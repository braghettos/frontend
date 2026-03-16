import type { AvailableResource, ResourceField, ResourceSchema } from '../types'

import { parseOpenAPISchema } from './parseSchema'

/**
 * Dynamic schema registry. Populated at runtime from the API-server-provided
 * schemas that arrive via `widgetData.availableResources[].schema`.
 *
 * Call `buildSchemaRegistry(resources)` once when the widget mounts.
 * Afterward, `getResourceFields(kind)` and `getDefaultProperties(kind)`
 * return the parsed fields.
 */
let schemaCache: Record<string, ResourceField[]> = {}

export function buildSchemaRegistry(resources: AvailableResource[]): void {
  const next: Record<string, ResourceField[]> = {}

  for (const resource of resources) {
    if (resource.schema) {
      next[resource.kind] = parseOpenAPISchema(resource.schema)
    }
  }

  schemaCache = next
}

export function setSchemaForKind(kind: string, schema: ResourceSchema): void {
  schemaCache[kind] = parseOpenAPISchema(schema)
}

export function getResourceFields(kind: string): ResourceField[] {
  return schemaCache[kind] ?? []
}

export function getDefaultProperties(kind: string): Record<string, unknown> {
  const fields = getResourceFields(kind)
  const defaults: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.defaultValue !== undefined) {
      defaults[field.name] = field.defaultValue
    }
  }
  return defaults
}

export const RESOURCE_ICONS: Record<string, string> = {
  ConfigMap: 'fa-file-lines',
  CronJob: 'fa-clock',
  DaemonSet: 'fa-clone',
  Deployment: 'fa-cubes',
  HorizontalPodAutoscaler: 'fa-arrows-left-right',
  Ingress: 'fa-globe',
  Job: 'fa-play',
  PersistentVolumeClaim: 'fa-hard-drive',
  Secret: 'fa-key',
  Service: 'fa-network-wired',
  ServiceAccount: 'fa-user-shield',
  StatefulSet: 'fa-database',
}
