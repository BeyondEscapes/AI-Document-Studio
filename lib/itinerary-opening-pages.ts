import sharp from 'sharp'
import type { DocumentContent, DocumentImage } from '@/types'

type RouteStop = {
  name: string
  latitude: number
  longitude: number
  aliases: string[]
}

const ROUTE_STOPS: RouteStop[] = [
  { name: 'Airport', latitude: 7.18, longitude: 79.88, aliases: ['Bandaranaike International Airport', 'Colombo Airport', 'Katunayake', 'Airport'] },
  { name: 'Negombo', latitude: 7.21, longitude: 79.84, aliases: ['Negombo'] },
  { name: 'Colombo', latitude: 6.93, longitude: 79.85, aliases: ['Colombo'] },
  { name: 'Pinnawala', latitude: 7.30, longitude: 80.39, aliases: ['Pinnawala'] },
  { name: 'Kandy', latitude: 7.29, longitude: 80.63, aliases: ['Kandy'] },
  { name: 'Dambulla', latitude: 7.86, longitude: 80.65, aliases: ['Dambulla'] },
  { name: 'Sigiriya', latitude: 7.96, longitude: 80.76, aliases: ['Sigiriya'] },
  { name: 'Polonnaruwa', latitude: 7.94, longitude: 81.00, aliases: ['Polonnaruwa'] },
  { name: 'Anuradhapura', latitude: 8.31, longitude: 80.40, aliases: ['Anuradhapura'] },
  { name: 'Trincomalee', latitude: 8.57, longitude: 81.23, aliases: ['Trincomalee'] },
  { name: 'Jaffna', latitude: 9.66, longitude: 80.01, aliases: ['Jaffna'] },
  { name: 'Nuwara Eliya', latitude: 6.95, longitude: 80.78, aliases: ['Nuwara Eliya'] },
  { name: 'Ella', latitude: 6.87, longitude: 81.05, aliases: ['Ella'] },
  { name: 'Udawalawe', latitude: 6.45, longitude: 80.88, aliases: ['Udawalawe'] },
  { name: 'Yala', latitude: 6.37, longitude: 81.52, aliases: ['Yala'] },
  { name: 'Weligama', latitude: 5.97, longitude: 80.43, aliases: ['Weligama'] },
  { name: 'Mirissa', latitude: 5.95, longitude: 80.45, aliases: ['Mirissa'] },
  { name: 'Galle', latitude: 6.05, longitude: 80.22, aliases: ['Galle'] },
  { name: 'Bentota', latitude: 6.42, longitude: 79.99, aliases: ['Bentota'] },
]

const OVERVIEW_HEADING = /^(trip overview|tour overview|overview|introduction|about this tour)$/i
const WELCOME_HEADING = /^(ayubowan|ayubowan\s*[|:-]?\s*welcome.*|welcome to sri lanka)$/i

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]!)
}

function routeStopsFromText(value: string): RouteStop[] {
  const matches: Array<{ index: number; stop: RouteStop }> = []
  for (const stop of ROUTE_STOPS) {
    const aliasMatches = stop.aliases.flatMap(alias => {
      const expression = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig')
      return [...value.matchAll(expression)].map(match => ({ index: match.index ?? 0, length: match[0].length }))
    })
    if (aliasMatches.length) {
      matches.push({ index: Math.min(...aliasMatches.map(match => match.index)), stop })
    }
  }
  matches.sort((left, right) => left.index - right.index)
  return matches.map(match => match.stop)
}

function extractRoute(content: DocumentContent): RouteStop[] {
  const explicitRoute = content.intake?.fields.destinations
    ?? content.intake?.fields.route
    ?? content.intake?.fields.travelRoute
  if (explicitRoute?.trim()) {
    const stops = routeStopsFromText(explicitRoute)
    if (stops.length) return stops
  }

  const headingText = content.sections
    .filter(section => ['heading1', 'heading2', 'heading3'].includes(section.type))
    .map(section => section.content)
    .join(' | ')
  const headingStops = routeStopsFromText(headingText)
  if (headingStops.length) return headingStops

  return routeStopsFromText([
    content.title,
    ...content.sections.map(section => section.content),
    content.intake?.fields.destinations ?? '',
  ].join(' | '))
}

function projectPoint(stop: RouteStop): [number, number] {
  const x = 190 + ((stop.longitude - 79.55) / (81.95 - 79.55)) * 260
  const y = 30 + ((9.95 - stop.latitude) / (9.95 - 5.75)) * 360
  return [x, y]
}

