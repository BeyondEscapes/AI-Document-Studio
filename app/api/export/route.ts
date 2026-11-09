import { NextRequest, NextResponse } from 'next/server'
import { generateDocx, generatePdf, generateFilename, getExportedFile } from '@/lib/export'
import { getTheme, getSettings } from '@/lib/db'
import path from 'path'
import type { DocumentContent } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { documentContent, themeId, format, filename } = body

    if (!documentContent) {
      return NextResponse.json({ error: 'Document content is required' }, { status: 400 })
    }

    if (!['docx', 'pdf'].includes(format)) {
      return NextResponse.json({ error: 'Format must be "docx" or "pdf"' }, { status: 400 })
    }

    // Get theme/template
    const settings = getSettings()
    const effectiveThemeId = themeId || settings.defaultThemeId
    const theme = getTheme(effectiveThemeId)
    
    let templatePath: string
    if (theme && require('fs').existsSync(theme.templatePath)) {
      templatePath = theme.templatePath
    } else {
      // Fall back to default template
      templatePath = path.join(process.cwd(), 'assets', 'beyond-escapes-template.docx')
    }

    const content = documentContent as DocumentContent
    const docxFilename = filename 
      ? filename.replace(/\.(docx|pdf)$/, '') + '.docx'
      : generateFilename(content, 'docx')

    // Always generate DOCX first
    const docxResult = await generateDocx(content, templatePath, docxFilename)
    
    if (!docxResult.success || !docxResult.filePath) {
      return NextResponse.json(
        { error: docxResult.error || 'DOCX generation failed' },
        { status: 500 }
      )
    }

    if (format === 'docx') {
      return NextResponse.json({
        success: true,
        filename: docxFilename,
        format: 'docx',
        downloadUrl: `/api/export/download?filename=${encodeURIComponent(docxFilename)}`,
      })
    }

    // Generate PDF from DOCX
    const pdfFilename = docxFilename.replace('.docx', '.pdf')
    const pdfResult = await generatePdf(docxResult.filePath, pdfFilename)
    
    if (!pdfResult.success) {
      return NextResponse.json(
        { 
          error: pdfResult.error || 'PDF conversion failed',
          docxAvailable: true,
          docxFilename,
          docxDownloadUrl: `/api/export/download?filename=${encodeURIComponent(docxFilename)}`,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      filename: pdfFilename,
      format: 'pdf',
      downloadUrl: `/api/export/download?filename=${encodeURIComponent(pdfFilename)}`,
    })

  } catch (error) {
    console.error('Export error:', error)
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Export failed: ${errMsg}` }, { status: 500 })
  }
}
