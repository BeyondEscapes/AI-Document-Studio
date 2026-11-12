#!/usr/bin/env python3
"""
AI Document Studio - DOCX Template Engine
Generates a branded DOCX document by applying AI-generated content
to the Beyond Escapes Word template while preserving all formatting,
logos, headers, footers, and brand identity.

Usage: python generate_docx.py <template_path> <content_json_path> <output_path>
"""

import sys
import json
import base64
import binascii
import io
import shutil
import os
import copy
import re
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Pt, RGBColor, Cm, Emu, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    import lxml.etree as etree
except ImportError:
    print("ERROR: python-docx not installed. Run: pip install python-docx lxml", file=sys.stderr)
    sys.exit(1)


def add_blue_heading_bar(doc, text: str):
    """Add a blue heading bar table (matching the original template style)."""
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    cell = table.rows[0].cells[0]
    
    # Set cell width to full page width (10080 dxa = 7 inches)
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcW = OxmlElement('w:tcW')
    tcW.set(qn('w:w'), '10080')
    tcW.set(qn('w:type'), 'dxa')
    tcPr.append(tcW)
    
    # Set blue background fill
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), '3973B9')
    tcPr.append(shd)
    
    # Add text with white formatting
    para = cell.paragraphs[0]
    para_format = para.paragraph_format
    para_format.space_after = Pt(0)
    
    run = para.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.bold = True
    run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    run.font.size = Pt(12)
    
    # Remove underline explicitly
    rPr = run._r.get_or_add_rPr()
    u_elem = OxmlElement('w:u')
    u_elem.set(qn('w:val'), 'none')
    rPr.append(u_elem)
    
    return table


def add_subheading(doc, text: str):
    """Add a bold underlined subheading (attraction/place name style)."""
    para = doc.add_paragraph()
    para_format = para.paragraph_format
    para_format.space_before = Pt(8)
    para_format.space_after = Pt(2)
    
    run = para.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.bold = True
    run.font.underline = True
    run.font.size = Pt(12)
    
    return para


def add_minor_heading(doc, text: str):
    """Add a bold minor heading."""
    para = doc.add_paragraph()
    para_format = para.paragraph_format
    para_format.space_before = Pt(4)
    para_format.space_after = Pt(2)
    
    run = para.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.bold = True
    run.font.size = Pt(12)
    
    return para


def add_bullet_paragraph(doc, text: str):
    """Add a bullet list paragraph using ListBullet style."""
    try:
        para = doc.add_paragraph(style='List Bullet')
    except KeyError:
        para = doc.add_paragraph()
        # Add manual bullet if style not available
        pPr = para._p.get_or_add_pPr()
        numPr = OxmlElement('w:numPr')
        ilvl = OxmlElement('w:ilvl')
        ilvl.set(qn('w:val'), '0')
        numId = OxmlElement('w:numId')
        numId.set(qn('w:val'), '1')
        numPr.append(ilvl)
        numPr.append(numId)
        pPr.append(numPr)
    
    para.paragraph_format.space_before = Pt(0)
    para.paragraph_format.space_after = Pt(0)
    
    run = para.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.bold = False
    run.font.size = Pt(12)
    
    # Ensure no underline
    rPr = run._r.get_or_add_rPr()
    u_elem = OxmlElement('w:u')
    u_elem.set(qn('w:val'), 'none')
    rPr.append(u_elem)
    
    return para


def add_numbered_paragraph(doc, text: str, number: int):
    """Add a numbered list paragraph."""
    try:
        para = doc.add_paragraph(style='List Number')
    except KeyError:
        para = doc.add_paragraph()
        para.add_run(f"{number}. ")
    
    para.paragraph_format.space_before = Pt(0)
    para.paragraph_format.space_after = Pt(0)
    
    run = para.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(12)
    
    return para


def add_regular_paragraph(doc, text: str):
    """Add a regular body text paragraph."""
    para = doc.add_paragraph()
    para.paragraph_format.space_after = Pt(7)
    para.paragraph_format.line_spacing = Pt(12)
    
    run = para.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.bold = False
    run.font.size = Pt(12)
    
    # Ensure no underline
    rPr = run._r.get_or_add_rPr()
    u_elem = OxmlElement('w:u')
    u_elem.set(qn('w:val'), 'none')
    rPr.append(u_elem)
    
    return para


