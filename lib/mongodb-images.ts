import { createHash } from 'node:crypto'
import { Binary, MongoClient } from 'mongodb'
import type { ItineraryImageCatalogItem } from '../types'

const dimensions = 512
const index = 'itinerary_image_metadata'
const clientCache = globalThis as typeof globalThis & { itineraryMongoClient?: MongoClient }
const metadata = { _id: 0, bytes: 0, embedding: 0 }

interface StoredImage extends ItineraryImageCatalogItem {
  _id: string
  bytes?: Binary
  embedding: number[]
}

function collection() {
  const uri = process.env.MONGODB_URI
  if (!uri) return null
  const client = clientCache.itineraryMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
  })
  return client.db(process.env.MONGODB_DB || 'doc_theme').collection<StoredImage>('itinerary_images')
}

function embed(value: string): number[] {
  const words = value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[a-z0-9]{2,}/g) ?? []
  const vector = new Array<number>(dimensions).fill(0)
  for (const word of new Set(words)) {
    const hash = createHash('sha256').update(word).digest()
    vector[hash.readUInt16BE(0) % dimensions] += hash[2] % 2 ? 1 : -1
  }
  return vector
}

function imageRecord(image: ItineraryImageCatalogItem): StoredImage {
  return { ...image, _id: image.id, embedding: embed(`${image.title} ${image.sourcePath}`) }
}

export async function saveMongoImage(image: ItineraryImageCatalogItem, bytes: Buffer): Promise<boolean> {
  const images = collection()
  if (!images) return false
  await images.insertOne({ ...imageRecord(image), bytes: new Binary(bytes) })
  return true
}

export async function listMongoImages(): Promise<ItineraryImageCatalogItem[]> {
  return await collection()?.find<ItineraryImageCatalogItem>(
    { bytes: { $exists: true } }, { projection: metadata },
  ).toArray() ?? []
}

export async function readMongoImage(id: string): Promise<Buffer | undefined> {
  const image = await collection()?.findOne({ _id: id }, { projection: { bytes: 1 } })
  return image?.bytes ? Buffer.from(image.bytes.value()) : undefined
}

export async function searchMongoImages(query: string): Promise<ItineraryImageCatalogItem[]> {
  const images = collection()
  const queryVector = embed(query)
  if (!images || !queryVector.some(Boolean)) return []
  return await images.aggregate<ItineraryImageCatalogItem>([
    { $vectorSearch: { index, path: 'embedding', queryVector, limit: 48, numCandidates: 300 } },
    { $set: { score: { $meta: 'vectorSearchScore' } } },
    { $match: { score: { $gt: 0.55 } } },
    { $project: { ...metadata, score: 0 } },
  ], { maxTimeMS: 2000 }).toArray()
}

export async function initializeImageSearch(catalog: ItineraryImageCatalogItem[]): Promise<void> {
  const images = collection()
  if (!images) throw new Error('Set MONGODB_URI before initializing image search.')
  try {
    await images.bulkWrite(catalog.map(image => ({
      updateOne: {
        filter: { _id: image.id },
        update: { $setOnInsert: imageRecord(image) },
        upsert: true,
      },
    })), { ordered: false })
    const [existing] = await images.listSearchIndexes(index).toArray()
    if (!existing) {
      await images.createSearchIndex({
        name: index,
        type: 'vectorSearch',
        definition: { fields: [{ type: 'vector', path: 'embedding', numDimensions: dimensions, similarity: 'cosine' }] },
      })
    }
  } finally {
    const client = clientCache.itineraryMongoClient
    delete clientCache.itineraryMongoClient
    await client?.close()
  }
}
