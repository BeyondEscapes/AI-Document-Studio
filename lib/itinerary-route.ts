import type { ItineraryRouteStop } from '@/types'

export const OPENFREEMAP_ATTRIBUTION = '© OpenStreetMap contributors | © OpenMapTiles | © OpenFreeMap'

interface KnownStop extends ItineraryRouteStop {
  aliases: string[]
}

const KNOWN_STOPS: KnownStop[] = [
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

export function getInitialRouteStops(routeText: string): ItineraryRouteStop[] {
  const matches: Array<{ index: number; stop: ItineraryRouteStop }> = []
  for (const stop of KNOWN_STOPS) {
    const aliasMatches = stop.aliases.flatMap(alias => {
      const expression = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig')
      return [...routeText.matchAll(expression)].map(match => ({ index: match.index ?? 0 }))
    })
    if (aliasMatches.length) {
      matches.push({ index: Math.min(...aliasMatches.map(match => match.index)), stop })
    }
  }
  matches.sort((left, right) => left.index - right.index)
  return matches.map(({ stop }) => ({
    name: stop.name,
    latitude: stop.latitude,
    longitude: stop.longitude,
  }))
}
