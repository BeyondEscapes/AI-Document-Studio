import { NextRequest, NextResponse } from 'next/server'
import { generateDocx, generatePdf, generateFilename, sanitizeFilename } from '@/lib/export'
import { generateBrandedDocx } from '@/lib/docx-template-generator'
import { addItineraryOpeningPages } from '@/lib/itinerary-opening-pages'
import { embedCatalogItineraryImages } from '@/lib/itinerary-image-storage'
import { getTheme, getSettings } from '@/lib/db'
import path from 'path'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { DATA_DIR } from '@/lib/storage'
import { validateWordTemplate } from '@/lib/word-template-validation'
import type { DocumentContent } from '@/types'
import { randomUUID } from 'node:crypto'
import { getCurrentUser, unauthorized } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    const body = await request.json().catch(() => null)
    const { documentContent, themeId, format, filename } = body ?? {}

    if (!documentContent || typeof documentContent.title !== 'string' || !Array.isArray(documentContent.sections) ||
      documentContent.sections.some((section: unknown) => !section || typeof section !== 'object')) {
      return NextResponse.json({ error: 'Valid document content is required.' }, { status: 400 })
    }

    if (!['docx', 'pdf'].includes(format)) {
      return NextResponse.json({ error: 'Format must be "docx" or "pdf"' }, { status: 400 })
    }

    const resolvedContent = await embedCatalogItineraryImages(documentContent as DocumentContent)
    const content = await addItineraryOpeningPages(resolvedContent)
    // Get theme/template
    const settings = getSettings(user)
    const effectiveThemeId = themeId || settings.defaultThemeId
    const theme = getTheme(effectiveThemeId)
    
    let templatePath: string
    if (content.documentType === 'tour_itinerary') {
      templatePath = path.join(process.cwd(), 'assets', 'beyond-escapes-template.docx')
    } else if (theme && existsSync(theme.templatePath)) {
      templatePath = theme.templatePath
      if (!theme.isDefault) {
        try {
          const name = path.basename(templatePath)
          const runtimeTemplate = path.join(DATA_DIR, 'templates', name)
          if (!/^template_[a-f0-9-]{36}\.docx$/i.test(name) || templatePath !== runtimeTemplate) {
            throw new Error('Invalid custom template path')
          }
          await validateWordTemplate(await readFile(/* turbopackIgnore: true */ runtimeTemplate))
        } catch {
          return NextResponse.json({ error: 'This Word template failed validation. Select another template.' }, { status: 400 })
        }
      }
    } else {
      // Fall back to default template
      templatePath = path.join(process.cwd(), 'assets', 'beyond-escapes-template.docx')
    }

    const docxFilename = typeof filename === 'string' && filename.trim()
      ? sanitizeFilename(filename.replace(/\.(docx|pdf)$/i, '')) + '.docx'
      : generateFilename(content, 'docx')
    if (process.env.VERCEL) {
      const converterUrl = process.env.PDF_CONVERTER_URL?.replace(/\/+$/, '')
      const converterToken = process.env.PDF_CONVERTER_TOKEN
      if (format === 'pdf' && (!converterUrl || !converterToken)) {
        return NextResponse.json({ error: 'Use Save as PDF in your browser.', browserPdfAvailable: true }, { status: 503 })
      }
      const buffer = await generateBrandedDocx(content, templatePath)

      if (format === 'pdf') {
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

    const exportKey = randomUUID()
    const storageName = (name: string) => `${user.id}_${exportKey}_${name}`
    const downloadUrl = (name: string) => `/api/export/download?filename=${encodeURIComponent(storageName(name))}`

    // Always generate DOCX first
    const docxResult = await generateDocx(content, templatePath, storageName(docxFilename))
    
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
        downloadUrl: downloadUrl(docxFilename),
      })
    }

    // Generate PDF from DOCX
    const pdfFilename = docxFilename.replace('.docx', '.pdf')
    const pdfResult = await generatePdf(docxResult.filePath, storageName(pdfFilename))
    
    if (!pdfResult.success) {
      console.error('PDF conversion failed:', pdfResult.error)
      return NextResponse.json(
        { 
          error: 'Server PDF conversion failed. Use Save as PDF in your browser or download the Word document.',
          browserPdfAvailable: true,
          docxAvailable: true,
          docxFilename,
          docxDownloadUrl: downloadUrl(docxFilename),
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      filename: pdfFilename,
      format: 'pdf',
      downloadUrl: downloadUrl(pdfFilename),
    })

  } catch (error) {
    console.error('Export error:', error)
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Export failed: ${errMsg}` }, { status: 500 })
  }
}
