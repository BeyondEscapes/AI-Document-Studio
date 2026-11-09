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
import shutil
import os
import copy
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Pt, RGBColor, Cm, Emu
    from docx.enum.text import WD_ALIGN_PARAGRAPH
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


def add_title_paragraph(doc, text: str):
    """Add document title."""
    para = doc.add_paragraph()
    para.paragraph_format.space_after = Pt(8)
    
    run = para.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.bold = True
    run.font.size = Pt(12)
    
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
    
    # Add title if provided and not already in sections
    has_title_section = any(s.get('type') == 'title' for s in sections)
    if title and not has_title_section:
        add_title_paragraph(doc, title)
    
    # Add each section
    for i, section in enumerate(sections):
        section_type = section.get('type', 'paragraph')
        section_content = section.get('content', '')
        items = section.get('items', [])
        headers = section.get('headers', [])
        rows = section.get('rows', [])
        
        if section_type == 'title':
            add_title_paragraph(doc, section_content)
        
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
        
        # Add a small spacer paragraph between major sections
        if section_type in ('heading1',) and i < len(sections) - 1:
            # No extra space needed - heading bar already has built-in spacing
            pass
    
    # Add end marker
    end_para = doc.add_paragraph()
    end_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    end_para.paragraph_format.space_before = Pt(12)
    run = end_para.add_run('****END OF SERVICES****')
    run.font.name = 'Times New Roman'
    run.font.bold = True
    run.font.size = Pt(12)
    
    # Save document
    doc.save(output_path)
    print(f"SUCCESS: Document saved to {output_path}", flush=True)


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
