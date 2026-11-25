import { NextRequest, NextResponse } from 'next/server'
import { saveTheme } from '@/lib/db'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { DATA_DIR } from '@/lib/storage'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { validateWordTemplate } from '@/lib/word-template-validation'

const TEMPLATES_DIR = path.join(DATA_DIR, 'templates')

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (user.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 })

    const formData = await request.formData().catch(() => null)
    const file = formData?.get('template')
    const title = formData?.get('name')
    const notes = formData?.get('description')
    const name = typeof title === 'string' ? title.trim().slice(0, 100) : ''
    if (!(file instanceof File) || !name) {
      return NextResponse.json({ error: 'Template file and name are required.' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 10 MB.' }, { status: 413 })
    }
    if (!file.name.toLowerCase().endsWith('.docx')) {
      return NextResponse.json({ error: 'Only .docx files are allowed.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      await validateWordTemplate(buffer)
    } catch {
      return NextResponse.json({ error: 'Choose a valid Word template without macros, embedded objects, or external links.' }, { status: 400 })
    }

    const id = randomUUID()
    const templatePath = path.join(TEMPLATES_DIR, `template_${id}.docx`)
    const theme = { id, name, description: typeof notes === 'string' ? notes.trim().slice(0, 500) : '',
      isDefault: false, createdAt: new Date().toISOString() }
    await mkdir(TEMPLATES_DIR, { recursive: true })
    try {
      await writeFile(templatePath, buffer, { flag: 'wx' })
      saveTheme({ ...theme, templatePath })
    } catch (error) {
      await rm(templatePath, { force: true }).catch(() => {})
      throw error
    }
    return NextResponse.json({ success: true, theme }, { status: 201 })
  } catch (error) {
    console.error('Template upload failed:', error)
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 })
  }
}
