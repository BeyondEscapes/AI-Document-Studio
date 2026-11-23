import { readFile } from 'node:fs/promises'
import path from 'path'
import { DATA_DIR } from '@/lib/storage'
import { readMongoImage } from '@/lib/mongodb-images'
import type { DocumentContent, DocumentImage } from '@/types'

const IMAGE_DIRECTORIES = [
  path.join(DATA_DIR, 'itinerary-images'),
  path.join(process.cwd(), 'public', 'itinerary-images'),
]

export async function readItineraryImage(id: string): Promise<Buffer | undefined> {
  if (!/^[a-f0-9-]{24,36}$/i.test(id)) return undefined
  for (const directory of IMAGE_DIRECTORIES) {
    try {
      return await readFile(path.join(directory, `${id}.jpg`))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return readMongoImage(id)
}

export async function embedCatalogItineraryImages(content: DocumentContent): Promise<DocumentContent> {
  const reads = new Map<string, Promise<Buffer | undefined>>()
  const embed = async (image: DocumentImage): Promise<DocumentImage> => {
    if (!image.catalogId || !image.src.startsWith('/api/itinerary-images/')) return image
    const pending = reads.get(image.catalogId) ?? readItineraryImage(image.catalogId)
    reads.set(image.catalogId, pending)
    const bytes = await pending
    if (!bytes) throw new Error(`The itinerary image "${image.altText}" is missing. Add it again before exporting.`)
    return { ...image, src: `data:image/jpeg;base64,${bytes.toString('base64')}` }
  }
  const optionalImage = (image?: DocumentImage) => image ? embed(image) : undefined
  const pages = content.itineraryPages
  const [sections, coverImage, closingLogo, mapImage, welcomeArtwork, logo] = await Promise.all([
    Promise.all(content.sections.map(async section => ({
      ...section,
      images: section.images ? await Promise.all(section.images.map(embed)) : undefined,
    }))),
    optionalImage(content.coverImage),
    optionalImage(content.closingLogo),
    optionalImage(pages?.cover?.mapImage),
    optionalImage(pages?.cover?.welcomeArtwork),
    optionalImage(pages?.closing?.logo),
  ])

  return {
    ...content,
    sections,
    coverImage,
    closingLogo,
    itineraryPages: pages ? {
      ...pages,
      cover: pages.cover ? {
        ...pages.cover,
        mapImage,
        welcomeArtwork,
      } : undefined,
      closing: pages.closing ? {
        ...pages.closing,
        logo,
      } : undefined,
    } : undefined,
  }
}
