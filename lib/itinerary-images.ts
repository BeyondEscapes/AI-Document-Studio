import type { DocumentSection, ItineraryImageCatalogItem } from '@/types'

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
  const imageTokens = [...new Set(tokens(`${imagePath} ${image.title}`))]
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
      .filter(candidate => candidate.score >= 0.6)
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
