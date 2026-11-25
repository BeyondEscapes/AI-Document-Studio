import type {
  DocumentContent,
  DocumentSection,
  ItineraryClosingSettings,
  ItineraryEntranceFeeItem,
  ItineraryPageSettings,
  ItineraryQuotationItem,
} from '@/types'

export const DEFAULT_QUOTATION: { items: ItineraryQuotationItem[]; total: string } = {
  items: [
    { service: 'Per vehicle per tour', amount: 'USD 760.00' },
    { service: 'Udawalawe Safari @USD 65.00 per person x 2', amount: 'USD 130.00' },
    { service: 'Train Tickets @USD15.00 per person x 2', amount: 'USD 30.00' },
  ],
  total: 'USD 920.00',
}

export const DEFAULT_ENTRANCE_FEES: ItineraryEntranceFeeItem[] = [
  { attraction: 'Dambulla Cave Temple', amount: 'USD 10.00' },
  { attraction: 'Sigiriya Rock Fortress', amount: 'USD 35.00' },
  { attraction: 'Kandy Temple Of tooth', amount: 'USD 10.00' },
  { attraction: 'Kandy Cultural Show', amount: 'USD 5.00' },
  { attraction: 'Stilt Fishing', amount: 'USD 5.00' },
  { attraction: 'Victoria Park', amount: 'USD 5.00' },
  { attraction: 'Madu river boat safari', amount: 'USD 15.00' },
  { attraction: 'Whale watching experience', amount: 'USD 35.00' },
  { attraction: 'Village safari experience', amount: 'USD 7.00' },
]

export const DEFAULT_VALUE_ADDED_SERVICES: string[] = [
  'Paging and welcome with Garlands on arrival',
  'Meeting and assistance at the airport on arrival',
  '500ml Mineral Water Bottle per day per person will be given during sightseeing tours',
]

export const DEFAULT_RATE_INCLUDES: string[] = [
  'Transport is based on Air-conditioned Luxury Car',
  'Service of an English-speaking Chauffeur Guide.',
  'Driver bata, driver accommodation, fuel, Parking and highway tickets',
  'Half Day Safari at Udawalawe National Park',
  '2nd Class Train tickets from Ella to Nanu Oya',
  'All current taxes as on date',
]

export const DEFAULT_RATE_EXCLUDES: string[] = [
  'Hotel accommodation',
  'Breakfast, Lunch & Dinner',
  'Entrance fees',
  'Sri Lanka Visa',
  'Compulsory new year supplement (USD 50.00 Per Person)',
  'Any International Airfare / Airport taxes',
  'Any change in tax structure resulting from the hike in published tariff.',
  'Items of personal nature like tips, laundry, phone calls etc.',
  'Any video / still camera fee to the monuments and places of visit',
  'Any other item not explicitly mentioned under price includes.',
  'Bar, telephone and laundry bills',
  'Tips to guides, restaurants, and hotel lobby. Tipping is expected.',
  'Any others expense',
]

export const DEFAULT_CANCELLATION_POLICY: string[] = [
  '30 Days prior to the scheduled starting date: No Cancellation Fee',
  '29-15 Days prior to the scheduled starting date: 50% Cancellation Fee',
  '14 Days prior to the scheduled starting date: 75% Cancellation Fee',
  'Within 07 prior to the scheduled starting date: 100% Cancellation Fee',
  'Fee. No Shows - 100% Cancellation Fee.',
]

const OVERVIEW_HEADING = /^(trip overview|tour overview|overview|introduction|about this tour)$/i
const WELCOME_HEADING = /^(ayubowan|ayubowan\s*[|:-]?\s*welcome.*|welcome to sri lanka)$/i
const QUOTATION_HEADING = /^(quotation|package quotation|price quotation|tour quotation|costing|price summary)$/i
const ENTRANCE_FEES_HEADING = /^(optional\s*[-–—]?\s*entrance fees|entrance fees|optional entrance fees)$/i
const VALUE_ADDED_HEADING = /^(value added services.*|value added services on complementary basis|complimentary services|complimentary benefits)$/i
const INCLUDES_HEADING = /^(above rate includes|the above rate includes|package includes|inclusions|rate includes|price includes)$/i
const EXCLUDES_HEADING = /^(the above rate excludes|above rate excludes|package excludes|exclusions|rate excludes|price excludes)$/i
const CANCELLATION_HEADING = /^(cancellation policy|cancellation terms|cancellation)$/i
const END_OF_SERVICES_REGEX = /^\*+\s*end of services\s*\*+$/i

export interface ItinerarySectionContent {
  overview: string
  welcome: string
  quotation?: {
    items: ItineraryQuotationItem[]
    total?: string
  }
  optionalEntranceFees?: ItineraryEntranceFeeItem[]
  valueAddedServices?: string[]
  rateIncludes?: string[]
  rateExcludes?: string[]
  cancellationPolicy: string[]
  remaining: DocumentSection[]
}