function createRouteMapSvg(stops: RouteStop[], routeLabel: string): string {
  const island = [
    [79.75, 9.92], [80.17, 9.82], [80.59, 9.68], [80.99, 9.48], [81.28, 9.12],
    [81.36, 8.69], [81.65, 8.16], [81.86, 7.64], [81.77, 7.16], [81.57, 6.69],
    [81.35, 6.29], [80.98, 5.98], [80.58, 5.81], [80.19, 5.93], [79.88, 6.21],
    [79.73, 6.66], [79.63, 7.11], [79.63, 7.63], [79.66, 8.12], [79.7, 8.58],
    [79.61, 9.06], [79.69, 9.56],
  ].map(([longitude, latitude]) => projectPoint({ name: '', longitude, latitude, aliases: [] }))
  const islandPoints = island.map(([x, y]) => `${x},${y}`).join(' ')
  const stopPoints = stops.map(projectPoint)
  const routeLine = stopPoints.map(([x, y]) => `${x},${y}`).join(' ')
  const mapMarkers = stops.map((stop, index) => {
    const [x, y] = stopPoints[index]
    return `<g><circle cx="${x}" cy="${y}" r="10" fill="#3973B9" stroke="#FFFFFF" stroke-width="3"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#FFFFFF">${index + 1}</text></g>`
  }).join('')
  const listStops = stops.slice(0, 6).map((stop, index) => {
    const y = 135 + index * 39
    return `<g><circle cx="690" cy="${y - 5}" r="12" fill="#3973B9"/><text x="690" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#FFFFFF">${index + 1}</text><text x="715" y="${y}" font-family="Arial,sans-serif" font-size="22" fill="#23374D">${escapeXml(stop.name)}</text></g>`
  }).join('')
  const extraStops = stops.length > 6
    ? `<text x="715" y="369" font-family="Arial,sans-serif" font-size="17" fill="#68798A">+ ${stops.length - 6} more stops in your itinerary</text>`
    : ''
  const routeText = routeLabel ? escapeXml(routeLabel.slice(0, 115)) : 'Route details are shown in the itinerary'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="450" viewBox="0 0 1440 450">
    <rect width="1440" height="450" rx="24" fill="#F3F7FA"/>
    <path d="M 560 34 C 615 100, 618 300, 560 412" fill="none" stroke="#D3E0E9" stroke-width="2"/>
    <polygon points="${islandPoints}" fill="#DDEBDD" stroke="#82A984" stroke-width="3"/>
    ${routeLine ? `<polyline points="${routeLine}" fill="none" stroke="#3973B9" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.88"/>` : ''}
    ${mapMarkers}
    <rect x="625" y="35" width="770" height="380" rx="20" fill="#FFFFFF" stroke="#DDE6ED" stroke-width="2"/>
    <text x="665" y="82" font-family="Arial,sans-serif" font-size="17" font-weight="700" letter-spacing="1.5" fill="#3973B9">YOUR ROUTE</text>
    ${listStops || `<text x="665" y="135" font-family="Arial,sans-serif" font-size="21" fill="#68798A">${routeText}</text>`}
    ${extraStops}
    <text x="665" y="390" font-family="Arial,sans-serif" font-size="14" fill="#68798A">Route is illustrative and not to scale.</text>
  </svg>`
}

function createWelcomeArtworkSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="800" viewBox="0 0 1440 800">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#DDECF4"/><stop offset="1" stop-color="#F8F5E9"/>
      </linearGradient>
    </defs>
    <rect width="1440" height="800" fill="url(#sky)"/>
    <circle cx="1120" cy="180" r="88" fill="#E8B76C" opacity=".92"/>
    <path d="M0 535 Q235 340 450 520 T900 490 T1440 470 V800 H0Z" fill="#8BAF87"/>
    <path d="M0 615 Q260 420 535 595 T1030 555 T1440 565 V800 H0Z" fill="#527F68"/>
    <path d="M0 710 Q280 580 580 690 T1120 650 T1440 680 V800 H0Z" fill="#315F54"/>
    <g fill="#285B4C">
      <path d="M190 600 Q210 490 230 375 Q235 355 245 375 Q255 490 275 600Z"/>
      <path d="M228 385 Q175 320 110 340 Q170 365 222 405 Q160 385 124 416 Q178 405 225 425 Q185 430 170 458 Q213 440 239 430 Q266 447 310 458 Q294 427 252 416 Q307 418 353 440 Q333 401 260 400 Q320 370 343 338 Q281 346 238 388Z"/>
      <path d="M1225 635 Q1242 535 1260 430 Q1265 412 1275 430 Q1288 535 1305 635Z"/>
      <path d="M1262 440 Q1210 378 1148 396 Q1204 423 1255 460 Q1197 443 1163 473 Q1214 460 1259 481 Q1221 487 1206 512 Q1248 492 1274 484 Q1300 500 1344 512 Q1327 481 1286 472 Q1340 472 1383 495 Q1364 456 1293 456 Q1352 426 1373 394 Q1312 402 1271 444Z"/>
    </g>
    <path d="M0 743 Q340 680 680 742 T1440 733" fill="none" stroke="#E8D39E" stroke-width="8" opacity=".85"/>
    <text x="720" y="115" text-anchor="middle" font-family="Georgia,serif" font-size="54" font-weight="700" fill="#285B4C">Ayubowan</text>
    <text x="720" y="165" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" letter-spacing="4" fill="#3973B9">A WARM SRI LANKAN WELCOME</text>
  </svg>`
}

