import type { AvailableResource, ResourceSchema } from '../types'

/**
 * Fallback resource list used when the backend does not provide
 * `widgetData.availableResources`. Each entry carries an inline schema
 * that mirrors the fields the API server would normally expose.
 *
 * In production, these are overridden by the schemas the Snowplow backend
 * reads from the API server and returns in `widgetData`.
 */

const deploymentSchema: ResourceSchema = {
  properties: {
    containerPort: { default: 80, description: 'Container port', type: 'integer' },
    cpuLimit: { description: 'CPU limit (e.g. 500m)', type: 'string' },
    cpuRequest: { description: 'CPU request (e.g. 100m)', type: 'string' },
    image: { description: 'Container image', type: 'string' },
    imagePullPolicy: { default: 'IfNotPresent', enum: ['Always', 'IfNotPresent', 'Never'], type: 'string' },
    livenessProbeEnabled: { default: false, description: 'Enable liveness probe', type: 'boolean' },
    memoryLimit: { description: 'Memory limit (e.g. 256Mi)', type: 'string' },
    memoryRequest: { description: 'Memory request (e.g. 128Mi)', type: 'string' },
    readinessProbeEnabled: { default: false, description: 'Enable readiness probe', type: 'boolean' },
    replicas: { default: 1, description: 'Number of replicas', type: 'integer' },
    serviceAccountName: { description: 'Service account name', type: 'string' },
    strategy: { default: 'RollingUpdate', enum: ['RollingUpdate', 'Recreate'], type: 'string' },
  },
  required: ['image'],
  type: 'object',
}

const serviceSchema: ResourceSchema = {
  properties: {
    nodePort: { description: 'NodePort (30000-32767)', type: 'integer' },
    port: { default: 80, description: 'Service port', type: 'integer' },
    protocol: { default: 'TCP', enum: ['TCP', 'UDP', 'SCTP'], type: 'string' },
    serviceType: { default: 'ClusterIP', enum: ['ClusterIP', 'NodePort', 'LoadBalancer', 'ExternalName'], type: 'string' },
    targetPort: { default: 80, description: 'Target port on the pod', type: 'integer' },
  },
  required: ['port'],
  type: 'object',
}

const configMapSchema: ResourceSchema = {
  properties: {
    data: { additionalProperties: true, description: 'Key-value data entries', type: 'object' },
  },
  type: 'object',
}

const secretSchema: ResourceSchema = {
  properties: {
    data: { additionalProperties: true, description: 'Key-value secret data', type: 'object' },
    secretType: { default: 'Opaque', enum: ['Opaque', 'kubernetes.io/tls', 'kubernetes.io/dockerconfigjson', 'kubernetes.io/basic-auth', 'kubernetes.io/ssh-auth'], type: 'string' },
  },
  type: 'object',
}

const ingressSchema: ResourceSchema = {
  properties: {
    host: { description: 'Hostname (e.g. example.com)', type: 'string' },
    ingressClassName: { description: 'Ingress class name', type: 'string' },
    path: { default: '/', description: 'URL path', type: 'string' },
    pathType: { default: 'Prefix', enum: ['Prefix', 'Exact', 'ImplementationSpecific'], type: 'string' },
    tlsEnabled: { default: false, description: 'Enable TLS', type: 'boolean' },
    tlsSecretName: { description: 'TLS secret name', type: 'string' },
  },
  required: ['host'],
  type: 'object',
}

const pvcSchema: ResourceSchema = {
  properties: {
    accessMode: { default: 'ReadWriteOnce', enum: ['ReadWriteOnce', 'ReadOnlyMany', 'ReadWriteMany'], type: 'string' },
    storageClassName: { description: 'Storage class name', type: 'string' },
    storageSize: { default: '1Gi', description: 'Storage size (e.g. 1Gi)', type: 'string' },
  },
  required: ['storageSize'],
  type: 'object',
}

const hpaSchema: ResourceSchema = {
  properties: {
    maxReplicas: { default: 10, description: 'Maximum replicas', type: 'integer' },
    minReplicas: { default: 1, description: 'Minimum replicas', type: 'integer' },
    targetCPUUtilization: { default: 80, description: 'Target CPU utilization (%)', type: 'integer' },
    targetMemoryUtilization: { description: 'Target memory utilization (%)', type: 'integer' },
  },
  required: ['minReplicas', 'maxReplicas'],
  type: 'object',
}

