import type { Edge } from 'reactflow'

import type { FlowChartData, NodeElement } from './FlowChart'

export const parseGraphData = (data: FlowChartData): { parsedNodes: NodeElement[]; parsedEdges: Edge[] } => {
  if (!data || !Array.isArray(data)) {
    return { parsedEdges: [], parsedNodes: [] }
  }

  try {
    const parsedNodes = data.map(
      (node): NodeElement => ({
        data: node,
        id: node.uid,
        position: { x: 0, y: 0 },
        type: 'nodeElement',
      })
    )

    const parsedEdges: Edge[] = data.flatMap(({ parentRefs, uid }) =>
      (parentRefs ?? [])
        .filter((ref): ref is { uid: string } => typeof ref?.uid === 'string')
        .map((ref) => ({
          id: `${ref.uid}-${uid}`,
          label: '',
          source: ref.uid,
          target: uid,
        }))
    )

    return { parsedEdges, parsedNodes }
  } catch (error) {
    console.error('Error parsing data', error)
    return { parsedEdges: [], parsedNodes: [] }
  }
}
