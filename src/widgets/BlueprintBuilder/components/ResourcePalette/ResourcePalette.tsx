import type { IconProp } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Collapse, Input } from 'antd'
import { useMemo, useState, type DragEvent } from 'react'

import { RESOURCE_ICONS } from '../../resourceSchemas'
import type { AvailableResource, ResourceCategory } from '../../types'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../types'

import styles from './ResourcePalette.module.css'

interface ResourcePaletteProps {
  availableResources: AvailableResource[]
}

const ResourcePalette = ({ availableResources }: ResourcePaletteProps) => {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) {
      return availableResources
    }
    const lower = search.toLowerCase()
    return availableResources.filter(
      (res) =>
        res.kind.toLowerCase().includes(lower) ||
        res.apiVersion.toLowerCase().includes(lower)
    )
  }, [availableResources, search])

  const grouped = useMemo(() => {
    const groups: Partial<Record<ResourceCategory, AvailableResource[]>> = {}
    for (const resource of filtered) {
      const cat = resource.category
      if (!groups[cat]) {
        groups[cat] = []
      }
      groups[cat]?.push(resource)
    }
    return groups
  }, [filtered])

  const onDragStart = (event: DragEvent<HTMLDivElement>, resource: AvailableResource) => {
    event.dataTransfer.setData('application/blueprint-resource', JSON.stringify(resource))
    event.dataTransfer.effectAllowed = 'move'
  }

  const collapseItems = CATEGORY_ORDER
    .filter((cat) => grouped[cat] && (grouped[cat]?.length ?? 0) > 0)
    .map((cat) => ({
      children: (
        <div>
          {grouped[cat]!.map((resource) => (
            <div
              className={styles.resourceItem}
              draggable
              key={`${resource.kind}-${resource.apiVersion}`}
              onDragStart={(dragEvent) => onDragStart(dragEvent, resource)}
            >
              <FontAwesomeIcon
                className={styles.resourceIcon}
                icon={(resource.icon || RESOURCE_ICONS[resource.kind] || 'fa-cube') as IconProp}
              />
              <span className={styles.resourceLabel}>{resource.kind}</span>
              <span className={styles.resourceApi}>{resource.apiVersion}</span>
            </div>
          ))}
        </div>
      ),
      key: cat,
      label: CATEGORY_LABELS[cat],
    }))

  return (
    <div className={styles.palette}>
      <Input.Search
        allowClear
        className={styles.search}
        onChange={(inputEvent) => setSearch(inputEvent.target.value)}
        placeholder='Search resources...'
        value={search}
      />
      <Collapse
        defaultActiveKey={CATEGORY_ORDER}
        ghost
        items={collapseItems}
        size='small'
      />
    </div>
  )
}

export default ResourcePalette
