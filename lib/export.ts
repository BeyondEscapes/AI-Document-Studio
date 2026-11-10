import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { DATA_DIR } from '@/lib/storage'
import type { DocumentContent } from '@/types'

const PYTHON_DIR = path.join(process.cwd(), 'python')
const EXPORTS_DIR = path.join(DATA_DIR, 'exports')
const ASSETS_DIR = path.join(process.cwd(), 'assets')

export function ensureExportsDir(): void {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true })
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100)
    .trim() || 'Document'
}

export function generateFilename(documentContent: DocumentContent, extension: 'docx' | 'pdf'): string {
  const title = sanitizeFilename(documentContent.title || 'BeyondEscapes_Document')
  const timestamp = new Date().toISOString().slice(0, 10)
  return `${title}_${timestamp}.${extension}`
}

export async function generateDocx(
  documentContent: DocumentContent,
  templatePath: string,
  outputFilename: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  ensureExportsDir()
  
  const outputPath = path.join(EXPORTS_DIR, outputFilename)
  const contentJsonPath = path.join(EXPORTS_DIR, `${outputFilename}.content.json`)
  
  try {
    // Write content to temp JSON file (UTF-8 without BOM)
    fs.writeFileSync(contentJsonPath, JSON.stringify(documentContent, null, 2), { encoding: 'utf8' })
    
    // Find Python executable
    const pythonExe = findPython()
    if (!pythonExe) {
      return { success: false, error: 'Python 3 not found. Please install Python 3.x and ensure it is in PATH.' }
    }
    
    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      return { success: false, error: `Template file not found: ${templatePath}` }
    }
    
    const scriptPath = path.join(PYTHON_DIR, 'generate_docx.py')
    const cmd = `"${pythonExe}" "${scriptPath}" "${templatePath}" "${contentJsonPath}" "${outputPath}"`
    
    execSync(cmd, { 
      timeout: 60000,
      stdio: 'pipe',
      env: { ...process.env }
    })
    
    if (!fs.existsSync(outputPath)) {
      return { success: false, error: 'DOCX file was not generated. Check Python script logs.' }
    }
    
    // Cleanup temp file
    fs.unlinkSync(contentJsonPath)
    
    return { success: true, filePath: outputPath }
  } catch (error) {
    // Cleanup temp file on error
    if (fs.existsSync(contentJsonPath)) {
      try { fs.unlinkSync(contentJsonPath) } catch {}
    }
    const errMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: `DOCX generation failed: ${errMsg}` }
  }
}

export async function generatePdf(
  docxPath: string,
  outputFilename: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  ensureExportsDir()
  
  const pdfOutputDir = EXPORTS_DIR
  const expectedPdfPath = path.join(pdfOutputDir, outputFilename)
  
  if (!fs.existsSync(docxPath)) {
    return { success: false, error: `Source DOCX not found: ${docxPath}` }
  }

  const pythonExe = findPython()
  if (!pythonExe) {
    return { success: false, error: 'Python 3 not found for PDF conversion.' }
  }

  const scriptPath = path.join(PYTHON_DIR, 'convert_to_pdf.py')

  try {
    const cmd = `"${pythonExe}" "${scriptPath}" "${docxPath}" "${expectedPdfPath}"`
    execSync(cmd, {
      timeout: 120000,
      stdio: 'pipe',
      env: { ...process.env },
    })

    if (fs.existsSync(expectedPdfPath) && fs.statSync(expectedPdfPath).size > 0) {
      return { success: true, filePath: expectedPdfPath }
    } else {
      return { success: false, error: 'PDF file was not created or is empty.' }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: `PDF conversion failed: ${errMsg}` }
  }
}

function findPython(): string | null {
  const candidates = [
    'python',
    'python3',
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Python310\\python.exe',
    'C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
    'C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
  ]
  
  for (const candidate of candidates) {
    try {
      const result = execSync(`"${candidate}" --version`, { stdio: 'pipe', timeout: 5000 }).toString()
      if (result.includes('Python 3')) return candidate
    } catch {}
  }
  
  return null
}

function findLibreOffice(): string | null {
  const candidates = [
    'soffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/libreoffice',
    '/usr/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ]
  
  for (const candidate of candidates) {
    try {
      execSync(`"${candidate}" --version`, { stdio: 'pipe', timeout: 5000 })
      return candidate
    } catch {}
  }
  
  return null
}

export function getExportedFile(filename: string): Buffer | null {
  ensureExportsDir()
  const filePath = path.join(EXPORTS_DIR, filename)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath)
}

export function getDefaultTemplatePath(): string {
  return path.join(ASSETS_DIR, 'beyond-escapes-template.docx')
}
