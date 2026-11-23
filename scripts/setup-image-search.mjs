import { readFile } from 'node:fs/promises'
import { initializeImageSearch } from '../lib/mongodb-images.ts'

try {
  const contents = await readFile(
    new URL('../public/itinerary-images/catalog.json', import.meta.url), 'utf8',
  )
  const catalog = JSON.parse(contents.replace(/^\uFEFF/, ''))
  await initializeImageSearch(catalog)
  console.log('Bundled photo metadata is synced. Atlas builds the vector index asynchronously.')
} catch (error) {
  console.error('Image search setup failed:', error.message)
  process.exitCode = 1
}
