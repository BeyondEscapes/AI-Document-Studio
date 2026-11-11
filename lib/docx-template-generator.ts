import fs from 'fs'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { BUSINESS_DOCUMENT_TEMPLATES } from '@/lib/business-documents'
import type { DocumentContent, DocumentSection } from '@/types'

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const WORD_DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
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
  font?: string
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
  const font = options.font ?? FONT
  setWordAttribute(fonts, 'ascii', font)
  setWordAttribute(fonts, 'hAnsi', font)
  setWordAttribute(fonts, 'cs', font)
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

function createDataTable(
  document: XmlDocument,
  section: DocumentSection,
  headerFill = BLUE,
  headerTextColor = 'FFFFFF'
): XmlElement {
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
        setWordAttribute(shading, 'fill', headerFill)
        cellProperties.appendChild(shading)
      }
      cell.appendChild(cellProperties)
      cell.appendChild(createParagraph(document, values[index] ?? '', {
        bold: isHeader,
        color: isHeader ? headerTextColor : undefined,
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

const RESERVATION_WIDTHS = {
  guest: [1710, 3730, 1384, 864, 1037, 821, 1066, 476],
  stay: [2170, 2016, 800, 720, 720, 720, 720, 2016, 1206],
  total: 11088,
}

function createReservationCell(
  document: XmlDocument,
  text: string,
  width: number,
  options: { bold?: boolean; fill?: string; alignment?: 'center' | 'left'; size?: number } = {}
): XmlElement {
  const cell = wordElement(document, 'tc')
  const properties = wordElement(document, 'tcPr')
  const cellWidth = wordElement(document, 'tcW')
  setWordAttribute(cellWidth, 'w', width)
  setWordAttribute(cellWidth, 'type', 'dxa')
  properties.appendChild(cellWidth)
  const verticalAlignment = wordElement(document, 'vAlign')
  setWordAttribute(verticalAlignment, 'val', 'center')
  properties.appendChild(verticalAlignment)

  const margins = wordElement(document, 'tcMar')
  for (const [edge, value] of [['top', 30], ['left', 35], ['bottom', 30], ['right', 35]] as const) {
    const margin = wordElement(document, edge)
    setWordAttribute(margin, 'w', value)
    setWordAttribute(margin, 'type', 'dxa')
    margins.appendChild(margin)
  }
  properties.appendChild(margins)
  if (options.fill) {
    const shading = wordElement(document, 'shd')
    setWordAttribute(shading, 'val', 'clear')
    setWordAttribute(shading, 'color', 'auto')
    setWordAttribute(shading, 'fill', options.fill)
    properties.appendChild(shading)
  }
  cell.appendChild(properties)

  const alignment = options.alignment === 'center' ? 'center' : 'left'
  cell.appendChild(createParagraph(document, text, {
    bold: options.bold,
    alignment,
    before: 0,
    after: 0,
    size: options.size ?? 18,
    font: 'Calibri',
  }))
  return cell
}

function createReservationTable(
  document: XmlDocument,
  rows: Array<Array<{ text: string; options?: { bold?: boolean; fill?: string; alignment?: 'center' | 'left'; size?: number } }>>,
  widths: number[]
): XmlElement {
  const table = wordElement(document, 'tbl')
  const properties = wordElement(document, 'tblPr')
  const tableWidth = wordElement(document, 'tblW')
  setWordAttribute(tableWidth, 'w', RESERVATION_WIDTHS.total)
  setWordAttribute(tableWidth, 'type', 'dxa')
  properties.appendChild(tableWidth)
  const layout = wordElement(document, 'tblLayout')
  setWordAttribute(layout, 'type', 'fixed')
  properties.appendChild(layout)
  const borders = wordElement(document, 'tblBorders')
  for (const edge of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) {
    const border = wordElement(document, edge)
    setWordAttribute(border, 'val', 'single')
    setWordAttribute(border, 'sz', 6)
    setWordAttribute(border, 'space', 0)
    setWordAttribute(border, 'color', '000000')
    borders.appendChild(border)
  }
  properties.appendChild(borders)
  table.appendChild(properties)

  const grid = wordElement(document, 'tblGrid')
  widths.forEach(value => {
    const column = wordElement(document, 'gridCol')
    setWordAttribute(column, 'w', value)
    grid.appendChild(column)
  })
  table.appendChild(grid)

  rows.forEach(values => {
    const row = wordElement(document, 'tr')
    values.forEach((value, index) => {
      row.appendChild(createReservationCell(document, value.text, widths[index], value.options))
    })
    table.appendChild(row)
  })
  return table
}

function createReservationSpacer(document: XmlDocument, before: number): XmlElement {
  const paragraph = wordElement(document, 'p')
  const properties = wordElement(document, 'pPr')
  const spacing = wordElement(document, 'spacing')
  setWordAttribute(spacing, 'before', before)
  setWordAttribute(spacing, 'after', 0)
  properties.appendChild(spacing)
  paragraph.appendChild(properties)
  return paragraph
}

function createReservationMetadata(document: XmlDocument, label: string, value: string, before = 0): XmlElement {
  const paragraph = wordElement(document, 'p')
  const properties = wordElement(document, 'pPr')
  const spacing = wordElement(document, 'spacing')
  setWordAttribute(spacing, 'before', before)
  setWordAttribute(spacing, 'after', 0)
  properties.appendChild(spacing)
  paragraph.appendChild(properties)
  appendTextRun(paragraph, `${label}: `, { bold: true, size: 20, font: 'Calibri' })
  appendTextRun(paragraph, value, { size: 20, font: 'Calibri' })
  return paragraph
}

function reservationRoomCount(fields: Record<string, string>, field: string, abbreviation: string): string {
  const explicitValue = fields[field]?.trim()
  if (explicitValue) return explicitValue
  const allocation = fields.roomAllocation ?? ''
  const word = { SGL: 'SINGLES?', DBL: 'DOUBLES?', TWN: 'TWINS?', TPL: 'TRIPLES?' }[abbreviation]
  if (!word) return ''

  const patterns = [
    new RegExp(`\\b(\\d+)\\s*(?:${abbreviation}|${word})\\b`, 'i'),
    new RegExp(`\\b(?:${abbreviation}|${word})\\s*[:= -]?\\s*(\\d+)\\b`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(allocation)
    if (match) return match[1].padStart(2, '0')
  }
  return ''
}

function roomReservationElements(document: XmlDocument, fields: Record<string, string>): XmlElement[] {
  const elements: XmlElement[] = []
  elements.push(createParagraph(document, 'ROOM RESERVATION', {
    bold: true, alignment: 'center', before: 500, after: 880, size: 32, font: 'Calibri',
  }))
  const metadata = [
    ['Tour Number', fields.tourNumber],
    ['Market', fields.market],
    ['Date', fields.documentDate],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))
  for (const [label, value] of metadata) {
    elements.push(createReservationMetadata(document, label, value))
  }
  if (fields.hotel) elements.push(createReservationMetadata(document, 'Hotel', fields.hotel, 560))
  if (fields.location) elements.push(createReservationMetadata(document, 'Location', fields.location))

  elements.push(createReservationSpacer(document, 280))
  const guestLabels = ['CLIENT NAME', 'ADULT', 'CHILD', 'INFANT']
  const guestValues = [fields.clientName ?? '', fields.adults ?? '', fields.children ?? '', fields.infants ?? '']
  const guestRow = guestLabels.flatMap((label, index) => [
    { text: label, options: { bold: true, fill: 'D9D9D9', size: 18 } },
    { text: guestValues[index], options: { size: 20 } },
  ])
  elements.push(createReservationTable(document, [guestRow], RESERVATION_WIDTHS.guest))

  elements.push(createReservationSpacer(document, 240))
  const stayHeaders = ['CHECK-IN', 'CHECK-OUT', 'BASIS', 'SGL', 'DBL', 'TWN', 'TPL', 'ROOM CATEGORY', 'NIGHTS']
  const stayValues = [
    fields.checkIn ?? '',
    fields.checkOut ?? '',
    fields.basis ?? '',
    reservationRoomCount(fields, 'singleRooms', 'SGL'),
    reservationRoomCount(fields, 'doubleRooms', 'DBL'),
    reservationRoomCount(fields, 'twinRooms', 'TWN'),
    reservationRoomCount(fields, 'tripleRooms', 'TPL'),
    fields.roomCategory ?? '',
    fields.nights ?? '',
  ]
  elements.push(createReservationTable(document, [
    stayHeaders.map(text => ({ text, options: { bold: true, fill: 'D9D9D9', alignment: 'center' as const, size: 18 } })),
    stayValues.map(text => ({ text, options: { alignment: 'center' as const, size: 20 } })),
  ], RESERVATION_WIDTHS.stay))

  elements.push(createReservationSpacer(document, 520))
  const remarks = (fields.remarks ?? '').split(/\r?\n/).filter(line => line.trim())
  const remarksTable = createReservationTable(document, [], [RESERVATION_WIDTHS.total])
  const headerRow = wordElement(document, 'tr')
  headerRow.appendChild(createReservationCell(document, 'REMARKS:', RESERVATION_WIDTHS.total, {
    bold: true,
    fill: 'D9D9D9',
    size: 18,
  }))
  remarksTable.appendChild(headerRow)

  const bodyRow = wordElement(document, 'tr')
  const bodyCellElement = createReservationCell(document, '', RESERVATION_WIDTHS.total)
  const bodyParagraphElement = bodyCellElement.getElementsByTagNameNS(WORD_NS, 'p').item(0)
  if (bodyParagraphElement) {
    const properties = bodyParagraphElement.getElementsByTagNameNS(WORD_NS, 'pPr').item(0)
      ?? wordElement(document, 'pPr')
    const indentation = properties.getElementsByTagNameNS(WORD_NS, 'ind').item(0)
      ?? wordElement(document, 'ind')
    setWordAttribute(indentation, 'left', 220)
    setWordAttribute(indentation, 'hanging', 140)
    if (!indentation.parentNode) properties.appendChild(indentation)
    const spacing = properties.getElementsByTagNameNS(WORD_NS, 'spacing').item(0)
      ?? wordElement(document, 'spacing')
    setWordAttribute(spacing, 'before', 0)
    setWordAttribute(spacing, 'after', 40)
    if (!spacing.parentNode) properties.appendChild(spacing)
    if (!properties.parentNode) bodyParagraphElement.insertBefore(properties, bodyParagraphElement.firstChild)
    remarks.forEach((remark, index) => {
      if (index) {
        const paragraph = wordElement(document, 'p')
        const paragraphProperties = wordElement(document, 'pPr')
        const paragraphSpacing = wordElement(document, 'spacing')
        setWordAttribute(paragraphSpacing, 'before', 0)
        setWordAttribute(paragraphSpacing, 'after', 40)
        paragraphProperties.appendChild(paragraphSpacing)
        paragraph.appendChild(paragraphProperties)
        bodyCellElement.appendChild(paragraph)
        appendTextRun(paragraph, `\u2022  ${remark.trim().replace(/^[\u2022*-]\s*/, '')}`, { size: 20, font: 'Calibri' })
      } else {
        appendTextRun(bodyParagraphElement, `\u2022  ${remark.trim().replace(/^[\u2022*-]\s*/, '')}`, { size: 20, font: 'Calibri' })
      }
    })
  }
  bodyRow.appendChild(bodyCellElement)
  remarksTable.appendChild(bodyRow)
  elements.push(remarksTable)
  return elements
}

function setReservationPageLayout(document: XmlDocument): void {
  const sectionProperties = document.getElementsByTagNameNS(WORD_NS, 'sectPr')
  for (let index = 0; index < sectionProperties.length; index += 1) {
    const section = sectionProperties.item(index)
    if (!section) continue
    const pageSize = section.getElementsByTagNameNS(WORD_NS, 'pgSz').item(0)
    if (pageSize) {
      setWordAttribute(pageSize, 'w', 12240)
      setWordAttribute(pageSize, 'h', 15840)
    }
    const pageMargins = section.getElementsByTagNameNS(WORD_NS, 'pgMar').item(0)
    if (pageMargins) {
      setWordAttribute(pageMargins, 'top', 1152)
      setWordAttribute(pageMargins, 'right', 576)
      setWordAttribute(pageMargins, 'bottom', 936)
      setWordAttribute(pageMargins, 'left', 576)
    }
  }
}

async function setReservationHeaderBranding(archive: JSZip): Promise<void> {
  const headerPaths = Object.keys(archive.files).filter(path => /^word\/header\d+\.xml$/.test(path))
  await Promise.all(headerPaths.map(async path => {
    const entry = archive.file(path)
    if (!entry) return
    const xml = await entry.async('string')
    const header = new DOMParser().parseFromString(xml, 'application/xml')
    const anchors = header.getElementsByTagNameNS(WORD_DRAWING_NS, 'anchor')
    for (let index = 0; index < anchors.length; index += 1) {
      const anchor = anchors.item(index)
      const extent = anchor?.getElementsByTagNameNS(WORD_DRAWING_NS, 'extent').item(0)
      if (!anchor || !extent) continue
      const isLogo = Number(extent.getAttribute('cx')) > 1_000_000
      const scale = isLogo ? 1.7 : 1.52
      extent.setAttribute('cx', String(Math.round(Number(extent.getAttribute('cx')) * scale)))
      extent.setAttribute('cy', String(Math.round(Number(extent.getAttribute('cy')) * scale)))
      const positionH = anchor.getElementsByTagNameNS(WORD_DRAWING_NS, 'positionH').item(0)
      const positionV = anchor.getElementsByTagNameNS(WORD_DRAWING_NS, 'positionV').item(0)
      const horizontalOffset = positionH?.getElementsByTagNameNS(WORD_DRAWING_NS, 'posOffset').item(0)
      const verticalOffset = positionV?.getElementsByTagNameNS(WORD_DRAWING_NS, 'posOffset').item(0)
      if (horizontalOffset) horizontalOffset.textContent = isLogo ? '9144' : '6208776'
      if (verticalOffset) verticalOffset.textContent = isLogo ? '-178308' : '-612648'
    }
    archive.file(path, new XMLSerializer().serializeToString(header))
  }))
}

function documentIntakeElements(document: XmlDocument, content: DocumentContent): XmlElement[] {
  const intake = content.intake
  if (!intake || intake.documentType === 'room_reservation' || intake.documentType === 'tour_itinerary') return []

  const fields = BUSINESS_DOCUMENT_TEMPLATES[intake.documentType].fields
    .filter(field => intake.fields[field.key]?.trim())
  if (!fields.length) return []

  return [
    createHeadingBar(document, 'DOCUMENT DETAILS'),
    createDataTable(document, {
      id: 'document-details',
      type: 'table',
      content: '',
      headers: ['DETAIL', 'PROVIDED INFORMATION'],
      rows: fields.map(field => [field.label, intake.fields[field.key]]),
    }),
  ]
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
  if (content.documentType === 'room_reservation') {
    setReservationPageLayout(document)
    await setReservationHeaderBranding(archive)
  }

  const sectionProperties = Array.from(body.childNodes).find(node =>
    node.nodeType === 1 && (node as XmlElement).namespaceURI === WORD_NS && (node as XmlElement).localName === 'sectPr'
  ) ?? null
  for (const child of Array.from(body.childNodes)) {
    if (child !== sectionProperties) body.removeChild(child)
  }

  const hasTitleSection = content.sections.some(section => section.type === 'title')
  const elements: XmlElement[] = []
  if (content.documentType === 'room_reservation') {
    elements.push(...roomReservationElements(document, content.intake?.fields ?? {}))
  } else if (content.title && !hasTitleSection) {
    elements.push(createParagraph(document, content.title, { bold: true, after: 160 }))
  }
  elements.push(...documentIntakeElements(document, content))
  for (const section of content.sections) {
    if (content.documentType === 'room_reservation') continue
    elements.push(...sectionElements(document, section))
  }
  if (!content.documentType || content.documentType === 'tour_itinerary' || content.documentType === 'tour_proposal') {
    elements.push(createParagraph(document, '****END OF SERVICES****', { bold: true, before: 240, alignment: 'center' }))
  }

  for (const element of elements) {
    if (sectionProperties) body.insertBefore(element, sectionProperties)
    else body.appendChild(element)
  }

  archive.file('word/document.xml', new XMLSerializer().serializeToString(document))
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
