import type { BlueprintEdge, BlueprintNode } from '../types'

import {
  generateConfigMapTemplate,
  generateCronJobTemplate,
  generateDaemonSetTemplate,
  generateDeploymentTemplate,
  generateGenericTemplate,
  generateHPATemplate,
  generateIngressTemplate,
  generateJobTemplate,
  generatePVCTemplate,
  generateSecretTemplate,
  generateServiceAccountTemplate,
  generateServiceTemplate,
  generateStatefulSetTemplate,
} from './generateTemplate'

type TemplateGenerator = (
  chartName: string,
  node: BlueprintNode,
  nodes: BlueprintNode[],
  edges: BlueprintEdge[]
) => string

const templateMap: Record<string, TemplateGenerator> = {
  ConfigMap: (chart, node) => generateConfigMapTemplate(chart, node),
  CronJob: (chart, node) => generateCronJobTemplate(chart, node),
  DaemonSet: (chart, node) => generateDaemonSetTemplate(chart, node),
  Deployment: generateDeploymentTemplate,
  HorizontalPodAutoscaler: generateHPATemplate,
  Ingress: generateIngressTemplate,
  Job: (chart, node) => generateJobTemplate(chart, node),
  PersistentVolumeClaim: (chart, node) => generatePVCTemplate(chart, node),
  Secret: (chart, node) => generateSecretTemplate(chart, node),
  Service: generateServiceTemplate,
  ServiceAccount: (chart, node) => generateServiceAccountTemplate(chart, node),
  StatefulSet: (chart, node) => generateStatefulSetTemplate(chart, node),
}

export function getTemplateGenerator(kind: string): TemplateGenerator {
  return templateMap[kind] ?? ((chart, node) => generateGenericTemplate(chart, node))
}
