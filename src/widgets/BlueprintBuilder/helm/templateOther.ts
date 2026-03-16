import type { BlueprintEdge, BlueprintNode } from '../types'

import { findConnectedService, findConnectedWorkload, resolveQuoted, resolveValue } from './generateTemplate'

export function generateIngressTemplate(
  chartName: string,
  node: BlueprintNode,
  nodes: BlueprintNode[],
  edges: BlueprintEdge[]
): string {
  const { data } = node
  const params = data.helmExpressions
  const resName = data.resourceName
  const props = data.properties

  const service = findConnectedService(node.id, nodes, edges)
  const svcName = service
    ? `{{ include "${chartName}.fullname" . }}-${service.data.resourceName}`
    : `{{ include "${chartName}.fullname" . }}`
  const svcPort = Number(service?.data.properties.port ?? 80)

  let template = `{{- if .Values.${resName}.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}`

  if (props.ingressClassName) {
    template += `\nspec:
  ingressClassName: ${resolveValue(resName, 'ingressClassName', params, props.ingressClassName)}`
  } else {
    template += `\nspec:`
  }

  if (props.tlsEnabled) {
    template += `\n  tls:
    - hosts:
        - ${resolveValue(resName, 'host', params, props.host ?? 'example.com')}
      secretName: ${resolveValue(resName, 'tlsSecretName', params, props.tlsSecretName ?? 'tls-secret')}`
  }

  template += `\n  rules:
    - host: ${resolveValue(resName, 'host', params, props.host ?? 'example.com')}
      http:
        paths:
          - path: ${resolveValue(resName, 'path', params, props.path ?? '/')}
            pathType: ${resolveValue(resName, 'pathType', params, props.pathType ?? 'Prefix')}
            backend:
              service:
                name: ${svcName}
                port:
                  number: ${svcPort}
{{- end }}`

  return template
}

export function generatePVCTemplate(
  chartName: string,
  node: BlueprintNode
): string {
  const { data } = node
  const params = data.helmExpressions
  const resName = data.resourceName
  const props = data.properties

  let template = `{{- if .Values.${resName}.enabled }}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
spec:
  accessModes:
    - ${resolveValue(resName, 'accessMode', params, props.accessMode ?? 'ReadWriteOnce')}
  resources:
    requests:
      storage: ${resolveValue(resName, 'storageSize', params, props.storageSize ?? '1Gi')}`

  if (props.storageClassName) {
    template += `\n  storageClassName: ${resolveValue(resName, 'storageClassName', params, props.storageClassName)}`
  }

  template += `\n{{- end }}`
  return template
}

export function generateHPATemplate(
  chartName: string,
  node: BlueprintNode,
  nodes: BlueprintNode[],
  edges: BlueprintEdge[]
): string {
  const { data } = node
  const params = data.helmExpressions
  const resName = data.resourceName
  const props = data.properties

  const workload = findConnectedWorkload(node.id, nodes, edges)
  const targetName = workload
    ? `{{ include "${chartName}.fullname" . }}-${workload.data.resourceName}`
    : `{{ include "${chartName}.fullname" . }}`
  const targetKind = workload?.data.kind ?? 'Deployment'
  const targetApiVersion = workload?.data.apiVersion ?? 'apps/v1'

  let template = `{{- if .Values.${resName}.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: ${targetApiVersion}
    kind: ${targetKind}
    name: ${targetName}
  minReplicas: ${resolveValue(resName, 'minReplicas', params, props.minReplicas ?? 1)}
  maxReplicas: ${resolveValue(resName, 'maxReplicas', params, props.maxReplicas ?? 10)}
  metrics:`

  if (props.targetCPUUtilization) {
    template += `\n    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: ${resolveValue(resName, 'targetCPUUtilization', params, props.targetCPUUtilization)}`
  }

  if (props.targetMemoryUtilization) {
    template += `\n    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: ${resolveValue(resName, 'targetMemoryUtilization', params, props.targetMemoryUtilization)}`
  }

  template += `\n{{- end }}`
  return template
}

export function generateServiceAccountTemplate(
  chartName: string,
  node: BlueprintNode
): string {
  const { data } = node
  const params = data.helmExpressions
  const resName = data.resourceName
  const props = data.properties

  return `{{- if .Values.${resName}.enabled }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
automountServiceAccountToken: ${resolveValue(resName, 'automountServiceAccountToken', params, props.automountServiceAccountToken ?? true)}
{{- end }}`
}

