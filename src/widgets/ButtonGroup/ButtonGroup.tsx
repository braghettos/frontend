import WidgetRenderer from '../../components/WidgetRenderer'
import type { WidgetProps } from '../../types/Widget'
import { getEndpointUrl } from '../../utils/utils'

import styles from './ButtonGroup.module.css'
import type { ButtonGroup as WidgetType } from './ButtonGroup.type'

export type ButtonGroupWidgetData = WidgetType['spec']['widgetData']

const gapMap: Record<NonNullable<ButtonGroupWidgetData['gap']>, React.CSSProperties['gap']> = {
  'extra-small': 'var(--spacing-xs)',
  large: 'var(--spacing-lg)',
  medium: 'var(--spacing-md)',
  small: 'var(--spacing-sm)',
}

const justifyContentMap: Record< NonNullable<ButtonGroupWidgetData['alignment']>, React.CSSProperties['justifyContent']> = {
  center: 'center',
  left: 'flex-start',
  right: 'flex-end',
}

const ButtonGroup = ({ resourcesRefs, uid, widgetData }: WidgetProps<ButtonGroupWidgetData>) => {
  const { alignment, gap, items } = widgetData

  return (
    <div
      className={styles.inlineGroup}
      key={uid}
      style={{
        gap: gapMap[gap ?? 'small'],
        justifyContent: justifyContentMap[alignment ?? 'left'],
      }}
    >
      {items
        .map(({ resourceRefId }, index) => {
          const endpoint = getEndpointUrl(resourceRefId, resourcesRefs)
          if (!endpoint) {
            return null
          }

          return <WidgetRenderer key={`${uid}-${index}`} widgetEndpoint={endpoint} />
        })
        .filter(Boolean)}
    </div>
  )
}

export default ButtonGroup
