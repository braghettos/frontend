import type { Node, NodeChange, EdgeChange, XYPosition } from 'reactflow'

export type ResourceCategory = 'workloads' | 'networking' | 'config' | 'storage' | 'rbac' | 'custom'

export interface ResourceSchemaProperty {
  type?: string
  description?: string
  format?: string
  default?: unknown
  enum?: string[]
  minimum?: number
  maximum?: number
  items?: ResourceSchemaProperty
  properties?: Record<string, ResourceSchemaProperty>
  required?: string[]
  'x-kubernetes-int-or-string'?: boolean
  additionalProperties?: boolean | ResourceSchemaProperty
}

export interface ResourceSchema {
  type?: string
  description?: string
  properties?: Record<string, ResourceSchemaProperty>
  required?: string[]
}

export interface AvailableResource {
  kind: string
  apiVersion: string
  category: ResourceCategory
  icon?: string
  schema?: ResourceSchema
}

export interface ChartMeta {
  name: string
  version: string
  description: string
  appVersion: string
}

export interface ResourceField {
  name: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'list' | 'keyValue'
  required?: boolean
  defaultValue?: unknown
  options?: { label: string; value: string }[]
  placeholder?: string
  helmParameterize?: boolean
}

export interface ResourceNodeData {
  kind: string
  apiVersion: string
  category: ResourceCategory
  icon?: string
  resourceName: string
  properties: Record<string, unknown>
  /** Maps field name → Helm template expression. Empty string means not parameterized. */
  helmExpressions: Map<string, string>
}

export type BlueprintNode = Node<ResourceNodeData> & { type: 'blueprintNode' }

export type BlueprintEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  type?: string
  animated?: boolean
  label?: string
  data?: {
    relationshipType: 'selector' | 'mount' | 'envFrom' | 'reference' | 'scaleTarget'
  }
}

export interface BlueprintBuilderState {
  chart: ChartMeta
  nodes: BlueprintNode[]
  edges: BlueprintEdge[]
  selectedNodeId: string | null
  previewTab: string
}

export type BlueprintBuilderAction =
  | { type: 'ADD_NODE'; payload: { kind: string; apiVersion: string; category: ResourceCategory; icon?: string; position: XYPosition } }
  | { type: 'REMOVE_NODE'; payload: { nodeId: string } }
  | { type: 'UPDATE_NODE_DATA'; payload: { nodeId: string; data: Partial<ResourceNodeData> } }
  | { type: 'SET_HELM_EXPRESSION'; payload: { nodeId: string; fieldName: string; expression: string } }
  | { type: 'CLEAR_HELM_EXPRESSION'; payload: { nodeId: string; fieldName: string } }
  | { type: 'ADD_EDGE'; payload: BlueprintEdge }
  | { type: 'REMOVE_EDGE'; payload: { edgeId: string } }
  | { type: 'SELECT_NODE'; payload: { nodeId: string | null } }
  | { type: 'UPDATE_CHART_META'; payload: Partial<ChartMeta> }
  | { type: 'SET_PREVIEW_TAB'; payload: string }
  | { type: 'ON_NODES_CHANGE'; payload: NodeChange[] }
  | { type: 'ON_EDGES_CHANGE'; payload: EdgeChange[] }

export interface GeneratedFile {
  path: string
  content: string
}

export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  config: 'Configuration',
  custom: 'Custom Resources',
  networking: 'Networking',
  rbac: 'RBAC',
  storage: 'Storage',
  workloads: 'Workloads',
}

export const CATEGORY_ORDER: ResourceCategory[] = [
  'workloads',
  'networking',
  'config',
  'storage',
  'rbac',
  'custom',
]
