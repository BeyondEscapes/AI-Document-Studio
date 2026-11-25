import type { DocumentContent, DocumentImage, DocumentSection, ItineraryImageCatalogItem } from '@/types'
import { extractItinerarySections } from '@/lib/itinerary-page-content'

export function isItineraryDocument(content: DocumentContent | null | undefined): boolean {
  if (!content) return false
  return content.documentType === 'tour_itinerary'
    || content.intake?.documentType === 'tour_itinerary'
    || Boolean(content.itineraryPages)
    || Boolean(content.title && /itinerary|tour|day.*tour|trip/i.test(content.title))
}

const NON_LOCATION_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'city', 'experience', 'factory', 'for', 'from',
  'back', 'banner', 'cover', 'front', 'gif', 'image', 'images', 'img', 'in',
  'island', 'itinerary', 'jpeg', 'jpg', 'journey', 'national', 'of', 'park',
  'photo', 'photos', 'place', 'png', 'river', 'safari', 'sri', 'the',
  'thumbnail', 'thumb', 'to', 'tour', 'trail', 'trekking', 'visit', 'webp',
  'with',
])

function tokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 2 && !NON_LOCATION_WORDS.has(token) && !/^\d+$/.test(token))
}

export function scoreItineraryImage(query: string, image: ItineraryImageCatalogItem): number {
  const queryTokens = new Set(tokens(query))
  const imagePath = image.sourcePath
  const imageTokens = [...new Set(tokens(`${imagePath} ${image.title} ${image.folder?.city ?? ''} ${image.folder?.place ?? ''}`))]
  if (!queryTokens.size || !imageTokens.length) return 0

  const matchedTokens = imageTokens.filter(token => queryTokens.has(token)).length
  return matchedTokens / imageTokens.length
}

function sectionText(section: DocumentSection): string {
  return [
    section.content,
    ...(section.items ?? []),
    ...(section.headers ?? []),
    ...(section.rows ?? []).flat(),
  ].join(' ')
}

const NON_PAGE_HEADINGS = /^(about this tour|ayubowan|cancellation policy|day[-\s]?by[-\s]?day itinerary|exclusions|important information|inclusions|introduction|overview|tour overview|trip overview|welcome to sri lanka)$/i

function getItineraryPageSections(sections: DocumentSection[], pageStart: number): DocumentSection[] {
  let pageEnd = pageStart + 1
  while (pageEnd < sections.length && !['heading1', 'page_break'].includes(sections[pageEnd].type)) {
    pageEnd += 1
  }
  return sections.slice(pageStart, pageEnd)
}

export function suggestItineraryImageMatches(
  sections: DocumentSection[],
  catalog: ItineraryImageCatalogItem[]
): Map<string, ItineraryImageCatalogItem> {
  const matches = new Map<string, ItineraryImageCatalogItem>()
  const usedImageIds = new Set(
    sections.flatMap(section => (section.images ?? []).flatMap(image =>
      [image.catalogId, image.src].filter((value): value is string => Boolean(value))
    ))
  )

  sections.forEach((section, index) => {
    if (!['heading1', 'heading2', 'heading3'].includes(section.type) || section.images?.length) return
    if (/^(trip overview|tour overview|itinerary|overview|important information|inclusions|exclusions)$/i
      .test(section.content.trim())) return

    const text = [sectionText(section)]
    for (let nextIndex = index + 1; nextIndex < sections.length; nextIndex += 1) {
      const next = sections[nextIndex]
      if (['heading1', 'heading2'].includes(next.type)) break
      text.push(sectionText(next))
    }

    const ranked = catalog
      .filter(image => !usedImageIds.has(image.id) && !usedImageIds.has(image.url))
      .map(image => ({ image, score: scoreItineraryImage(text.join(' '), image) }))
      .filter(candidate => candidate.score >= 0.5)
      .sort((left, right) => right.score - left.score || left.image.title.localeCompare(right.image.title))

    const best = ranked[0]?.image
    if (best) {
      matches.set(section.id, best)
      usedImageIds.add(best.id)
      usedImageIds.add(best.url)
    }
  })

  return matches
}

