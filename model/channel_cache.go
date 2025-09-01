package model

import (
	"errors"
	"fmt"
	"math/rand"
	"one-api/common"
	"one-api/setting"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
)

var group2model2channels map[string]map[string][]int // enabled channel
var channelsIDM map[int]*Channel                     // all channels include disabled
var channelSyncLock sync.RWMutex

func InitChannelCache() {
	if !common.MemoryCacheEnabled {
		return
	}
	newChannelId2channel := make(map[int]*Channel)
	var channels []*Channel
	DB.Find(&channels)
	for _, channel := range channels {
		newChannelId2channel[channel.Id] = channel
	}
	var abilities []*Ability
	DB.Find(&abilities)
	groups := make(map[string]bool)
	for _, ability := range abilities {
		groups[ability.Group] = true
	}
	newGroup2model2channels := make(map[string]map[string][]int)
	for group := range groups {
		newGroup2model2channels[group] = make(map[string][]int)
	}
	for _, channel := range channels {
		if channel.Status != common.ChannelStatusEnabled {
			continue // skip disabled channels
		}
		groups := strings.Split(channel.Group, ",")
		for _, group := range groups {
			models := strings.Split(channel.Models, ",")
			for _, model := range models {
				if _, ok := newGroup2model2channels[group][model]; !ok {
					newGroup2model2channels[group][model] = make([]int, 0)
				}
				newGroup2model2channels[group][model] = append(newGroup2model2channels[group][model], channel.Id)
			}
		}
	}

	// sort by priority
	for group, model2channels := range newGroup2model2channels {
		for model, channels := range model2channels {
			sort.Slice(channels, func(i, j int) bool {
				return newChannelId2channel[channels[i]].GetPriority() > newChannelId2channel[channels[j]].GetPriority()
			})
			newGroup2model2channels[group][model] = channels
		}
	}

	channelSyncLock.Lock()
	group2model2channels = newGroup2model2channels
	channelsIDM = newChannelId2channel
	channelSyncLock.Unlock()
	common.SysLog("channels synced from database")
}

func SyncChannelCache(frequency int) {
	for {
		time.Sleep(time.Duration(frequency) * time.Second)
		common.SysLog("syncing channels from database")
		InitChannelCache()
	}
}

func CacheGetRandomSatisfiedChannel(c *gin.Context, group string, model string, retry int) (*Channel, string, error) {
	var channel *Channel
	var err error
	selectGroup := group
	if group == "auto" {
		if len(setting.AutoGroups) == 0 {
			return nil, selectGroup, errors.New("auto groups is not enabled")
		}
		for _, autoGroup := range setting.AutoGroups {
			if common.DebugEnabled {
				println("autoGroup:", autoGroup)
			}
			channel, _ = getRandomSatisfiedChannel(autoGroup, model, retry)
			if channel == nil {
				continue
			} else {
				c.Set("auto_group", autoGroup)
				selectGroup = autoGroup
				if common.DebugEnabled {
					println("selectGroup:", selectGroup)
				}
				break
			}
		}
	} else {
		channel, err = getRandomSatisfiedChannel(group, model, retry)
		if err != nil {
			return nil, group, err
		}
	}
	if channel == nil {
		return nil, group, errors.New("channel not found")
	}
	return channel, selectGroup, nil
}

