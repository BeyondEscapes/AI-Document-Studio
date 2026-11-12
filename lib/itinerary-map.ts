import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import type { DocumentImage } from '@/types'

export async function createAyubowanArtworkImage(): Promise<DocumentImage> {
  const artwork = await fs.promises.readFile(path.join(process.cwd(), 'public', 'images', 'sri-lanka-ayubowan.png'))
  const bytes = await sharp(artwork).jpeg({ quality: 92 }).toBuffer()
  return {
    src: `data:image/jpeg;base64,${bytes.toString('base64')}`,
    altText: 'Ayubowan welcome banner with a Sri Lankan woman greeting in English and Sinhala',
    width: 2167,
    height: 726,
    displayWidth: 6.5,
    displayHeight: 2.18,
  }
}
