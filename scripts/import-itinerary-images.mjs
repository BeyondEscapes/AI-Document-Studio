#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'

const root = process.cwd()
const args = process.argv.slice(2)
const zipIndex = args.indexOf('--zip')
const zipPath = zipIndex >= 0 ? args[zipIndex + 1] : ''
const dataDirectory = path.join(root, 'data', 'itinerary-images')
const pythonScript = path.join(root, 'python', 'extract_itinerary_images.py')

if (!zipPath) {
  console.error('Usage: npm run import:itinerary-images -- --zip "C:\\path\\to\\itinerary-images.zip"')
  process.exit(1)
}

const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'itinerary-image-import-'))
const pythonCommand = process.env.PYTHON || 'python'

try {
  const extraction = spawnSync(pythonCommand, [pythonScript, path.resolve(zipPath), temporaryDirectory], {
    stdio: 'inherit',
    windowsHide: true,
  })
  if (extraction.error) throw extraction.error
  if (extraction.status !== 0) throw new Error(`Image extraction exited with status ${extraction.status}.`)

  const manifest = JSON.parse(await fs.readFile(path.join(temporaryDirectory, 'manifest.json'), 'utf8'))
  await fs.mkdir(dataDirectory, { recursive: true })
  const catalogPath = path.join(dataDirectory, 'catalog.json')
  let existing = []
  try {
    existing = JSON.parse(await fs.readFile(catalogPath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const catalog = new Map(existing.map(image => [image.id, image]))
  let imported = 0
  let skipped = 0
  let cursor = 0

  async function processNext() {
    while (cursor < manifest.length) {
      const entry = manifest[cursor]
      cursor += 1
      const inputPath = path.join(temporaryDirectory, entry.filename)
      const id = crypto.createHash('sha256').update(entry.sourcePath.toLowerCase()).digest('hex').slice(0, 24)
      const outputPath = path.join(dataDirectory, `${id}.jpg`)
      const temporaryOutput = `${outputPath}.tmp`

      try {
        const result = await sharp(inputPath, { failOn: 'error', limitInputPixels: 80_000_000 })
          .rotate()
          .resize({ width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer({ resolveWithObject: true })
        await fs.writeFile(temporaryOutput, result.data)
        await fs.rename(temporaryOutput, outputPath)
        const sourceName = entry.sourceName
        const title = path.parse(sourceName).name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
        catalog.set(id, {
          id,
          title: title || sourceName,
          sourceName,
          sourcePath: entry.sourcePath,
          url: `/api/itinerary-images/${id}`,
          width: result.info.width,
          height: result.info.height,
        })
        imported += 1
      } catch (error) {
        await fs.rm(temporaryOutput, { force: true })
        console.warn(`Skipped unreadable image ${entry.sourcePath}: ${error.message}`)
        skipped += 1
      }
    }
  }

  await Promise.all(Array.from({ length: 3 }, () => processNext()))
  const catalogTemporaryPath = `${catalogPath}.tmp`
  await fs.writeFile(catalogTemporaryPath, JSON.stringify([...catalog.values()], null, 2), 'utf8')
  await fs.rename(catalogTemporaryPath, catalogPath)
  console.log(`Imported ${imported} optimized photos; skipped ${skipped}.`)
  console.log(`Image library: ${dataDirectory}`)
} catch (error) {
  console.error(`Itinerary image import failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true })
}
