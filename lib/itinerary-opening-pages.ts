import fs from 'fs'
import path from 'path'
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
const CANCELLATION_HEADING = /^cancellation policy$/i
const DEFAULT_CANCELLATION_POLICY = [
  'Please refer to the cancellation terms provided for this itinerary. Any applicable fees and deadlines are subject to those agreed terms.',
]

function escapeXml(value: string): string {
  const normalized = value.replace(/[’‘]/g, "'").replace(/[–—]/g, '-')
  return normalized.replace(/[<>&"']/g, character => ({
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

function projectCoverPoint(stop: RouteStop): [number, number] {
  const x = 115 + ((stop.longitude - 79.55) / (81.95 - 79.55)) * 450
  const y = 650 + ((9.95 - stop.latitude) / (9.95 - 5.75)) * 900
  return [x, y]
}

function wrapText(value: string, maxCharacters: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && candidate.length > maxCharacters) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

function renderTextLines(
  lines: string[],
  x: number,
  y: number,
  options: { size: number; lineHeight: number; fill?: string; weight?: number; font?: string }
): string {
  return lines.map((line, index) =>
    `<text x="${x}" y="${y + index * options.lineHeight}" font-family="${options.font ?? 'Arial,sans-serif'}" font-size="${options.size}" font-weight="${options.weight ?? 400}" fill="${options.fill ?? '#29394A'}">${escapeXml(line)}</text>`
  ).join('')
}

function createItineraryCoverSvg(
  content: DocumentContent,
  overview: string,
  welcome: string,
  stops: RouteStop[],
  routeLabel: string
): string {
  const island = [
    [79.75, 9.92], [80.17, 9.82], [80.59, 9.68], [80.99, 9.48], [81.28, 9.12],
    [81.36, 8.69], [81.65, 8.16], [81.86, 7.64], [81.77, 7.16], [81.57, 6.69],
    [81.35, 6.29], [80.98, 5.98], [80.58, 5.81], [80.19, 5.93], [79.88, 6.21],
    [79.73, 6.66], [79.63, 7.11], [79.63, 7.63], [79.66, 8.12], [79.7, 8.58],
    [79.61, 9.06], [79.69, 9.56],
  ].map(([longitude, latitude]) => projectCoverPoint({ name: '', longitude, latitude, aliases: [] }))
  const islandPoints = island.map(([x, y]) => `${x},${y}`).join(' ')
  const stopPoints = stops.map(projectCoverPoint)
  const markerPoints = stopPoints.map(([originalX, originalY], index) => {
    let x = originalX
    let y = originalY
    for (const [previousX, previousY] of stopPoints.slice(0, index)) {
      if (Math.hypot(x - previousX, y - previousY) < 38) {
        x += 28
        y += 22
      }
    }
    return [x, y]
  })
  const routeLine = stopPoints.map(([x, y]) => `${x},${y}`).join(' ')
  const mapMarkers = stops.map((stop, index) => {
    const [x, y] = markerPoints[index]
    return `<g><circle cx="${x}" cy="${y}" r="16" fill="#3973B9" stroke="#FFFFFF" stroke-width="5"/><text x="${x}" y="${y + 6}" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#FFFFFF">${index + 1}</text></g>`
  }).join('')
  const overviewLines = wrapText(overview, 64)
  const welcomeLines = wrapText(welcome || 'Warm wishes for a memorable journey through Sri Lanka.', 64)
  const routeLines = wrapText(routeLabel || 'Route details are shown in the day-by-day itinerary.', 48)
  const duration = content.intake?.fields.tripDuration?.trim()
  const travelDates = content.intake?.fields.travelDates?.trim()
  const fields = content.intake?.fields ?? {}
  const preparedBy = fields.preparedBy?.trim() || fields.tourConsultant?.trim() || 'Beyond Escapes Sri Lanka'
  const titleLines = wrapText((content.title || 'TOUR OF SRI LANKA').toUpperCase(), 42)
  const titleSvg = renderTextLines(titleLines.slice(0, 2), 800, 82, {
    size: 36, lineHeight: 43, fill: '#3973B9', weight: 700, font: 'Georgia,serif',
  }).replace(/<text/g, '<text text-anchor="middle"')
  const overviewStart = 685
  const welcomeHeadingY = overviewStart + overviewLines.length * 34 + 48
  const welcomeStart = welcomeHeadingY + 45
  const routeHeadingY = Math.max(1180, welcomeStart + welcomeLines.length * 31 + 65)
  const routeLinesStart = routeHeadingY + 53
  const detailsY = routeLinesStart + routeLines.length * 35 + 55
  const contactY = Math.max(1610, detailsY + (duration || travelDates ? 95 : 35))
  const mapCard = `<rect x="55" y="535" width="620" height="1325" rx="22" fill="#EFF7F8" stroke="#D8E6E9" stroke-width="3"/>
    <text x="95" y="595" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#3973B9">SRI LANKA ROUTE MAP</text>
    <text x="95" y="628" font-family="Arial,sans-serif" font-size="18" fill="#6C7E8C">A guide to your journey</text>
    <polygon points="${islandPoints}" fill="#DDEBDD" stroke="#82A984" stroke-width="4"/>
    ${routeLine ? `<polyline points="${routeLine}" fill="none" stroke="#3973B9" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>` : ''}
    ${mapMarkers}
    <text x="95" y="1808" font-family="Arial,sans-serif" font-size="17" fill="#6C7E8C">Illustrative route map · not to scale</text>`
  const durationLines = [
    ...(duration ? [`Trip duration: ${duration}`] : []),
    ...(travelDates ? [`Travel dates: ${travelDates}`] : []),
  ]
  const durationSvg = renderTextLines(durationLines, 750, detailsY, { size: 22, lineHeight: 34, fill: '#5E6E7B' })
  const routeSvg = renderTextLines(routeLines, 750, routeLinesStart, { size: 24, lineHeight: 35, fill: '#5B6671', weight: 700 })
  const overviewSvg = renderTextLines(overviewLines, 750, overviewStart, { size: 23, lineHeight: 34 })
  const welcomeSvg = renderTextLines(welcomeLines, 750, welcomeStart, { size: 21, lineHeight: 31, fill: '#476C69' })
  const preparerSvg = renderTextLines([
    `Prepared by: ${preparedBy}`,
    'info@beyondescapes.com',
    '+94 112 579 679  |  +94 112 579 779  |  +94 70 457 9679',
  ], 750, contactY, { size: 21, lineHeight: 31, fill: '#35485B' })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2200" viewBox="0 0 1600 2200">
    <defs>
      <linearGradient id="welcome-sky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#F7E5D2"/><stop offset="1" stop-color="#F7D6BA"/>
      </linearGradient>
    </defs>
    <rect width="1600" height="2200" fill="#FFFFFF"/>
    ${titleSvg}
    <line x1="60" y1="135" x2="1540" y2="135" stroke="#3973B9" stroke-width="2"/>
    <rect x="60" y="170" width="1480" height="330" rx="10" fill="url(#welcome-sky)"/>
    <circle cx="1300" cy="265" r="72" fill="#E9B878" opacity=".8"/>
    <path d="M60 440 Q420 350 780 435 T1540 425 V500 H60Z" fill="#D5B99D" opacity=".6"/>
    <path d="M60 465 Q430 410 820 470 T1540 455 V500 H60Z" fill="#9BB18A" opacity=".8"/>
    <g transform="translate(255 -5)">
      <path d="M230 330 C210 278 218 222 257 185 C276 166 321 162 347 184 C381 214 383 276 361 331Z" fill="#2C2828"/>
      <circle cx="301" cy="250" r="56" fill="#DDA985"/>
      <path d="M246 236 C244 184 285 154 330 177 C359 191 369 219 361 252 C348 222 332 207 309 204 C284 201 267 218 246 236Z" fill="#302827"/>
      <path d="M282 301 L282 339 L322 339 L322 300Z" fill="#DDA985"/>
      <path d="M208 368 Q300 324 390 368 L433 500 H164Z" fill="#C68E56"/>
      <path d="M224 365 C249 354 274 357 294 379 L317 414 L293 438 L264 403 L226 421Z" fill="#E3B18D"/>
      <path d="M373 365 C350 354 328 358 309 379 L291 411 L315 437 L344 403 L380 421Z" fill="#E3B18D"/>
      <path d="M295 377 L302 336 L310 377 L320 341 L317 384 L303 402Z" fill="#F0C6A7"/>
      <path d="M196 407 Q300 450 405 407 L425 500 H175Z" fill="#E0B56D" opacity=".95"/>
      <path d="M180 474 Q300 452 420 474" fill="none" stroke="#F5D99A" stroke-width="7"/>
    </g>
    <text x="850" y="330" font-family="Georgia,serif" font-size="76" font-weight="700" fill="#668678">Ayubowan</text>
    <text x="855" y="375" font-family="Arial,sans-serif" font-size="30" letter-spacing="2" fill="#3973B9">WELCOME TO SRI LANKA</text>
    <text x="855" y="420" font-family="Arial,sans-serif" font-size="21" fill="#476C69">A warm Sri Lankan greeting</text>
    ${mapCard}
    <text x="750" y="595" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#3973B9">YOUR JOURNEY AT A GLANCE</text>
    ${overviewSvg}
    <text x="750" y="${welcomeHeadingY}" font-family="Arial,sans-serif" font-size="23" font-weight="700" fill="#668678">A WARM WELCOME</text>
    ${welcomeSvg}
    <text x="750" y="${routeHeadingY}" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#3973B9">ROUTE PLAN</text>
    ${routeSvg}
    ${durationSvg}
    <line x1="750" y1="${contactY - 38}" x2="1515" y2="${contactY - 38}" stroke="#D4DFE6" stroke-width="2"/>
    ${preparerSvg}
  </svg>`
}

function collectOpeningAndClosingContent(sections: DocumentContent['sections']): {
  overview: string
  welcome: string
  cancellationPolicy: string[]
  remaining: DocumentContent['sections']
} {
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
    for (let nextIndex = index + 1; nextIndex < sections.length; nextIndex += 1) {
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
  })

  return {
    overview,
    welcome,
    cancellationPolicy,
    remaining: sections.filter((_, index) => !excluded.has(index)),
  }
}

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

export async function addItineraryOpeningPages(content: DocumentContent): Promise<DocumentContent> {
  if (content.documentType !== 'tour_itinerary') return content

  const stops = extractRoute(content)
  const fields = content.intake?.fields ?? {}
  const routeText = fields.destinations?.trim()
    || fields.route?.trim()
    || fields.travelRoute?.trim()
    || stops.map(stop => stop.name).join(' – ')
  const { overview, welcome, cancellationPolicy, remaining } = collectOpeningAndClosingContent(content.sections)
  const overviewText = overview || (routeText
    ? `This itinerary presents a route through ${routeText}. The overview and daily schedule set out the destinations, travel transitions, and activities included in the trip details provided. Use the route map as a visual guide while referring to the day-by-day plan for specific arrangements.`
    : 'This itinerary presents the destinations, travel transitions, and activities included in the trip details provided. Use the route map as a visual guide while referring to the day-by-day plan for specific arrangements.')
  const welcomeText = welcome || 'Warm wishes for a memorable journey through Sri Lanka.'
  const coverBytes = await sharp(Buffer.from(createItineraryCoverSvg(
    content,
    overviewText,
    welcomeText,
    stops,
    routeText
  ))).jpeg({ quality: 94 }).toBuffer()
  const closingLogo = await createClosingLogoImage()
  const coverImage: DocumentImage = {
    src: `data:image/jpeg;base64,${coverBytes.toString('base64')}`,
    altText: 'Beyond Escapes itinerary cover with Ayubowan welcome, route map, trip overview, and contact details',
    width: 1600,
    height: 2200,
    displayWidth: 6.65,
    displayHeight: 9.5,
  }
  const closingSections: DocumentContent['sections'] = [
    { id: 'beyond-escapes-final-page-break', type: 'page_break', content: '' },
    { id: 'beyond-escapes-cancellation-heading', type: 'heading1', content: 'CANCELLATION POLICY' },
    {
      id: 'beyond-escapes-cancellation-policy',
      type: 'bullet_list',
      content: '',
      items: cancellationPolicy.length ? cancellationPolicy : DEFAULT_CANCELLATION_POLICY,
    },
  ]

  return {
    ...content,
    coverImage,
    closingLogo,
    sections: [...remaining, ...closingSections],
  }
}
