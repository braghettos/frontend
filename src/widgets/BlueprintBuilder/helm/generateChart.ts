import type { BlueprintBuilderState, GeneratedFile } from '../types'

import { generateHelpers } from './generateHelpers'
import { generateValues } from './generateValues'
import { getTemplateGenerator } from './helmTemplateMap'
import { toYamlKey } from './templateUtils'

export function generateChart(state: BlueprintBuilderState): GeneratedFile[] {
  const { chart, edges, nodes } = state
  const files: GeneratedFile[] = []

  files.push({
    content: [
      `apiVersion: v2`,
      `name: ${chart.name}`,
      `description: ${chart.description}`,
      `type: application`,
      `version: ${chart.version}`,
      `appVersion: ${JSON.stringify(chart.appVersion)}`,
    ].join('\n'),
    path: 'Chart.yaml',
  })

  files.push({
    content: generateValues(nodes),
    path: 'values.yaml',
  })

  files.push({
    content: generateHelpers(chart),
    path: 'templates/_helpers.tpl',
  })

  for (const node of nodes) {
    const generator = getTemplateGenerator(node.data.kind)
    const content = generator(chart.name, node, nodes, edges)
    const fileName = `${toYamlKey(node.data.resourceName)}.yaml`

    files.push({
      content,
      path: `templates/${fileName}`,
    })
  }

  return files
}
