import type { BlueprintEdge, BlueprintNode } from '../types'

import { findConnectedByKind, findConnectedWorkload, resolveQuoted, resolveValue } from './generateTemplate'

export function generateDeploymentTemplate(
  chartName: string,
  node: BlueprintNode,
  allNodes: BlueprintNode[],
  edges: BlueprintEdge[]
): string {
  const { data } = node
  const params = data.helmExpressions
  const resName = data.resourceName
  const props = data.properties

  const configMaps = findConnectedByKind(node.id, allNodes, edges, ['ConfigMap'])
  const secrets = findConnectedByKind(node.id, allNodes, edges, ['Secret'])
  const pvcs = findConnectedByKind(node.id, allNodes, edges, ['PersistentVolumeClaim'])

  let template = `{{- if .Values.${resName}.enabled }}
apiVersion: ${data.apiVersion}
kind: ${data.kind}
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
spec:
  replicas: ${resolveValue(resName, 'replicas', params, props.replicas ?? 1)}
  selector:
    matchLabels:
      {{- include "${chartName}.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: ${resName}
  strategy:
    type: ${resolveValue(resName, 'strategy', params, props.strategy ?? 'RollingUpdate')}
  template:
    metadata:
      labels:
        {{- include "${chartName}.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: ${resName}
    spec:`

  if (props.serviceAccountName) {
    template += `\n      serviceAccountName: ${resolveValue(resName, 'serviceAccountName', params, props.serviceAccountName)}`
  }

  template += `\n      containers:
        - name: ${resName}
          image: ${resolveQuoted(resName, 'image', params, props.image ?? 'nginx:latest')}
          imagePullPolicy: ${resolveValue(resName, 'imagePullPolicy', params, props.imagePullPolicy ?? 'IfNotPresent')}`

  if (props.containerPort) {
    template += `\n          ports:
            - name: http
              containerPort: ${resolveValue(resName, 'containerPort', params, props.containerPort)}
              protocol: TCP`
  }

  if (props.cpuRequest || props.memoryRequest || props.cpuLimit || props.memoryLimit) {
    template += `\n          resources:`
    if (props.cpuRequest || props.memoryRequest) {
      template += `\n            requests:`
      if (props.cpuRequest) { template += `\n              cpu: ${resolveValue(resName, 'cpuRequest', params, props.cpuRequest)}` }
      if (props.memoryRequest) { template += `\n              memory: ${resolveValue(resName, 'memoryRequest', params, props.memoryRequest)}` }
    }
    if (props.cpuLimit || props.memoryLimit) {
      template += `\n            limits:`
      if (props.cpuLimit) { template += `\n              cpu: ${resolveValue(resName, 'cpuLimit', params, props.cpuLimit)}` }
      if (props.memoryLimit) { template += `\n              memory: ${resolveValue(resName, 'memoryLimit', params, props.memoryLimit)}` }
    }
  }

  if (props.livenessProbeEnabled) {
    template += `\n          livenessProbe:
            httpGet:
              path: /
              port: http`
  }

  if (props.readinessProbeEnabled) {
    template += `\n          readinessProbe:
            httpGet:
              path: /
              port: http`
  }

  if (configMaps.length > 0 || secrets.length > 0) {
    template += `\n          envFrom:`
    for (const cm of configMaps) {
      template += `\n            - configMapRef:
                name: {{ include "${chartName}.fullname" . }}-${cm.data.resourceName}`
    }
    for (const sec of secrets) {
      template += `\n            - secretRef:
                name: {{ include "${chartName}.fullname" . }}-${sec.data.resourceName}`
    }
  }

  if (pvcs.length > 0) {
    template += `\n          volumeMounts:`
    for (const pvc of pvcs) {
      template += `\n            - name: ${pvc.data.resourceName}
              mountPath: /data/${pvc.data.resourceName}`
    }
    template += `\n      volumes:`
    for (const pvc of pvcs) {
      template += `\n        - name: ${pvc.data.resourceName}
          persistentVolumeClaim:
            claimName: {{ include "${chartName}.fullname" . }}-${pvc.data.resourceName}`
    }
  }

  template += `\n{{- end }}`
  return template
}

export function generateServiceTemplate(
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
  const componentLabel = workload ? workload.data.resourceName : resName

  let portSection = `    - port: ${resolveValue(resName, 'port', params, props.port ?? 80)}
      targetPort: ${resolveValue(resName, 'targetPort', params, props.targetPort ?? 80)}
      protocol: ${resolveValue(resName, 'protocol', params, props.protocol ?? 'TCP')}
      name: http`

  if (props.nodePort) {
    portSection += `\n      nodePort: ${resolveValue(resName, 'nodePort', params, props.nodePort)}`
  }

  return `{{- if .Values.${resName}.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
spec:
  type: ${resolveValue(resName, 'serviceType', params, props.serviceType ?? 'ClusterIP')}
  ports:
${portSection}
  selector:
    {{- include "${chartName}.selectorLabels" . | nindent 4 }}
    app.kubernetes.io/component: ${componentLabel}
{{- end }}`
}

export function generateConfigMapTemplate(
  chartName: string,
  node: BlueprintNode
): string {
  const { data } = node
  const resName = data.resourceName
  const props = data.properties

  let dataSection = '  {}'
  if (typeof props.data === 'string' && props.data.trim()) {
    const lines = props.data.split('\n').filter((line: string) => line.trim())
    dataSection = lines.map((line: string) => `  ${line.trim()}`).join('\n')
  }

  return `{{- if .Values.${resName}.enabled }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
data:
${dataSection}
{{- end }}`
}

export function generateSecretTemplate(
  chartName: string,
  node: BlueprintNode
): string {
  const { data } = node
  const params = data.helmExpressions
  const resName = data.resourceName
  const props = data.properties

  let dataSection = '  {}'
  if (typeof props.data === 'string' && props.data.trim()) {
    const lines = props.data.split('\n').filter((line: string) => line.trim())
    dataSection = lines
      .map((line: string) => {
        const [key, ...valueParts] = line.split(':')
        const value = valueParts.join(':').trim()
        return `  ${key.trim()}: {{ ${JSON.stringify(value)} | b64enc | quote }}`
      })
      .join('\n')
  }

  return `{{- if .Values.${resName}.enabled }}
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "${chartName}.fullname" . }}-${resName}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
type: ${resolveValue(resName, 'secretType', params, props.secretType ?? 'Opaque')}
data:
${dataSection}
{{- end }}`
}
