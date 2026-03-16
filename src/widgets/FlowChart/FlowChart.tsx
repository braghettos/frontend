import dagre from '@dagrejs/dagre'
import { Empty } from 'antd'
import { useMemo } from 'react'
import type { Edge, Node } from 'reactflow'
import ReactFlow, { Controls, Position, useEdgesState, useNodesState } from 'reactflow'

import type { WidgetProps } from '../../types/Widget'

import styles from './FlowChart.module.css'
import type { FlowChart as WidgetType } from './FlowChart.type'
import FlowChartNodeElement from './FlowChartNodeElement'
import { parseGraphData } from './utils'

export type FlowChartWidgetData = WidgetType['spec']['widgetData']
export type FlowChartData = FlowChartWidgetData['data']
export type FlowChartNodeData = NonNullable<FlowChartData>[number]
export type NodeElement = Node<FlowChartNodeData> & { type: 'nodeElement' }

const getLayoutedElements = (nodes: NodeElement[], edges: Edge[], direction: string) => {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))

  const nodeWidth = 400
  const nodeHeight = 200

  dagreGraph.setGraph({ rankdir: direction })

  nodes.forEach(({ id }) => {
    dagreGraph.setNode(id, { height: nodeHeight, width: nodeWidth })
  })

  edges.forEach(({ source, target }) => {
    dagreGraph.setEdge(source, target)
  })

  dagre.layout(dagreGraph)

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id) as {x: number; y: number}
    node.targetPosition = Position.Left
    node.sourcePosition = Position.Right

    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    }

    return node
  })

  return { edges, nodes }
}

const FlowChart = ({ uid, widgetData }: WidgetProps<FlowChartWidgetData>) => {
  const { data } = widgetData

  const nodeType = useMemo(() => ({ nodeElement: FlowChartNodeElement }), [])

  const { parsedEdges, parsedNodes } = parseGraphData(data)
  const { edges: layoutedEdges, nodes: layoutedNodes } = getLayoutedElements(parsedNodes, parsedEdges, 'LR')

  const [nodes, , onNodesChange] = useNodesState(layoutedNodes)
  const [edges, , onEdgesChange] = useEdgesState(layoutedEdges)

  if (!data || parsedNodes.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <div className={styles.flowChart} key={uid}>
      <ReactFlow
        edges={edges}
        fitView
        nodeTypes={nodeType}
        nodes={nodes}
        nodesConnectable={false}
        onEdgesChange={onEdgesChange}
        onNodesChange={onNodesChange}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export default FlowChart