function collectOverviewAndWelcome(sections: DocumentContent['sections']): {
  overview: string
  welcome: string
  remaining: DocumentContent['sections']
} {
  const excluded = new Set<number>()
  let overview = ''
  let welcome = ''

  sections.forEach((section, index) => {
    if (section.type === 'title') excluded.add(index)
    if (!['heading1', 'heading2', 'heading3'].includes(section.type)) return

    const heading = section.content.trim()
    const isOverview = !overview && OVERVIEW_HEADING.test(heading)
    const isWelcome = !welcome && WELCOME_HEADING.test(heading)
    if (!isOverview && !isWelcome) return

    excluded.add(index)
    for (let nextIndex = index + 1; nextIndex < sections.length; nextIndex += 1) {
      const next = sections[nextIndex]
      if (['heading1', 'heading2', 'heading3', 'page_break'].includes(next.type)) break
      if (next.type === 'paragraph' && next.content.trim()) {
        if (isOverview) overview += `${overview ? ' ' : ''}${next.content.trim()}`
        if (isWelcome) welcome += `${welcome ? ' ' : ''}${next.content.trim()}`
        excluded.add(nextIndex)
      }
    }
  })

  return {
    overview,
    welcome,
    remaining: sections.filter((_, index) => !excluded.has(index)),
  }
}

export async function addItineraryOpeningPages(content: DocumentContent): Promise<DocumentContent> {
  if (content.documentType !== 'tour_itinerary') return content

  const stops = extractRoute(content)
  const routeText = stops.length
    ? stops.map(stop => stop.name).join(' – ')
    : content.intake?.fields.destinations?.trim() ?? ''
  const { overview, welcome, remaining } = collectOverviewAndWelcome(content.sections)
  const overviewText = overview || (routeText
    ? `Welcome to Sri Lanka. This itinerary introduces a journey through ${routeText}, following the destinations and experiences included in your travel plans.`
    : 'Welcome to Sri Lanka. This itinerary brings together the destinations and experiences included in your travel plans.')
  const welcomeText = welcome || 'Ayubowan is a traditional Sri Lankan greeting wishing you a long life and good health. May your time on the island be filled with warm hospitality, beautiful landscapes and memorable experiences. We look forward to welcoming you.'

  const [mapBytes, heroBytes] = await Promise.all([
    sharp(Buffer.from(createRouteMapSvg(stops, routeText))).jpeg({ quality: 90 }).toBuffer(),
    sharp(Buffer.from(createWelcomeArtworkSvg())).jpeg({ quality: 90 }).toBuffer(),
  ])
  const mapImage: DocumentImage = {
    src: `data:image/jpeg;base64,${mapBytes.toString('base64')}`,
    altText: `Illustrative Sri Lanka route map${routeText ? `: ${routeText}` : ''}`,
    caption: 'Sri Lanka route overview',
    width: 1440,
    height: 450,
    displayWidth: 6.65,
    displayHeight: 2.15,
  }
  const heroImage: DocumentImage = {
    src: `data:image/jpeg;base64,${heroBytes.toString('base64')}`,
    altText: 'Illustrated Sri Lankan landscape welcome artwork',
    width: 1440,
    height: 800,
    displayWidth: 5.8,
    displayHeight: 4.2,
  }
  const openingSections: DocumentContent['sections'] = [
    { id: 'beyond-escapes-cover-title', type: 'title', content: content.title || 'A Sri Lanka Journey' },
    { id: 'beyond-escapes-cover-overview', type: 'paragraph', content: overviewText },
    ...(content.intake?.fields.tripDuration?.trim()
      ? [{ id: 'beyond-escapes-cover-duration', type: 'paragraph' as const, content: `Trip duration: ${content.intake.fields.tripDuration.trim()}` }]
      : []),
    { id: 'beyond-escapes-route-map-heading', type: 'heading1', content: 'ROUTE PLAN' },
    { id: 'beyond-escapes-route-map', type: 'paragraph', content: '', images: [mapImage] },
    { id: 'beyond-escapes-cover-break', type: 'page_break', content: '' },
    { id: 'beyond-escapes-ayubowan-heading', type: 'heading1', content: 'AYUBOWAN | WELCOME TO SRI LANKA' },
    { id: 'beyond-escapes-ayubowan-photo', type: 'paragraph', content: '', images: [heroImage] },
    { id: 'beyond-escapes-ayubowan-copy', type: 'paragraph', content: welcomeText },
    { id: 'beyond-escapes-ayubowan-break', type: 'page_break', content: '' },
  ]

  return { ...content, sections: [...openingSections, ...remaining] }
}
