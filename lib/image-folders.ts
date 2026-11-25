import type { ImageFolder, ItineraryImageCatalogItem } from '@/types'

const CITY_NAMES = [
  ['Anuradhapura', 'anuradhapura|anuradpura'],
  ['Ella', 'nine arch|flying ravana|ravana waterfall|ella rock|little adam|demodara'],
  ['Kandy', 'kandy|hanthana|hantana|peradeniya|udawatta'],
  ['Haputale', 'haputale|adisham|lipton seat|dambetenna'],
  ['Nuwara Eliya', 'nuwara eliya|hakgala|horton plains|ambewela|sitha amman|ramboda|ranboda|kirigalptta'],
  ['Udawalawe', 'udawalawe|udawalawa|ath athuru|elephant transit'],
  ['Negombo', 'negombo|negambo'],
  ['Trincomalee', 'trincomalee|koneshwaram'],
  ['Sigiriya', 'sigiriya'],
  ['Dambulla', 'dambulla|kandalama'],
] as const

const OTHER_LOCATIONS = [
  'Ambalangoda', 'Bentota', 'Belihuloya', 'Bundala', 'Colombo', 'Galle', 'Gal Oya', 'Jaffna',
  'Kataragama', 'Kaudulla', 'Kitulgala', 'Knuckles', 'Kumana', 'Matale', 'Meemure', 'Mihintale',
  'Minneriya', 'Mirissa', 'Pasikuda', 'Pinnawala', 'Polonnaruwa', 'Sinharaja', 'Tangalle', 'Unawatuna',
  'Wilpattu', 'Wilpaththu', 'Yala',
]

const LOCATION_MATCHES = [
  ...CITY_NAMES,
  ...OTHER_LOCATIONS.map(location => [location, location.toLowerCase()] as const),
].map(([label, terms]) => ({ label, pattern: new RegExp(`\\b(?:${terms})\\b`, 'i') }))

export function imageFolder(image: ItineraryImageCatalogItem): ImageFolder | undefined {
  if (image.folder) return image.folder
  const parts = image.sourcePath.split(/[/\\]/).slice(0, -1).filter(part => !/^(itinerary images|set \d+)$/i.test(part))
  const name = `${image.title} ${parts.join(' ')}`.replace(/[-_]+/g, ' ')
  const location = LOCATION_MATCHES.find(({ pattern }) => pattern.test(name))
  if (location) return { city: location.label, place: (parts.at(-1) || image.title).replace(/\s+\d+$/, '') }
  if (parts.length) return { city: parts[0], place: parts.at(-1) === parts[0] ? '' : parts.at(-1)! }
  return undefined
}

export function folderKey(folder: ImageFolder): string {
  return JSON.stringify([folder.city.toLowerCase(), folder.place.toLowerCase()])
}

export function uniqueImageFolders(folders: ImageFolder[]): ImageFolder[] {
  return [...new Map(folders.map(folder => [folderKey(folder), folder])).values()]
    .sort((a, b) => a.city.localeCompare(b.city) || a.place.localeCompare(b.place))
}

export function imageSearchText(image: ItineraryImageCatalogItem): string {
  const folder = imageFolder(image)
  return `${image.title} ${image.sourcePath} ${folder?.city ?? ''} ${folder?.place ?? ''}`.toLowerCase()
}
