import { NextRequest, NextResponse } from 'next/server'
import { generateDocx, generatePdf, generateFilename, getExportedFile } from '@/lib/export'
import { generateBrandedDocx } from '@/lib/docx-template-generator'
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
    if (process.env.VERCEL) {
      const docxFilename = filename
        ? filename.replace(/\.(docx|pdf)$/, '') + '.docx'
        : generateFilename(content, 'docx')
      const buffer = await generateBrandedDocx(content, templatePath)

      if (format === 'pdf') {
        const converterUrl = process.env.PDF_CONVERTER_URL?.replace(/\/+$/, '')
        const converterToken = process.env.PDF_CONVERTER_TOKEN
        if (!converterUrl || !converterToken) {
          return NextResponse.json(
            { error: 'PDF conversion is not configured. Deploy the converter service and set PDF_CONVERTER_URL and PDF_CONVERTER_TOKEN in Vercel.' },
            { status: 503 }
          )
        }

        const formData = new FormData()
        formData.append(
          'document',
          new Blob([new Uint8Array(buffer)], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }),
          docxFilename
        )

        let converterResponse: Response
        try {
          converterResponse = await fetch(`${converterUrl}/convert`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${converterToken}` },
            body: formData,
            signal: AbortSignal.timeout(55_000),
          })
        } catch {
          return NextResponse.json(
            { error: 'Could not reach the PDF converter. Check PDF_CONVERTER_URL and confirm the converter service is running.' },
            { status: 502 }
          )
        }

        if (!converterResponse.ok) {
          return NextResponse.json(
            { error: `PDF conversion failed with status ${converterResponse.status}. Check the converter service logs.` },
            { status: 502 }
          )
        }

        const pdfBuffer = Buffer.from(await converterResponse.arrayBuffer())
        if (!pdfBuffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
          return NextResponse.json({ error: 'The PDF converter returned an invalid file.' }, { status: 502 })
        }

        const pdfFilename = docxFilename.replace(/\.docx$/i, '.pdf')
        return new NextResponse(new Uint8Array(pdfBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${pdfFilename}"`,
            'Content-Length': pdfBuffer.length.toString(),
          },
        })
      }

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${docxFilename}"`,
          'Content-Length': buffer.length.toString(),
        },
      })
    }

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
