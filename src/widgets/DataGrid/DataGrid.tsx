import { List } from 'antd'
import type { ListGridType } from 'antd/es/list'
import { useMemo } from 'react'

import WidgetRenderer from '../../components/WidgetRenderer'
import type { WidgetProps } from '../../types/Widget'
import { getEndpointUrl } from '../../utils/utils'

import styles from './DataGrid.module.css'
import type { DataGrid as WidgetType } from './DataGrid.type'

export type DataGridWidgetData = WidgetType['spec']['widgetData']

const DataGrid = ({ resourcesRefs, widgetData }: WidgetProps<DataGridWidgetData>) => {
  const { asGrid, grid, items, prefix } = widgetData

  const datalist = useMemo(() => items
    .map(({ resourceRefId }) => {
      const endpoint = getEndpointUrl(resourceRefId, resourcesRefs)
      if (!endpoint) { return null }

      return <WidgetRenderer key={resourceRefId} prefix={prefix} widgetEndpoint={endpoint} wrapper={{ component: List.Item }} />
    })
    .filter(Boolean),
  [items, prefix, resourcesRefs]
  )

  const renderedGrid: ListGridType = useMemo(() => {
    if (asGrid && items) {
      if (grid) {
        return grid
      }

      return {
        gutter: 16,
        lg: 3,
        md: 2,
        sm: 1,
        xl: 3,
        xs: 1,
        xxl: 4,
      }
    }

    return { column: 1, gutter: 16 }
  }, [asGrid, grid, items])

  return (
    <div className={styles.list}>
      <List dataSource={datalist} grid={renderedGrid} renderItem={(item) => item} />
    </div>
  )
}

export default DataGrid