export function generateStatefulSetTemplate(
  chartName: string,
  node: BlueprintNode
): string {
  const { data } = node
  const params = data.helmExpressions
  const resName = data.resourceName
  const props = data.properties

  let volumeSection = ''
  if (props.volumeClaimSize) {
    let storageClass = ''
    if (props.storageClassName) {
      storageClass = `\n        storageClassName: ${resolveValue(resName, 'storageClassName', params, props.storageClassName)}`
    }
    volumeSection = `
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]${storageClass}
        resources:
          requests:
            storage: ${resolveValue(resName, 'volumeClaimSize', params, props.volumeClaimSize)}`
  }

  return `{{- if .Values.${resName}.enabled }}
apiVersion: ${data.apiVersion}
kind: StatefulSet
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
spec:
  serviceName: ${resolveValue(resName, 'serviceName', params, props.serviceName ?? 'headless')}
  replicas: ${resolveValue(resName, 'replicas', params, props.replicas ?? 1)}
  selector:
    matchLabels:
      {{- include "${chartName}.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: ${resName}
  template:
    metadata:
      labels:
        {{- include "${chartName}.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: ${resName}
    spec:
      containers:
        - name: ${resName}
          image: ${resolveQuoted(resName, 'image', params, props.image ?? 'nginx:latest')}
          ports:
            - name: http
              containerPort: ${resolveValue(resName, 'containerPort', params, props.containerPort ?? 80)}
              protocol: TCP${volumeSection}
{{- end }}`
}

export function generateJobTemplate(
  chartName: string,
  node: BlueprintNode
): string {
  const { data } = node
  const params = data.helmExpressions
  const resName = data.resourceName
  const props = data.properties

  let commandSection = ''
  if (props.command) {
    commandSection = `\n          command:
            - /bin/sh
            - -c
            - ${resolveValue(resName, 'command', params, props.command)}`
  }

  return `{{- if .Values.${resName}.enabled }}
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
spec:
  backoffLimit: ${resolveValue(resName, 'backoffLimit', params, props.backoffLimit ?? 6)}
  template:
    spec:
      restartPolicy: ${resolveValue(resName, 'restartPolicy', params, props.restartPolicy ?? 'Never')}
      containers:
        - name: ${resName}
          image: ${resolveQuoted(resName, 'image', params, props.image ?? 'busybox:latest')}${commandSection}
{{- end }}`
}

export function generateCronJobTemplate(
  chartName: string,
  node: BlueprintNode
): string {
  const { data } = node
  const params = data.helmExpressions
  const resName = data.resourceName
  const props = data.properties

  let commandSection = ''
  if (props.command) {
    commandSection = `\n              command:
                - /bin/sh
                - -c
                - ${resolveValue(resName, 'command', params, props.command)}`
  }

  return `{{- if .Values.${resName}.enabled }}
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
spec:
  schedule: ${resolveQuoted(resName, 'schedule', params, props.schedule ?? '*/5 * * * *')}
  concurrencyPolicy: ${resolveValue(resName, 'concurrencyPolicy', params, props.concurrencyPolicy ?? 'Allow')}
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: ${resolveValue(resName, 'restartPolicy', params, props.restartPolicy ?? 'Never')}
          containers:
            - name: ${resName}
              image: ${resolveQuoted(resName, 'image', params, props.image ?? 'busybox:latest')}${commandSection}
{{- end }}`
}

export function generateDaemonSetTemplate(
  chartName: string,
  node: BlueprintNode
): string {
  const { data } = node
  const params = data.helmExpressions
  const resName = data.resourceName
  const props = data.properties

  return `{{- if .Values.${resName}.enabled }}
apiVersion: ${data.apiVersion}
kind: DaemonSet
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
spec:
  selector:
    matchLabels:
      {{- include "${chartName}.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: ${resName}
  template:
    metadata:
      labels:
        {{- include "${chartName}.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: ${resName}
    spec:
      containers:
        - name: ${resName}
          image: ${resolveQuoted(resName, 'image', params, props.image ?? 'fluentd:latest')}
          imagePullPolicy: ${resolveValue(resName, 'imagePullPolicy', params, props.imagePullPolicy ?? 'IfNotPresent')}
          ports:
            - name: http
              containerPort: ${resolveValue(resName, 'containerPort', params, props.containerPort ?? 80)}
              protocol: TCP
{{- end }}`
}

export function generateGenericTemplate(
  chartName: string,
  node: BlueprintNode
): string {
  const { data } = node
  const resName = data.resourceName

  return `{{- if .Values.${resName}.enabled }}
apiVersion: ${data.apiVersion}
kind: ${data.kind}
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
spec: {}
{{- end }}`
}
