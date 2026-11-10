import fs from 'fs'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import JSZip from 'jszip'
import type { DocumentContent, DocumentSection } from '@/types'

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const CONTENT_WIDTH = 10080
const BLUE = '3973B9'
const FONT = 'Times New Roman'
type XmlDocument = ReturnType<InstanceType<typeof DOMParser>['parseFromString']>
type XmlElement = ReturnType<XmlDocument['createElementNS']>

type ParagraphOptions = {
  bold?: boolean
  color?: string
  underline?: boolean
  alignment?: 'center' | 'left' | 'right'
  before?: number
  after?: number
  size?: number
}

function wordElement(document: XmlDocument, name: string): XmlElement {
  return document.createElementNS(WORD_NS, `w:${name}`)
}

function setWordAttribute(element: XmlElement, name: string, value: string | number): void {
  element.setAttributeNS(WORD_NS, `w:${name}`, String(value))
}

function appendTextRun(parent: XmlElement, text: string, options: ParagraphOptions = {}): void {
  const document = parent.ownerDocument as XmlDocument
  const run = wordElement(document, 'r')
  const properties = wordElement(document, 'rPr')
  const fonts = wordElement(document, 'rFonts')
  setWordAttribute(fonts, 'ascii', FONT)
  setWordAttribute(fonts, 'hAnsi', FONT)
  setWordAttribute(fonts, 'cs', FONT)
  properties.appendChild(fonts)

  if (options.bold) properties.appendChild(wordElement(document, 'b'))
  if (options.color) {
    const color = wordElement(document, 'color')
    setWordAttribute(color, 'val', options.color)
    properties.appendChild(color)
  }
  if (options.underline) {
    const underline = wordElement(document, 'u')
    setWordAttribute(underline, 'val', 'single')
    properties.appendChild(underline)
  }

  const size = wordElement(document, 'sz')
  setWordAttribute(size, 'val', options.size ?? 24)
  properties.appendChild(size)
  const complexSize = wordElement(document, 'szCs')
  setWordAttribute(complexSize, 'val', options.size ?? 24)
  properties.appendChild(complexSize)
  run.appendChild(properties)

  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (line) {
      const textElement = wordElement(document, 't')
      textElement.setAttributeNS(XML_NS, 'xml:space', 'preserve')
      textElement.appendChild(document.createTextNode(line))
      run.appendChild(textElement)
    }
    if (index < lines.length - 1) run.appendChild(wordElement(document, 'br'))
  })

  parent.appendChild(run)
}

function createParagraph(document: XmlDocument, text: string, options: ParagraphOptions = {}): XmlElement {
  const paragraph = wordElement(document, 'p')
  if (options.alignment || options.before !== undefined || options.after !== undefined) {
    const properties = wordElement(document, 'pPr')
    if (options.alignment) {
      const alignment = wordElement(document, 'jc')
      setWordAttribute(alignment, 'val', options.alignment)
      properties.appendChild(alignment)
    }
    if (options.before !== undefined || options.after !== undefined) {
      const spacing = wordElement(document, 'spacing')
      if (options.before !== undefined) setWordAttribute(spacing, 'before', options.before)
      if (options.after !== undefined) setWordAttribute(spacing, 'after', options.after)
      properties.appendChild(spacing)
    }
    paragraph.appendChild(properties)
  }
  appendTextRun(paragraph, text, options)
  return paragraph
}

function createHeadingBar(document: XmlDocument, text: string): XmlElement {
  const table = wordElement(document, 'tbl')
  const properties = wordElement(document, 'tblPr')
  const width = wordElement(document, 'tblW')
  setWordAttribute(width, 'w', CONTENT_WIDTH)
  setWordAttribute(width, 'type', 'dxa')
  properties.appendChild(width)
  const borders = wordElement(document, 'tblBorders')
  for (const edge of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) {
    const border = wordElement(document, edge)
    setWordAttribute(border, 'val', 'nil')
    borders.appendChild(border)
  }
  properties.appendChild(borders)
  table.appendChild(properties)

  const grid = wordElement(document, 'tblGrid')
  const gridColumn = wordElement(document, 'gridCol')
  setWordAttribute(gridColumn, 'w', CONTENT_WIDTH)
  grid.appendChild(gridColumn)
  table.appendChild(grid)

  const row = wordElement(document, 'tr')
  const cell = wordElement(document, 'tc')
  const cellProperties = wordElement(document, 'tcPr')
  const cellWidth = wordElement(document, 'tcW')
  setWordAttribute(cellWidth, 'w', CONTENT_WIDTH)
  setWordAttribute(cellWidth, 'type', 'dxa')
  cellProperties.appendChild(cellWidth)
  const shading = wordElement(document, 'shd')
  setWordAttribute(shading, 'val', 'clear')
  setWordAttribute(shading, 'color', 'auto')
  setWordAttribute(shading, 'fill', BLUE)
  cellProperties.appendChild(shading)
  cell.appendChild(cellProperties)
  cell.appendChild(createParagraph(document, text, { bold: true, color: 'FFFFFF', alignment: 'center' }))
  row.appendChild(cell)
  table.appendChild(row)
  return table
}

