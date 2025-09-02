import { initVChartSemiTheme } from '@visactor/vchart-semi-theme';
import { Activity, Gauge, PieChart, Wallet, Zap } from 'lucide-react';
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import {
  IconCoinMoneyStroked,
  IconHistogram,
  IconLoopTextStroked,
  IconMoneyExchangeStroked,
  IconPieChart2Stroked,
  IconPulse,
  IconRefresh,
  IconSearch,
  IconStopwatchStroked,
  IconTextStroked,
  IconTypograph,
} from '@douyinfe/semi-icons';
import {
  IllustrationConstruction,
  IllustrationConstructionDark,
} from '@douyinfe/semi-illustrations';
import {
  Avatar,
  Button,
  Card,
  Divider,
  Empty,
  Form,
  Modal,
  Progress,
  Skeleton,
  TabPane,
  Tabs,
} from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import _ from 'lodash';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../context/Status/index.js';
import { UserContext } from '../../context/User/index.js';
import {
  API,
  copy,
  getQuotaWithUnit,
  getRelativeTime,
  isAdmin,
  modelColorMap,
  modelToColor,
  renderNumber,
  renderQuota,
  showError,
  showSuccess,
  timestamp2string,
  timestamp2string1,
} from '../../helpers';
import { useIsMobile } from '../../hooks/useIsMobile.js';

