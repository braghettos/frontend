import type { IconProp } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Tag } from 'antd'
import { memo } from 'react'
import { Handle, Position } from 'reactflow'

import { getResourceFields, RESOURCE_ICONS } from '../../resourceSchemas'
import type { ResourceNodeData } from '../../types'

import styles from './BlueprintNode.module.css'

interface BlueprintNodeProps {
  data: ResourceNodeData & {
    selected?: boolean
    onDelete?: (nodeId: string) => void
    nodeId?: string
  }
}

const BlueprintNode = memo(({ data }: BlueprintNodeProps) => {
  const { category, icon, kind, nodeId, onDelete, properties, resourceName, selected } = data

  const fields = getResourceFields(kind)
  const requiredFields = fields.filter((field) => field.required)
  const allRequiredFilled = requiredFields.every(
    (field) => properties[field.name] !== undefined && properties[field.name] !== ''
  )

  const summaryProps = Object.entries(properties)
    .filter(([, val]) => val !== undefined && val !== '' && val !== false)
    .slice(0, 3)

  return (
    <div
      className={styles.node}
      data-category={category}
      data-selected={selected}
    >
      <Handle position={Position.Left} type='target' />

      <div className={styles.header}>
        <FontAwesomeIcon
          className={styles.icon}
          icon={(icon || RESOURCE_ICONS[kind] || 'fa-cube') as IconProp}
        />
        <span className={styles.kindLabel}>{kind}</span>
        <span
          className={`${styles.validationDot} ${allRequiredFilled ? styles.valid : styles.invalid}`}
          title={allRequiredFilled ? 'All required fields set' : 'Missing required fields'}
        />
        {onDelete && nodeId && (
          <span
            className={styles.deleteBtn}
            onClick={(clickEvent) => {
              clickEvent.stopPropagation()
              onDelete(nodeId)
            }}
            role='button'
            tabIndex={0}
            title='Remove resource'
          >
            <FontAwesomeIcon icon={'fa-xmark' as IconProp} />
          </span>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.name}>{resourceName}</div>
        {summaryProps.length > 0 && (
          <div className={styles.propList}>
            {summaryProps.map(([key, propVal]) => (
              <Tag className={styles.propTag} key={key}>
                {key}: {String(propVal)}
              </Tag>
            ))}
          </div>
        )}
      </div>

      <Handle position={Position.Right} type='source' />
    </div>
  )
})

BlueprintNode.displayName = 'BlueprintNode'

export default BlueprintNode