function createDataTable(document: XmlDocument, section: DocumentSection): XmlElement {
  const headers = section.headers ?? []
  const rows = section.rows ?? []
  const columnCount = Math.max(headers.length, ...rows.map(row => row.length), 1)
  const table = wordElement(document, 'tbl')
  const properties = wordElement(document, 'tblPr')
  const width = wordElement(document, 'tblW')
  setWordAttribute(width, 'w', CONTENT_WIDTH)
  setWordAttribute(width, 'type', 'dxa')
  properties.appendChild(width)
  const borders = wordElement(document, 'tblBorders')
  for (const edge of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) {
    const border = wordElement(document, edge)
    setWordAttribute(border, 'val', 'single')
    setWordAttribute(border, 'sz', 4)
    setWordAttribute(border, 'space', 0)
    setWordAttribute(border, 'color', '808080')
    borders.appendChild(border)
  }
  properties.appendChild(borders)
  table.appendChild(properties)

  const columnWidth = Math.floor(CONTENT_WIDTH / columnCount)
  const grid = wordElement(document, 'tblGrid')
  for (let index = 0; index < columnCount; index += 1) {
    const gridColumn = wordElement(document, 'gridCol')
    setWordAttribute(gridColumn, 'w', index === columnCount - 1 ? CONTENT_WIDTH - columnWidth * index : columnWidth)
    grid.appendChild(gridColumn)
  }
  table.appendChild(grid)

  const addRow = (values: string[], isHeader: boolean) => {
    const row = wordElement(document, 'tr')
    for (let index = 0; index < columnCount; index += 1) {
      const cell = wordElement(document, 'tc')
      const cellProperties = wordElement(document, 'tcPr')
      const cellWidth = wordElement(document, 'tcW')
      setWordAttribute(cellWidth, 'w', index === columnCount - 1 ? CONTENT_WIDTH - columnWidth * index : columnWidth)
      setWordAttribute(cellWidth, 'type', 'dxa')
      cellProperties.appendChild(cellWidth)
      if (isHeader) {
        const shading = wordElement(document, 'shd')
        setWordAttribute(shading, 'val', 'clear')
        setWordAttribute(shading, 'color', 'auto')
        setWordAttribute(shading, 'fill', BLUE)
        cellProperties.appendChild(shading)
      }
      cell.appendChild(cellProperties)
      cell.appendChild(createParagraph(document, values[index] ?? '', {
        bold: isHeader,
        color: isHeader ? 'FFFFFF' : undefined,
        size: 22,
      }))
      row.appendChild(cell)
    }
    table.appendChild(row)
  }

  if (headers.length) addRow(headers, true)
  for (const row of rows) addRow(row, false)
  return table
}

function sectionElements(document: XmlDocument, section: DocumentSection): XmlElement[] {
  switch (section.type) {
    case 'title':
      return [createParagraph(document, section.content, { bold: true, after: 160 })]
    case 'heading1':
      return [createHeadingBar(document, section.content)]
    case 'heading2':
      return [createParagraph(document, section.content, { bold: true, underline: true, before: 160, after: 40 })]
    case 'heading3':
      return [createParagraph(document, section.content, { bold: true, before: 80, after: 40 })]
    case 'paragraph':
      return section.content.trim() ? [createParagraph(document, section.content, { after: 140 })] : []
    case 'bullet_list':
      return (section.items ?? []).filter(item => item.trim()).map(item => createParagraph(document, `\u2022  ${item}`))
    case 'numbered_list':
      return (section.items ?? []).filter(item => item.trim()).map((item, index) => createParagraph(document, `${index + 1}.  ${item}`))
    case 'table':
      return [createDataTable(document, section)]
    case 'page_break': {
      const paragraph = wordElement(document, 'p')
      const run = wordElement(document, 'r')
      const pageBreak = wordElement(document, 'br')
      setWordAttribute(pageBreak, 'type', 'page')
      run.appendChild(pageBreak)
      paragraph.appendChild(run)
      return [paragraph]
    }
    default:
      return []
  }
}

export async function generateBrandedDocx(content: DocumentContent, templatePath: string): Promise<Buffer> {
  const archive = await JSZip.loadAsync(fs.readFileSync(templatePath))
  const documentEntry = archive.file('word/document.xml')
  if (!documentEntry) throw new Error('The selected Word template is missing word/document.xml.')

  const xml = await documentEntry.async('string')
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const body = document.getElementsByTagNameNS(WORD_NS, 'body').item(0)
  if (!body) throw new Error('The selected Word template has no document body.')

  const sectionProperties = Array.from(body.childNodes).find(node =>
    node.nodeType === 1 && (node as XmlElement).namespaceURI === WORD_NS && (node as XmlElement).localName === 'sectPr'
  ) ?? null
  for (const child of Array.from(body.childNodes)) {
    if (child !== sectionProperties) body.removeChild(child)
  }

  const hasTitleSection = content.sections.some(section => section.type === 'title')
  const elements: XmlElement[] = []
  if (content.title && !hasTitleSection) {
    elements.push(createParagraph(document, content.title, { bold: true, after: 160 }))
  }
  for (const section of content.sections) {
    elements.push(...sectionElements(document, section))
  }
  elements.push(createParagraph(document, '****END OF SERVICES****', { bold: true, before: 240, alignment: 'center' }))

  for (const element of elements) {
    if (sectionProperties) body.insertBefore(element, sectionProperties)
    else body.appendChild(element)
  }

  archive.file('word/document.xml', new XMLSerializer().serializeToString(document))
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
