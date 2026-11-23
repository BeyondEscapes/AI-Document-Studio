import { NextResponse } from 'next/server'
import { readItineraryImage } from '@/lib/itinerary-image-storage'
import { getCurrentUser, unauthorized } from '@/lib/auth'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await getCurrentUser()) return unauthorized()
  const { id } = await params
  if (!/^[a-f0-9-]{24,36}$/i.test(id)) {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
  }

  const bytes = await readItineraryImage(id).catch(() => null)
  if (bytes === null) {
    return NextResponse.json({ error: 'Image storage is unavailable.' }, { status: 503 })
  }
  if (!bytes) {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
