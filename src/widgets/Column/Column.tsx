import { Col as AntdColumn } from 'antd'

import WidgetRenderer from '../../components/WidgetRenderer'
import type { WidgetProps } from '../../types/Widget'
import { getEndpointUrl } from '../../utils/utils'

import styles from './Column.module.css'
import type { Column as WidgetType } from './Column.type'

export type ColumnWidgetData = WidgetType['spec']['widgetData']

const Column = ({ resourcesRefs, uid, widgetData }: WidgetProps<ColumnWidgetData>) => {
  const { items, size } = widgetData

  if (size === 0) {
    return null
  }

  return (
    <AntdColumn className={styles.column} key={uid} span={size}>
      {items
        .map(({ resourceRefId }, index) => {
          const endpoint = getEndpointUrl(resourceRefId, resourcesRefs)
          if (!endpoint) {
            return null
          }

          return <WidgetRenderer key={`${uid}-${index}`} widgetEndpoint={endpoint} />
        })
        .filter(Boolean)}
    </AntdColumn>
  )
}

export default Column