export interface ItineraryPageContent {
  overview: string
  welcome: string
  quotation: {
    items: ItineraryQuotationItem[]
    total: string
  }
  optionalEntranceFees: ItineraryEntranceFeeItem[]
  valueAddedServices: string[]
  rateIncludes: string[]
  rateExcludes: string[]
  cancellationPolicy: string[]
  preparedBy: string
  companyName: string
  phone: string
  email: string
  address: string
}

function parseTableOrLines(
  sections: DocumentSection[],
  startIndex: number
): { lines: string[]; tableRows?: string[][]; nextIndex: number } {
  const lines: string[] = []
  let tableRows: string[][] | undefined
  let nextIndex = startIndex

  for (; nextIndex < sections.length; nextIndex += 1) {
    const next = sections[nextIndex]
    if (['heading1', 'heading2', 'heading3', 'page_break'].includes(next.type)) break
    if (END_OF_SERVICES_REGEX.test(next.content.trim())) break

    if (next.type === 'table' && next.rows?.length) {
      tableRows = next.rows
    } else if (next.type === 'paragraph' && next.content.trim()) {
      lines.push(...next.content.split(/\r?\n/).map(line => line.trim()).filter(Boolean))
    } else if (['bullet_list', 'numbered_list'].includes(next.type)) {
      lines.push(...(next.items ?? []).map(item => item.trim()).filter(Boolean))
    }
  }

  return { lines, tableRows, nextIndex }
}

export function extractItinerarySections(sections: DocumentSection[]): ItinerarySectionContent {
  const excluded = new Set<number>()
  let overview = ''
  let welcome = ''
  let quotation: { items: ItineraryQuotationItem[]; total?: string } | undefined
  let optionalEntranceFees: ItineraryEntranceFeeItem[] | undefined
  let valueAddedServices: string[] | undefined
  let rateIncludes: string[] | undefined
  let rateExcludes: string[] | undefined
  const cancellationPolicy: string[] = []

  sections.forEach((section, index) => {
    if (section.type === 'title') {
      excluded.add(index)
      return
    }
    if (END_OF_SERVICES_REGEX.test(section.content.trim())) {
      excluded.add(index)
      return
    }
    if (!['heading1', 'heading2', 'heading3'].includes(section.type)) return

    const heading = section.content.trim()
    const isOverview = !overview && OVERVIEW_HEADING.test(heading)
    const isWelcome = !welcome && WELCOME_HEADING.test(heading)
    const isQuotation = !quotation && QUOTATION_HEADING.test(heading)
    const isEntranceFees = !optionalEntranceFees && ENTRANCE_FEES_HEADING.test(heading)
    const isValueAdded = !valueAddedServices && VALUE_ADDED_HEADING.test(heading)
    const isIncludes = !rateIncludes && INCLUDES_HEADING.test(heading)
    const isExcludes = !rateExcludes && EXCLUDES_HEADING.test(heading)
    const isCancellationPolicy = !cancellationPolicy.length && CANCELLATION_HEADING.test(heading)

    if (
      !isOverview && !isWelcome && !isQuotation && !isEntranceFees &&
      !isValueAdded && !isIncludes && !isExcludes && !isCancellationPolicy
    ) {
      return
    }

    excluded.add(index)
    const { lines, tableRows, nextIndex } = parseTableOrLines(sections, index + 1)
    for (let i = index + 1; i < nextIndex; i += 1) {
      excluded.add(i)
    }

    if (isOverview) {
      overview = lines.join(' ')
    } else if (isWelcome) {
      welcome = lines.join(' ')
    } else if (isQuotation) {
      const items: ItineraryQuotationItem[] = []
      let total = ''
      if (tableRows?.length) {
        tableRows.forEach(row => {
          const service = (row[0] ?? '').trim()
          const amount = (row[1] ?? '').trim()
          if (!service) return
          if (/^total/i.test(service)) {
            total = amount || service
          } else {
            items.push({ service, amount })
          }
        })
      } else {
        lines.forEach(line => {
          const parts = line.split(/[:\t|]/)
          if (parts.length >= 2) {
            const service = parts[0].trim()
            const amount = parts.slice(1).join(':').trim()
            if (/^total/i.test(service)) total = amount
            else items.push({ service, amount })
          }
        })
      }
      quotation = { items, total: total || undefined }
    } else if (isEntranceFees) {
      const items: ItineraryEntranceFeeItem[] = []
      if (tableRows?.length) {
        tableRows.forEach(row => {
          const attraction = (row[0] ?? '').trim()
          const amount = (row[1] ?? '').trim()
          if (attraction) items.push({ attraction, amount })
        })
      } else {
        lines.forEach(line => {
          const parts = line.split(/[:\t|]/)
          if (parts.length >= 2) {
            items.push({ attraction: parts[0].trim(), amount: parts.slice(1).join(':').trim() })
          } else if (line.trim()) {
            items.push({ attraction: line.trim(), amount: '' })
          }
        })
      }
      optionalEntranceFees = items
    } else if (isValueAdded) {
      valueAddedServices = lines
    } else if (isIncludes) {
      rateIncludes = lines
    } else if (isExcludes) {
      rateExcludes = lines
    } else if (isCancellationPolicy) {
      cancellationPolicy.push(...lines)
    }

    if (sections[nextIndex]?.type === 'page_break') excluded.add(nextIndex)
  })

  return {
    overview,
    welcome,
    quotation,
    optionalEntranceFees,
    valueAddedServices,
    rateIncludes,
    rateExcludes,
    cancellationPolicy,
    remaining: sections.filter((_, index) => !excluded.has(index)),
  }
}