const serviceAccountSchema: ResourceSchema = {
  properties: {
    automountServiceAccountToken: { default: true, description: 'Automount service account token', type: 'boolean' },
  },
  type: 'object',
}

const statefulSetSchema: ResourceSchema = {
  properties: {
    containerPort: { default: 80, description: 'Container port', type: 'integer' },
    image: { description: 'Container image', type: 'string' },
    replicas: { default: 1, description: 'Number of replicas', type: 'integer' },
    serviceName: { description: 'Headless service name', type: 'string' },
    storageClassName: { description: 'Storage class name', type: 'string' },
    volumeClaimSize: { default: '1Gi', description: 'Volume claim size', type: 'string' },
  },
  required: ['image', 'serviceName'],
  type: 'object',
}

const jobSchema: ResourceSchema = {
  properties: {
    backoffLimit: { default: 6, description: 'Backoff limit', type: 'integer' },
    command: { description: 'Shell command to run', type: 'string' },
    image: { description: 'Container image', type: 'string' },
    restartPolicy: { default: 'Never', enum: ['Never', 'OnFailure'], type: 'string' },
  },
  required: ['image'],
  type: 'object',
}

const cronJobSchema: ResourceSchema = {
  properties: {
    command: { description: 'Shell command to run', type: 'string' },
    concurrencyPolicy: { default: 'Allow', enum: ['Allow', 'Forbid', 'Replace'], type: 'string' },
    image: { description: 'Container image', type: 'string' },
    restartPolicy: { default: 'Never', enum: ['Never', 'OnFailure'], type: 'string' },
    schedule: { description: 'Cron schedule expression', type: 'string' },
  },
  required: ['schedule', 'image'],
  type: 'object',
}

const daemonSetSchema: ResourceSchema = {
  properties: {
    containerPort: { default: 80, description: 'Container port', type: 'integer' },
    image: { description: 'Container image', type: 'string' },
    imagePullPolicy: { default: 'IfNotPresent', enum: ['Always', 'IfNotPresent', 'Never'], type: 'string' },
  },
  required: ['image'],
  type: 'object',
}

export const DEFAULT_RESOURCES: AvailableResource[] = [
  { apiVersion: 'apps/v1', category: 'workloads', icon: 'fa-cubes', kind: 'Deployment', schema: deploymentSchema },
  { apiVersion: 'apps/v1', category: 'workloads', icon: 'fa-database', kind: 'StatefulSet', schema: statefulSetSchema },
  { apiVersion: 'apps/v1', category: 'workloads', icon: 'fa-clone', kind: 'DaemonSet', schema: daemonSetSchema },
  { apiVersion: 'batch/v1', category: 'workloads', icon: 'fa-play', kind: 'Job', schema: jobSchema },
  { apiVersion: 'batch/v1', category: 'workloads', icon: 'fa-clock', kind: 'CronJob', schema: cronJobSchema },
  { apiVersion: 'v1', category: 'networking', icon: 'fa-network-wired', kind: 'Service', schema: serviceSchema },
  { apiVersion: 'networking.k8s.io/v1', category: 'networking', icon: 'fa-globe', kind: 'Ingress', schema: ingressSchema },
  { apiVersion: 'v1', category: 'config', icon: 'fa-file-lines', kind: 'ConfigMap', schema: configMapSchema },
  { apiVersion: 'v1', category: 'config', icon: 'fa-key', kind: 'Secret', schema: secretSchema },
  { apiVersion: 'v1', category: 'storage', icon: 'fa-hard-drive', kind: 'PersistentVolumeClaim', schema: pvcSchema },
  { apiVersion: 'autoscaling/v2', category: 'workloads', icon: 'fa-arrows-left-right', kind: 'HorizontalPodAutoscaler', schema: hpaSchema },
  { apiVersion: 'v1', category: 'rbac', icon: 'fa-user-shield', kind: 'ServiceAccount', schema: serviceAccountSchema },
]
