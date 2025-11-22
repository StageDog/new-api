/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import { Card, Tabs, TabPane } from '@douyinfe/semi-ui';
import { PieChart } from 'lucide-react';
import { VChart } from '@visactor/react-vchart';

const ChartsPanel = ({
  chart,
  CARD_PROPS,
  CHART_CONFIG,
  FLEX_CENTER_GAP2,
  t,
}) => {
  return (
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
          spec={chart}
          option={CHART_CONFIG}
        />
      </div>
    </Card>
  );
};

export default ChartsPanel;
