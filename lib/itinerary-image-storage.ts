import fs from 'fs'
import path from 'path'
import { DATA_DIR } from '@/lib/storage'
import type { DocumentContent, DocumentImage } from '@/types'

const IMAGE_DIRECTORIES = [
  path.join(DATA_DIR, 'itinerary-images'),
  path.join(process.cwd(), 'public', 'itinerary-images'),
]

function embedCatalogImage(image: DocumentImage): DocumentImage {
  if (!image.catalogId || image.src.startsWith('data:image/jpeg;base64,')) return image
  if (!image.src.startsWith('/api/itinerary-images/')) return image
  if (!/^[a-f0-9-]{24,36}$/i.test(image.catalogId)) {
    throw new Error('An itinerary image has an invalid catalog ID.')
  }

  const imagePath = IMAGE_DIRECTORIES
    .map(directory => path.join(directory, `${image.catalogId}.jpg`))
    .find(candidate => fs.existsSync(candidate))
  if (!imagePath) {
    throw new Error(`The itinerary image "${image.altText}" is missing from local storage. Add it again before exporting.`)
  }

  const bytes = fs.readFileSync(imagePath)
  return { ...image, src: `data:image/jpeg;base64,${bytes.toString('base64')}` }
}

export function embedCatalogItineraryImages(content: DocumentContent): DocumentContent {
  const embed = (image?: DocumentImage) => image ? embedCatalogImage(image) : undefined
  const pages = content.itineraryPages

  return {
    ...content,
    sections: content.sections.map(section => ({
      ...section,
      images: section.images?.map(embedCatalogImage),
    })),
    coverImage: embed(content.coverImage),
    closingLogo: embed(content.closingLogo),
    itineraryPages: pages ? {
      ...pages,
      cover: pages.cover ? {
        ...pages.cover,
        mapImage: embed(pages.cover.mapImage),
        welcomeArtwork: embed(pages.cover.welcomeArtwork),
      } : undefined,
      closing: pages.closing ? {
        ...pages.closing,
        logo: embed(pages.closing.logo),
      } : undefined,
    } : undefined,
  }
}
