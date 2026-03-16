/* eslint-disable no-console */
import { exec } from 'node:child_process'
import fs from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'
import { promisify } from 'node:util'

import chalk from 'chalk'
import { glob } from 'glob'

const asyncExec = promisify(exec)

const WIDGETS_DIR = join(process.cwd(), 'src', 'widgets')
const OUTPUT_DIR = join(process.cwd(), 'scripts', 'krateoctl-output')

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
}

/** Move a file, fallback to copy+unlink if rename fails */
async function moveFile(src: string, dest: string) {
  try {
    await fs.rename(src, dest)
  } catch {
    await fs.copyFile(src, dest)
    await fs.unlink(src)
  }
}

async function runKrateoctl(schemaPath: string) {
  const schemaName = basename(schemaPath)
  const widgetDir = dirname(schemaPath)
  const base = schemaName.replace(/\.schema\.json$/i, '')

  console.log(`⚙️  Generating CRD for ${chalk.cyan(schemaName)}...`)

  try {
    // Esegue il comando krateoctl
    await asyncExec(`krateoctl gen-widget "${schemaPath}"`, { cwd: widgetDir })

    // Il file generato è sempre <path>.crd.yaml (nella stessa cartella)
    const generatedPath = join(widgetDir, `${base}.schema.crd.yaml`)

    // Nome finale desiderato nella cartella di output
    const finalName = `${base}.crd.yaml`
    const destinationPath = join(OUTPUT_DIR, finalName)

    // Verifica che il file sia stato generato
    await fs.access(generatedPath)

    // Sposta e rinomina nella cartella di output
    await moveFile(generatedPath, destinationPath)

    console.log(`✅ ${chalk.green(finalName)} moved to ${chalk.gray(OUTPUT_DIR)}`)
    return true
  } catch (err) {
    console.error(`❌ Failed to generate CRD for ${chalk.red(schemaName)}:`)
    console.error(err instanceof Error ? err.message : String(err))
    return false
  }
}

async function main() {
  console.log(chalk.blue('🚀 Starting Krateo widget CRD generation...\n'))

  await ensureOutputDir()

  const schemaFiles = await glob('**/*.schema.json', {
    absolute: true,
    cwd: WIDGETS_DIR,
  })

  if (schemaFiles.length === 0) {
    console.error('❌ No .schema.json files found in', WIDGETS_DIR)
    process.exit(1)
  }

  console.log(`Found ${schemaFiles.length} schema files to process\n`)

  let successCount = 0
  let failureCount = 0

  for (const schemaFile of schemaFiles) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await runKrateoctl(schemaFile)
    if (ok) {
      successCount += 1
    } else {
      failureCount += 1
    }
  }

  console.log('\n📊 Summary:')
  console.log(`Total schemas: ${schemaFiles.length}`)
  console.log(`✅ Successful: ${successCount}`)
  console.log(`❌ Failed: ${failureCount}`)

  if (failureCount > 0) { process.exit(1) }
  console.log('\n🎉 All CRDs generated successfully!')
}

void main()
