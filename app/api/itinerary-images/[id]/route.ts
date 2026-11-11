import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { DATA_DIR } from '@/lib/storage'

const USER_IMAGE_DIRECTORY = path.join(DATA_DIR, 'itinerary-images')
const SHIPPED_IMAGE_DIRECTORY = path.join(process.cwd(), 'public', 'itinerary-images')

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^[a-f0-9-]{24,36}$/i.test(id)) {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
  }

  const userImagePath = path.join(USER_IMAGE_DIRECTORY, `${id}.jpg`)
  const shippedImagePath = path.join(SHIPPED_IMAGE_DIRECTORY, `${id}.jpg`)
  const imagePath = fs.existsSync(userImagePath) ? userImagePath : shippedImagePath
  if (!fs.existsSync(imagePath)) {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
  }

  return new NextResponse(fs.readFileSync(imagePath), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
