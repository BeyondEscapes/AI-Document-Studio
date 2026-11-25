import { createHash } from 'node:crypto'
import { Binary, MongoClient } from 'mongodb'
import type { ImageFolder, ItineraryImageCatalogItem } from '../types'

const dimensions = 512
const index = 'itinerary_image_metadata'
const clientCache = globalThis as typeof globalThis & { itineraryMongoClient?: MongoClient }
const metadata = { _id: 0, bytes: 0, embedding: 0 }

interface StoredImage extends ItineraryImageCatalogItem {
  _id: string
  bytes?: Binary
  embedding: number[]
}

function database() {
  const uri = process.env.MONGODB_URI
  if (!uri) return null
  const client = clientCache.itineraryMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
  })
  return client.db(process.env.MONGODB_DB || 'doc_theme')
}

function collection() {
  return database()?.collection<StoredImage>('itinerary_images')
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
  return { ...image, _id: image.id, embedding: embed(`${image.title} ${image.sourcePath} ${image.folder?.city ?? ''} ${image.folder?.place ?? ''}`) }
}

export async function saveMongoImage(image: ItineraryImageCatalogItem, bytes: Buffer): Promise<boolean> {
  const images = collection()
  if (!images) return false
  await images.insertOne({ ...imageRecord(image), bytes: new Binary(bytes) })
  return true
}

export async function listMongoImages(): Promise<ItineraryImageCatalogItem[]> {
  return await collection()?.find<ItineraryImageCatalogItem>(
    { $or: [{ bytes: { $exists: true } }, { folder: { $exists: true } }] }, { projection: metadata },
  ).toArray() ?? []
}

export async function updateMongoImageMetadata(image: ItineraryImageCatalogItem): Promise<boolean> {
  const images = collection()
  if (!images) return false
  const { _id, ...fields } = imageRecord(image)
  await images.updateOne({ _id }, { $set: fields }, { upsert: true })
  return true
}

export async function saveMongoImageFolder(folder: ImageFolder, key: string): Promise<boolean> {
  const folders = database()?.collection<ImageFolder & { _id: string }>('itinerary_image_folders')
  if (!folders) return false
  await folders.updateOne({ _id: key }, { $setOnInsert: folder }, { upsert: true })
  return true
}

export async function listMongoImageFolders(): Promise<ImageFolder[]> {
  return await database()?.collection<ImageFolder>('itinerary_image_folders')
    .find<ImageFolder>({}, { projection: { _id: 0 } }).toArray() ?? []
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
