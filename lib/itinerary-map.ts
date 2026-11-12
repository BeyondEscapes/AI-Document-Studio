import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import type { DocumentImage } from '@/types'

export async function createAyubowanArtworkImage(): Promise<DocumentImage> {
  const artwork = await fs.promises.readFile(path.join(process.cwd(), 'public', 'images', 'sri-lanka-ayubowan.svg'))
  const bytes = await sharp(artwork).jpeg({ quality: 92 }).toBuffer()
  return {
    src: `data:image/jpeg;base64,${bytes.toString('base64')}`,
    altText: 'Illustration of a warm Sri Lankan welcome',
    width: 1500,
    height: 410,
    displayWidth: 6.5,
    displayHeight: 1.8,
  }
}
