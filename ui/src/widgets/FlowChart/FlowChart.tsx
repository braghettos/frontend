import { FlowGraph, G6 } from '@ant-design/graphs'
import { ReactNode as G6ReactNode } from '@antv/g6-extension-react'

import { WidgetEmpty } from '../../components/WidgetStates'
import type { WidgetProps } from '../../types/Widget'

import styles from './FlowChart.module.css'
import type { FlowChart as WidgetType } from './FlowChart.type'
import FlowChartNodeElement from './FlowChartNodeElement'
import { toGraphData } from './utils'

export type FlowChartWidgetData = WidgetType['spec']['widgetData']
export type FlowChartData = FlowChartWidgetData['data']
export type FlowChartNodeData = NonNullable<FlowChartData>[number]

// Register the React custom-node type once so antd components render as G6 nodes.
try {
  G6.register(G6.ExtensionCategory.NODE, 'react', G6ReactNode)
} catch {
  /* already registered */
}

const FlowChart = ({ uid, widgetData }: WidgetProps<FlowChartWidgetData>) => {
  const { data } = widgetData
  const graphData = toGraphData(data)

  if (!data || graphData.nodes.length === 0) {
    return <WidgetEmpty description='Nothing to graph' />
  }

  return (
    <div className={styles.flowChart} key={uid}>
      <FlowGraph
        autoFit='view'
        behaviors={['drag-canvas', 'zoom-canvas']}
        data={graphData}
        // Edges: ONE curve per parent, not an orthogonal bundle.
        //
        // @ant-design/graphs defaults edges to polyline + router:{type:'orth'}, and this component
        // used to pass no `edge` at all, so that default stood. An orthogonal router routes every
        // edge through a mid-x corridor — fine for a chain, ruinous for a fan-in: on /agents twelve
        // agents share one rank and one target, so all twelve vertical segments landed on the SAME
        // line inside a 60px gap and drew over each other. `cubic-horizontal` gives each parent its
        // own curve, so a fan-in reads as a fan.
        //
        // `router: false` is load-bearing: the library deep-merges its options, so omitting the key
        // would keep the inherited router:{type:'orth'} and the curve would still be squared off.
        edge={{ style: { router: false }, type: 'cubic-horizontal' }}
        // dagre (layered, left-to-right) was already in effect — this widget was never missing a
        // layout. What it lacked was room: ranksep/nodesep were the library's small-node values
        // while the cards are 400px wide, so columns sat closer together than the cards themselves.
        layout={{ nodesep: 32, rankdir: 'LR', ranksep: 160, type: 'dagre' }}
        node={{
          style: {
            component: (datum: { data: FlowChartNodeData }) => <FlowChartNodeElement data={datum.data} />,
            ports: [{ placement: 'left' }, { placement: 'right' }],
            // THE BOX DAGRE RESERVES, AND IT MUST MATCH THE CARD.
            //
            // This said [300, 140] while FlowChartNodeElement.module.css painted a 400px card
            // (+10px padding +1px border = 422px under content-box). dagre packed 300px boxes with
            // a 60px column gap, so every card overhung its own reserved area by ~120px — drawing
            // on top of its own outbound edges and into the next column. That was the reported
            // "nodes overlap links", and it was never a layout-algorithm problem.
            //
            // The card now uses border-box and fills this width exactly (see the CSS), so this
            // array is the single source of truth for node geometry. Change it here, not there.
            size: [400, 150],
          },
          type: 'react',
        }}
      />
    </div>
  )
}

export default FlowChart