const Detail = (props) => {
  // ========== Hooks - Context ==========
  const [userState, userDispatch] = useContext(UserContext);
  const [statusState, statusDispatch] = useContext(StatusContext);

  // ========== Hooks - Navigation & Translation ==========
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // ========== Hooks - Refs ==========
  const formRef = useRef();
  const initialized = useRef(false);
  const apiScrollRef = useRef(null);

  // ========== Constants & Shared Configurations ==========
  const CHART_CONFIG = { mode: 'desktop-browser' };

  const CARD_PROPS = {
    shadows: 'always',
    bordered: false,
    headerLine: true,
  };

  const FORM_FIELD_PROPS = {
    className: 'w-full mb-2 !rounded-lg',
    size: 'large',
  };

  const ICON_BUTTON_CLASS = 'text-white hover:bg-opacity-80 !rounded-full';
  const FLEX_CENTER_GAP2 = 'flex items-center gap-2';

  const ILLUSTRATION_SIZE = { width: 96, height: 96 };

  // ========== Constants ==========
  let now = new Date();
  const isAdminUser = isAdmin();

  // ========== Panel enable flags ==========
  const apiInfoEnabled = statusState?.status?.api_info_enabled ?? true;
  const announcementsEnabled =
    statusState?.status?.announcements_enabled ?? true;
  const faqEnabled = statusState?.status?.faq_enabled ?? true;
  const uptimeEnabled = statusState?.status?.uptime_kuma_enabled ?? true;

  const hasApiInfoPanel = apiInfoEnabled;
  const hasInfoPanels = announcementsEnabled || faqEnabled || uptimeEnabled;

  // ========== Helper Functions ==========
  const getTimeInterval = useCallback((timeType, isSeconds = false) => {
    const intervals = {
      hour: isSeconds ? 3600 : 60,
      day: isSeconds ? 86400 : 1440,
      week: isSeconds ? 604800 : 10080,
    };
    return intervals[timeType] || intervals.hour;
  }, []);

  const updateMapValue = useCallback((map, key, value) => {
    if (!map.has(key)) {
      map.set(key, 0);
    }
    map.set(key, map.get(key) + value);
  }, []);

  const initializeMaps = useCallback((key, ...maps) => {
    maps.forEach((map) => {
      if (!map.has(key)) {
        map.set(key, 0);
      }
    });
  }, []);

  const updateChartSpec = useCallback(
    (setterFunc, newData, subtitle, newColors, dataId) => {
      setterFunc((prev) => ({
        ...prev,
        data: [{ id: dataId, values: newData }],
        title: {
          ...prev.title,
          subtext: subtitle,
        },
        color: {
          specified: newColors,
        },
      }));
    },
    [],
  );

  const createSectionTitle = useCallback(
    (Icon, text) => (
      <div className={FLEX_CENTER_GAP2}>
        <Icon size={16} />
        {text}
      </div>
    ),
    [],
  );

  const createFormField = useCallback(
    (Component, props) => <Component {...FORM_FIELD_PROPS} {...props} />,
    [],
  );

  // ========== Time Options ==========
  const timeOptions = useMemo(
    () => [
      { label: t('小时'), value: 'hour' },
      { label: t('天'), value: 'day' },
      { label: t('周'), value: 'week' },
    ],
    [t],
  );

  // ========== Hooks - State ==========
  const [inputs, setInputs] = useState({
    username: '',
    token_name: '',
    model_name: '',
    start_timestamp: timestamp2string(new Date().setHours(0, 0, 0, 0) / 1000),
    end_timestamp: timestamp2string(now.getTime() / 1000 + 3600),
    channel: '',
    show_upstream_model_name: true,
    data_export_default_time: '',
  });

  const [dataExportDefaultTime, setDataExportDefaultTime] = useState('hour');

  const [loading, setLoading] = useState(false);
  const [greetingVisible, setGreetingVisible] = useState(false);
  const [quotaData, setQuotaData] = useState([]);
  const [consumeQuota, setConsumeQuota] = useState(0);
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [times, setTimes] = useState(0);
  const [pieData, setPieData] = useState([{ type: 'null', value: '0' }]);
  const [lineData, setLineData] = useState([]);
  const [userConsumptionRankBarData, setUserConsumptionRankBarData] = useState(
    [],
  );

  const [modelColors, setModelColors] = useState({});
  const [activeChartTab, setActiveChartTab] = useState('1');
  const [showApiScrollHint, setShowApiScrollHint] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);

  const [trendData, setTrendData] = useState({
    balance: [],
    usedQuota: [],
    requestCount: [],
    times: [],
    consumeQuota: [],
    inputTokens: [],
    outputTokens: [],
    rpm: [],
    tpm: [],
  });

  // ========== Additional Refs for new cards ==========
  const announcementScrollRef = useRef(null);
  const faqScrollRef = useRef(null);
  const uptimeScrollRef = useRef(null);
  const uptimeTabScrollRefs = useRef({});

  // ========== Additional State for scroll hints ==========
  const [showAnnouncementScrollHint, setShowAnnouncementScrollHint] =
    useState(false);
  const [showFaqScrollHint, setShowFaqScrollHint] = useState(false);
  const [showUptimeScrollHint, setShowUptimeScrollHint] = useState(false);

  // ========== Uptime data ==========
  const [uptimeData, setUptimeData] = useState([]);
  const [uptimeLoading, setUptimeLoading] = useState(false);
  const [activeUptimeTab, setActiveUptimeTab] = useState('');

  // ========== Props Destructuring ==========
  const { username, model_name, start_timestamp, end_timestamp, channel, show_upstream_model_name } =
    inputs;

  // ========== Chart Specs State ==========
  const [spec_pie, setSpecPie] = useState({
    type: 'pie',
    data: [
      {
        id: 'id0',
        values: pieData,
      },
    ],
    outerRadius: 0.8,
    innerRadius: 0.5,
    padAngle: 0.6,
    valueField: 'value',
    categoryField: 'type',
    pie: {
      style: {
        cornerRadius: 10,
      },
      state: {
        hover: {
          outerRadius: 0.85,
          stroke: '#000',
          lineWidth: 1,
        },
        selected: {
          outerRadius: 0.85,
          stroke: '#000',
          lineWidth: 1,
        },
      },
    },
    title: {
      visible: true,
      text: t('模型调用次数占比'),
      subtext: `${t('总计')}：${renderNumber(times)}`,
    },
    legends: {
      visible: true,
      orient: 'left',
    },
    label: {
      visible: true,
    },
    tooltip: {
      mark: {
        content: [
          {
            key: (datum) => datum['type'],
            value: (datum) => renderNumber(datum['value']),
          },
        ],
      },
    },
    color: {
      specified: modelColorMap,
    },
  });

  const [spec_line, setSpecLine] = useState({
    type: 'bar',
    data: [
      {
        id: 'barData',
        values: lineData,
      },
    ],
    xField: 'Time',
    yField: 'Usage',
    seriesField: 'Model',
    stack: true,
    legends: {
      visible: true,
      selectMode: 'single',
    },
    title: {
      visible: true,
      text: t('模型消耗分布'),
      subtext: `${t('总计')}：${renderQuota(consumeQuota, 2)}`,
    },
    bar: {
      state: {
        hover: {
          stroke: '#000',
          lineWidth: 1,
        },
      },
    },
    tooltip: {
      mark: {
        content: [
          {
            key: (datum) => datum['Model'],
            value: (datum) => renderQuota(datum['rawQuota'] || 0, 4),
          },
        ],
      },
      dimension: {
        content: [
          {
            key: (datum) => datum['Model'],
            value: (datum) => datum['rawQuota'] || 0,
          },
        ],
        updateContent: (array) => {
          array.sort((a, b) => b.value - a.value);
          let sum = 0;
          for (let i = 0; i < array.length; i++) {
            if (array[i].key == '其他') {
              continue;
            }
            let value = parseFloat(array[i].value);
            if (isNaN(value)) {
              value = 0;
            }
            if (array[i].datum && array[i].datum.TimeSum) {
              sum = array[i].datum.TimeSum;
            }
            array[i].value = renderQuota(value, 4);
          }
          array.unshift({
            key: t('总计'),
            value: renderQuota(sum, 4),
          });
          return array;
        },
      },
    },
    color: {
      specified: modelColorMap,
    },
  });

  // 模型消耗趋势折线图
  const [spec_model_line, setSpecModelLine] = useState({
    type: 'line',
    data: [
      {
        id: 'lineData',
        values: [],
      },
    ],
    xField: 'Time',
    yField: 'Count',
    seriesField: 'Model',
    legends: {
      visible: true,
      selectMode: 'single',
    },
    title: {
      visible: true,
      text: t('模型消耗趋势'),
      subtext: '',
    },
    tooltip: {
      mark: {
        content: [
          {
            key: (datum) => datum['Model'],
            value: (datum) => renderNumber(datum['Count']),
          },
        ],
      },
    },
    color: {
      specified: modelColorMap,
    },
  });

  // 模型调用次数排行柱状图
  const [spec_rank_bar, setSpecRankBar] = useState({
    type: 'bar',
    data: [
      {
        id: 'rankData',
        values: [],
      },
    ],
    xField: 'Model',
    yField: 'Count',
    seriesField: 'Model',
    legends: {
      visible: true,
      selectMode: 'single',
    },
    title: {
      visible: true,
      text: t('模型调用次数排行'),
      subtext: '',
    },
    bar: {
      state: {
        hover: {
          stroke: '#000',
          lineWidth: 1,
        },
      },
    },
    tooltip: {
      mark: {
        content: [
          {
            key: (datum) => datum['Model'],
            value: (datum) => renderNumber(datum['Count']),
          },
        ],
      },
    },
    color: {
      specified: modelColorMap,
    },
  });

  const [user_consumption_rank_bar, setUserConsumptionRankBar] = useState({
    type: 'bar',
    direction: 'horizontal',
    data: [
      {
        id: 'userConsumptionRankBarData',
        values: userConsumptionRankBarData,
      },
    ],
    xField: 'Usage',
    yField: 'User',
    seriesField: 'User',
    legends: {
      visible: true,
      selectMode: 'single',
    },
    title: {
      visible: false,
    },
    bar: {
      state: {
        hover: {
          stroke: '#000',
          lineWidth: 1,
        },
      },
    },
    tooltip: {
      mark: {
        content: [
          {
            key: (datum) => datum['User'],
            value: (datum) => renderNumber(datum['Usage']),
          },
        ],
      },
    },
    color: {
      specified: modelColorMap,
    },
  });

  // ========== Hooks - Memoized Values ==========
  const performanceMetrics = useMemo(() => {
    const timeDiff =
      (Date.parse(end_timestamp) - Date.parse(start_timestamp)) / 60000;
    const avgRPM = isNaN(times / timeDiff)
      ? '0'
      : (times / timeDiff).toFixed(3);
    const avgTPM = isNaN((inputTokens + outputTokens) / timeDiff)
      ? '0'
      : ((inputTokens + outputTokens) / timeDiff).toFixed(3);

    return { avgRPM, avgTPM, timeDiff };
  }, [times, inputTokens, outputTokens, end_timestamp, start_timestamp]);

  const getGreeting = useMemo(() => {
    const hours = new Date().getHours();
    let greeting = '';

    if (hours >= 5 && hours < 12) {
      greeting = t('早上好');
    } else if (hours >= 12 && hours < 14) {
      greeting = t('中午好');
    } else if (hours >= 14 && hours < 18) {
      greeting = t('下午好');
    } else {
      greeting = t('晚上好');
    }

    const username = userState?.user?.username || '';
    return `👋${greeting}，${username}`;
  }, [t, userState?.user?.username]);

  // ========== Hooks - Callbacks ==========
  const getTrendSpec = useCallback(
    (data, color) => ({
      type: 'line',
      data: [
        { id: 'trend', values: data.map((val, idx) => ({ x: idx, y: val })) },
      ],
      xField: 'x',
      yField: 'y',
      height: 40,
      width: 100,
      axes: [
        {
          orient: 'bottom',
          visible: false,
        },
        {
          orient: 'left',
          visible: false,
        },
      ],
      padding: 0,
      autoFit: false,
      legends: { visible: false },
      tooltip: { visible: false },
      crosshair: { visible: false },
      line: {
        style: {
          stroke: color,
          lineWidth: 2,
        },
      },
      point: {
        visible: false,
      },
      background: {
        fill: 'transparent',
      },
    }),
    [],
  );

  const groupedStatsData = useMemo(
    () => [
      {
        title: createSectionTitle(Wallet, t('个人现状')),
        color: 'bg-blue-50',
        items: [
          {
            title: t('当前余额'),
            value: renderQuota(userState?.user?.quota),
            icon: <IconMoneyExchangeStroked />,
            avatarColor: 'blue',
            onClick: () => navigate('/console/topup'),
            trendData: [],
            trendColor: '#3b82f6',
          },
          {
            title: t('历史消费'),
            value: renderQuota(userState?.user?.used_quota),
            icon: <IconHistogram />,
            avatarColor: 'purple',
            trendData: [],
            trendColor: '#8b5cf6',
          },
        ],
      },
      {
        title: createSectionTitle(Activity, t('统计情况')),
        color: 'bg-green-50',
        items: [
          {
            title: t('累计消费'),
            value: renderQuota(consumeQuota),
            icon: <IconCoinMoneyStroked />,
            avatarColor: 'yellow',
            trendData: trendData.consumeQuota,
            trendColor: '#f59e0b',
          },
          {
            title: t('累计次数'),
            value: times,
            icon: <IconPulse />,
            avatarColor: 'cyan',
            trendData: trendData.times,
            trendColor: '#06b6d4',
          },
        ],
      },
      {
        title: createSectionTitle(Zap, t('资源消耗')),
        color: 'bg-yellow-50',
        items: [
          {
            title: t('输入token数'),
            value: isNaN(inputTokens) ? 0 : inputTokens,
            icon: <IconTextStroked />,
            avatarColor: 'green',
            trendData: trendData.inputTokens,
            trendColor: '#10b981',
          },
          {
            title: t('输出token数'),
            value: isNaN(outputTokens) ? 0 : outputTokens,
            icon: <IconLoopTextStroked />,
            avatarColor: 'pink',
            trendData: trendData.outputTokens,
            trendColor: '#ec4899',
          },
        ],
      },
      {
        title: createSectionTitle(Gauge, t('性能指标')),
        color: 'bg-indigo-50',
        items: [
          {
            title: t('平均RPM'),
            value: performanceMetrics.avgRPM,
            icon: <IconStopwatchStroked />,
            avatarColor: 'indigo',
            trendData: trendData.rpm,
            trendColor: '#6366f1',
          },
          {
            title: t('平均TPM'),
            value: performanceMetrics.avgTPM,
            icon: <IconTypograph />,
            avatarColor: 'orange',
            trendData: trendData.tpm,
            trendColor: '#f97316',
          },
        ],
      },
    ],
    [
      createSectionTitle,
      t,
      userState?.user?.quota,
      userState?.user?.used_quota,
      userState?.user?.request_count,
      times,
      consumeQuota,
      inputTokens,
      outputTokens,
      trendData,
      performanceMetrics,
      navigate,
    ],
  );

  const handleCopyUrl = useCallback(
    async (url) => {
      if (await copy(url)) {
        showSuccess(t('复制成功'));
      }
    },
    [t],
  );

  const handleSpeedTest = useCallback((apiUrl) => {
    const encodedUrl = encodeURIComponent(apiUrl);
    const speedTestUrl = `https://www.tcptest.cn/http/${encodedUrl}`;
    window.open(speedTestUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const handleInputChange = useCallback((value, name) => {
    if (name === 'data_export_default_time') {
      setDataExportDefaultTime(value);
      return;
    }
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  }, []);

  const loadQuotaData = useCallback(async () => {
    setLoading(true);
    const startTime = Date.now();
    try {
      let url = '';
      let localStartTimestamp = Date.parse(start_timestamp) / 1000;
      let localEndTimestamp = Date.parse(end_timestamp) / 1000;
      if (isAdminUser) {
        url = `/api/data/?username=${username}&start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}&default_time=${dataExportDefaultTime}`;
      } else {
        url = `/api/data/self/?start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}&default_time=${dataExportDefaultTime}`;
      }
      const res = await API.get(url);
      const { success, message, data } = res.data;
      if (success) {
        setQuotaData(data);
        if (data.length === 0) {
          data.push({
            count: 0,
            model_name: '无数据',
            quota: 0,
            created_at: now.getTime() / 1000,
          });
        }
        data.sort((a, b) => a.created_at - b.created_at);
        updateChartData(data);
      } else {
        showError(message);
      }
    } finally {
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, 500 - elapsed);
      setTimeout(() => {
        setLoading(false);
      }, remainingTime);
    }
  }, [
    start_timestamp,
    end_timestamp,
    username,
    dataExportDefaultTime,
    isAdminUser,
  ]);

  const loadUptimeData = useCallback(async () => {
    setUptimeLoading(true);
    try {
      const res = await API.get('/api/uptime/status');
      const { success, message, data } = res.data;
      if (success) {
        setUptimeData(data || []);
        if (data && data.length > 0 && !activeUptimeTab) {
          setActiveUptimeTab(data[0].categoryName);
        }
      } else {
        showError(message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUptimeLoading(false);
    }
  }, [activeUptimeTab]);

  const refresh = useCallback(async () => {
    await Promise.all([loadQuotaData(), loadUptimeData()]);
  }, [loadQuotaData, loadUptimeData]);

  const handleSearchConfirm = useCallback(() => {
    refresh();
    setSearchModalVisible(false);
  }, [refresh]);

  const initChart = useCallback(async () => {
    await loadQuotaData();
    await loadUptimeData();
  }, [loadQuotaData, loadUptimeData]);

  const showSearchModal = useCallback(() => {
    setSearchModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSearchModalVisible(false);
  }, []);

  // ========== Regular Functions ==========
  const checkApiScrollable = () => {
    if (apiScrollRef.current) {
      const element = apiScrollRef.current;
      const isScrollable = element.scrollHeight > element.clientHeight;
      const isAtBottom =
        element.scrollTop + element.clientHeight >= element.scrollHeight - 5;
      setShowApiScrollHint(isScrollable && !isAtBottom);
    }
  };

  const handleApiScroll = () => {
    checkApiScrollable();
  };

  const checkCardScrollable = (ref, setHintFunction) => {
    if (ref.current) {
      const element = ref.current;
      const isScrollable = element.scrollHeight > element.clientHeight;
      const isAtBottom =
        element.scrollTop + element.clientHeight >= element.scrollHeight - 5;
      setHintFunction(isScrollable && !isAtBottom);
    }
  };

  const handleCardScroll = (ref, setHintFunction) => {
    checkCardScrollable(ref, setHintFunction);
  };

  // ========== Effects for scroll detection ==========
  useEffect(() => {
    const timer = setTimeout(() => {
      checkApiScrollable();
      checkCardScrollable(announcementScrollRef, setShowAnnouncementScrollHint);
      checkCardScrollable(faqScrollRef, setShowFaqScrollHint);

      if (uptimeData.length === 1) {
        checkCardScrollable(uptimeScrollRef, setShowUptimeScrollHint);
      } else if (uptimeData.length > 1 && activeUptimeTab) {
        const activeTabRef = uptimeTabScrollRefs.current[activeUptimeTab];
        if (activeTabRef) {
          checkCardScrollable(activeTabRef, setShowUptimeScrollHint);
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [uptimeData, activeUptimeTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setGreetingVisible(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const getUserData = async () => {
    let res = await API.get(`/api/user/self`);
    const { success, message, data } = res.data;
    if (success) {
      userDispatch({ type: 'login', payload: data });
    } else {
      showError(message);
    }
  };

  // ========== Data Processing Functions ==========
  const processRawData = useCallback(
    (data) => {
      const result = {
        totalQuota: 0,
        totalTimes: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        uniqueModels: new Set(),
        timePoints: [],
        timeQuotaMap: new Map(),
        timeInputTokensMap: new Map(),
        timeOutputTokensMap: new Map(),
        timeCountMap: new Map(),
        userConsumptionMap: new Map(),
      };

      data.forEach((item) => {
        result.uniqueModels.add((show_upstream_model_name && item.upstream_model_name !== '') ? item.upstream_model_name : item.model_name);
        result.totalInputTokens += item.prompt_tokens;
        result.totalOutputTokens += item.completion_tokens;
        result.totalQuota += item.quota;
        result.totalTimes += item.count;

        const timeKey = timestamp2string1(
          item.created_at,
          dataExportDefaultTime,
        );
        if (!result.timePoints.includes(timeKey)) {
          result.timePoints.push(timeKey);
        }

        initializeMaps(
          timeKey,
          result.timeQuotaMap,
          result.timeInputTokensMap,
          result.timeOutputTokensMap,
          result.timeCountMap,
        );
        updateMapValue(result.timeQuotaMap, timeKey, item.quota);
        updateMapValue(result.timeInputTokensMap, timeKey, item.prompt_tokens);
        updateMapValue(
          result.timeOutputTokensMap,
          timeKey,
          item.completion_tokens,
        );
        updateMapValue(result.timeCountMap, timeKey, item.count);
        updateMapValue(
          result.userConsumptionMap,
          item.username,
          item.prompt_tokens + item.completion_tokens,
        );
      });

      result.timePoints.sort();
      return result;
    },
    [dataExportDefaultTime, initializeMaps, updateMapValue],
  );

  const calculateTrendData = useCallback(
    (
      timePoints,
      timeQuotaMap,
      timeInputTokensMap,
      timeOutputTokensMap,
      timeCountMap,
    ) => {
      const quotaTrend = timePoints.map((time) => timeQuotaMap.get(time) || 0);
      const inputTokensTrend = timePoints.map(
        (time) => timeInputTokensMap.get(time) || 0,
      );
      const outputTokensTrend = timePoints.map(
        (time) => timeOutputTokensMap.get(time) || 0,
      );
      const countTrend = timePoints.map((time) => timeCountMap.get(time) || 0);

      const rpmTrend = [];
      const tpmTrend = [];

      if (timePoints.length >= 2) {
        const interval = getTimeInterval(dataExportDefaultTime);

        for (let i = 0; i < timePoints.length; i++) {
          rpmTrend.push(timeCountMap.get(timePoints[i]) / interval);
          tpmTrend.push(
            (timeInputTokensMap.get(timePoints[i]) +
              timeOutputTokensMap.get(timePoints[i])) /
              interval,
          );
        }
      }

      return {
        balance: [],
        usedQuota: [],
        requestCount: [],
        times: countTrend,
        consumeQuota: quotaTrend,
        inputTokens: inputTokensTrend,
        outputTokens: outputTokensTrend,
        rpm: rpmTrend,
        tpm: tpmTrend,
      };
    },
    [dataExportDefaultTime, getTimeInterval],
  );

  const generateModelColors = useCallback(
    (uniqueModels) => {
      const newModelColors = {};
      Array.from(uniqueModels).forEach((modelName) => {
        newModelColors[modelName] =
          modelColorMap[modelName] ||
          modelColors[modelName] ||
          modelToColor(modelName);
      });
      return newModelColors;
    },
    [modelColors],
  );

  const aggregateDataByTimeAndModel = useCallback(
    (data) => {
      const aggregatedData = new Map();

      data.forEach((item) => {
        const timeKey = timestamp2string1(
          item.created_at,
          dataExportDefaultTime,
        );
        const modelKey = (show_upstream_model_name && item.upstream_model_name !== '') ? item.upstream_model_name : item.model_name;
        const key = `${timeKey}-${modelKey}`;

        if (!aggregatedData.has(key)) {
          aggregatedData.set(key, {
            time: timeKey,
            model: modelKey,
            quota: 0,
            count: 0,
          });
        }

        const existing = aggregatedData.get(key);
        existing.quota += item.quota;
        existing.count += item.count;
      });

      return aggregatedData;
    },
    [dataExportDefaultTime],
  );

  const generateChartTimePoints = useCallback(
    (aggregatedData, data) => {
      let chartTimePoints = Array.from(
        new Set([...aggregatedData.values()].map((d) => d.time)),
      );

      if (chartTimePoints.length < 7) {
        const lastTime = Math.max(...data.map((item) => item.created_at));
        const interval = getTimeInterval(dataExportDefaultTime, true);

        chartTimePoints = Array.from({ length: 7 }, (_, i) =>
          timestamp2string1(
            lastTime - (6 - i) * interval,
            dataExportDefaultTime,
          ),
        );
      }

      return chartTimePoints;
    },
    [dataExportDefaultTime, getTimeInterval],
  );

  const updateChartData = useCallback(
    (data) => {
      const processedData = processRawData(data);
      const {
        totalQuota,
        totalTimes,
        totalInputTokens,
        totalOutputTokens,
        uniqueModels,
        timePoints,
        timeQuotaMap,
        timeInputTokensMap,
        timeOutputTokensMap,
        timeCountMap,
        userConsumptionMap,
      } = processedData;

      const trendDataResult = calculateTrendData(
        timePoints,
        timeQuotaMap,
        timeInputTokensMap,
        timeOutputTokensMap,
        timeCountMap,
      );
      setTrendData(trendDataResult);

      const newModelColors = generateModelColors(uniqueModels);
      setModelColors(newModelColors);

      const aggregatedData = aggregateDataByTimeAndModel(data);

      const modelTotals = new Map();
      for (let [_, value] of aggregatedData) {
        updateMapValue(modelTotals, value.model, value.count);
      }

      const newPieData = Array.from(modelTotals)
        .map(([model, count]) => ({
          type: model,
          value: count,
        }))
        .sort((a, b) => b.value - a.value);

      const chartTimePoints = generateChartTimePoints(aggregatedData, data);
      let newLineData = [];

      chartTimePoints.forEach((time) => {
        let timeData = Array.from(uniqueModels).map((model) => {
          const key = `${time}-${model}`;
          const aggregated = aggregatedData.get(key);
          return {
            Time: time,
            Model: model,
            rawQuota: aggregated?.quota || 0,
            Usage: aggregated?.quota
              ? getQuotaWithUnit(aggregated.quota, 4)
              : 0,
          };
        });

        const timeSum = timeData.reduce((sum, item) => sum + item.rawQuota, 0);
        timeData.sort((a, b) => b.rawQuota - a.rawQuota);
        timeData = timeData.map((item) => ({ ...item, TimeSum: timeSum }));
        newLineData.push(...timeData);
      });

      newLineData.sort((a, b) => a.Time.localeCompare(b.Time));

      updateChartSpec(
        setSpecPie,
        newPieData,
        `${t('总计')}：${renderNumber(totalTimes)}`,
        newModelColors,
        'id0',
      );

      updateChartSpec(
        setSpecLine,
        newLineData,
        `${t('总计')}：${renderQuota(totalQuota, 2)}`,
        newModelColors,
        'barData',
      );

      const userConsumptionRankBarData = _(userConsumptionMap)
        .toPairs()
        .orderBy([1], 'desc')
        .take(10)
        .map(([user, usage]) => ({
          User: user,
          Usage: usage,
        }))
        .value();

      // ===== 模型调用次数折线图 =====
      let modelLineData = [];
      chartTimePoints.forEach((time) => {
        const timeData = Array.from(uniqueModels).map((model) => {
          const key = `${time}-${model}`;
          const aggregated = aggregatedData.get(key);
          return {
            Time: time,
            Model: model,
            Count: aggregated?.count || 0,
          };
        });
        modelLineData.push(...timeData);
      });
      modelLineData.sort((a, b) => a.Time.localeCompare(b.Time));

      // ===== 模型调用次数排行柱状图 =====
      const rankData = Array.from(modelTotals)
        .map(([model, count]) => ({
          Model: model,
          Count: count,
        }))
        .sort((a, b) => b.Count - a.Count);

      updateChartSpec(
        setSpecModelLine,
        modelLineData,
        `${t('总计')}：${renderNumber(totalTimes)}`,
        newModelColors,
        'lineData',
      );

      updateChartSpec(
        setSpecRankBar,
        rankData,
        `${t('总计')}：${renderNumber(totalTimes)}`,
        newModelColors,
        'rankData',
      );

      updateChartSpec(
        setUserConsumptionRankBar,
        userConsumptionRankBarData,
        '',
        newModelColors,
        'userConsumptionRankBarData',
      );

      setPieData(newPieData);
      setLineData(newLineData);
      setConsumeQuota(totalQuota);
      setUserConsumptionRankBarData(userConsumptionRankBarData);
      setTimes(totalTimes);
      setInputTokens(totalInputTokens);
      setOutputTokens(totalOutputTokens);
    },
    [
      processRawData,
      calculateTrendData,
      generateModelColors,
      aggregateDataByTimeAndModel,
      generateChartTimePoints,
      updateChartSpec,
      updateMapValue,
      t,
    ],
  );

  // ========== Status Data Management ==========
  const announcementLegendData = useMemo(
    () => [
      { color: 'grey', label: t('默认'), type: 'default' },
      { color: 'blue', label: t('进行中'), type: 'ongoing' },
      { color: 'green', label: t('成功'), type: 'success' },
      { color: 'orange', label: t('警告'), type: 'warning' },
      { color: 'red', label: t('异常'), type: 'error' },
    ],
    [t],
  );

  const uptimeStatusMap = useMemo(
    () => ({
      1: { color: '#10b981', label: t('正常'), text: t('可用率') }, // UP
      0: { color: '#ef4444', label: t('异常'), text: t('有异常') }, // DOWN
      2: { color: '#f59e0b', label: t('高延迟'), text: t('高延迟') }, // PENDING
      3: { color: '#3b82f6', label: t('维护中'), text: t('维护中') }, // MAINTENANCE
    }),
    [t],
  );

  const uptimeLegendData = useMemo(
    () =>
      Object.entries(uptimeStatusMap).map(([status, info]) => ({
        status: Number(status),
        color: info.color,
        label: info.label,
      })),
    [uptimeStatusMap],
  );

  const getUptimeStatusColor = useCallback(
    (status) => uptimeStatusMap[status]?.color || '#8b9aa7',
    [uptimeStatusMap],
  );

  const getUptimeStatusText = useCallback(
    (status) => uptimeStatusMap[status]?.text || t('未知'),
    [uptimeStatusMap, t],
  );

  const apiInfoData = useMemo(() => {
    return statusState?.status?.api_info || [];
  }, [statusState?.status?.api_info]);

  const announcementData = useMemo(() => {
    const announcements = statusState?.status?.announcements || [];
    return announcements.map((item) => ({
      ...item,
      time: getRelativeTime(item.publishDate),
    }));
  }, [statusState?.status?.announcements]);

  const faqData = useMemo(() => {
    return statusState?.status?.faq || [];
  }, [statusState?.status?.faq]);

  const renderMonitorList = useCallback(
    (monitors) => {
      if (!monitors || monitors.length === 0) {
        return (
          <div className='flex justify-center items-center py-4'>
            <Empty
              image={<IllustrationConstruction style={ILLUSTRATION_SIZE} />}
              darkModeImage={
                <IllustrationConstructionDark style={ILLUSTRATION_SIZE} />
              }
              title={t('暂无监控数据')}
            />
          </div>
        );
      }

      const grouped = {};
      monitors.forEach((m) => {
        const g = m.group || '';
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(m);
      });

      const renderItem = (monitor, idx) => (
        <div
          key={idx}
          className='p-2 hover:bg-white rounded-lg transition-colors'
        >
          <div className='flex items-center justify-between mb-1'>
            <div className='flex items-center gap-2'>
              <div
                className='w-2 h-2 rounded-full flex-shrink-0'
                style={{
                  backgroundColor: getUptimeStatusColor(monitor.status),
                }}
              />
              <span className='text-sm font-medium text-gray-900'>
                {monitor.name}
              </span>
            </div>
            <span className='text-xs text-gray-500'>
              {((monitor.uptime || 0) * 100).toFixed(2)}%
            </span>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-xs text-gray-500'>
              {getUptimeStatusText(monitor.status)}
            </span>
            <div className='flex-1'>
              <Progress
                percent={(monitor.uptime || 0) * 100}
                showInfo={false}
                aria-label={`${monitor.name} uptime`}
                stroke={getUptimeStatusColor(monitor.status)}
              />
            </div>
          </div>
        </div>
      );

      return Object.entries(grouped).map(([gname, list]) => (
        <div key={gname || 'default'} className='mb-2'>
          {gname && (
            <>
              <div className='text-md font-semibold text-gray-500 px-2 py-1'>
                {gname}
              </div>
              <Divider />
            </>
          )}
          {list.map(renderItem)}
        </div>
      ));
    },
    [t, getUptimeStatusColor, getUptimeStatusText],
  );

  // ========== Hooks - Effects ==========
  useEffect(() => {
    getUserData();
    if (!initialized.current) {
      initVChartSemiTheme({
        isWatchingThemeSwitch: true,
      });
      initialized.current = true;
      initChart();
    }
  }, []);

  return (
    <div className='bg-gray-50 h-full mt-[64px] px-2'>
      <div className='flex items-center justify-between mb-4'>
        <h2
          className='text-2xl font-semibold text-gray-800 transition-opacity duration-1000 ease-in-out'
          style={{ opacity: greetingVisible ? 1 : 0 }}
        >
          {getGreeting}
        </h2>
        <div className='flex gap-3'>
          <Button
            type='tertiary'
            icon={<IconSearch />}
            onClick={showSearchModal}
            className={`bg-green-500 hover:bg-green-600 ${ICON_BUTTON_CLASS}`}
          />
          <Button
            type='tertiary'
            icon={<IconRefresh />}
            onClick={refresh}
            loading={loading}
            className={`bg-blue-500 hover:bg-blue-600 ${ICON_BUTTON_CLASS}`}
          />
        </div>
      </div>

      {/* 搜索条件Modal */}
      <Modal
        title={t('搜索条件')}
        visible={searchModalVisible}
        onOk={handleSearchConfirm}
        onCancel={handleCloseModal}
        closeOnEsc={true}
        size={isMobile ? 'full-width' : 'small'}
        centered
      >
        <Form ref={formRef} layout='vertical' className='w-full'>
          {createFormField(Form.DatePicker, {
            field: 'start_timestamp',
            label: t('起始时间'),
            initValue: start_timestamp,
            value: start_timestamp,
            type: 'dateTime',
            name: 'start_timestamp',
            onChange: (value) => handleInputChange(value, 'start_timestamp'),
          })}

          {createFormField(Form.DatePicker, {
            field: 'end_timestamp',
            label: t('结束时间'),
            initValue: end_timestamp,
            value: end_timestamp,
            type: 'dateTime',
            name: 'end_timestamp',
            onChange: (value) => handleInputChange(value, 'end_timestamp'),
          })}

          {createFormField(Form.Select, {
            field: 'data_export_default_time',
            label: t('时间粒度'),
            initValue: dataExportDefaultTime,
            placeholder: t('时间粒度'),
            name: 'data_export_default_time',
            optionList: timeOptions,
            onChange: (value) =>
              handleInputChange(value, 'data_export_default_time'),
          })}

          {isAdminUser &&
            createFormField(Form.Input, {
              field: 'username',
              label: t('用户名称'),
              value: username,
              placeholder: t('可选值'),
              name: 'username',
              onChange: (value) => handleInputChange(value, 'username'),
            })}

          {isAdminUser &&
            createFormField(Form.Checkbox, {
              field: 'show_upstream_model_name',
              label: t('显示上游模型名称'),
              initValue: show_upstream_model_name,
              value: show_upstream_model_name,
              name: 'show_upstream_model_name',
              onChange: (value) => handleInputChange(value, 'show_upstream_model_name'),
            })}
        </Form>
      </Modal>

      <div className='mb-4'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          {groupedStatsData.map((group, idx) => (
            <Card
              key={idx}
              {...CARD_PROPS}
              className={`${group.color} border-0 !rounded-2xl w-full`}
              title={group.title}
            >
              <div className='space-y-4'>
                {group.items.map((item, itemIdx) => (
                  <div
                    key={itemIdx}
                    className='flex items-center justify-between cursor-pointer'
                    onClick={item.onClick}
                  >
                    <div className='flex items-center'>
                      <Avatar
                        className='mr-3'
                        size='small'
                        color={item.avatarColor}
                      >
                        {item.icon}
                      </Avatar>
                      <div>
                        <div className='text-xs text-gray-500'>
                          {item.title}
                        </div>
                        <div className='text-lg font-semibold'>
                          <Skeleton
                            loading={loading}
                            active
                            placeholder={
                              <Skeleton.Paragraph
                                active
                                rows={1}
                                style={{
                                  width: '65px',
                                  height: '24px',
                                  marginTop: '4px',
                                }}
                              />
                            }
                          >
                            {item.value}
                          </Skeleton>
                        </div>
                      </div>
                    </div>
                    {(loading ||
                      (item.trendData && item.trendData.length > 0)) && (
                      <div className='w-24 h-10'>
                        <VChart
                          spec={getTrendSpec(item.trendData, item.trendColor)}
                          option={CHART_CONFIG}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className='mb-4'>
        <div
          className={`grid grid-cols-1 gap-4 ${isAdminUser ? 'lg:grid-cols-4' : ''}`}
        >
          <Card
            {...CARD_PROPS}
            className={`shadow-sm !rounded-2xl ${isAdminUser ? 'lg:col-span-3' : ''}`}
            title={
              <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between w-full gap-3'>
                <div className={FLEX_CENTER_GAP2}>
                  <PieChart size={16} />
                  {t('模型数据分析')}
                </div>
                <Tabs
                  type='button'
                  activeKey={activeChartTab}
                  onChange={setActiveChartTab}
                >
                  <TabPane
                    tab={
                      <span>
                        <IconPieChart2Stroked />
                        {t('调用次数分布')}
                      </span>
                    }
                    itemKey='1'
                  />
                  <TabPane
                    tab={
                      <span>
                        <IconHistogram />
                        {t('调用次数排行')}
                      </span>
                    }
                    itemKey='2'
                  />
                  <TabPane
                    tab={
                      <span>
                        <IconHistogram />
                        {t('消耗分布')}
                      </span>
                    }
                    itemKey='3'
                  />
                  <TabPane
                    tab={
                      <span>
                        <IconPulse />
                        {t('消耗趋势')}
                      </span>
                    }
                    itemKey='4'
                  />
                </Tabs>
              </div>
            }
            bodyStyle={{ padding: 0 }}
          >
            <div className='h-96 p-2'>
              {activeChartTab === '1' && (
                <VChart spec={spec_pie} option={CHART_CONFIG} />
              )}
              {activeChartTab === '2' && (
                <VChart spec={spec_rank_bar} option={CHART_CONFIG} />
              )}
              {activeChartTab === '3' && (
                <VChart spec={spec_line} option={CHART_CONFIG} />
              )}
              {activeChartTab === '4' && (
                <VChart spec={spec_model_line} option={CHART_CONFIG} />
              )}
            </div>
          </Card>

          {isAdmin() && (
            <Card
              {...CARD_PROPS}
              className={`shadow-sm !rounded-2xl`}
              title={
                <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between w-full gap-3'>
                  <div className={FLEX_CENTER_GAP2}>
                    <PieChart size={16} />
                    {t('用户token数排行')}
                  </div>
                </div>
              }
              bodyStyle={{ padding: 0 }}
            >
              <div className='h-96 p-2'>
                <VChart
                  spec={user_consumption_rank_bar}
                  option={CHART_CONFIG}
                />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Detail;
