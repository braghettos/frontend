import WidgetRenderer from '../../components/WidgetRenderer'
import type { WidgetProps } from '../../types/Widget'

import type { RoutesLoader as WidgetType } from './RoutesLoader.type'

export type RoutesLoaderWidgetData = WidgetType['spec']['widgetData']

export function RoutesLoader({ resourcesRefs }: WidgetProps<RoutesLoaderWidgetData>) {
  return (
    <>
      {resourcesRefs.items.map(({ id, path }, index) => (
        <WidgetRenderer invisible={true} key={`${id}-${index}`} widgetEndpoint={path} />
      ))}
    </>
  )
}
