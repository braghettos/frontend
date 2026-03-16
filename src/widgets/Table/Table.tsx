import type { IconProp } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Table as AntdTable, Result, Typography } from 'antd'

import { useFilter } from '../../components/FiltesProvider/FiltersProvider'
import WidgetRenderer from '../../components/WidgetRenderer'
import type { WidgetProps } from '../../types/Widget'
import { getEndpointUrl } from '../../utils/utils'

import styles from './Table.module.css'
import type { Table as WidgetType } from './Table.type'

export type TableWidgetData = WidgetType['spec']['widgetData']

const Table = ({ resourcesRefs, uid, widgetData }: WidgetProps<TableWidgetData>) => {
  const { columns, data, pageSize, prefix } = widgetData
  const { getFilteredData } = useFilter()

  // TODO: check if this works with RESTAction, it should not be displayed
  if (!columns.length) {
    return (
      <Result
        status='error'
        subTitle={'It is necessary to configure columns data in order to display Table data.'}
        title={'Error while rendering widget'}
      />
    )
  }

  let dataTable: TableWidgetData['data'] = data
  if (prefix && data?.length > 0) {
    dataTable = getFilteredData(data, prefix) as TableWidgetData['data']
  }

  return (
    <AntdTable
      columns={columns?.map(({ color, title, valueKey }, index) => ({
        dataIndex: valueKey,
        key: `${uid}-col-${index}`,
        render: (_: unknown, row: TableWidgetData['data'][number]) => {
          const cell = row.find((cell) => cell.valueKey === valueKey)

          if (!cell) {
            console.error('Table rendering error: cell is undefined')
            return <span>-</span>
          }

          const { arrayValue, booleanValue, decimalValue, kind, numberValue, resourceRefId, stringValue, type } = cell
          const endpoint = kind === 'widget' && resourceRefId && getEndpointUrl(resourceRefId, resourcesRefs)

          switch (kind) {
            case 'icon':
              if (stringValue) { return <FontAwesomeIcon color={color} icon={stringValue as IconProp} /> }
              console.error('Table rendering error: icon value has incorrect format')
              return <span>-</span>

            case 'widget':
              if (!resourceRefId) {
                console.error('Table rendering error: widget resourceRefId not found')
                return <span>-</span>
              }

              if (!endpoint) {
                console.error('Table rendering error: widget resourceRefId endpoint not found')
                return <span>-</span>
              }

              return <WidgetRenderer widgetEndpoint={endpoint} />

            case 'jsonSchemaType':
              if (!type) {
                console.error('Table rendering error: jsonSchemaType cell missing type')
                return <span>-</span>
              }

              switch (type) {
                case 'string':
                  return <span style={{ color }}>{stringValue ?? '-'}</span>
                case 'number':
                case 'integer':
                  return <span style={{ color }}>{numberValue ?? '-'}</span>
                case 'decimal':
                  return <span style={{ color }}>{String(decimalValue) ?? '-'}</span>
                case 'boolean':
                  return <span style={{ color }}>{booleanValue !== undefined ? String(booleanValue) : '-'}</span>
                case 'array':
                  return <span style={{ color }}>{arrayValue ? arrayValue.join(', ') : '-'}</span>
                case 'null':
                  return <span>-</span>
                default:
                  console.error('Table rendering error: unknown jsonSchemaType')
                  return <span>-</span>
              }

            default:
              console.error('Table rendering error: unknown kind')
              return <span>-</span>
          }
        },
        title: (
          <div className={styles.headerEllipsis}>
            <Typography.Text ellipsis={{ tooltip: true }}>
              {title}
            </Typography.Text>
          </div>
        ),
      }))}
      dataSource={dataTable}
      key={uid}
      pagination={dataTable && pageSize && dataTable.length > pageSize ? { defaultPageSize: pageSize } : false}
      scroll={{ x: 'max-content' }}
    />
  )
}

export default Table
