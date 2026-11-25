import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { DATA_DIR } from '@/lib/storage'
import { listMongoImageFolders, listMongoImages, saveMongoImage, saveMongoImageFolder, searchMongoImages, updateMongoImageMetadata } from '@/lib/mongodb-images'
import { scoreItineraryImage } from '@/lib/itinerary-images'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { folderKey, imageFolder, imageSearchText, uniqueImageFolders } from '@/lib/image-folders'
import type { ImageFolder, ItineraryImageCatalogItem } from '@/types'

export const runtime = 'nodejs'

const IMAGE_DIRECTORY = path.join(DATA_DIR, 'itinerary-images')
const CATALOG_PATH = path.join(IMAGE_DIRECTORY, 'catalog.json')
const SHIPPED_CATALOG_PATH = path.join(process.cwd(), 'public', 'itinerary-images', 'catalog.json')
const FOLDERS_PATH = path.join(IMAGE_DIRECTORY, 'folders.json')
let shippedCatalog: ItineraryImageCatalogItem[] | undefined
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024

function readList<T>(catalogPath: string): T[] {
  if (!fs.existsSync(catalogPath)) return []
  const contents = fs.readFileSync(catalogPath, 'utf8').replace(/^\uFEFF/, '')
  const catalog: unknown = JSON.parse(contents)
  if (!Array.isArray(catalog)) throw new Error('The itinerary image catalog has an invalid format.')
  return catalog as T[]
}

async function readCatalog(strict = false): Promise<ItineraryImageCatalogItem[]> {
  const catalog = new Map(
    (shippedCatalog ??= readList<ItineraryImageCatalogItem>(SHIPPED_CATALOG_PATH)).map(image => [image.id, image])
  )
  for (const image of readList<ItineraryImageCatalogItem>(CATALOG_PATH)) catalog.set(image.id, image)
  const uploads = await (strict ? listMongoImages() : listMongoImages().catch(() => []))
  for (const image of uploads) catalog.set(image.id, image)
  return [...catalog.values()]
}

function writeList<T>(filePath: string, entries: T[]): void {
  fs.mkdirSync(IMAGE_DIRECTORY, { recursive: true })
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(entries, null, 2), 'utf8')
  fs.renameSync(temporaryPath, filePath)
}

function readFolder(cityInput: unknown, placeInput: unknown): ImageFolder | undefined {
  if (typeof cityInput !== 'string' || typeof placeInput !== 'string') return undefined
  const city = cityInput.trim().replace(/\s+/g, ' ')
  const place = placeInput.trim().replace(/\s+/g, ' ')
  if (!city || city.length > 80 || place.length > 100 || /[/\\\u0000-\u001f]/.test(city + place)) return undefined
  return { city, place }
}

