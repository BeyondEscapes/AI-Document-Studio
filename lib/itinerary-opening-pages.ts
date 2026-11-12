import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import type { DocumentContent, DocumentImage, ItineraryClosingSettings, ItineraryCoverSettings, ItineraryRouteStop } from '@/types'
import { createAyubowanArtworkImage } from '@/lib/itinerary-map'
import { getInitialRouteStops } from '@/lib/itinerary-route'
import { extractItinerarySections, getItineraryPageContent } from '@/lib/itinerary-page-content'

async function createClosingLogoImage(): Promise<DocumentImage> {
  const imageDirectory = path.join(process.cwd(), 'public', 'images')
  const [logoBytes, iconBytes] = await Promise.all([
    fs.promises.readFile(path.join(imageDirectory, 'beyond_escapes_logo.png')),
    fs.promises.readFile(path.join(imageDirectory, 'beyond_escapes_icon.png')),
  ])
  const [logo, icon] = await Promise.all([
    sharp(logoBytes).resize({ width: 520, height: 110, fit: 'inside' }).png().toBuffer(),
    sharp(iconBytes).resize({ width: 112, height: 112, fit: 'inside' }).png().toBuffer(),
  ])
  const bytes = await sharp({
    create: {
      width: 680,
      height: 140,
      channels: 3,
      background: '#FFFFFF',
    },
  }).composite([
    { input: logo, left: 0, top: 15 },
    { input: icon, left: 550, top: 14 },
  ]).jpeg({ quality: 92 }).toBuffer()

  return {
    src: `data:image/jpeg;base64,${bytes.toString('base64')}`,
    altText: 'Beyond Escapes company logo and brand icon',
    width: 680,
    height: 140,
    displayWidth: 3.6,
    displayHeight: 0.75,
  }
}

function getRouteText(content: DocumentContent): string {
  const fields = content.intake?.fields ?? {}
  return fields.destinations?.trim()
    || fields.route?.trim()
    || fields.travelRoute?.trim()
    || content.sections
      .filter(section => ['heading1', 'heading2', 'heading3'].includes(section.type))
      .map(section => section.content)
      .join(' | ')
}

function validRouteStops(stops: ItineraryRouteStop[]): ItineraryRouteStop[] {
  return stops.filter(stop =>
    stop.name.trim()
    && (stop.latitude === null || (Number.isFinite(stop.latitude) && stop.latitude >= -90 && stop.latitude <= 90))
    && (stop.longitude === null || (Number.isFinite(stop.longitude) && stop.longitude >= -180 && stop.longitude <= 180))
  )
}

export async function addItineraryOpeningPages(content: DocumentContent): Promise<DocumentContent> {
  if (content.documentType !== 'tour_itinerary') return content

  const extracted = extractItinerarySections(content.sections)
  const pageContent = getItineraryPageContent(content)
  const currentCover = content.itineraryPages?.cover ?? {}
  const currentClosing = content.itineraryPages?.closing ?? {}
  const routeText = getRouteText(content)
  const routeStops = validRouteStops(
    currentCover.routeStops?.length
      ? currentCover.routeStops
      : getInitialRouteStops(routeText || [
        content.title,
        ...content.sections.map(section => section.content),
      ].join(' | '))
  )
  const routeSignature = JSON.stringify(routeStops)
  const hasCurrentMap = Boolean(currentCover.mapImage)
    && (!currentCover.mapRouteSignature || currentCover.mapRouteSignature === routeSignature)
  if (!hasCurrentMap || !currentCover.mapImage) {
    throw new Error('A real road map screenshot is required. Generate or upload a map in the itinerary editor before exporting.')
  }
  const mapImage = currentCover.mapImage
  const mapAttribution = currentCover.mapAttribution ?? 'Map image supplied by user'
  const [welcomeArtwork, logo] = await Promise.all([
    createAyubowanArtworkImage(),
    createClosingLogoImage(),
  ])

  const cover: ItineraryCoverSettings = {
    ...currentCover,
    overview: pageContent.overview,
    welcome: pageContent.welcome,
    preparedBy: pageContent.preparedBy,
    routeStops,
    mapImage,
    mapAttribution,
    welcomeArtwork,
  }
  const closing: ItineraryClosingSettings = {
    ...currentClosing,
    cancellationPolicy: pageContent.cancellationPolicy,
    companyName: pageContent.companyName,
    phone: pageContent.phone,
    email: pageContent.email,
    address: pageContent.address,
    logo,
  }

  return {
    ...content,
    itineraryPages: { cover, closing },
    sections: [
      { id: 'beyond-escapes-itinerary-body-page-break', type: 'page_break', content: '' },
      ...extracted.remaining,
      { id: 'beyond-escapes-final-page-break', type: 'page_break', content: '' },
    ],
  }
}
