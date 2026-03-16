import { Empty } from 'antd'
import type { EChartsCoreOption } from 'echarts'
import ReactECharts from 'echarts-for-react'
import { useEffect, useRef, useState } from 'react'

import { getColorCode } from '../../theme/palette'
import type { WidgetProps } from '../../types/Widget'

import styles from './PieChart.module.css'
import type { PieChart as WidgetType } from './PieChart.type'

export type PieChartWidgetData = WidgetType['spec']['widgetData'];

const PieChart = ({ uid, widgetData }: WidgetProps<PieChartWidgetData>) => {
  const { description, series, title } = widgetData
  const chartRef = useRef<HTMLDivElement | null>(null)

  const [fontSizes, setFontSizes] = useState({
    subtitle: 16,
    title: 24,
  })

  const [offsets, setOffsets] = useState({
    subtitleY: 0,
    titleY: 0,
  })

  useEffect(() => {
    function updateLayout() {
      if (!chartRef.current || !series) { return }

      const { clientHeight: height, clientWidth: width } = chartRef.current
      const radius = Math.min(width, height) / 2
      const innerRadiusPx = radius * 0.60

      const availableHeight = innerRadiusPx * 2 * 0.85
      const availableWidth = innerRadiusPx * 2 * 0.85

      let titleFont = availableHeight * 0.45
      let subtitleFont = availableHeight * 0.24

      const titleLen = title?.length ?? 1
      const descLen = description?.length ?? 1

      titleFont = Math.min(titleFont, availableWidth / (titleLen * 0.55))
      subtitleFont = description
        ? Math.min(subtitleFont, availableWidth / (descLen * 0.55))
        : 0

      titleFont = Math.max(12, Math.min(48, titleFont))
      subtitleFont = Math.max(10, Math.min(24, subtitleFont))

      const baseGap = subtitleFont * 0.35
      const compactFactor = Math.max(0.4, Math.min(1, 40 / (titleLen + descLen)))
      const gap = Math.max(4, Math.min(18, baseGap * compactFactor))

      const blockHeight = titleFont + (description ? subtitleFont + gap : 0)

      const titleY = -blockHeight / 2 + titleFont * 0.15
      const subtitleY = description ? titleY + titleFont + gap : 0

      setFontSizes({
        subtitle: Math.round(subtitleFont),
        title: Math.round(titleFont),
      })

      setOffsets({
        subtitleY: Math.round(subtitleY),
        titleY: Math.round(titleY),
      })
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [series, title, description])

  if (!series) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  const { data, total } = series
  const filledValue = (data || []).reduce((sum, item) => sum + (item.value ?? 0), 0)
  const emptyValue = Math.max((total ?? 0) - filledValue, 0)

  const chartData = [
    ...(data || []).map((item) => ({
      itemStyle: { color: getColorCode(item.color || 'gray') },
      name: item.label ?? '',
      value: item.value ?? 0,
    })),
    {
      emphasis: { disabled: true },
      itemStyle: { color: '#E1E3E8' },
      label: { show: false },
      name: '',
      tooltip: { show: false },
      value: emptyValue,
    },
  ]

  const graphicTextElements = [
    {
      style: {
        fill: '#000',
        fontSize: fontSizes.title,
        fontWeight: 500,
        text: title ?? '',
        textAlign: 'center',
        textVerticalAlign: 'middle',
        x: 0,
        y: offsets.titleY,
      },
      type: 'text',
    },
  ]

  if (description) {
    graphicTextElements.push({
      style: {
        fill: '#666',
        fontSize: fontSizes.subtitle,
        fontWeight: 400,
        text: description,
        textAlign: 'center',
        textVerticalAlign: 'middle',
        x: 0,
        y: offsets.subtitleY,
      },
      type: 'text',
    })
  }

  const options: EChartsCoreOption = {
    graphic: {
      children: graphicTextElements,
      left: 'center',
      top: 'middle',
      type: 'group',
    },
    series: [
      {
        avoidLabelOverlap: false,
        data: chartData,
        itemStyle: {
          borderColor: '#fff',
          borderRadius: 6,
          borderWidth: 2,
        },
        label: { show: false },
        labelLine: { show: false },
        radius: ['65%', '85%'],
        type: 'pie',
      },
    ],
    tooltip: {
      confine: true,
      trigger: 'item',
    },
  }

  return (
    <div className={styles.pieChart} ref={chartRef}>
      <ReactECharts key={uid} option={options} />
    </div>
  )
}

export default PieChart
