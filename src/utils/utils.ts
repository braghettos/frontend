import type { ResourcesRefs } from '../types/Widget'

export const getResourceRef = (resourceRefId: string, resourcesRefs: ResourcesRefs) => {
  if (!resourcesRefs || resourcesRefs.items.length === 0) {
    console.error(`Cannot find resources refs for resource ref with ID ${resourceRefId}`)
    return
  }

  const backendEndpoint = resourcesRefs.items.find(({ id }) => {
    return id === resourceRefId
  })

  if (!backendEndpoint) {
    console.error(`Cannot find resource ref with ID ${resourceRefId}`)
  }

  return backendEndpoint
}

export const getEndpointUrl = (resourceRefId: string, resourcesRefs: ResourcesRefs) => {
  const backendEndpoint = getResourceRef(resourceRefId, resourcesRefs)

  return backendEndpoint?.path
}

export const getResourceEndpoint = ({
  apiVersion,
  name,
  namespace,
  resource,
}: {
  resource: string
  apiVersion: string
  name: string
  namespace: string
}): string => {
  return `/call?resource=${resource}&apiVersion=${apiVersion}&name=${name}&namespace=${namespace}`
}

export const formatISODate = (value: string, showTime: boolean = false) => {
  return showTime
    ? new Date(value).toLocaleDateString('en', {
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    : new Date(value).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const getHeadersObject = (headers: string[]): Record<string, string> | undefined => {
  const result: Record<string, string> = {}

  for (const header of headers) {
    const parts = header.split(':')
    if (parts.length !== 2) {
      return undefined
    }

    const key = parts[0].trim()
    const value = parts[1].trim()

    if (!key || !value) {
      return undefined
    }

    result[key] = value
  }

  return result
}

export const parseNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
