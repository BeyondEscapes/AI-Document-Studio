import fs from 'fs'
import path from 'path'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { DocumentContent, DocumentSection } from '@/types'

const BLUE = '3973B9'
const FONT = 'Times New Roman'
const CONTENT_WIDTH = 6231

function textRun(text: string, options: { bold?: boolean; color?: string; size?: number; underline?: boolean } = {}): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: options.size ?? 24,
    bold: options.bold,
    color: options.color,
    underline: options.underline ? { type: 'single' } : undefined,
  })
}

function paragraph(text: string, options: { bold?: boolean; after?: number; before?: number; underline?: boolean; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): Paragraph {
  return new Paragraph({
    children: [textRun(text, { bold: options.bold, underline: options.underline })],
    alignment: options.alignment,
    spacing: { before: options.before ?? 0, after: options.after ?? 0 },
  })
}

function headingBar(text: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [CONTENT_WIDTH],
    rows: [new TableRow({
      children: [new TableCell({
        shading: { fill: BLUE },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [textRun(text, { bold: true, color: 'FFFFFF' })],
        })],
      })],
    })],
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
  })
}

function dataTable(section: DocumentSection): Table {
  const headers = section.headers ?? []
  const rows = section.rows ?? []
  const columnCount = Math.max(headers.length, ...rows.map(row => row.length), 1)
  const cell = (value: string, header = false) => new TableCell({
    shading: header ? { fill: BLUE } : undefined,
    margins: { top: 70, bottom: 70, left: 90, right: 90 },
    children: [new Paragraph({
      children: [textRun(value, { bold: header, color: header ? 'FFFFFF' : undefined, size: 22 })],
    })],
  })
  const tableRows: TableRow[] = []

  if (headers.length) {
    tableRows.push(new TableRow({
      children: Array.from({ length: columnCount }, (_, index) => cell(headers[index] ?? '', true)),
    }))
  }
  for (const row of rows) {
    tableRows.push(new TableRow({
      children: Array.from({ length: columnCount }, (_, index) => cell(row[index] ?? '')),
    }))
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: Array.from({ length: columnCount }, (_, index) =>
      index === columnCount - 1
        ? CONTENT_WIDTH - Math.floor(CONTENT_WIDTH / columnCount) * index
        : Math.floor(CONTENT_WIDTH / columnCount)
    ),
    rows: tableRows,
  })
}

function sectionElements(section: DocumentSection): Array<Paragraph | Table> {
  switch (section.type) {
    case 'title':
      return [paragraph(section.content, { bold: true, after: 160 })]
    case 'heading1':
      return [headingBar(section.content)]
    case 'heading2':
      return [paragraph(section.content, { bold: true, underline: true, before: 160, after: 40 })]
    case 'heading3':
      return [paragraph(section.content, { bold: true, before: 80, after: 40 })]
    case 'paragraph':
      return section.content.trim() ? [paragraph(section.content, { after: 140 })] : []
    case 'bullet_list':
      return (section.items ?? []).filter(item => item.trim()).map(item => paragraph(`\u2022  ${item}`, { after: 0 }))
    case 'numbered_list':
      return (section.items ?? []).filter(item => item.trim()).map((item, index) => paragraph(`${index + 1}.  ${item}`, { after: 0 }))
    case 'table':
      return [dataTable(section)]
    case 'page_break':
      return [new Paragraph({ children: [new PageBreak()] })]
    default:
      return []
  }
}

export async function generateBrandedDocx(content: DocumentContent): Promise<Buffer> {
  const titleSectionExists = content.sections.some(section => section.type === 'title')
  const body: Array<Paragraph | Table> = []
  const logoPath = path.join(process.cwd(), 'public', 'images', 'beyond_escapes_logo.png')
  const logo = fs.existsSync(logoPath)
    ? new ImageRun({
        data: fs.readFileSync(logoPath),
        type: 'png',
        transformation: { width: 240, height: 44 },
      })
    : null

  if (content.title && !titleSectionExists) {
    body.push(paragraph(content.title, { bold: true, after: 160 }))
  }
  for (const section of content.sections) {
    body.push(...sectionElements(section))
  }
  body.push(paragraph('****END OF SERVICES****', { bold: true, before: 240, alignment: AlignmentType.CENTER }))

  const document = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 8391, height: 11906 },
          margin: { top: 936, right: 1080, bottom: 936, left: 1080, header: 360, footer: 360 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: logo
              ? [logo]
              : [textRun('BEYOND ESCAPES | SRI LANKA', { bold: true, color: BLUE, size: 20 })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [textRun('BEYOND ESCAPES | SRI LANKA', { size: 18 })],
          })],
        }),
      },
      children: body,
    }],
  })

  return Packer.toBuffer(document)
}
