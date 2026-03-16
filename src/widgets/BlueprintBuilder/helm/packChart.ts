import { gzipSync, strToU8 } from 'fflate'

import type { GeneratedFile } from '../types'

/**
 * Minimal tar archive builder. Produces an uncompressed POSIX tar
 * consisting of 512-byte headers + data blocks for each file.
 */
function createTarball(chartName: string, files: GeneratedFile[]): Uint8Array {
  const blocks: Uint8Array[] = []

  for (const file of files) {
    const filePath = `${chartName}/${file.path}`
    const content = strToU8(file.content)

    const header = new Uint8Array(512)
    const encoder = new TextEncoder()

    const nameBytes = encoder.encode(filePath)
    header.set(nameBytes.subarray(0, 100), 0)

    const writeOctal = (value: number, offset: number, length: number) => {
      const str = value.toString(8).padStart(length - 1, '0')
      const bytes = encoder.encode(str)
      header.set(bytes.subarray(0, length - 1), offset)
    }

    // mode, uid, gid, size, mtime
    writeOctal(0o644, 100, 8)
    writeOctal(0, 108, 8)
    writeOctal(0, 116, 8)
    writeOctal(content.length, 124, 12)
    writeOctal(Math.floor(Date.now() / 1000), 136, 12)

    // type flag: '0' = regular file
    header[156] = 48

    // compute checksum (fill with spaces first)
    header.set(encoder.encode('        '), 148)
    let checksum = 0
    for (let idx = 0; idx < 512; idx++) {
      checksum += header[idx]
    }
    const checksumStr = checksum.toString(8).padStart(6, '0')
    header.set(encoder.encode(checksumStr), 148)
    header[154] = 0
    header[155] = 0x20

    blocks.push(header)

    if (content.length > 0) {
      const paddedLen = Math.ceil(content.length / 512) * 512
      const padded = new Uint8Array(paddedLen)
      padded.set(content)
      blocks.push(padded)
    }
  }

  // end-of-archive marker: two 512-byte zero blocks
  blocks.push(new Uint8Array(1024))

  const totalLength = blocks.reduce((sum, block) => sum + block.length, 0)
  const tar = new Uint8Array(totalLength)
  let offset = 0
  for (const block of blocks) {
    tar.set(block, offset)
    offset += block.length
  }

  return tar
}

export function packChart(
  chartName: string,
  files: GeneratedFile[]
): void {
  const tar = createTarball(chartName, files)
  const tgz = gzipSync(tar)

  const blob = new Blob([tgz], { type: 'application/gzip' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${chartName}-chart.tgz`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