export async function GET(request: NextRequest) {
  try {
    if (!await getCurrentUser()) return unauthorized()
    const query = request.nextUrl.searchParams.get('q')?.trim().toLowerCase().slice(0, 160)
    const gallery = request.nextUrl.searchParams.has('gallery')
    const [catalog, ranked] = await Promise.all([
      readCatalog(gallery),
      query ? searchMongoImages(query).catch(() => []) : [],
    ])
    const images = catalog.map(image => ({ ...image, folder: imageFolder(image) }))
    const byId = new Map(images.map(image => [image.id, image]))
    const filtered = query
      ? [...new Map([
        ...ranked.map(image => byId.get(image.id) ?? { ...image, folder: imageFolder(image) }),
        ...images.filter(image => scoreItineraryImage(query, image) > 0 || imageSearchText(image).includes(query)),
      ].map(image => [image.id, image])).values()]
      : images
    const folders = gallery
      ? uniqueImageFolders([
        ...await listMongoImageFolders(),
        ...readList<ImageFolder>(FOLDERS_PATH),
        ...images.flatMap(image => image.folder ? [image.folder] : []),
      ])
      : undefined
    return NextResponse.json({ success: true, images: filtered, folders })
  } catch (error) {
    console.error('Could not read the itinerary image catalog:', error)
    return NextResponse.json({ error: 'Could not load itinerary images.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await getCurrentUser()) return unauthorized()
    const formData = await request.formData()
    const file = formData.get('image')
    const gallery = formData.has('gallery')
    const city = formData.get('city') ?? ''
    const place = formData.get('place') ?? ''
    const folder = readFolder(city, place)
    if ((city || place) && !folder) {
      return NextResponse.json({ error: 'Enter a valid city and place.' }, { status: 400 })
    }
    const title = formData.get('title')
    const maxEdge = gallery ? 3200 : 1600
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose an image file to upload.' }, { status: 400 })
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return NextResponse.json({ error: 'Choose a JPEG, PNG, or WebP image.' }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: 'Images must be smaller than 20 MB.' }, { status: 413 })
    }

    const input = Buffer.from(await file.arrayBuffer())
    const result = await sharp(input, { failOn: 'error', limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: maxEdge, height: gallery ? maxEdge : 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: gallery ? 92 : 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })

    const id = crypto.randomUUID()
    const safeName = path.basename(file.name).replace(/[\u0000-\u001f]/g, '').slice(0, 160) || 'Uploaded image'
    const item: ItineraryImageCatalogItem = {
      id,
      folder,
      title: (typeof title === 'string' && title.trim().slice(0, 160)) || path.parse(safeName).name.replace(/[-_]+/g, ' ').trim() || 'Uploaded image',
      sourceName: safeName,
      sourcePath: safeName,
      url: `/api/itinerary-images/${id}`,
      width: result.info.width,
      height: result.info.height,
    }

    if (!await saveMongoImage(item, result.data)) {
      const catalog = readList<ItineraryImageCatalogItem>(CATALOG_PATH)
      fs.mkdirSync(IMAGE_DIRECTORY, { recursive: true })
      fs.writeFileSync(path.join(IMAGE_DIRECTORY, `${id}.jpg`), result.data)
      writeList(CATALOG_PATH, [item, ...catalog])
    }

    return NextResponse.json({ success: true, image: { ...item, folder: imageFolder(item) } }, { status: 201 })
  } catch (error) {
    console.error('Could not upload itinerary image:', error)
    return NextResponse.json({ error: 'Could not save the image.' }, { status: 500 })
  }
}


export async function PUT(request: NextRequest) {
  try {
    if (!await getCurrentUser()) return unauthorized()
    const body = await request.json().catch(() => null)
    const folder = readFolder(body?.city, body?.place)
    if (!folder) return NextResponse.json({ error: 'Enter a valid city and place.' }, { status: 400 })

    if (!await saveMongoImageFolder(folder, folderKey(folder))) {
      writeList(FOLDERS_PATH, uniqueImageFolders([...readList<ImageFolder>(FOLDERS_PATH), folder]))
    }
    return NextResponse.json({ success: true, folder })
  } catch (error) {
    console.error('Could not create image folder:', error)
    return NextResponse.json({ error: 'Could not create the folder.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!await getCurrentUser()) return unauthorized()
    const body = await request.json().catch(() => null)
    const folder = readFolder(body?.city, body?.place)
    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 160) : ''
    if (!folder || !title) return NextResponse.json({ error: 'Enter a title and valid folder.' }, { status: 400 })

    const image = (await readCatalog(true)).find(item => item.id === body.id)
    if (!image) return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
    const updated = { ...image, title, folder }
    if (!await updateMongoImageMetadata(updated)) {
      const catalog = readList<ItineraryImageCatalogItem>(CATALOG_PATH)
      writeList(CATALOG_PATH, [updated, ...catalog.filter(item => item.id !== updated.id)])
    }
    return NextResponse.json({ success: true, image: updated })
  } catch (error) {
    console.error('Could not organize image:', error)
    return NextResponse.json({ error: 'Could not organize the image.' }, { status: 500 })
  }
}
