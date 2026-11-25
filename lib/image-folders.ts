import type { DocumentImage, DocumentSection, ImageFolder, ItineraryImageCatalogItem } from '@/types'

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


function locationText(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function itineraryPhotoFolder(
  sections: DocumentSection[],
  sectionId: string,
  photo: DocumentImage,
  catalog: ItineraryImageCatalogItem[],
): ImageFolder | undefined {
  const folders = uniqueImageFolders(catalog.flatMap(image => {
    const folder = imageFolder(image)
    return folder ? [folder] : []
  }))
  const current = catalog.find(image => image.id === photo.catalogId || image.url === photo.src)
  const originalFolder = current && imageFolder(current)
  const index = sections.findIndex(section => section.id === sectionId)
  const headings: string[] = []
  for (let position = index; position >= 0; position--) {
    const section = sections[position]
    if (section.type === 'page_break') break
    if (/^heading[123]$/.test(section.type)) headings.push(section.content)
    if (section.type === 'heading1' || /^day\s+\d+\b/i.test(section.content)) break
  }

  const cities = uniqueImageFolders(folders.map(folder => ({ city: folder.city, place: '' })))
  for (const label of [...headings, photo.caption || photo.altText]) {
    const text = locationText(label)
    if (!text) continue
    const words = ` ${text} `
    const city = cities.map(folder => {
      const name = locationText(folder.city)
      const explicit = words.lastIndexOf(` ${name} `)
      const alias = LOCATION_MATCHES.find(location => location.label === folder.city)?.pattern.exec(text)?.index ?? -1
      return { folder, position: Math.max(explicit, alias) }
    }).filter(match => match.position >= 0).sort((a, b) => b.position - a.position)[0]?.folder
    const place = folders.filter(folder => {
      const name = locationText(folder.place)
      return name && name !== locationText(folder.city) && (!city || city.city === folder.city) && words.includes(` ${name} `)
    }).sort((a, b) => b.place.length - a.place.length)[0]
    if (place || city) return place ?? city
  }
  return originalFolder
}
