import type { IconProp } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Input } from 'antd'

import type { ChartMeta } from '../../types'

import styles from './BlueprintToolbar.module.css'

interface BlueprintToolbarProps {
  chart: ChartMeta
  nodeCount: number
  onExport: () => void
  onUpdateChartMeta: (meta: Partial<ChartMeta>) => void
}

const BlueprintToolbar = ({
  chart,
  nodeCount,
  onExport,
  onUpdateChartMeta,
}: BlueprintToolbarProps) => {
  return (
    <div className={styles.toolbar}>
      <FontAwesomeIcon icon={'fa-drafting-compass' as IconProp} style={{ fontSize: 20, opacity: 0.7 }} />
      <span className={styles.title}>Blueprint Builder</span>

      <div className={styles.fields}>
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Name:</span>
          <Input
            onChange={(ev) => onUpdateChartMeta({ name: ev.target.value })}
            size='small'
            style={{ width: 140 }}
            value={chart.name}
          />
        </div>
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Version:</span>
          <Input
            onChange={(ev) => onUpdateChartMeta({ version: ev.target.value })}
            size='small'
            style={{ width: 80 }}
            value={chart.version}
          />
        </div>
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>App:</span>
          <Input
            onChange={(ev) => onUpdateChartMeta({ appVersion: ev.target.value })}
            size='small'
            style={{ width: 80 }}
            value={chart.appVersion}
          />
        </div>
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Description:</span>
          <Input
            onChange={(ev) => onUpdateChartMeta({ description: ev.target.value })}
            size='small'
            style={{ width: 200 }}
            value={chart.description}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          disabled={nodeCount === 0}
          icon={<FontAwesomeIcon icon={'fa-download' as IconProp} />}
          onClick={onExport}
          type='primary'
        >
          Export Chart
        </Button>
      </div>
    </div>
  )
}

export default BlueprintToolbar
