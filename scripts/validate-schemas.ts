/* eslint-disable no-console */
import { readFile } from 'fs/promises'
import path from 'path'

import type { AnySchema } from 'ajv'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { glob } from 'glob'

import type { JSONSchema } from '../src/utils/types'

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

const files = await glob('**/*.schema.json', {
  ignore: ['node_modules/**'],
})

let hasErrors = false

const requiredActions = ['rest', 'navigate', 'openDrawer', 'openModal']

// Validate all schemas in parallel
await Promise.all(
  files.map(async (file) => {
    try {
      const schemaText = await readFile(file, 'utf-8')
      const schema = JSON.parse(schemaText) as AnySchema

      ajv.compile(schema)

      if (file.startsWith('src/widgets/') && path.basename(file).endsWith('.schema.json')) {
        const actions = (schema as JSONSchema).properties?.spec?.properties?.actions?.properties
        if (actions) {
          const missingActions = requiredActions.filter(
            (action) => !(action in actions)
          )

          if (missingActions.length > 0) {
            throw new Error(
              `Missing required actions in actions.properties: ${missingActions.join(', ')}`
            )
          }
        }
      }

      console.log(`✅ ${file} is a valid JSON Schema.`)
    } catch (err) {
      console.error(`❌ Error in ${file}:`)
      console.error(err instanceof Error ? err.message : err)
      hasErrors = true
    }
  })
)

if (hasErrors) {
  process.exit(1)
}
