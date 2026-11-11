import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { DATA_DIR } from '@/lib/storage'
import type { ItineraryImageCatalogItem } from '@/types'

export const runtime = 'nodejs'

const IMAGE_DIRECTORY = path.join(DATA_DIR, 'itinerary-images')
const CATALOG_PATH = path.join(IMAGE_DIRECTORY, 'catalog.json')
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024

function readCatalog(): ItineraryImageCatalogItem[] {
  if (!fs.existsSync(CATALOG_PATH)) return []
  const catalog: unknown = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'))
  if (!Array.isArray(catalog)) throw new Error('The itinerary image catalog has an invalid format.')
  return catalog as ItineraryImageCatalogItem[]
}

function writeCatalog(catalog: ItineraryImageCatalogItem[]): void {
  fs.mkdirSync(IMAGE_DIRECTORY, { recursive: true })
  const temporaryPath = `${CATALOG_PATH}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(catalog, null, 2), 'utf8')
  fs.renameSync(temporaryPath, CATALOG_PATH)
}

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q')?.trim().toLowerCase()
    const images = readCatalog()
    const filtered = query
      ? images.filter(image => `${image.title} ${image.sourcePath}`.toLowerCase().includes(query))
      : images
    return NextResponse.json({ success: true, images: filtered })
  } catch (error) {
    console.error('Could not read the itinerary image catalog:', error)
    return NextResponse.json({ error: 'Could not load itinerary images.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('image')
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
      .resize({ width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })

    const catalog = readCatalog()
    const id = crypto.randomUUID()
    const safeName = path.basename(file.name).replace(/[\u0000-\u001f]/g, '').slice(0, 160) || 'Uploaded image'
    const item: ItineraryImageCatalogItem = {
      id,
      title: path.parse(safeName).name.replace(/[-_]+/g, ' ').trim() || 'Uploaded image',
      sourceName: safeName,
      sourcePath: safeName,
      url: `/api/itinerary-images/${id}`,
      width: result.info.width,
      height: result.info.height,
    }

    fs.mkdirSync(IMAGE_DIRECTORY, { recursive: true })
    fs.writeFileSync(path.join(IMAGE_DIRECTORY, `${id}.jpg`), result.data)
    writeCatalog([item, ...catalog])

    return NextResponse.json({ success: true, image: item }, { status: 201 })
  } catch (error) {
    console.error('Could not upload itinerary image:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Could not upload image: ${message}` }, { status: 500 })
  }
}
