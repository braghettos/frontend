import { useEffect } from 'react'

import { createRoute, useRoutesContext } from '../../context/RoutesContext'
import type { WidgetProps } from '../../types/Widget'
import { getEndpointUrl } from '../../utils/utils'

import type { Route as WidgetType } from './Route.type'

export type RouteWidgetData = WidgetType['spec']['widgetData']

export function Route({ resourcesRefs, widgetData }: WidgetProps<RouteWidgetData>) {
  const { path, resourceRefId } = widgetData
  const { registerRoutes } = useRoutesContext()

  useEffect(() => {
    const endpoint = getEndpointUrl(resourceRefId, resourcesRefs)

    if (endpoint) {
      registerRoutes([createRoute({ endpoint, path })])
    }
  }, [registerRoutes, resourcesRefs, path, resourceRefId])
  return null
}