def add_document_images(doc, images):
    for image in images:
        if not isinstance(image, dict):
            raise ValueError('Document images must be objects containing image data.')
        source = image.get('src', '')
        match = re.fullmatch(r'data:image/(?:jpeg|png);base64,([A-Za-z0-9+/=\r\n]+)', source)
        if not match:
            raise ValueError('Document image data must be an embedded JPEG or PNG.')

        encoded = match.group(1)
        if len(encoded) > 12 * 1024 * 1024:
            raise ValueError('Document images must be 9 MB or smaller after optimization.')
        try:
            image_bytes = base64.b64decode(encoded, validate=True)
        except binascii.Error as error:
            raise ValueError('Document image data is not valid base64.') from error
        if not image_bytes or len(image_bytes) > 9 * 1024 * 1024:
            raise ValueError('Document images must be non-empty and 9 MB or smaller.')
        if source.startswith('data:image/jpeg;') and image_bytes.startswith(b'\xff\xd8'):
            if image_bytes[2:4] not in (b'\xff\xe0', b'\xff\xe1'):
                jfif_header = bytes.fromhex('ffe000104a46494600010100000100010000')
                image_bytes = image_bytes[:2] + jfif_header + image_bytes[2:]

        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_before = Pt(4)
        paragraph.paragraph_format.space_after = Pt(4)
        aspect_ratio = max(0.01, float(image.get('width', 1)) / max(1, float(image.get('height', 1))))
        max_width = max(1, float(image.get('displayWidth') or 4.8))
        max_height = max(1, float(image.get('displayHeight') or 3))
        width = min(max_width, max_height * aspect_ratio)
        picture = paragraph.add_run().add_picture(io.BytesIO(image_bytes), width=Inches(width))
        picture._inline.docPr.set('descr', str(image.get('altText') or image.get('caption') or 'Itinerary photo')[:500])
        picture._inline.docPr.set('title', str(image.get('caption') or image.get('altText') or 'Itinerary photo')[:255])
        caption = image.get('caption')
        if caption:
            caption_paragraph = doc.add_paragraph()
            caption_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            caption_paragraph.paragraph_format.space_after = Pt(8)
            run = caption_paragraph.add_run(str(caption)[:255])
            run.font.name = 'Calibri'
            run.font.size = Pt(9)
            run.font.italic = True


def add_title_paragraph(doc, text: str, branded=False):
    """Add document title."""
    para = doc.add_paragraph()
    para.paragraph_format.space_before = Pt(8 if branded else 0)
    para.paragraph_format.space_after = Pt(12 if branded else 8)
    if branded:
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    run = para.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.bold = True
    run.font.size = Pt(18 if branded else 12)
    if branded:
        run.font.color.rgb = RGBColor(0x39, 0x73, 0xB9)
    
    return para


def add_data_table(doc, headers, rows):
    """Add a data table with headers."""
    if not rows:
        return
    
    num_cols = max(len(headers) if headers else 0, max(len(row) for row in rows) if rows else 1)
    if num_cols == 0:
        num_cols = 1
    
    table = doc.add_table(rows=1 + len(rows), cols=num_cols)
    table.style = 'Table Grid'
    
    # Header row
    if headers:
        header_row = table.rows[0]
        for i, header in enumerate(headers[:num_cols]):
            cell = header_row.cells[i]
            cell.text = ''
            run = cell.paragraphs[0].add_run(header)
            run.font.name = 'Times New Roman'
            run.font.bold = True
            run.font.size = Pt(11)
            
            # Blue header background
            tc = cell._tc
            tcPr = tc.get_or_add_tcPr()
            shd = OxmlElement('w:shd')
            shd.set(qn('w:val'), 'clear')
            shd.set(qn('w:color'), 'auto')
            shd.set(qn('w:fill'), '3973B9')
            tcPr.append(shd)
            
            # White text
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    
    # Data rows
    for row_idx, row_data in enumerate(rows):
        table_row = table.rows[row_idx + 1]
        for col_idx, cell_data in enumerate(row_data[:num_cols]):
            cell = table_row.cells[col_idx]
            cell.text = ''
            run = cell.paragraphs[0].add_run(str(cell_data))
            run.font.name = 'Times New Roman'
            run.font.size = Pt(11)
    
    return table


