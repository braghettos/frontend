import type { ResourceField, ResourceSchema, ResourceSchemaProperty } from '../types'

function toLabel(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function propertyToField(
  name: string,
  prop: ResourceSchemaProperty,
  required: boolean
): ResourceField | null {
  const label = toLabel(name)
  const { description } = prop

  if (prop.enum && prop.enum.length > 0) {
    return {
      defaultValue: prop.default,
      label,
      name,
      options: prop.enum.map((val) => ({ label: val, value: val })),
      placeholder: description,
      required,
      type: 'select',
    }
  }

  switch (prop.type) {
    case 'string':
    case 'binary':
      return {
        defaultValue: prop.default,
        label,
        name,
        placeholder: description ?? name,
        required,
        type: 'string',
      }

    case 'integer':
    case 'number':
      return {
        defaultValue: prop.default,
        label,
        name,
        placeholder: description ?? name,
        required,
        type: 'number',
      }

    case 'boolean':
      return {
        defaultValue: prop.default ?? false,
        label,
        name,
        required,
        type: 'boolean',
      }

    case 'object': {
      if (prop.additionalProperties) {
        return {
          defaultValue: prop.default,
          label,
          name,
          placeholder: 'key: value',
          required,
          type: 'keyValue',
        }
      }
      return null
    }

    case 'array':
      return {
        defaultValue: prop.default,
        label,
        name,
        placeholder: description ?? name,
        required,
        type: 'list',
      }

    default: {
      if (prop['x-kubernetes-int-or-string']) {
        return {
          defaultValue: prop.default,
          label,
          name,
          placeholder: description ?? name,
          required,
          type: 'string',
        }
      }
      return null
    }
  }
}

/**
 * Converts an OpenAPI/K8s-style JSON schema (as returned by the API server
 * in CRD definitions or OpenAPI v3 specs) into the flat ResourceField[] array
 * consumed by the PropertyPanel.
 *
 * The parser walks `schema.properties` one level deep, mapping each property
 * to a form field. Nested objects with additionalProperties become keyValue
 * fields; other nested objects are skipped to keep the UI manageable.
 */
export function parseOpenAPISchema(
  schema: ResourceSchema | undefined,
  requiredOverride?: string[]
): ResourceField[] {
  if (!schema?.properties) {
    return []
  }

  const requiredSet = new Set<string>(requiredOverride ?? schema.required ?? [])
  const fields: ResourceField[] = []

  for (const [name, prop] of Object.entries(schema.properties)) {
    const field = propertyToField(name, prop, requiredSet.has(name))
    if (field) {
      fields.push(field)
    }
  }

  return fields
}
