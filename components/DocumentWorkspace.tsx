'use client'

import { useState, useCallback } from 'react'
import {
  FileText, Download, X, Edit3, Eye, FileDown,
  ChevronDown, ChevronUp, Trash2, Plus, AlertCircle,
  CheckCircle, Loader2, Palette, RefreshCw
} from 'lucide-react'
import type { DocumentContent, DocumentSection, DocumentTheme } from '@/types'

interface DocumentWorkspaceProps {
  documentContent: DocumentContent | null
  themes: DocumentTheme[]
  selectedThemeId: string
  onThemeChange: (themeId: string) => void
  onDocumentUpdate: (content: DocumentContent) => void
  onClose: () => void
}

type ViewMode = 'preview' | 'edit'

export function DocumentWorkspace({
  documentContent, themes, selectedThemeId, onThemeChange, onDocumentUpdate, onClose
}: DocumentWorkspaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [exportStatus, setExportStatus] = useState<{
    docx: 'idle' | 'loading' | 'success' | 'error'
    pdf: 'idle' | 'loading' | 'success' | 'error'
    docxError?: string
    pdfError?: string
    docxFilename?: string
    pdfFilename?: string
  }>({ docx: 'idle', pdf: 'idle' })

  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!documentContent) return
    
    setExportStatus(prev => ({
      ...prev,
      [format]: 'loading',
      [`${format}Error`]: undefined,
    }))

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentContent,
          themeId: selectedThemeId,
          format,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setExportStatus(prev => ({
          ...prev,
          [format]: 'success',
          [`${format}Filename`]: data.filename,
        }))
        // Trigger download
        const link = document.createElement('a')
        link.href = data.downloadUrl
        link.download = data.filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        setExportStatus(prev => ({
          ...prev,
          [format]: 'error',
          [`${format}Error`]: data.error || 'Export failed',
          // If DOCX available for PDF fallback
          ...(data.docxAvailable && format === 'pdf' ? {
            docx: 'success',
            docxFilename: data.docxFilename,
          } : {}),
        }))
        // If PDF failed but DOCX was generated, offer it
        if (data.docxAvailable && data.docxDownloadUrl) {
          const link = document.createElement('a')
          link.href = data.docxDownloadUrl
          link.download = data.docxFilename
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        }
      }
    } catch (err) {
      setExportStatus(prev => ({
        ...prev,
        [format]: 'error',
        [`${format}Error`]: 'Network error. Please try again.',
      }))
    }
  }

  const handleSectionUpdate = useCallback((updatedSection: DocumentSection) => {
    if (!documentContent) return
    const updated = {
      ...documentContent,
      sections: documentContent.sections.map(s =>
        s.id === updatedSection.id ? updatedSection : s
      ),
    }
    onDocumentUpdate(updated)
  }, [documentContent, onDocumentUpdate])

  const handleSectionDelete = useCallback((sectionId: string) => {
    if (!documentContent) return
    const updated = {
      ...documentContent,
      sections: documentContent.sections.filter(s => s.id !== sectionId),
    }
    onDocumentUpdate(updated)
  }, [documentContent, onDocumentUpdate])

  const handleAddSection = useCallback((afterId: string, type: DocumentSection['type']) => {
    if (!documentContent) return
    const newSection: DocumentSection = {
      id: `section-${Date.now()}`,
      type,
      content: type === 'bullet_list' || type === 'numbered_list' ? '' : 'New section',
      items: type === 'bullet_list' || type === 'numbered_list' ? ['New item'] : undefined,
    }
    const idx = documentContent.sections.findIndex(s => s.id === afterId)
    const newSections = [...documentContent.sections]
    newSections.splice(idx + 1, 0, newSection)
    onDocumentUpdate({ ...documentContent, sections: newSections })
  }, [documentContent, onDocumentUpdate])

  const handleTitleChange = useCallback((title: string) => {
    if (!documentContent) return
    onDocumentUpdate({ ...documentContent, title })
  }, [documentContent, onDocumentUpdate])

  if (!documentContent) {
    return (
      <div className="flex flex-col h-full bg-gray-50 items-center justify-center p-8">
        <FileText size={40} className="text-gray-300 mb-3" />
        <h3 className="text-sm font-medium text-gray-500">No document generated yet</h3>
        <p className="text-xs text-gray-400 mt-1 text-center">
          Chat with AI to generate your document content
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 h-14">
        <FileText size={15} className="text-blue-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-gray-800 flex-1 truncate">
          {documentContent.title}
        </h2>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('preview')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'preview' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Eye size={12} />
            Preview
          </button>
          <button
            onClick={() => setViewMode('edit')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'edit' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Edit3 size={12} />
            Edit
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Template Selector */}
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <Palette size={12} className="text-gray-400 flex-shrink-0" />
        <span className="text-xs text-gray-500">Template:</span>
        <select
          value={selectedThemeId}
          onChange={e => onThemeChange(e.target.value)}
          className="text-xs border-0 bg-transparent text-gray-700 font-medium focus:outline-none cursor-pointer flex-1 max-w-xs"
        >
          {themes.map(theme => (
            <option key={theme.id} value={theme.id}>{theme.name}</option>
          ))}
        </select>
      </div>

      {/* Document Content */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'preview' ? (
          <DocumentPreview documentContent={documentContent} />
        ) : (
          <DocumentEditor
            documentContent={documentContent}
            onSectionUpdate={handleSectionUpdate}
            onSectionDelete={handleSectionDelete}
            onAddSection={handleAddSection}
            onTitleChange={handleTitleChange}
          />
        )}
      </div>

      {/* Export Panel */}
      <div className="border-t border-gray-200 px-4 py-3 bg-white">
        <p className="text-xs font-semibold text-gray-600 mb-2">Export Document</p>
        <div className="flex gap-2">
          {/* DOCX Button */}
          <div className="flex-1">
            <button
              onClick={() => handleExport('docx')}
              disabled={exportStatus.docx === 'loading'}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                exportStatus.docx === 'success'
                  ? 'bg-green-500 text-white'
                  : exportStatus.docx === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-600'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              } disabled:opacity-60`}
            >
              {exportStatus.docx === 'loading' ? (
                <Loader2 size={15} className="animate-spin" />
              ) : exportStatus.docx === 'success' ? (
                <CheckCircle size={15} />
              ) : exportStatus.docx === 'error' ? (
                <AlertCircle size={15} />
              ) : (
                <Download size={15} />
              )}
              <span>
                {exportStatus.docx === 'loading' ? 'Generating...'
                  : exportStatus.docx === 'success' ? 'Downloaded!'
                  : exportStatus.docx === 'error' ? 'Retry DOCX'
                  : 'Word (.docx)'}
              </span>
            </button>
            {exportStatus.docx === 'error' && exportStatus.docxError && (
              <p className="text-[10px] text-red-500 mt-1 text-center">{exportStatus.docxError}</p>
            )}
          </div>

          {/* PDF Button */}
          <div className="flex-1">
            <button
              onClick={() => handleExport('pdf')}
              disabled={exportStatus.pdf === 'loading'}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                exportStatus.pdf === 'success'
                  ? 'bg-green-500 text-white'
                  : exportStatus.pdf === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-600'
                  : 'bg-gray-700 hover:bg-gray-800 text-white'
              } disabled:opacity-60`}
            >
              {exportStatus.pdf === 'loading' ? (
                <Loader2 size={15} className="animate-spin" />
              ) : exportStatus.pdf === 'success' ? (
                <CheckCircle size={15} />
              ) : exportStatus.pdf === 'error' ? (
                <AlertCircle size={15} />
              ) : (
                <FileDown size={15} />
              )}
              <span>
                {exportStatus.pdf === 'loading' ? 'Converting...'
                  : exportStatus.pdf === 'success' ? 'Downloaded!'
                  : exportStatus.pdf === 'error' ? 'Retry PDF'
                  : 'PDF (.pdf)'}
              </span>
            </button>
            {exportStatus.pdf === 'error' && exportStatus.pdfError && (
              <p className="text-[10px] text-red-500 mt-1 text-center">{exportStatus.pdfError}</p>
            )}
          </div>
        </div>

        {/* LibreOffice note */}
        <p className="text-[10px] text-gray-400 mt-2 text-center">
          PDF requires LibreOffice • DOCX uses Beyond Escapes template
        </p>
      </div>
    </div>
  )
}

// Document Preview Component
function DocumentPreview({ documentContent }: { documentContent: DocumentContent }) {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Document Header Preview */}
      <div className="mb-6 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">BE</span>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-800">BEYOND ESCAPES | SRI LANKA</p>
            <p className="text-[9px] text-gray-500">Official Travel Itinerary</p>
          </div>
        </div>
        <h1 className="text-lg font-bold text-gray-900 font-serif">{documentContent.title}</h1>
      </div>

      {/* Sections */}
      <div className="space-y-1 doc-preview">
        {documentContent.sections.map(section => (
          <SectionPreview key={section.id} section={section} />
        ))}
      </div>

      {/* Footer Preview */}
      <div className="mt-8 pt-4 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-500 font-medium">BEYOND ESCAPES | SRI LANKA</p>
      </div>
    </div>
  )
}

function SectionPreview({ section }: { section: DocumentSection }) {
  switch (section.type) {
    case 'title':
      return <h1 className="text-xl font-bold text-gray-900 mb-4 font-serif">{section.content}</h1>

    case 'heading1':
      return (
        <div className="doc-heading-bar text-sm font-bold text-white">
          {section.content}
        </div>
      )

    case 'heading2':
      return <h3 className="doc-subheading text-sm text-gray-900 mt-3">{section.content}</h3>

    case 'heading3':
      return <h4 className="font-bold text-sm text-gray-800 mt-2 mb-1">{section.content}</h4>

    case 'paragraph':
      return <p className="text-sm text-gray-700 leading-relaxed mb-2">{section.content}</p>

    case 'bullet_list':
      return (
        <ul className="mb-2 space-y-0.5">
          {(section.items || []).map((item, i) => (
            <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
              <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )

    case 'numbered_list':
      return (
        <ol className="mb-2 space-y-0.5">
          {(section.items || []).map((item, i) => (
            <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
              <span className="text-blue-600 font-medium mt-0.5 flex-shrink-0 w-4">{i + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      )

    case 'table':
      return (
        <div className="overflow-x-auto mb-2">
          <table className="w-full border-collapse text-xs">
            {section.headers && section.headers.length > 0 && (
              <thead>
                <tr>
                  {section.headers.map((h, i) => (
                    <th key={i} className="bg-blue-600 text-white px-2 py-1.5 text-left font-medium border border-blue-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {(section.rows || []).map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {row.map((cell, j) => (
                    <td key={j} className="px-2 py-1.5 border border-gray-200 text-gray-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'page_break':
      return (
        <div className="my-4 border-t-2 border-dashed border-gray-200 relative">
          <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-white px-2 text-[10px] text-gray-400">
            — Page Break —
          </span>
        </div>
      )

    default:
      return null
  }
}

// Document Editor Component
function DocumentEditor({
  documentContent,
  onSectionUpdate,
  onSectionDelete,
  onAddSection,
  onTitleChange,
}: {
  documentContent: DocumentContent
  onSectionUpdate: (section: DocumentSection) => void
  onSectionDelete: (id: string) => void
  onAddSection: (afterId: string, type: DocumentSection['type']) => void
  onTitleChange: (title: string) => void
}) {
  return (
    <div className="p-4 space-y-2">
      {/* Title Editor */}
      <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider mt-1 w-14 flex-shrink-0">Title</span>
        <input
          type="text"
          value={documentContent.title}
          onChange={e => onTitleChange(e.target.value)}
          className="flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none focus:ring-0"
          placeholder="Document title"
        />
      </div>

      {/* Sections */}
      {documentContent.sections.map((section, idx) => (
        <SectionEditor
          key={section.id}
          section={section}
          onUpdate={onSectionUpdate}
          onDelete={() => onSectionDelete(section.id)}
          onAddAfter={(type) => onAddSection(section.id, type)}
        />
      ))}

      {/* Add Section Button */}
      <AddSectionButton onAdd={(type) => {
        const lastId = documentContent.sections[documentContent.sections.length - 1]?.id || 'none'
        onAddSection(lastId, type)
      }} />
    </div>
  )
}

function SectionEditor({
  section,
  onUpdate,
  onDelete,
  onAddAfter,
}: {
  section: DocumentSection
  onUpdate: (s: DocumentSection) => void
  onDelete: () => void
  onAddAfter: (type: DocumentSection['type']) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const typeBadgeColor = {
    title: 'bg-purple-100 text-purple-700',
    heading1: 'bg-blue-100 text-blue-700',
    heading2: 'bg-blue-50 text-blue-600',
    heading3: 'bg-sky-50 text-sky-600',
    paragraph: 'bg-gray-100 text-gray-600',
    bullet_list: 'bg-green-50 text-green-600',
    numbered_list: 'bg-teal-50 text-teal-600',
    table: 'bg-orange-50 text-orange-600',
    page_break: 'bg-red-50 text-red-500',
  }[section.type] || 'bg-gray-100 text-gray-600'

  const updateItems = (itemsText: string) => {
    const items = itemsText.split('\n').filter(l => l.trim())
    onUpdate({ ...section, items })
  }

  return (
    <div className="group relative">
      <div className="p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-200 transition-colors">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${typeBadgeColor}`}>
            {section.type.replace('_', ' ')}
          </span>
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              title="Add section below"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
              title="Delete section"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Content based on type */}
        {section.type === 'page_break' ? (
          <div className="text-xs text-gray-400 italic text-center py-1">— Page Break —</div>
        ) : section.type === 'bullet_list' || section.type === 'numbered_list' ? (
          <textarea
            value={(section.items || []).join('\n')}
            onChange={e => updateItems(e.target.value)}
            className="w-full text-sm text-gray-800 outline-none resize-none bg-transparent min-h-[60px]"
            placeholder="One item per line"
          />
        ) : section.type === 'table' ? (
          <div className="text-xs text-gray-500 italic">Table editing — use the AI to modify table content</div>
        ) : (
          <textarea
            value={section.content}
            onChange={e => onUpdate({ ...section, content: e.target.value })}
            className="w-full text-sm text-gray-800 outline-none resize-none bg-transparent min-h-[36px]"
            placeholder="Enter content..."
            rows={section.type === 'paragraph' ? 3 : 1}
          />
        )}
      </div>

      {showAdd && (
        <div className="mt-1">
          <AddSectionButton onAdd={(type) => { onAddAfter(type); setShowAdd(false) }} compact />
        </div>
      )}
    </div>
  )
}

function AddSectionButton({
  onAdd,
  compact = false,
}: {
  onAdd: (type: DocumentSection['type']) => void
  compact?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)

  const types: Array<{ type: DocumentSection['type']; label: string }> = [
    { type: 'heading1', label: 'Blue Heading Bar' },
    { type: 'heading2', label: 'Subheading' },
    { type: 'heading3', label: 'Minor Heading' },
    { type: 'paragraph', label: 'Paragraph' },
    { type: 'bullet_list', label: 'Bullet List' },
    { type: 'numbered_list', label: 'Numbered List' },
    { type: 'page_break', label: 'Page Break' },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors ${compact ? 'px-2 py-1' : 'w-full justify-center px-3 py-2 border border-dashed border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50'}`}
      >
        <Plus size={12} />
        {!compact && <span>Add Section</span>}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px]">
          {types.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => { onAdd(type); setIsOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
