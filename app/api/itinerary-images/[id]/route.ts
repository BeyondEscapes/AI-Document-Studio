import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { DATA_DIR } from '@/lib/storage'

const IMAGE_DIRECTORY = path.join(DATA_DIR, 'itinerary-images')

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^[a-f0-9-]{24,36}$/i.test(id)) {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
  }

  const imagePath = path.join(IMAGE_DIRECTORY, `${id}.jpg`)
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