func getRandomSatisfiedChannel(group string, model string, retry int) (*Channel, error) {
	if strings.HasPrefix(model, "gpt-4-gizmo") {
		model = "gpt-4-gizmo-*"
	}
	if strings.HasPrefix(model, "gpt-4o-gizmo") {
		model = "gpt-4o-gizmo-*"
	}

	// if memory cache is disabled, get channel directly from database
	if !common.MemoryCacheEnabled {
		return GetRandomSatisfiedChannel(group, model, retry)
	}

	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()
	channelIds := group2model2channels[group][model]

	validChannels := make([]*Channel, 0)
	for _, channelId := range channelIds {
		if channel, ok := channelsIDM[channelId]; ok {
			if !isRedisLimited(*channel, channelId) {
				validChannels = append(validChannels, channel)
			}
		} else {
			return nil, fmt.Errorf("数据库一致性错误，渠道# %d 不存在，请联系管理员修复", channelId)
		}
	}

	if len(validChannels) == 0 {
		return nil, errors.New("channel not found")
	}

	if len(validChannels) == 1 {
		return validChannels[0], nil
	}

	uniquePriorities := make(map[int]bool)
	for _, channel := range validChannels {
		uniquePriorities[int(channel.GetPriority())] = true
	}
	var sortedUniquePriorities []int
	for priority := range uniquePriorities {
		sortedUniquePriorities = append(sortedUniquePriorities, priority)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(sortedUniquePriorities)))

	if retry >= len(uniquePriorities) {
		retry = len(uniquePriorities) - 1
	}
	targetPriority := int64(sortedUniquePriorities[retry])

	// get the priority for the given retry number
	var targetChannels []*Channel
	for _, channel := range validChannels {
		if channel.GetPriority() == targetPriority {
			targetChannels = append(targetChannels, channel)
		}
	}

	// 平滑系数
	smoothingFactor := 10
	// Calculate the total weight of all channels up to endIdx
	totalWeight := 0
	for _, channel := range targetChannels {
		totalWeight += channel.GetWeight() + smoothingFactor
	}
	// Generate a random value in the range [0, totalWeight)
	randomWeight := rand.Intn(totalWeight)

	// Find a channel based on its weight
	for _, channel := range targetChannels {
		randomWeight -= channel.GetWeight() + smoothingFactor
		if randomWeight < 0 {
			return channel, nil
		}
	}
	// return null if no channel is not found
	return nil, errors.New("channel not found")
}

func isRedisLimited(channel Channel, channelId int) bool {
	if channel.RateLimit != nil && *channel.RateLimit > 0 {
		if !checkRedisLimit(channel, channelId) {
			return true
		}
	}
	return false
}

func checkRedisLimit(channel Channel, channelId int) bool {
	key := fmt.Sprintf("rate_limit:%d", channelId)

	countStr, err := common.RedisGet(key)
	if err == redis.Nil {
		// Key doesn't exist, set it with expiration
		err = common.RedisSet(key, "1", time.Minute)
		if err != nil {
			common.SysLog(fmt.Sprintf("Error setting rate limit: %v", err))
			return false
		}
		return true
	} else if err != nil {
		common.SysLog(fmt.Sprintf("Error checking rate limit: %v", err))
		return false
	}

	count, err := strconv.ParseInt(countStr, 10, 64)
	if err != nil {
		common.SysLog(fmt.Sprintf("Error parsing rate limit count: %v", err))
		return false
	}

	if count > int64(*channel.RateLimit) {
		return false
	}

	// 增加计数
	newCount := strconv.FormatInt(count+1, 10)
	err = common.RedisSet(key, newCount, time.Minute)
	if err != nil {
		common.SysLog(fmt.Sprintf("Error incrementing rate limit: %v", err))
		return false
	}

	return true
}

func CacheGetChannel(id int) (*Channel, error) {
	if !common.MemoryCacheEnabled {
		return GetChannelById(id, true)
	}
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	c, ok := channelsIDM[id]
	if !ok {
		return nil, fmt.Errorf("渠道# %d，已不存在", id)
	}
	if c.Status != common.ChannelStatusEnabled {
		return nil, fmt.Errorf("渠道# %d，已被禁用", id)
	}
	return c, nil
}

func CacheGetChannelInfo(id int) (*ChannelInfo, error) {
	if !common.MemoryCacheEnabled {
		channel, err := GetChannelById(id, true)
		if err != nil {
			return nil, err
		}
		return &channel.ChannelInfo, nil
	}
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	c, ok := channelsIDM[id]
	if !ok {
		return nil, fmt.Errorf("渠道# %d，已不存在", id)
	}
	if c.Status != common.ChannelStatusEnabled {
		return nil, fmt.Errorf("渠道# %d，已被禁用", id)
	}
	return &c.ChannelInfo, nil
}

func CacheUpdateChannelStatus(id int, status int) {
	if !common.MemoryCacheEnabled {
		return
	}
	channelSyncLock.Lock()
	defer channelSyncLock.Unlock()
	if channel, ok := channelsIDM[id]; ok {
		channel.Status = status
	}
}

func CacheUpdateChannel(channel *Channel) {
	if !common.MemoryCacheEnabled {
		return
	}
	channelSyncLock.Lock()
	defer channelSyncLock.Unlock()
	if channel == nil {
		return
	}

	println("CacheUpdateChannel:", channel.Id, channel.Name, channel.Status, channel.ChannelInfo.MultiKeyPollingIndex)

	println("before:", channelsIDM[channel.Id].ChannelInfo.MultiKeyPollingIndex)
	channelsIDM[channel.Id] = channel
	println("after :", channelsIDM[channel.Id].ChannelInfo.MultiKeyPollingIndex)
}
