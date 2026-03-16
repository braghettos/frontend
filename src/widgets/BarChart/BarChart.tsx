import { Empty, Progress, Space } from 'antd'

import { getColorCode } from '../../theme/palette'
import type { WidgetProps } from '../../types/Widget'

import styles from './BarChart.module.css'
import type { BarChart as WidgetType } from './BarChart.type'

export type BarChartWidgetData = WidgetType['spec']['widgetData']

const BarChart = ({ uid, widgetData }: WidgetProps<BarChartWidgetData>) => {
  const { data } = widgetData

  if (!data.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <div className={styles.chart} key={uid}>
      {
        data.map(({ bars, label }, index) => (
          <div className={styles.chartBarsRow} key={`multiplebar_${index}`}>
            <div className={styles.chartBarsData}>
              <div className={styles.chartBarsLabel}>{label}</div>
              <Space size='large' >
                {
                  bars.map(({ color, value }) => (
                    <span className={styles.chartBarsValue} style={{ color: getColorCode(color) }}>{value}</span>
                  ))
                }
              </Space>
            </div>
            <div className={styles.chartBarsList}>
              {
                bars.map(({ color, percentage }, i) => (
                  <Progress
                    className={styles.chartBarsProgress}
                    key={`progess_${i}`}
                    percent={percentage}
                    showInfo={false}
                    size='small'
                    strokeColor={getColorCode(color)}
                  />
                ))
              }
            </div>
          </div>
        ))
      }
    </div>
  )
}

export default BarChart
