import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const publicDirectory = path.join(process.cwd(), 'public')
const workerSource = path.join(
  process.cwd(),
  'node_modules',
  'maplibre-gl',
  'dist',
  'maplibre-gl-worker.mjs'
)
const licenseSource = path.join(
  process.cwd(),
  'node_modules',
  'maplibre-gl',
  'LICENSE.txt'
)

mkdirSync(publicDirectory, { recursive: true })
copyFileSync(workerSource, path.join(publicDirectory, 'maplibre-gl-worker.mjs'))
copyFileSync(licenseSource, path.join(publicDirectory, 'maplibre-gl-worker-LICENSE.txt'))
