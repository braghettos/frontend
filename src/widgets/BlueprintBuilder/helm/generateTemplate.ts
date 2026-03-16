import type { BlueprintEdge, BlueprintNode } from '../types'

export function resolveValue(
  _resourceName: string,
  field: string,
  helmExpressions: Map<string, string>,
  fallback: unknown
): string {
  const expr = helmExpressions.get(field)
  if (expr !== undefined) {
    return expr
  }
  if (typeof fallback === 'string') { return fallback }
  if (typeof fallback === 'number') { return String(fallback) }
  if (typeof fallback === 'boolean') { return String(fallback) }
  return '""'
}

export function resolveQuoted(
  _resourceName: string,
  field: string,
  helmExpressions: Map<string, string>,
  fallback: unknown
): string {
  const expr = helmExpressions.get(field)
  if (expr !== undefined) {
    return expr
  }
  if (typeof fallback === 'string') { return `"${fallback}"` }
  if (fallback !== null && fallback !== undefined) {
    return `"${typeof fallback === 'object' ? JSON.stringify(fallback) : String(fallback as string | number | boolean)}"`
  }
  return '""'
}

export function findConnectedByKind(
  nodeId: string,
  nodes: BlueprintNode[],
  edges: BlueprintEdge[],
  targetKinds: string[]
): BlueprintNode[] {
  const results: BlueprintNode[] = []

  for (const edge of edges) {
    if (edge.source === nodeId || edge.target === nodeId) {
      const otherId = edge.source === nodeId ? edge.target : edge.source
      const other = nodes.find((node) => node.id === otherId)
      if (other && targetKinds.includes(other.data.kind)) {
        results.push(other)
      }
    }
  }

  return results
}

export function findConnectedWorkload(
  nodeId: string,
  nodes: BlueprintNode[],
  edges: BlueprintEdge[]
): BlueprintNode | undefined {
  const workloadKinds = ['Deployment', 'StatefulSet', 'DaemonSet']
  const results = findConnectedByKind(nodeId, nodes, edges, workloadKinds)
  return results[0]
}

export function findConnectedService(
  nodeId: string,
  nodes: BlueprintNode[],
  edges: BlueprintEdge[]
): BlueprintNode | undefined {
  const results = findConnectedByKind(nodeId, nodes, edges, ['Service'])
  return results[0]
}

export {
  generateDeploymentTemplate,
  generateServiceTemplate,
  generateConfigMapTemplate,
  generateSecretTemplate,
} from './templateWorkloads'

export {
  generateIngressTemplate,
  generatePVCTemplate,
  generateHPATemplate,
  generateServiceAccountTemplate,
  generateStatefulSetTemplate,
  generateJobTemplate,
  generateCronJobTemplate,
  generateDaemonSetTemplate,
  generateGenericTemplate,
} from './templateOther'
