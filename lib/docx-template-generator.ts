import fs from 'fs'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { BUSINESS_DOCUMENT_TEMPLATES } from '@/lib/business-documents'
import type { DocumentContent, DocumentImage, DocumentSection, ItineraryClosingSettings, ItineraryCoverSettings } from '@/types'

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const WORD_DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const PICTURE_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'
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

function setXmlAttribute(element: XmlElement, namespace: string, prefix: string, name: string, value: string | number): void {
  element.setAttributeNS(namespace, `${prefix}:${name}`, String(value))
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

function sectionElements(document: XmlDocument, section: DocumentSection, brandedTitle = false): XmlElement[] {
  switch (section.type) {
    case 'title':
      return [createParagraph(document, section.content, brandedTitle
        ? { bold: true, color: BLUE, alignment: 'center', before: 160, after: 240, size: 36 }
        : { bold: true, after: 160 })]
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

function createTableCell(
  document: XmlDocument,
  width: number,
  elements: XmlElement[],
  fill?: string
): XmlElement {
  const cell = wordElement(document, 'tc')
  const properties = wordElement(document, 'tcPr')
  const cellWidth = wordElement(document, 'tcW')
  setWordAttribute(cellWidth, 'w', width)
  setWordAttribute(cellWidth, 'type', 'dxa')
  properties.appendChild(cellWidth)
  const margins = wordElement(document, 'tcMar')
  for (const edge of ['top', 'left', 'bottom', 'right']) {
    const margin = wordElement(document, edge)
    setWordAttribute(margin, 'w', 90)
    setWordAttribute(margin, 'type', 'dxa')
    margins.appendChild(margin)
  }
  properties.appendChild(margins)
  if (fill) {
    const shading = wordElement(document, 'shd')
    setWordAttribute(shading, 'val', 'clear')
    setWordAttribute(shading, 'color', 'auto')
    setWordAttribute(shading, 'fill', fill)
    properties.appendChild(shading)
  }
  cell.appendChild(properties)
  for (const element of elements) cell.appendChild(element)
  return cell
}

function createItineraryCoverTable(
  document: XmlDocument,
  cover: ItineraryCoverSettings,
  intakeFields: Record<string, string>,
  mapImageElements: XmlElement[]
): XmlElement {
  const table = wordElement(document, 'tbl')
  const properties = wordElement(document, 'tblPr')
  const width = wordElement(document, 'tblW')
  setWordAttribute(width, 'w', CONTENT_WIDTH)
  setWordAttribute(width, 'type', 'dxa')
  properties.appendChild(width)
  const layout = wordElement(document, 'tblLayout')
  setWordAttribute(layout, 'type', 'fixed')
  properties.appendChild(layout)
  const borders = wordElement(document, 'tblBorders')
  for (const edge of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) {
    const border = wordElement(document, edge)
    setWordAttribute(border, 'val', 'nil')
    borders.appendChild(border)
  }
  properties.appendChild(borders)
  table.appendChild(properties)

  const leftWidth = 3900
  const rightWidth = CONTENT_WIDTH - leftWidth
  const grid = wordElement(document, 'tblGrid')
  for (const columnWidth of [leftWidth, rightWidth]) {
    const column = wordElement(document, 'gridCol')
    setWordAttribute(column, 'w', columnWidth)
    grid.appendChild(column)
  }
  table.appendChild(grid)

  const mapCellElements = [
    createParagraph(document, 'SRI LANKA ROUTE MAP', { bold: true, color: BLUE, alignment: 'center', after: 80, size: 20 }),
    ...mapImageElements,
    createParagraph(document, cover.mapAttribution ?? 'Road map screenshot not saved', {
      color: '66737E',
      alignment: 'center',
      before: 40,
      size: 13,
      font: 'Calibri',
    }),
  ]

  const rightCellElements: XmlElement[] = [
    createParagraph(document, 'YOUR JOURNEY AT A GLANCE', { bold: true, color: BLUE, size: 21, after: 70 }),
    createParagraph(document, cover.overview ?? '', { size: 18, after: 110 }),
    createParagraph(document, 'A WARM WELCOME', { bold: true, color: '668678', size: 19, after: 50 }),
    createParagraph(document, cover.welcome ?? '', { size: 17, after: 100 }),
  ]
  const routeText = intakeFields.destinations?.trim()
    || intakeFields.route?.trim()
    || intakeFields.travelRoute?.trim()
    || (cover.routeStops ?? []).map(stop => stop.name).join(' - ')
  if (routeText) {
    rightCellElements.push(
      createParagraph(document, 'ROUTE PLAN', { bold: true, color: BLUE, size: 19, after: 40 }),
      createParagraph(document, routeText, { bold: true, size: 17, after: 70 })
    )
  }
  const tripDetails = [
    intakeFields.tripDuration?.trim() ? `Trip duration: ${intakeFields.tripDuration.trim()}` : '',
    intakeFields.travelDates?.trim() ? `Travel dates: ${intakeFields.travelDates.trim()}` : '',
    cover.preparedBy?.trim() ? `Prepared by: ${cover.preparedBy.trim()}` : '',
  ].filter(Boolean)
  if (tripDetails.length) rightCellElements.push(createParagraph(document, tripDetails.join('\n'), { size: 16, after: 65 }))
  const contacts = [
    intakeFields.phone?.trim() ?? '+94 112 579 679',
    intakeFields.email?.trim() ?? 'tours@beyondescapes.com',
  ].filter(Boolean)
  if (contacts.length) {
    rightCellElements.push(createParagraph(document, contacts.join('\n'), { color: '35485B', size: 16, after: 30 }))
  }

  const row = wordElement(document, 'tr')
  row.appendChild(createTableCell(document, leftWidth, mapCellElements, 'F4F8F5'))
  row.appendChild(createTableCell(document, rightWidth, rightCellElements))
  table.appendChild(row)
  return table
}

function itineraryClosingElements(document: XmlDocument, closing: ItineraryClosingSettings): XmlElement[] {
  const elements: XmlElement[] = [
    createHeadingBar(document, 'CANCELLATION POLICY'),
    ...(closing.cancellationPolicy ?? []).filter(item => item.trim()).map(item =>
      createParagraph(document, `\u2022  ${item}`, { after: 100, size: 21 })
    ),
    createParagraph(document, '****END OF SERVICES****', {
      bold: true,
      before: 300,
      after: 200,
      alignment: 'center',
      size: 22,
    }),
    createHeadingBar(document, closing.companyName ?? 'BEYOND ESCAPES PRIVATE LIMITED'),
    ...[closing.phone, closing.email, closing.address]
      .filter((line): line is string => Boolean(line?.trim()))
      .map(line => createParagraph(document, line, {
        alignment: 'center',
        before: 80,
        after: 80,
        size: 20,
      })),
  ]
  return elements
}

function decodeItineraryImage(source: string): Buffer {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(source)
  if (!match || match[1].length > 12 * 1024 * 1024) {
    throw new Error('DOCX images must be optimized embedded JPEGs smaller than 9 MB.')
  }
  const image = Buffer.from(match[1], 'base64')
  if (!image.length || image.length > 9 * 1024 * 1024) {
    throw new Error('DOCX images must be non-empty and smaller than 9 MB.')
  }
  return image
}

function createImageParagraph(
  document: XmlDocument,
  image: NonNullable<DocumentSection['images']>[number],
  relationshipId: string,
  drawingId: number
): XmlElement {
  const naturalWidth = Math.max(1, Number(image.width) || 4)
  const naturalHeight = Math.max(1, Number(image.height) || 3)
  const maxWidth = Math.max(1, Number(image.displayWidth) || 4.8)
  const maxHeight = Math.max(1, Number(image.displayHeight) || 3)
  const scale = Math.min(maxWidth * 914400 / naturalWidth, maxHeight * 914400 / naturalHeight)
  const width = Math.round(naturalWidth * scale)
  const height = Math.round(naturalHeight * scale)

  const paragraph = wordElement(document, 'p')
  const paragraphProperties = wordElement(document, 'pPr')
  const alignment = wordElement(document, 'jc')
  setWordAttribute(alignment, 'val', 'center')
  paragraphProperties.appendChild(alignment)
  const spacing = wordElement(document, 'spacing')
  setWordAttribute(spacing, 'before', 80)
  setWordAttribute(spacing, 'after', 40)
  paragraphProperties.appendChild(spacing)
  paragraph.appendChild(paragraphProperties)

  const run = wordElement(document, 'r')
  const drawing = wordElement(document, 'drawing')
  const inline = document.createElementNS(WORD_DRAWING_NS, 'wp:inline')
  for (const name of ['distT', 'distB', 'distL', 'distR']) {
    inline.setAttribute(name, '0')
  }
  const extent = document.createElementNS(WORD_DRAWING_NS, 'wp:extent')
  extent.setAttribute('cx', String(width))
  extent.setAttribute('cy', String(height))
  inline.appendChild(extent)

  const documentProperties = document.createElementNS(WORD_DRAWING_NS, 'wp:docPr')
  documentProperties.setAttribute('id', String(drawingId))
  documentProperties.setAttribute('name', `Itinerary photo ${drawingId}`)
  documentProperties.setAttribute('descr', image.altText.slice(0, 500))
  inline.appendChild(documentProperties)

  const frameProperties = document.createElementNS(WORD_DRAWING_NS, 'wp:cNvGraphicFramePr')
  const frameLocks = document.createElementNS(DRAWING_NS, 'a:graphicFrameLocks')
  frameLocks.setAttribute('noChangeAspect', '1')
  frameProperties.appendChild(frameLocks)
  inline.appendChild(frameProperties)

  const graphic = document.createElementNS(DRAWING_NS, 'a:graphic')
  const graphicData = document.createElementNS(DRAWING_NS, 'a:graphicData')
  graphicData.setAttribute('uri', PICTURE_NS)
  const picture = document.createElementNS(PICTURE_NS, 'pic:pic')

  const nonVisual = document.createElementNS(PICTURE_NS, 'pic:nvPicPr')
  const pictureProperties = document.createElementNS(PICTURE_NS, 'pic:cNvPr')
  pictureProperties.setAttribute('id', String(drawingId))
  pictureProperties.setAttribute('name', `Itinerary photo ${drawingId}.jpg`)
  pictureProperties.setAttribute('descr', image.altText.slice(0, 500))
  nonVisual.appendChild(pictureProperties)
  const pictureLocks = document.createElementNS(PICTURE_NS, 'pic:cNvPicPr')
  const aspectLocks = document.createElementNS(DRAWING_NS, 'a:picLocks')
  aspectLocks.setAttribute('noChangeAspect', '1')
  pictureLocks.appendChild(aspectLocks)
  nonVisual.appendChild(pictureLocks)
  picture.appendChild(nonVisual)

  const fill = document.createElementNS(PICTURE_NS, 'pic:blipFill')
  const blip = document.createElementNS(DRAWING_NS, 'a:blip')
  setXmlAttribute(blip, OFFICE_REL_NS, 'r', 'embed', relationshipId)
  fill.appendChild(blip)
  const stretch = document.createElementNS(DRAWING_NS, 'a:stretch')
  stretch.appendChild(document.createElementNS(DRAWING_NS, 'a:fillRect'))
  fill.appendChild(stretch)
  picture.appendChild(fill)

  const shapeProperties = document.createElementNS(PICTURE_NS, 'pic:spPr')
  const transform = document.createElementNS(DRAWING_NS, 'a:xfrm')
  const offset = document.createElementNS(DRAWING_NS, 'a:off')
  offset.setAttribute('x', '0')
  offset.setAttribute('y', '0')
  transform.appendChild(offset)
  const pictureExtent = document.createElementNS(DRAWING_NS, 'a:ext')
  pictureExtent.setAttribute('cx', String(width))
  pictureExtent.setAttribute('cy', String(height))
  transform.appendChild(pictureExtent)
  shapeProperties.appendChild(transform)
  const geometry = document.createElementNS(DRAWING_NS, 'a:prstGeom')
  geometry.setAttribute('prst', 'rect')
  geometry.appendChild(document.createElementNS(DRAWING_NS, 'a:avLst'))
  shapeProperties.appendChild(geometry)
  picture.appendChild(shapeProperties)

  graphicData.appendChild(picture)
  graphic.appendChild(graphicData)
  inline.appendChild(graphic)
  drawing.appendChild(inline)
  run.appendChild(drawing)
  paragraph.appendChild(run)
  return paragraph
}

async function addItineraryImages(
  archive: JSZip,
  document: XmlDocument,
  images: NonNullable<DocumentSection['images']>,
  elements: XmlElement[]
): Promise<void> {
  if (!images.length) return

  const relationshipsPath = 'word/_rels/document.xml.rels'
  const relationshipsEntry = archive.file(relationshipsPath)
  const contentTypesEntry = archive.file('[Content_Types].xml')
  if (!relationshipsEntry || !contentTypesEntry) {
    throw new Error('The selected Word template is missing image relationship metadata.')
  }
  const relationships = new DOMParser().parseFromString(
    await relationshipsEntry.async('string'),
    'application/xml'
  )
  const contentTypes = new DOMParser().parseFromString(
    await contentTypesEntry.async('string'),
    'application/xml'
  )
  const relationshipRoot = relationships.documentElement
  const contentTypeRoot = contentTypes.documentElement
  if (!relationshipRoot || !contentTypeRoot) throw new Error('The Word template has invalid image relationship metadata.')

  const existingRelationshipIds = new Set(
    Array.from(relationshipRoot.getElementsByTagNameNS(PACKAGE_REL_NS, 'Relationship'))
      .map(relationship => relationship.getAttribute('Id'))
  )
  let hasJpegContentType = Array.from(contentTypeRoot.getElementsByTagNameNS(CONTENT_TYPES_NS, 'Default'))
    .some(entry => entry.getAttribute('Extension')?.toLowerCase() === 'jpg')
  const existingMediaPaths = new Set(
    Object.keys(archive.files).filter(path => /^word\/media\/itinerary-image-\d+\.jpg$/.test(path))
  )
  let imageIndex = 0

  for (const image of images) {
    const bytes = decodeItineraryImage(image.src)
    imageIndex += 1
    let mediaPath = `word/media/itinerary-image-${imageIndex}.jpg`
    while (existingMediaPaths.has(mediaPath)) {
      imageIndex += 1
      mediaPath = `word/media/itinerary-image-${imageIndex}.jpg`
    }
    existingMediaPaths.add(mediaPath)
    let relationshipId = `rIdItineraryImage${imageIndex}`
    while (existingRelationshipIds.has(relationshipId)) relationshipId += 'x'
    existingRelationshipIds.add(relationshipId)
    archive.file(mediaPath, bytes)

    const relationship = relationships.createElementNS(PACKAGE_REL_NS, 'Relationship')
    relationship.setAttribute('Id', relationshipId)
    relationship.setAttribute('Type', `${OFFICE_REL_NS}/image`)
    relationship.setAttribute('Target', `media/itinerary-image-${imageIndex}.jpg`)
    relationshipRoot.appendChild(relationship)

    if (!hasJpegContentType) {
      const jpegContentType = contentTypes.createElementNS(CONTENT_TYPES_NS, 'Default')
      jpegContentType.setAttribute('Extension', 'jpg')
      jpegContentType.setAttribute('ContentType', 'image/jpeg')
      contentTypeRoot.appendChild(jpegContentType)
      hasJpegContentType = true
    }

    elements.push(createImageParagraph(document, image, relationshipId, imageIndex))
    if (image.caption?.trim()) {
      elements.push(createParagraph(document, image.caption, {
        alignment: 'center',
        after: 160,
        size: 18,
        font: 'Calibri',
      }))
    }
  }

  archive.file(relationshipsPath, new XMLSerializer().serializeToString(relationships))
  archive.file('[Content_Types].xml', new XMLSerializer().serializeToString(contentTypes))
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

  const itineraryCover = content.documentType === 'tour_itinerary' ? content.itineraryPages?.cover : undefined
  const hasTitleSection = Boolean(content.coverImage || itineraryCover) || content.sections.some(section => section.type === 'title')
  const elements: XmlElement[] = []
  if (content.documentType === 'room_reservation') {
    elements.push(...roomReservationElements(document, content.intake?.fields ?? {}))
  } else if (content.title && !hasTitleSection) {
    elements.push(createParagraph(document, content.title, { bold: true, after: 160 }))
  }
  if (itineraryCover) {
    const imageElements: XmlElement[] = []
    if (itineraryCover.welcomeArtwork) {
      await addItineraryImages(archive, document, [itineraryCover.welcomeArtwork], imageElements)
    }
    elements.push(
      createParagraph(document, content.title || 'TOUR OF SRI LANKA', {
        bold: true,
        color: BLUE,
        alignment: 'center',
        before: 80,
        after: 70,
        size: 34,
      }),
      ...imageElements,
      createParagraph(document, 'Ayubowan | Welcome to Sri Lanka', {
        bold: true,
        color: '668678',
        alignment: 'center',
        before: 30,
        after: 70,
        size: 22,
      })
    )
    const mapElements: XmlElement[] = []
    if (itineraryCover.mapImage) {
      await addItineraryImages(archive, document, [itineraryCover.mapImage], mapElements)
    }
    const closingSettings = content.itineraryPages?.closing ?? {}
    const coverFields = {
      ...content.intake?.fields,
      phone: closingSettings.phone ?? content.intake?.fields.phone ?? '',
      email: closingSettings.email ?? content.intake?.fields.email ?? '',
    }
    elements.push(createItineraryCoverTable(
      document,
      itineraryCover,
      coverFields,
      mapElements
    ))
  } else if (content.coverImage && content.documentType !== 'tour_itinerary') {
    await addItineraryImages(archive, document, [content.coverImage], elements)
  }
  elements.push(...documentIntakeElements(document, content))
  for (const section of content.sections) {
    if (content.documentType === 'room_reservation') continue
    elements.push(...sectionElements(document, section, content.documentType === 'tour_itinerary'))
    await addItineraryImages(archive, document, section.images ?? [], elements)
  }
  if (content.documentType === 'tour_itinerary') {
    elements.push(...itineraryClosingElements(
      document,
      content.itineraryPages?.closing ?? {}
    ))
    const closingLogo = content.itineraryPages?.closing?.logo ?? content.closingLogo
    if (closingLogo) await addItineraryImages(archive, document, [closingLogo], elements)
  } else if (!content.documentType || content.documentType === 'tour_proposal') {
    elements.push(createParagraph(document, '****END OF SERVICES****', { bold: true, before: 240, alignment: 'center' }))
  }

  for (const element of elements) {
    if (sectionProperties) body.insertBefore(element, sectionProperties)
    else body.appendChild(element)
  }

  archive.file('word/document.xml', new XMLSerializer().serializeToString(document))
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