def add_room_reservation_reference(doc, fields):
    """Render the structured reservation details in the supplied PDF's table layout."""
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_before = Pt(25)
    title.paragraph_format.space_after = Pt(44)
    title_run = title.add_run('ROOM RESERVATION')
    title_run.font.name = 'Calibri'
    title_run.font.bold = True
    title_run.font.size = Pt(16)

    metadata = [
        ('Tour Number', fields.get('tourNumber')),
        ('Market', fields.get('market')),
        ('Date', fields.get('documentDate')),
    ]
    for label, value in metadata:
        if value:
            paragraph = doc.add_paragraph()
            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(0)
            label_run = paragraph.add_run(f'{label}: ')
            label_run.font.name = 'Calibri'
            label_run.font.bold = True
            label_run.font.size = Pt(10)
            run = paragraph.add_run(value)
            run.font.name = 'Calibri'
            run.font.size = Pt(10)

    for label, key in [('Hotel', 'hotel'), ('Location', 'location')]:
        if fields.get(key):
            paragraph = doc.add_paragraph()
            paragraph.paragraph_format.space_before = Pt(28 if key == 'hotel' else 0)
            paragraph.paragraph_format.space_after = Pt(0)
            label_run = paragraph.add_run(f'{label}: ')
            label_run.font.name = 'Calibri'
            label_run.font.bold = True
            label_run.font.size = Pt(10)
            run = paragraph.add_run(fields[key])
            run.font.name = 'Calibri'
            run.font.size = Pt(10)

    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(14)
    spacer.paragraph_format.space_after = Pt(0)
    guest_values = [
        fields.get('clientName', ''),
        fields.get('adults', ''),
        fields.get('children', ''),
        fields.get('infants', ''),
    ]
    add_reservation_guest_table(doc, guest_values)

    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(12)
    spacer.paragraph_format.space_after = Pt(0)
    room_counts = [
        reservation_room_count(fields, 'singleRooms', 'SGL'),
        reservation_room_count(fields, 'doubleRooms', 'DBL'),
        reservation_room_count(fields, 'twinRooms', 'TWN'),
        reservation_room_count(fields, 'tripleRooms', 'TPL'),
    ]
    add_reservation_stay_table(doc, [
        fields.get('checkIn', ''),
        fields.get('checkOut', ''),
        fields.get('basis', ''),
        *room_counts,
        fields.get('roomCategory', ''),
        fields.get('nights', ''),
    ])

    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(26)
    spacer.paragraph_format.space_after = Pt(0)
    add_reservation_remarks_table(doc, fields.get('remarks', ''))


RESERVATION_CONTENT_WIDTH = Inches(7.7)
RESERVATION_GUEST_WIDTHS = [1.1875, 2.5903, 0.9611, 0.6, 0.7201, 0.5701, 0.7403, 0.3306]
RESERVATION_STAY_WIDTHS = [1.5069, 1.4, 0.5556, 0.5, 0.5, 0.5, 0.5, 1.4, 0.8375]


def set_reservation_header_branding(doc):
    for section in doc.sections:
        for anchor in section.header._element.xpath('.//wp:anchor'):
            extent = anchor.find(qn('wp:extent'))
            if extent is None:
                continue
            width = int(extent.get('cx', '0'))
            scale = 1.7 if width > 1_000_000 else 1.52
            extent.set('cx', str(round(width * scale)))
            extent.set('cy', str(round(int(extent.get('cy', '0')) * scale)))

            position_h = anchor.find(qn('wp:positionH'))
            position_v = anchor.find(qn('wp:positionV'))
            horizontal_offset = position_h.find(qn('wp:posOffset')) if position_h is not None else None
            vertical_offset = position_v.find(qn('wp:posOffset')) if position_v is not None else None
            if horizontal_offset is not None:
                horizontal_offset.text = '9144' if width > 1_000_000 else '6208776'
            if vertical_offset is not None:
                vertical_offset.text = '-178308' if width > 1_000_000 else '-612648'


