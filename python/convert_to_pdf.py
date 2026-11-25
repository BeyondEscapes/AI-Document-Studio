#!/usr/bin/env python3
"""
AI Document Studio - PDF Conversion Engine
Converts DOCX to PDF using LibreOffice headless or docx2pdf (MS Word).

Usage: python convert_to_pdf.py <docx_path> <output_pdf_path>
"""

import sys
import os
import subprocess
import shutil
import tempfile
from pathlib import Path


def convert_with_docx2pdf(docx_path: str, pdf_path: str) -> bool:
    """Convert using docx2pdf (uses Word COM automation on Windows)."""
    try:
        from docx2pdf import convert
        convert(docx_path, pdf_path)
        if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
            print(f"SUCCESS: Converted with docx2pdf to {pdf_path}")
            return True
    except Exception as e:
        print(f"docx2pdf error: {e}", file=sys.stderr)
    return False


def convert_with_libreoffice(docx_path: str, pdf_path: str) -> bool:
    """Convert using LibreOffice headless."""
    lo_candidates = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        "soffice",
        "libreoffice",
    ]
    
    lo_exe = None
    for candidate in lo_candidates:
        if os.path.exists(candidate) or shutil.which(candidate):
            lo_exe = candidate
            break
    
    if not lo_exe:
        return False
    
    outdir = os.path.dirname(os.path.abspath(pdf_path))

    try:
        with tempfile.TemporaryDirectory(prefix='studio-lo-') as profile:
            subprocess.run([
                lo_exe,
                f'-env:UserInstallation={Path(profile).as_uri()}',
                '--headless',
                '--convert-to', 'pdf',
                docx_path,
                '--outdir', outdir,
            ], capture_output=True, text=True, timeout=30, check=True)
        lo_output = os.path.join(outdir, f'{Path(docx_path).stem}.pdf')
        if os.path.getsize(lo_output) > 0:
            if lo_output != pdf_path:
                shutil.move(lo_output, pdf_path)
            print(f'SUCCESS: Converted with LibreOffice to {pdf_path}')
            return True
    except (OSError, subprocess.SubprocessError) as error:
        print(f'LibreOffice error: {error}', file=sys.stderr)

    return False


def main():
    if len(sys.argv) < 3:
        print("Usage: python convert_to_pdf.py <docx_path> <output_pdf_path>", file=sys.stderr)
        sys.exit(1)
    
    docx_path = os.path.abspath(sys.argv[1])
    pdf_path = os.path.abspath(sys.argv[2])
    
    if not os.path.exists(docx_path):
        print(f"ERROR: DOCX file not found: {docx_path}", file=sys.stderr)
        sys.exit(1)
    
    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
    
    if len(sys.argv) == 4 and sys.argv[3] == '--word-only':
        sys.exit(0 if convert_with_docx2pdf(docx_path, pdf_path) else 1)

    if sys.platform in ('win32', 'darwin'):
        try:
            subprocess.run(
                [sys.executable, __file__, docx_path, pdf_path, '--word-only'],
                timeout=15, check=True,
            )
            sys.exit(0)
        except (OSError, subprocess.SubprocessError) as error:
            print(f'Word conversion error: {error}', file=sys.stderr)

    if convert_with_libreoffice(docx_path, pdf_path):
        sys.exit(0)

    print("ERROR: All PDF conversion strategies failed.", file=sys.stderr)
    sys.exit(1)


if __name__ == '__main__':
    main()
