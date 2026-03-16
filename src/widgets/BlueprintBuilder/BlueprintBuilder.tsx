import { Empty } from 'antd'
import useApp from 'antd/es/app/useApp'
import { useCallback, useEffect, useMemo } from 'react'

import type { WidgetProps } from '../../types/Widget'

import styles from './BlueprintBuilder.module.css'
import type { BlueprintBuilder as WidgetType } from './BlueprintBuilder.type'
import BlueprintCanvas from './components/BlueprintCanvas/BlueprintCanvas'
import BlueprintToolbar from './components/BlueprintToolbar/BlueprintToolbar'
import HelmPreview from './components/HelmPreview/HelmPreview'
import PropertyPanel from './components/PropertyPanel/PropertyPanel'
import ResourcePalette from './components/ResourcePalette/ResourcePalette'
import { generateChart } from './helm/generateChart'
import { packChart } from './helm/packChart'
import { buildSchemaRegistry } from './resourceSchemas'
import { DEFAULT_RESOURCES } from './resourceSchemas/defaults'
import type { AvailableResource } from './types'
import { useBlueprintBuilderState } from './useBlueprintBuilderState'

export type BlueprintBuilderWidgetData = WidgetType['spec']['widgetData']

const BlueprintBuilder = ({ widgetData }: WidgetProps<BlueprintBuilderWidgetData>) => {
  const { notification } = useApp()

  const availableResources = useMemo(() => {
    const fromWidget = widgetData?.availableResources as AvailableResource[] | undefined
    return fromWidget && fromWidget.length > 0 ? fromWidget : DEFAULT_RESOURCES
  }, [widgetData?.availableResources])

  useEffect(() => {
    buildSchemaRegistry(availableResources)
  }, [availableResources])

  const {
    clearHelmExpression,
    dispatch,
    removeNode,
    setHelmExpression,
    state,
    updateChartMeta,
    updateNodeData,
  } = useBlueprintBuilderState(widgetData?.chartDefaults)

  const selectedNode = useMemo(
    () => state.nodes.find((nd) => nd.id === state.selectedNodeId),
    [state.nodes, state.selectedNodeId]
  )

  const handleExport = useCallback(() => {
    try {
      const files = generateChart(state)
      packChart(state.chart.name, files)
      notification.success({
        description: `Chart "${state.chart.name}" has been downloaded as .tgz`,
        message: 'Chart exported successfully',
        placement: 'bottomLeft',
      })
    } catch (error) {
      notification.error({
        description: String(error),
        message: 'Failed to export chart',
        placement: 'bottomLeft',
      })
    }
  }, [state, notification])

  if (!availableResources || availableResources.length === 0) {
    return <Empty description='No Kubernetes resources available' />
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <BlueprintToolbar
          chart={state.chart}
          nodeCount={state.nodes.length}
          onExport={handleExport}
          onUpdateChartMeta={updateChartMeta}
        />
      </div>

      <div className={styles.body}>
        <div className={styles.palette}>
          <ResourcePalette availableResources={availableResources} />
        </div>

        <div className={styles.canvas}>
          <BlueprintCanvas
            dispatch={dispatch}
            edges={state.edges}
            nodes={state.nodes}
            onNodeDelete={removeNode}
            selectedNodeId={state.selectedNodeId}
          />
        </div>

        <div className={styles.propertyPanel}>
          <PropertyPanel
            edges={state.edges}
            node={selectedNode}
            nodes={state.nodes}
            onClearHelmExpression={clearHelmExpression}
            onSetHelmExpression={setHelmExpression}
            onUpdateNodeData={updateNodeData}
          />
        </div>
      </div>

      <div className={styles.preview}>
        <HelmPreview
          activeTab={state.previewTab}
          onTabChange={(tab) => dispatch({ payload: tab, type: 'SET_PREVIEW_TAB' })}
          state={state}
        />
      </div>
    </div>
  )
}

export default BlueprintBuilder