def set_reservation_cell_shading(cell, fill):
    shading = OxmlElement('w:shd')
    shading.set(qn('w:val'), 'clear')
    shading.set(qn('w:color'), 'auto')
    shading.set(qn('w:fill'), fill)
    cell._tc.get_or_add_tcPr().append(shading)


def set_reservation_cell_margins(cell, top=30, start=35, bottom=30, end=35):
    tc_pr = cell._tc.get_or_add_tcPr()
    margins = OxmlElement('w:tcMar')
    for edge, value in [('top', top), ('start', start), ('bottom', bottom), ('end', end)]:
        margin = OxmlElement(f'w:{edge}')
        margin.set(qn('w:w'), str(value))
        margin.set(qn('w:type'), 'dxa')
        margins.append(margin)
    tc_pr.append(margins)


def set_reservation_table_borders(table):
    properties = table._tbl.tblPr
    borders = properties.find(qn('w:tblBorders'))
    if borders is None:
        borders = OxmlElement('w:tblBorders')
        properties.append(borders)
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        border = borders.find(qn(f'w:{edge}'))
        if border is None:
            border = OxmlElement(f'w:{edge}')
            borders.append(border)
        border.set(qn('w:val'), 'single')
        border.set(qn('w:sz'), '6')
        border.set(qn('w:space'), '0')
        border.set(qn('w:color'), '000000')


def set_reservation_table_widths(table, widths):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table_properties = table._tbl.tblPr
    table_width = table_properties.find(qn('w:tblW'))
    if table_width is None:
        table_width = OxmlElement('w:tblW')
        table_properties.append(table_width)
    table_width.set(qn('w:w'), str(int(RESERVATION_CONTENT_WIDTH.twips)))
    table_width.set(qn('w:type'), 'dxa')

    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths:
        column = OxmlElement('w:gridCol')
        column.set(qn('w:w'), str(int(Inches(width).twips)))
        grid.append(column)

    for row in table.rows:
        for index, cell in enumerate(row.cells):
            cell.width = Inches(widths[index])
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_reservation_cell_margins(cell)
    set_reservation_table_borders(table)


def format_reservation_cell(cell, text, *, bold=False, size=9, fill=None, alignment=WD_ALIGN_PARAGRAPH.LEFT):
    cell.text = ''
    if fill:
        set_reservation_cell_shading(cell, fill)
    paragraph = cell.paragraphs[0]
    paragraph.alignment = alignment
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(str(text))
    run.font.name = 'Calibri'
    run.font.bold = bold
    run.font.size = Pt(size)


def add_reservation_guest_table(doc, values):
    table = doc.add_table(rows=1, cols=8)
    widths = RESERVATION_GUEST_WIDTHS
    labels = ['CLIENT NAME', 'ADULT', 'CHILD', 'INFANT']
    for index, (label, value) in enumerate(zip(labels, values)):
        format_reservation_cell(table.rows[0].cells[index * 2], label, bold=True, size=9, fill='D9D9D9')
        format_reservation_cell(table.rows[0].cells[index * 2 + 1], value, size=10)
    set_reservation_table_widths(table, widths)


def reservation_room_count(fields, field_name, abbreviation):
    value = fields.get(field_name, '')
    if value:
        return value

    allocation = fields.get('roomAllocation', '')
    if not isinstance(allocation, str) or not allocation:
        return ''

    label = r'(?:' + abbreviation + r'|' + {
        'SGL': r'SINGLES?',
        'DBL': r'DOUBLES?',
        'TWN': r'TWINS?',
        'TPL': r'TRIPLES?',
    }[abbreviation] + r')'
    patterns = [
        rf'\b(\d+)\s*{label}\b',
        rf'\b{label}\s*[:= -]?\s*(\d+)\b',
    ]
    for pattern in patterns:
        match = re.search(pattern, allocation, re.IGNORECASE)
        if match:
            return match.group(1).zfill(2)
    return ''


