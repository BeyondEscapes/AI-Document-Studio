import fs from 'fs'
import os from 'os'
import path from 'path'

export const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'ai-document-studio')
  : path.join(process.cwd(), 'data')

export function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}
