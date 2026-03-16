import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Connection,
  type NodeMouseHandler,
} from 'reactflow'

import { getDefaultProperties } from '../../resourceSchemas'
import type { AvailableResource, BlueprintBuilderAction, BlueprintNode as BPNode, BlueprintEdge } from '../../types'
import BlueprintNode from '../BlueprintNode/BlueprintNode'

import styles from './BlueprintCanvas.module.css'

interface BlueprintCanvasProps {
  dispatch: React.Dispatch<BlueprintBuilderAction>
  edges: BlueprintEdge[]
  nodes: BPNode[]
  onNodeDelete: (nodeId: string) => void
  selectedNodeId: string | null
}

const nodeTypes = { blueprintNode: BlueprintNode }

function inferRelationshipType(
  sourceKind: string,
  targetKind: string
): BlueprintEdge['data'] {
  const workloads = ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob']

  if (sourceKind === 'Service' && workloads.includes(targetKind)) {
    return { relationshipType: 'selector' }
  }
  if (sourceKind === 'Ingress' && targetKind === 'Service') {
    return { relationshipType: 'reference' }
  }
  if (sourceKind === 'ConfigMap' && workloads.includes(targetKind)) {
    return { relationshipType: 'mount' }
  }
  if (sourceKind === 'Secret' && workloads.includes(targetKind)) {
    return { relationshipType: 'envFrom' }
  }
  if (sourceKind === 'PersistentVolumeClaim' && workloads.includes(targetKind)) {
    return { relationshipType: 'mount' }
  }
  if (sourceKind === 'HorizontalPodAutoscaler' && workloads.includes(targetKind)) {
    return { relationshipType: 'scaleTarget' }
  }
  return { relationshipType: 'reference' }
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  envFrom: 'envFrom',
  mount: 'mounts',
  reference: 'references',
  scaleTarget: 'scales',
  selector: 'selects',
}

const BlueprintCanvas = ({
  dispatch,
  edges,
  nodes,
  onNodeDelete,
  selectedNodeId,
}: BlueprintCanvasProps) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const nodesWithMeta = useMemo(
    () =>
      nodes.map((nd) => ({
        ...nd,
        data: {
          ...nd.data,
          nodeId: nd.id,
          onDelete: onNodeDelete,
          selected: nd.id === selectedNodeId,
        },
      })),
    [nodes, selectedNodeId, onNodeDelete]
  )

  const edgesWithLabels = useMemo(
    () =>
      edges.map((ed) => ({
        animated: true,
        id: ed.id,
        label: ed.data?.relationshipType
          ? RELATIONSHIP_LABELS[ed.data.relationshipType] || ed.data.relationshipType
          : undefined,
        source: ed.source,
        target: ed.target,
      })),
    [edges]
  )

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragOver(false)

      const data = event.dataTransfer.getData('application/blueprint-resource')
      if (!data) { return }

      const resource = JSON.parse(data) as AvailableResource

      const bounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (!bounds) { return }

      const position = {
        x: event.clientX - bounds.left - 100,
        y: event.clientY - bounds.top - 40,
      }

      dispatch({
        payload: {
          apiVersion: resource.apiVersion,
          category: resource.category,
          icon: resource.icon,
          kind: resource.kind,
          position,
        },
        type: 'ADD_NODE',
      })

      const lastNodeId = document.querySelector('[data-id]')
      if (lastNodeId) {
        const nodeId = nodes.length > 0 ? nodes[nodes.length - 1].id : null
        if (nodeId) {
          const defaults = getDefaultProperties(resource.kind)
          dispatch({
            payload: { data: { properties: defaults }, nodeId },
            type: 'UPDATE_NODE_DATA',
          })
        }
      }
    },
    [dispatch, nodes]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) { return }

      const sourceNode = nodes.find((nd) => nd.id === connection.source)
      const targetNode = nodes.find((nd) => nd.id === connection.target)
      if (!sourceNode || !targetNode) { return }

      const relData = inferRelationshipType(sourceNode.data.kind, targetNode.data.kind)
      const newEdge: BlueprintEdge = {
        data: relData,
        id: `edge-${connection.source}-${connection.target}`,
        source: connection.source,
        target: connection.target,
      }

      dispatch({ payload: newEdge, type: 'ADD_EDGE' })
    },
    [dispatch, nodes]
  )

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      dispatch({ payload: { nodeId: node.id }, type: 'SELECT_NODE' })
    },
    [dispatch]
  )

  const onPaneClick = useCallback(() => {
    dispatch({ payload: { nodeId: null }, type: 'SELECT_NODE' })
  }, [dispatch])

  return (
    <div className={styles.canvas} ref={reactFlowWrapper}>
      <ReactFlow
        edges={edgesWithLabels}
        fitView={false}
        nodeTypes={nodeTypes}
        nodes={nodesWithMeta}
        nodesConnectable
        onConnect={onConnect}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onEdgesChange={(changes) => dispatch({ payload: changes, type: 'ON_EDGES_CHANGE' })}
        onNodeClick={onNodeClick}
        onNodesChange={(changes) => dispatch({ payload: changes, type: 'ON_NODES_CHANGE' })}
        onPaneClick={onPaneClick}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
        />
      </ReactFlow>
      {isDragOver && (
        <div className={styles.dropOverlay}>
          <span className={styles.dropLabel}>Drop resource here</span>
        </div>
      )}
    </div>
  )
}

export default BlueprintCanvas