export function suggestItineraryPageImages(
  sections: DocumentSection[],
  catalog: ItineraryImageCatalogItem[],
  options?: { replaceExisting?: boolean }
): Map<string, ItineraryImageCatalogItem> {
  const replaceExisting = Boolean(options?.replaceExisting)
  const extracted = extractItinerarySections(sections)
  const remainingIds = new Set(extracted.remaining.map(s => s.id))

  // Find candidate day/page starts strictly within remaining (body) sections
  // Front page (title, overview, welcome) and last page (cancellation policy) are never included
  let pageStarts = sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => remainingIds.has(section.id) && section.type === 'heading1' && !NON_PAGE_HEADINGS.test(section.content.trim()))

  if (!pageStarts.length) {
    pageStarts = sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => remainingIds.has(section.id) && section.type === 'heading2' && !NON_PAGE_HEADINGS.test(section.content.trim()))
  }

  if (!pageStarts.length) {
    pageStarts = sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => remainingIds.has(section.id) && ['heading1', 'heading2', 'heading3'].includes(section.type))
  }

  if (!pageStarts.length && extracted.remaining.length) {
    pageStarts = sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => remainingIds.has(section.id))
  }

  const usedImageIds = new Set(
    replaceExisting
      ? []
      : sections.flatMap(section => (section.images ?? []).flatMap(image =>
          [image.catalogId, image.src].filter((value): value is string => Boolean(value))
        ))
  )
  const matches = new Map<string, ItineraryImageCatalogItem>()
  const startIndices = new Set(pageStarts.map(p => p.index))

  for (let i = 0; i < pageStarts.length; i++) {
    const { section, index } = pageStarts[i]
    if (!catalog.length) break

    let pageEnd = index + 1
    while (pageEnd < sections.length && !startIndices.has(pageEnd) && sections[pageEnd].type !== 'page_break') {
      pageEnd += 1
    }
    const pageSections = sections.slice(index, pageEnd)

    if (!replaceExisting && pageSections.some(pageSection => pageSection.images?.length)) {
      continue
    }

    const available = catalog.filter(image => !usedImageIds.has(image.id) && !usedImageIds.has(image.url))
    const pool = available.length ? available : catalog
    const ranked = pool
      .map(image => ({
        image,
        score: scoreItineraryImage(pageSections.map(sectionText).join(' '), image),
      }))
      .sort((left, right) => right.score - left.score || left.image.title.localeCompare(right.image.title))
    const bestMatch = ranked[0]
    const image = bestMatch && bestMatch.score > 0
      ? bestMatch.image
      : pool[0] ?? catalog[matches.size % catalog.length]

    matches.set(section.id, image)
    usedImageIds.add(image.id)
    usedImageIds.add(image.url)
  }

  return matches
}

function useCatalogImageUrls(content: DocumentContent): DocumentContent {
  const imageWithUrl = (image: DocumentImage): DocumentImage => image.catalogId
    ? { ...image, src: `/api/itinerary-images/${encodeURIComponent(image.catalogId)}` }
    : image

  return {
    ...content,
    sections: content.sections.map(section => ({
      ...section,
      images: section.images?.map(imageWithUrl),
    })),
    coverImage: content.coverImage ? imageWithUrl(content.coverImage) : undefined,
    closingLogo: content.closingLogo ? imageWithUrl(content.closingLogo) : undefined,
    itineraryPages: content.itineraryPages ? {
      ...content.itineraryPages,
      cover: content.itineraryPages.cover ? {
        ...content.itineraryPages.cover,
        mapImage: content.itineraryPages.cover.mapImage
          ? imageWithUrl(content.itineraryPages.cover.mapImage)
          : undefined,
        welcomeArtwork: content.itineraryPages.cover.welcomeArtwork
          ? imageWithUrl(content.itineraryPages.cover.welcomeArtwork)
          : undefined,
      } : undefined,
      closing: content.itineraryPages.closing ? {
        ...content.itineraryPages.closing,
        logo: content.itineraryPages.closing.logo
          ? imageWithUrl(content.itineraryPages.closing.logo)
          : undefined,
      } : undefined,
    } : undefined,
  }
}

export function prepareDocumentForLocalSave(content: DocumentContent): DocumentContent {
  return useCatalogImageUrls(content)
}
