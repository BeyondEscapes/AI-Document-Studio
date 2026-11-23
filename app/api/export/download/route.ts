import { NextRequest, NextResponse } from 'next/server'
import { getExportedFile } from '@/lib/export'
import path from 'path'
import { getCurrentUser, unauthorized } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    const { searchParams } = new URL(request.url)
    const filename = searchParams.get('filename')
    
    if (!filename) {
      return NextResponse.json({ error: 'Filename required' }, { status: 400 })
    }
    
    // Security: only allow safe filenames, no path traversal
    const safeName = path.basename(filename)
    if (safeName !== filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }
    const prefix = `${user.id}_`
    const downloadName = safeName.slice(prefix.length).match(/^[a-f0-9-]{36}_([a-zA-Z0-9_-]+\.(?:docx|pdf))$/)?.[1]
    if (!safeName.startsWith(prefix) || !downloadName) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    
    // Only allow docx and pdf
    const ext = path.extname(safeName).toLowerCase()
    if (!['.docx', '.pdf'].includes(ext)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }
    
    const fileBuffer = getExportedFile(safeName)
    if (!fileBuffer) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    
    const contentType = ext === '.pdf' 
      ? 'application/pdf' 
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    
    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Cache-Control': 'private, no-store',
        'Content-Length': fileBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