export function getItineraryPageContent(content: DocumentContent): ItineraryPageContent {
  const extracted = extractItinerarySections(content.sections)
  const settings: ItineraryPageSettings = content.itineraryPages ?? {}
  const closing: ItineraryClosingSettings = settings.closing ?? {}
  const fields = content.intake?.fields ?? {}
  const routeText = fields.destinations?.trim() || fields.route?.trim() || fields.travelRoute?.trim()

  const quotation = closing.quotation
    ? { items: closing.quotation.items, total: closing.quotation.total ?? DEFAULT_QUOTATION.total }
    : extracted.quotation?.items.length
      ? { items: extracted.quotation.items, total: extracted.quotation.total ?? DEFAULT_QUOTATION.total }
      : DEFAULT_QUOTATION

  const optionalEntranceFees = closing.optionalEntranceFees
    ?? (extracted.optionalEntranceFees?.length ? extracted.optionalEntranceFees : DEFAULT_ENTRANCE_FEES)
  const valueAddedServices = closing.valueAddedServices
    ?? (extracted.valueAddedServices?.length ? extracted.valueAddedServices : DEFAULT_VALUE_ADDED_SERVICES)
  const rateIncludes = closing.rateIncludes
    ?? (extracted.rateIncludes?.length ? extracted.rateIncludes : DEFAULT_RATE_INCLUDES)
  const rateExcludes = closing.rateExcludes
    ?? (extracted.rateExcludes?.length ? extracted.rateExcludes : DEFAULT_RATE_EXCLUDES)
  const cancellationPolicy = closing.cancellationPolicy
    ?? (extracted.cancellationPolicy.length ? extracted.cancellationPolicy : DEFAULT_CANCELLATION_POLICY)

  return {
    overview: settings.cover?.overview
      ?? (extracted.overview || (routeText
        ? `EMBRACE THIS EXCLUSIVE HOLIDAY PACKAGE DESIGNED BY SRI LANKA BEYOND ESCAPES - TAILOR-MADE WITH EXQUISITE BEAUTY AND HAVE A JOURNEY OF A LIFETIME! THIS ITINERARY HAS BEEN CAREFULLY DESIGNED TO GIVE YOU A TASTE OF THE EXCITING, ENDLESS POSSIBILITIES AND CAN BE TAILORED TO SUIT YOUR EXACT PREFERENCES. A BLEND OF ISLAND NATURE, WILDLIFE & ENGAGE IN SOME ADVENTUROUS ACTIVITIES MADE FOR YOUR VACATION IN SRI LANKA.`
        : 'EMBRACE THIS EXCLUSIVE HOLIDAY PACKAGE DESIGNED BY SRI LANKA BEYOND ESCAPES - TAILOR-MADE WITH EXQUISITE BEAUTY AND HAVE A JOURNEY OF A LIFETIME!')),
    welcome: settings.cover?.welcome
      ?? (extracted.welcome || "Begin in the spirit of Ayubowan, with wishes for a safe and memorable journey. Beyond Escapes is delighted to welcome you to Sri Lanka and share the island's warm hospitality, rich culture, lush landscapes and beautiful coastlines. We hope each stop becomes a lasting memory."),
    quotation,
    optionalEntranceFees,
    valueAddedServices,
    rateIncludes,
    rateExcludes,
    cancellationPolicy,
    preparedBy: settings.cover?.preparedBy
      ?? (fields.preparedBy?.trim() || fields.tourConsultant?.trim() || 'Kalani Lankajeewa\nTour Consultant'),
    companyName: closing.companyName ?? 'BEYOND ESCAPES PRIVATE LIMITED',
    phone: closing.phone ?? '+94 112 579 679 | +94 112 579 779 | +94 70 457 9679',
    email: closing.email ?? 'info@beyondescapes.com | www.beyondescapes.com',
    address: closing.address ?? '164/B, New Kandy Rd, Kothalawala, Kaduwela, Sri Lanka',
  }
}
