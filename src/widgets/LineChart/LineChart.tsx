import { Empty } from 'antd'
import ReactECharts from 'echarts-for-react'

import { getColorCode } from '../../theme/palette'
import type { WidgetProps } from '../../types/Widget'

import styles from './LineChart.module.css'
import type { LineChart as WidgetType } from './LineChart.type'

export type LineChartWidgetData = WidgetType['spec']['widgetData']

const LineChart = ({ uid, widgetData }: WidgetProps<LineChartWidgetData>) => {
  const { lines, xAxisName, yAxisName } = widgetData

  if (!lines.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  const dataChart = [...lines]

  const xValues = dataChart[0]?.coords?.map(({ xAxis }) => xAxis) || []

  const optionLine = {
    grid: {
      bottom: '30%',
      left: '15%',
    },
    legend: {
      bottom: 0,
      data: lines.map(({ name }) => name),
    },
    series: lines.map(({ color, coords, name }) => ({
      color: getColorCode(color),
      data: coords?.map(({ yAxis }) => yAxis) || [],
      name,
      smooth: true,
      type: 'line',
    })),
    xAxis: {
      axisLabel: {
        rotate: 45,
      },
      data: xValues,
      name: xAxisName,
    },
    yAxis: {
      name: yAxisName,
    },
  }

  return (
    <div className={styles.lineChart}>
      <ReactECharts key={uid} option={optionLine} />
    </div>
  )
}

export default LineChart