def add_reservation_stay_table(doc, values):
    headers = ['CHECK-IN', 'CHECK-OUT', 'BASIS', 'SGL', 'DBL', 'TWN', 'TPL', 'ROOM CATEGORY', 'NIGHTS']
    table = doc.add_table(rows=2, cols=9)
    widths = RESERVATION_STAY_WIDTHS
    for index, header in enumerate(headers):
        format_reservation_cell(table.rows[0].cells[index], header, bold=True, size=9, fill='D9D9D9', alignment=WD_ALIGN_PARAGRAPH.CENTER)
        format_reservation_cell(table.rows[1].cells[index], values[index], size=10, alignment=WD_ALIGN_PARAGRAPH.CENTER)
    set_reservation_table_widths(table, widths)


def add_reservation_remarks_table(doc, remarks):
    table = doc.add_table(rows=2, cols=1)
    table.autofit = False
    format_reservation_cell(table.rows[0].cells[0], 'REMARKS:', bold=True, size=9, fill='D9D9D9')

    cell = table.rows[1].cells[0]
    cell.text = ''
    set_reservation_cell_margins(cell, top=80, start=220, bottom=80, end=80)
    remark_lines = remarks.splitlines() if isinstance(remarks, str) else []
    if not remark_lines and isinstance(remarks, str) and remarks.strip():
        remark_lines = [remarks]
    for index, line in enumerate(remark_lines):
        if not line.strip():
            continue
        paragraph = cell.paragraphs[0] if index == 0 else cell.add_paragraph()
        paragraph.paragraph_format.left_indent = Pt(8)
        paragraph.paragraph_format.first_line_indent = Pt(-7)
        paragraph.paragraph_format.space_before = Pt(0)
        paragraph.paragraph_format.space_after = Pt(2)
        run = paragraph.add_run(f'\u2022  {line.strip().lstrip("•-* ").strip()}')
        run.font.name = 'Calibri'
        run.font.size = Pt(10)

    set_reservation_table_widths(table, [RESERVATION_CONTENT_WIDTH.inches])


def add_page_break(doc):
    """Add a page break."""
    doc.add_page_break()


def clear_document_body(doc):
    """Remove all body content from the document while preserving structure."""
    body = doc.element.body
    
    # Find the section properties (last element) - must be preserved
    sect_pr = None
    for child in list(body):
        if child.tag == qn('w:sectPr'):
            sect_pr = child
            break
    
    # Remove all paragraphs and tables (body content)
    for child in list(body):
        if child.tag != qn('w:sectPr'):
            body.remove(child)
    
    return sect_pr


