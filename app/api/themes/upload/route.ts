import { NextRequest, NextResponse } from 'next/server'
import { saveTheme } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'

const TEMPLATES_DIR = path.join(process.cwd(), 'data', 'templates')

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('template') as File | null
    const name = formData.get('name') as string | null
    const description = formData.get('description') as string | null
    
    if (!file || !name) {
      return NextResponse.json({ error: 'Template file and name are required' }, { status: 400 })
    }
    
    // Validate file type
    if (!file.name.endsWith('.docx')) {
      return NextResponse.json({ error: 'Only .docx files are allowed' }, { status: 400 })
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }
    
    // Ensure templates directory exists
    if (!fs.existsSync(TEMPLATES_DIR)) {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true })
    }
    
    const themeId = uuidv4()
    const safeFilename = `template_${themeId}.docx`
    const templatePath = path.join(TEMPLATES_DIR, safeFilename)
    
    // Save file
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(templatePath, buffer)
    
    // Validate it's a real DOCX (zip with word/ folder)
    try {
      const { execSync } = require('child_process')
      // Basic check: DOCX files start with PK (zip signature)
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
        fs.unlinkSync(templatePath)
        return NextResponse.json({ error: 'Invalid DOCX file format' }, { status: 400 })
      }
    } catch {}
    
    // Save theme record
    const theme = {
      id: themeId,
      name: name.substring(0, 100),
      description: (description || '').substring(0, 500),
      templatePath,
      isDefault: false,
      createdAt: new Date().toISOString(),
    }
    saveTheme(theme)
    
    return NextResponse.json({ success: true, theme })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
