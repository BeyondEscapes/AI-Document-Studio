import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import type { DocumentImage, ItineraryRouteStop } from '@/types'

const ISLAND_OUTLINE: Array<[number, number]> = [
  [79.75, 9.92], [80.17, 9.82], [80.59, 9.68], [80.99, 9.48], [81.28, 9.12],
  [81.36, 8.69], [81.65, 8.16], [81.86, 7.64], [81.77, 7.16], [81.57, 6.69],
  [81.35, 6.29], [80.98, 5.98], [80.58, 5.81], [80.19, 5.93], [79.88, 6.21],
  [79.73, 6.66], [79.63, 7.11], [79.63, 7.63], [79.66, 8.12], [79.7, 8.58],
  [79.61, 9.06], [79.69, 9.56],
]

function projectPoint(longitude: number, latitude: number, minLongitude: number, maxLongitude: number, minLatitude: number, maxLatitude: number): [number, number] {
  const x = 170 + ((longitude - minLongitude) / (maxLongitude - minLongitude || 1)) * 620
  const y = 110 + ((maxLatitude - latitude) / (maxLatitude - minLatitude || 1)) * 1040
  return [x, y]
}

function createIllustrativeMapSvg(stops: ItineraryRouteStop[]): string {
  const longitudes = ISLAND_OUTLINE.map(([longitude]) => longitude)
  const latitudes = ISLAND_OUTLINE.map(([, latitude]) => latitude)
  const minLongitude = Math.min(...longitudes)
  const maxLongitude = Math.max(...longitudes)
  const minLatitude = Math.min(...latitudes)
  const maxLatitude = Math.max(...latitudes)
  const islandPoints = ISLAND_OUTLINE
    .map(([longitude, latitude]) => projectPoint(longitude, latitude, minLongitude, maxLongitude, minLatitude, maxLatitude))
    .map(([x, y]) => `${x},${y}`).join(' ')
  const validStops = stops.filter(stop =>
    Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude)
  )
  const points = validStops.map(stop =>
    projectPoint(stop.longitude!, stop.latitude!, minLongitude, maxLongitude, minLatitude, maxLatitude)
  )
  const routeLine = points.map(([x, y]) => `${x},${y}`).join(' ')
  const markers = points.map(([x, y], index) =>
    `<g><circle cx="${x}" cy="${y}" r="22" fill="#3973B9" stroke="#fff" stroke-width="7"/><text x="${x}" y="${y + 8}" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#fff">${index + 1}</text></g>`
  ).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400" viewBox="0 0 1000 1400">
    <rect width="1000" height="1400" fill="#f3f8f6"/>
    <path d="M75 110 Q500 20 925 110 L925 1290 Q500 1380 75 1290Z" fill="#eef5f8" stroke="#d7e5eb" stroke-width="6"/>
    <polygon points="${islandPoints}" fill="#dbe9d7" stroke="#7ea881" stroke-width="8" stroke-linejoin="round"/>
    ${routeLine ? `<polyline points="${routeLine}" fill="none" stroke="#3973B9" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    ${markers}
  </svg>`
}

export async function createIllustrativeRouteMapImage(stops: ItineraryRouteStop[]): Promise<DocumentImage> {
  const bytes = await sharp(Buffer.from(createIllustrativeMapSvg(stops)))
    .jpeg({ quality: 92 })
    .toBuffer()
  return {
    src: `data:image/jpeg;base64,${bytes.toString('base64')}`,
    altText: 'Illustrative Sri Lanka map showing the itinerary stops',
    width: 1000,
    height: 1400,
    displayWidth: 2.4,
    displayHeight: 4.8,
  }
}

export async function createAyubowanArtworkImage(): Promise<DocumentImage> {
  const artwork = await fs.promises.readFile(path.join(process.cwd(), 'public', 'images', 'sri-lanka-ayubowan.svg'))
  const bytes = await sharp(artwork).jpeg({ quality: 92 }).toBuffer()
  return {
    src: `data:image/jpeg;base64,${bytes.toString('base64')}`,
    altText: 'Illustration of a warm Sri Lankan welcome',
    width: 1500,
    height: 410,
    displayWidth: 6.5,
    displayHeight: 1.8,
  }
}
