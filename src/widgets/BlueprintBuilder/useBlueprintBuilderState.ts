import { useReducer, useCallback } from 'react'
import type { Edge } from 'reactflow'
import { applyNodeChanges, applyEdgeChanges } from 'reactflow'

import type {
  BlueprintBuilderAction,
  BlueprintBuilderState,
  BlueprintEdge,
  BlueprintNode,
  ChartMeta,
  ResourceNodeData,
} from './types'

let nodeIdCounter = 0

function generateNodeId(): string {
  nodeIdCounter += 1
  return `node-${Date.now()}-${nodeIdCounter}`
}

function createInitialState(chartDefaults?: Partial<ChartMeta>): BlueprintBuilderState {
  return {
    chart: {
      appVersion: chartDefaults?.appVersion ?? '1.0.0',
      description: chartDefaults?.description ?? 'A Helm chart for Kubernetes',
      name: chartDefaults?.name ?? 'my-chart',
      version: chartDefaults?.version ?? '0.1.0',
    },
    edges: [],
    nodes: [],
    previewTab: 'values',
    selectedNodeId: null,
  }
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

function reducer(state: BlueprintBuilderState, action: BlueprintBuilderAction): BlueprintBuilderState {
  switch (action.type) {
    case 'ADD_NODE': {
      const { apiVersion, category, icon, kind, position } = action.payload
      const existingCount = state.nodes.filter((node) => node.data.kind === kind).length
      const suffix = existingCount > 0 ? `-${existingCount + 1}` : ''
      const resourceName = `${toKebabCase(kind)}${suffix}`

      const newNode: BlueprintNode = {
        data: {
          apiVersion,
          category,
          helmExpressions: new Map<string, string>(),
          icon,
          kind,
          properties: {},
          resourceName,
        },
        id: generateNodeId(),
        position,
        type: 'blueprintNode',
      }

      return { ...state, nodes: [...state.nodes, newNode] }
    }

    case 'REMOVE_NODE': {
      const { nodeId } = action.payload
      return {
        ...state,
        edges: state.edges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId
        ),
        nodes: state.nodes.filter((node) => node.id !== nodeId),
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      }
    }

    case 'UPDATE_NODE_DATA': {
      const { data, nodeId } = action.payload
      return {
        ...state,
        nodes: state.nodes.map((node) => {
          if (node.id !== nodeId) {
            return node
          }
          return { ...node, data: { ...node.data, ...data } }
        }),
      }
    }

    case 'SET_HELM_EXPRESSION': {
      const { expression, fieldName, nodeId } = action.payload
      return {
        ...state,
        nodes: state.nodes.map((node) => {
          if (node.id !== nodeId) {
            return node
          }
          const newMap = new Map(node.data.helmExpressions)
          newMap.set(fieldName, expression)
          return { ...node, data: { ...node.data, helmExpressions: newMap } }
        }),
      }
    }

    case 'CLEAR_HELM_EXPRESSION': {
      const { fieldName, nodeId } = action.payload
      return {
        ...state,
        nodes: state.nodes.map((node) => {
          if (node.id !== nodeId) {
            return node
          }
          const newMap = new Map(node.data.helmExpressions)
          newMap.delete(fieldName)
          return { ...node, data: { ...node.data, helmExpressions: newMap } }
        }),
      }
    }

    case 'ADD_EDGE': {
      const newEdge = action.payload
      const exists = state.edges.some(
        (edge) => edge.source === newEdge.source && edge.target === newEdge.target
      )
      if (exists) {
        return state
      }
      return { ...state, edges: [...state.edges, newEdge] }
    }

    case 'REMOVE_EDGE': {
      return {
        ...state,
        edges: state.edges.filter((edge) => edge.id !== action.payload.edgeId),
      }
    }

    case 'SELECT_NODE': {
      return { ...state, selectedNodeId: action.payload.nodeId }
    }

    case 'UPDATE_CHART_META': {
      return { ...state, chart: { ...state.chart, ...action.payload } }
    }

    case 'SET_PREVIEW_TAB': {
      return { ...state, previewTab: action.payload }
    }

    case 'ON_NODES_CHANGE': {
      const updatedNodes = applyNodeChanges(action.payload, state.nodes) as BlueprintNode[]
      return { ...state, nodes: updatedNodes }
    }

    case 'ON_EDGES_CHANGE': {
      const updatedEdges = applyEdgeChanges(
        action.payload,
        state.edges as unknown as Edge[]
      ) as unknown as BlueprintEdge[]
      return { ...state, edges: updatedEdges }
    }

    default:
      return state
  }
}

export function useBlueprintBuilderState(chartDefaults?: Partial<ChartMeta>) {
  const [state, dispatch] = useReducer(reducer, chartDefaults, createInitialState)

  const addNode = useCallback(
    (payload: BlueprintBuilderAction & { type: 'ADD_NODE' }) => dispatch(payload),
    []
  )

  const removeNode = useCallback(
    (nodeId: string) => dispatch({ payload: { nodeId }, type: 'REMOVE_NODE' }),
    []
  )

  const updateNodeData = useCallback(
    (nodeId: string, data: Partial<ResourceNodeData>) =>
      dispatch({ payload: { data, nodeId }, type: 'UPDATE_NODE_DATA' }),
    []
  )

  const setHelmExpression = useCallback(
    (nodeId: string, fieldName: string, expression: string) =>
      dispatch({ payload: { expression, fieldName, nodeId }, type: 'SET_HELM_EXPRESSION' }),
    []
  )

  const clearHelmExpression = useCallback(
    (nodeId: string, fieldName: string) =>
      dispatch({ payload: { fieldName, nodeId }, type: 'CLEAR_HELM_EXPRESSION' }),
    []
  )

  const selectNode = useCallback(
    (nodeId: string | null) => dispatch({ payload: { nodeId }, type: 'SELECT_NODE' }),
    []
  )

  const updateChartMeta = useCallback(
    (meta: Partial<ChartMeta>) => dispatch({ payload: meta, type: 'UPDATE_CHART_META' }),
    []
  )

  return {
    addNode,
    clearHelmExpression,
    dispatch,
    removeNode,
    selectNode,
    setHelmExpression,
    state,
    updateChartMeta,
    updateNodeData,
  }
}
