import { getResourceFields } from '../resourceSchemas'
import type { BlueprintNode } from '../types'

export function generateValues(nodes: BlueprintNode[]): string {
  const lines: string[] = []

  for (const node of nodes) {
    const { data } = node
    const fields = getResourceFields(data.kind)
    const resName = data.resourceName

    const hasAnyParam = data.helmExpressions.size > 0

    if (!hasAnyParam) {
      continue
    }

    lines.push(`${resName}:`)
    lines.push(`  enabled: true`)

    for (const field of fields) {
      if (!data.helmExpressions.has(field.name)) {
        continue
      }

      const value = data.properties[field.name] ?? field.defaultValue

      if (field.type === 'keyValue' && typeof value === 'string') {
        lines.push(`  ${field.name}:`)
        const kvLines = value.split('\n').filter((line) => line.trim())
        for (const kvLine of kvLines) {
          lines.push(`    ${kvLine.trim()}`)
        }
      } else if (field.type === 'boolean') {
        lines.push(`  ${field.name}: ${value === true ? 'true' : 'false'}`)
      } else if (field.type === 'number') {
        lines.push(`  ${field.name}: ${Number(value)}`)
      } else {
        lines.push(`  ${field.name}: ${JSON.stringify(value ?? '')}`)
      }
    }

    lines.push('')
  }

  if (lines.length === 0) {
    return '# Default values for the chart\n'
  }

  return lines.join('\n')
}