def generate_document(template_path: str, content: dict, output_path: str):
    """
    Main document generation function.
    Opens the template, clears sample content, injects new AI content,
    and saves preserving all branding, headers, footers, and styles.
    """
    # Open template (preserves headers, footers, styles, page settings)
    doc = Document(template_path)
    
    # Clear existing body content (sample itinerary text)
    # but preserve section properties (page size, margins, header/footer refs)
    body = doc.element.body
    
    # Store section properties
    sect_pr = body.find(qn('w:sectPr'))
    
    # Remove all body children except sectPr
    for child in list(body):
        if child.tag != qn('w:sectPr'):
            body.remove(child)
    
    # Process sections from AI content
    sections = content.get('sections', [])
    title = content.get('title', '')
    
    document_type = content.get('documentType')
    intake = content.get('intake') or {}
    fields = intake.get('fields') or {}

    if document_type == 'room_reservation':
        for section in doc.sections:
            section.page_width = Inches(8.5)
            section.page_height = Inches(11)
            section.left_margin = Inches(0.4)
            section.right_margin = Inches(0.4)
            section.top_margin = Inches(0.8)
            section.bottom_margin = Inches(0.65)
        set_reservation_header_branding(doc)
        sections = []
        add_room_reservation_reference(doc, fields)
    elif document_type and document_type != 'tour_itinerary' and fields:
        details = [
            [humanize_field_name(key), value]
            for key, value in fields.items()
            if isinstance(value, str) and value.strip()
        ]
        if details:
            add_blue_heading_bar(doc, 'DOCUMENT DETAILS')
            add_data_table(doc, ['DETAIL', 'PROVIDED INFORMATION'], details)

    # Add title if provided and not already in sections
    has_title_section = bool(content.get('coverImage')) or any(s.get('type') == 'title' for s in sections)
    if title and not has_title_section and document_type != 'room_reservation':
        add_title_paragraph(doc, title)
    if content.get('coverImage'):
        add_document_images(doc, [content['coverImage']])
    
    # Add each section
    for i, section in enumerate(sections):
        section_type = section.get('type', 'paragraph')
        section_content = section.get('content', '')
        items = section.get('items', [])
        headers = section.get('headers', [])
        rows = section.get('rows', [])
        
        if section_type == 'title':
            add_title_paragraph(doc, section_content, branded=document_type == 'tour_itinerary')
        
        elif section_type == 'heading1':
            # Blue heading bar
            add_blue_heading_bar(doc, section_content)
        
        elif section_type == 'heading2':
            # Bold underlined subheading
            add_subheading(doc, section_content)
        
        elif section_type == 'heading3':
            # Minor heading
            add_minor_heading(doc, section_content)
        
        elif section_type == 'paragraph':
            if section_content.strip():
                add_regular_paragraph(doc, section_content)
        
        elif section_type == 'bullet_list':
            for item in items:
                if item.strip():
                    add_bullet_paragraph(doc, item)
        
        elif section_type == 'numbered_list':
            for idx, item in enumerate(items, 1):
                if item.strip():
                    add_numbered_paragraph(doc, item, idx)
        
        elif section_type == 'table':
            add_data_table(doc, headers, rows)
        
        elif section_type == 'page_break':
            add_page_break(doc)

        add_document_images(doc, section.get('images', []))
        
        # Add a small spacer paragraph between major sections
        if section_type in ('heading1',) and i < len(sections) - 1:
            # No extra space needed - heading bar already has built-in spacing
            pass
    
    if document_type in (None, 'tour_itinerary', 'tour_proposal'):
        end_para = doc.add_paragraph()
        end_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        end_para.paragraph_format.space_before = Pt(12)
        run = end_para.add_run('****END OF SERVICES****')
        run.font.name = 'Times New Roman'
        run.font.bold = True
        run.font.size = Pt(12)
    if document_type == 'tour_itinerary':
        add_blue_heading_bar(doc, 'BEYOND ESCAPES PRIVATE LIMITED')
        for line in [
            '+94 112 579 679 | +94 112 579 779 | +94 76 900 2880',
            'tours@beyondescapes.com | www.beyondescapes.com',
            '164/B, New Kandy Rd, Kothalawala, Kaduwela, Sri Lanka',
        ]:
            paragraph = doc.add_paragraph()
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            paragraph.paragraph_format.space_before = Pt(4)
            paragraph.paragraph_format.space_after = Pt(4)
            run = paragraph.add_run(line)
            run.font.name = 'Times New Roman'
            run.font.size = Pt(10)
        if content.get('closingLogo'):
            add_document_images(doc, [content['closingLogo']])
    
    # Save document
    doc.save(output_path)
    print(f"SUCCESS: Document saved to {output_path}", flush=True)


def humanize_field_name(key):
    label = []
    for char in key:
        if char.isupper():
            label.append(' ')
        label.append(char)
    return ''.join(label).replace('_', ' ').strip().title()


def main():
    if len(sys.argv) != 4:
        print("Usage: python generate_docx.py <template_path> <content_json_path> <output_path>", file=sys.stderr)
        sys.exit(1)
    
    template_path = sys.argv[1]
    content_json_path = sys.argv[2]
    output_path = sys.argv[3]
    
    # Validate inputs
    if not os.path.exists(template_path):
        print(f"ERROR: Template not found: {template_path}", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.exists(content_json_path):
        print(f"ERROR: Content JSON not found: {content_json_path}", file=sys.stderr)
        sys.exit(1)
    
    # Load content (handle UTF-8 BOM from Windows PowerShell)
    with open(content_json_path, 'r', encoding='utf-8-sig') as f:
        content = json.load(f)
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    
    # Generate document
    generate_document(template_path, content, output_path)


if __name__ == '__main__':
    main()
