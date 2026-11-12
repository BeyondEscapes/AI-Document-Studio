import type { DocumentContent, DocumentSection, ItineraryPageSettings } from '@/types'

export const DEFAULT_CANCELLATION_POLICY = [
  'Please refer to the cancellation terms provided for this itinerary. Any applicable fees and deadlines are subject to those agreed terms.',
]

const OVERVIEW_HEADING = /^(trip overview|tour overview|overview|introduction|about this tour)$/i
const WELCOME_HEADING = /^(ayubowan|ayubowan\s*[|:-]?\s*welcome.*|welcome to sri lanka)$/i
const CANCELLATION_HEADING = /^cancellation policy$/i

export interface ItinerarySectionContent {
  overview: string
  welcome: string
  cancellationPolicy: string[]
  remaining: DocumentSection[]
}

export interface ItineraryPageContent {
  overview: string
  welcome: string
  cancellationPolicy: string[]
  preparedBy: string
  companyName: string
  phone: string
  email: string
  address: string
}

export function extractItinerarySections(sections: DocumentSection[]): ItinerarySectionContent {
  const excluded = new Set<number>()
  let overview = ''
  let welcome = ''
  const cancellationPolicy: string[] = []

  sections.forEach((section, index) => {
    if (section.type === 'title') excluded.add(index)
    if (!['heading1', 'heading2', 'heading3'].includes(section.type)) return

    const heading = section.content.trim()
    const isOverview = !overview && OVERVIEW_HEADING.test(heading)
    const isWelcome = !welcome && WELCOME_HEADING.test(heading)
    const isCancellationPolicy = !cancellationPolicy.length && CANCELLATION_HEADING.test(heading)
    if (!isOverview && !isWelcome && !isCancellationPolicy) return

    excluded.add(index)
    let nextIndex = index + 1
    for (; nextIndex < sections.length; nextIndex += 1) {
      const next = sections[nextIndex]
      if (['heading1', 'heading2', 'heading3', 'page_break'].includes(next.type)) break
      if (next.type === 'paragraph' && next.content.trim()) {
        if (isOverview) overview += `${overview ? ' ' : ''}${next.content.trim()}`
        if (isWelcome) welcome += `${welcome ? ' ' : ''}${next.content.trim()}`
        if (isCancellationPolicy) {
          cancellationPolicy.push(...next.content.split(/\r?\n/).map(line => line.trim()).filter(Boolean))
        }
        excluded.add(nextIndex)
      } else if (isCancellationPolicy && ['bullet_list', 'numbered_list'].includes(next.type)) {
        cancellationPolicy.push(...(next.items ?? []).map(item => item.trim()).filter(Boolean))
        excluded.add(nextIndex)
      }
    }
    if (isOverview || isWelcome) {
      if (sections[nextIndex]?.type === 'page_break') excluded.add(nextIndex)
    }
    if (isCancellationPolicy) {
      if (sections[index - 1]?.type === 'page_break') excluded.add(index - 1)
      if (sections[nextIndex]?.type === 'page_break') excluded.add(nextIndex)
    }
  })

  return {
    overview,
    welcome,
    cancellationPolicy,
    remaining: sections.filter((_, index) => !excluded.has(index)),
  }
}

export function getItineraryPageContent(content: DocumentContent): ItineraryPageContent {
  const extracted = extractItinerarySections(content.sections)
  const settings: ItineraryPageSettings = content.itineraryPages ?? {}
  const fields = content.intake?.fields ?? {}
  const routeText = fields.destinations?.trim() || fields.route?.trim() || fields.travelRoute?.trim()
  return {
    overview: settings.cover?.overview
      ?? (extracted.overview || (routeText
        ? `This itinerary presents a route through ${routeText}. The overview and daily schedule set out the destinations, travel transitions, and activities included in the trip details provided. Use the route map as a visual guide while referring to the day-by-day plan for specific arrangements.`
        : 'This itinerary presents the destinations, travel transitions, and activities included in the trip details provided. Use the route map as a visual guide while referring to the day-by-day plan for specific arrangements.')),
    welcome: settings.cover?.welcome
      ?? (extracted.welcome || 'Warm wishes for a memorable journey through Sri Lanka.'),
    cancellationPolicy: settings.closing?.cancellationPolicy
      ?? (extracted.cancellationPolicy.length ? extracted.cancellationPolicy : DEFAULT_CANCELLATION_POLICY),
    preparedBy: settings.cover?.preparedBy
      ?? (fields.preparedBy?.trim() || fields.tourConsultant?.trim() || 'Beyond Escapes Sri Lanka'),
    companyName: settings.closing?.companyName ?? 'BEYOND ESCAPES PRIVATE LIMITED',
    phone: settings.closing?.phone ?? '+94 112 579 679 | +94 112 579 779 | +94 76 900 2880',
    email: settings.closing?.email ?? 'tours@beyondescapes.com | www.beyondescapes.com',
    address: settings.closing?.address ?? '164/B, New Kandy Rd, Kothalawala, Kaduwela, Sri Lanka',
  }
}
