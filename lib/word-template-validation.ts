import JSZip, { type JSZipObject } from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const maxExpandedBytes = 50 * 1024 * 1024
const maxMetadataBytes = 512 * 1024
const activeParts = /(?:^|\/)(?:embeddings|activeX|vba[^/]*|webextensions|altChunk[^/]*)(?:\/|$)/i

export async function validateWordTemplate(bytes: Uint8Array) {
  const archive = await JSZip.loadAsync(bytes)
  const entries = Object.values(archive.files)
  if (entries.length > 1000 || !archive.file('word/document.xml') ||
      !archive.file('[Content_Types].xml') || !archive.file('_rels/.rels')) {
    throw new Error('Invalid Word document archive.')
  }

  let expanded = 0
  for (const entry of entries) {
    if (entry.dir) continue
    if ((entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name) ||
      entry.name.includes('\\') || activeParts.test(entry.name)) {
      throw new Error('The template contains an unsafe file or embedded object.')
    }
    const inspect = entry.name === '[Content_Types].xml' || entry.name.endsWith('.rels')
    const content = await readEntry(entry, inspect, length => {
      expanded += length
      return expanded <= maxExpandedBytes
    })
    if (!content) continue
    if (/<!DOCTYPE/i.test(content)) throw new Error('Template declarations are unsupported.')
    const xml = new DOMParser({ onError: () => { throw new Error('Invalid template metadata.') } })
      .parseFromString(content, 'application/xml')
    const elements = xml.getElementsByTagName('*')
    for (let index = 0; index < elements.length; index++) {
      const element = elements.item(index)
      if (!element) continue
      if (/macroenabled|vbaproject|activex|oleobject/i.test(element.getAttribute('ContentType') ?? '') ||
        element.getAttribute('TargetMode')?.toLowerCase() === 'external') {
        throw new Error('Active content and external links are unsupported in templates.')
      }
    }
  }
}

function readEntry(
  entry: JSZipObject,
  inspect: boolean,
  count: (length: number) => boolean,
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const streamed = entry as JSZipObject & {
      internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>
    }
    const stream = streamed.internalStream('uint8array')
    const chunks: Buffer[] = []
    let size = 0
    stream.on('data', (bytes: Uint8Array) => {
      size += bytes.length
      if (!count(bytes.length) || (inspect && size > maxMetadataBytes)) {
        stream.pause()
        reject(new Error('The template expands beyond the size limit.'))
      } else if (inspect) chunks.push(Buffer.from(bytes))
    }).on('error', reject).on('end', () => resolve(inspect ? Buffer.concat(chunks).toString('utf8') : undefined)).resume()
  })
}
