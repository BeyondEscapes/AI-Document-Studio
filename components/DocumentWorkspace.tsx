'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import {
  FileText, Download, X, Edit3, Eye, FileDown,
  ChevronDown, ChevronUp, Trash2, Plus, AlertCircle,
  CheckCircle, Loader2, Palette, RefreshCw, Save, BadgeCheck,
  ImagePlus, Search, Upload,
} from 'lucide-react'
import { BUSINESS_DOCUMENT_TEMPLATES, getDocumentFieldLabel, getMissingRequiredFields } from '@/lib/business-documents'
import { scoreItineraryImage, suggestItineraryImageMatches } from '@/lib/itinerary-images'
import { getInitialRouteStops } from '@/lib/itinerary-route'
import { extractItinerarySections, getItineraryPageContent } from '@/lib/itinerary-page-content'
import ItineraryMapEditor from '@/components/ItineraryMapEditor'
import type {
  DocumentContent,
  DocumentImage,
  DocumentSection,
  DocumentTheme,
  ItineraryClosingSettings,
  ItineraryCoverSettings,
  ItineraryImageCatalogItem,
  ItineraryRouteStop,
} from '@/types'

interface DocumentWorkspaceProps {
  documentContent: DocumentContent | null
  themes: DocumentTheme[]
  selectedThemeId: string
  onThemeChange: (themeId: string) => void
  onDocumentUpdate: (content: DocumentContent) => void
  onSaveDocument: () => Promise<void>
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  onClose: () => void
}

type ViewMode = 'preview' | 'edit'

function resetApproval(content: DocumentContent): DocumentContent {
  return { ...content, approval: { status: 'draft' } }
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Could not read the selected image.'))
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.readAsDataURL(blob)
  })
}

function hasCurrentItineraryMap(content: DocumentContent): boolean {
  const cover = content.itineraryPages?.cover
  if (!cover?.mapImage) return false
  if (!cover.mapRouteSignature) return true
  const fields = content.intake?.fields ?? {}
  const routeText = fields.destinations?.trim() || fields.route?.trim() || fields.travelRoute?.trim() || ''
  const routeStops = cover.routeStops ?? getInitialRouteStops(routeText)
  return cover.mapRouteSignature === JSON.stringify(routeStops)
}

export function DocumentWorkspace({
  documentContent, themes, selectedThemeId, onThemeChange, onDocumentUpdate,
  onSaveDocument, saveStatus, onClose
}: DocumentWorkspaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [imageCatalog, setImageCatalog] = useState<ItineraryImageCatalogItem[]>([])
  const [imagePickerSectionId, setImagePickerSectionId] = useState<string | null>(null)
  const [imageSearch, setImageSearch] = useState('')
  const [imageStatus, setImageStatus] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [isLoadingImageCatalog, setIsLoadingImageCatalog] = useState(false)
  const [isMatchingImages, setIsMatchingImages] = useState(false)
  const [uploadingImageSectionId, setUploadingImageSectionId] = useState<string | null>(null)
  const autoMatchedDocumentKey = useRef<string | null>(null)
  const [exportStatus, setExportStatus] = useState<{
    docx: 'idle' | 'loading' | 'success' | 'error'
    pdf: 'idle' | 'loading' | 'success' | 'error'
    docxError?: string
    pdfError?: string
    docxFilename?: string
    pdfFilename?: string
  }>({ docx: 'idle', pdf: 'idle' })

  useEffect(() => {
    if (documentContent?.documentType !== 'tour_itinerary') {
      setImageCatalog([])
      setImageStatus(null)
      setImageError(null)
      setIsLoadingImageCatalog(false)
      return
    }

    let active = true
    setIsLoadingImageCatalog(true)
    fetch('/api/itinerary-images')
      .then(async response => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not load the itinerary image library.')
        if (active) setImageCatalog(result.images as ItineraryImageCatalogItem[])
      })
      .catch(error => {
        if (active) setImageError(error instanceof Error ? error.message : 'Could not load the image library.')
      })
      .finally(() => {
        if (active) setIsLoadingImageCatalog(false)
      })

    return () => { active = false }
  }, [documentContent?.documentType])

  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!documentContent) return
    if (documentContent.documentType === 'tour_itinerary' && !hasCurrentItineraryMap(documentContent)) {
      setViewMode('edit')
      setExportStatus(prev => ({
        ...prev,
        [format]: 'error',
        [`${format}Error`]: 'A real road map matching the current stops is required. The map editor is opening to create or upload one; export again after it appears on the cover.',
      }))
      return
    }
    
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

      const contentType = res.headers.get('content-type') || ''
      const isDocx = contentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      const isPdf = contentType.includes('application/pdf')
      if (res.ok && (isDocx || isPdf)) {
        const blob = await res.blob()
        const contentDisposition = res.headers.get('content-disposition') || ''
        const extension = isPdf ? 'pdf' : 'docx'
        const filename = contentDisposition.match(/filename="([^"]+)"/)?.[1] || `BeyondEscapes_Document.${extension}`
        if (isPdf) {
          setExportStatus(prev => ({ ...prev, pdf: 'success', pdfFilename: filename }))
        } else {
          setExportStatus(prev => ({ ...prev, docx: 'success', docxFilename: filename }))
        }

        const link = document.createElement('a')
        const downloadUrl = URL.createObjectURL(blob)
        link.href = downloadUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
        return
      }

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
    const updated = resetApproval({
      ...documentContent,
      sections: documentContent.sections.map(s =>
        s.id === updatedSection.id ? updatedSection : s
      ),
    })
    onDocumentUpdate(updated)
  }, [documentContent, onDocumentUpdate])

  const handleSectionDelete = useCallback((sectionId: string) => {
    if (!documentContent) return
    const updated = resetApproval({
      ...documentContent,
      sections: documentContent.sections.filter(s => s.id !== sectionId),
    })
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
    onDocumentUpdate(resetApproval({ ...documentContent, sections: newSections }))
  }, [documentContent, onDocumentUpdate])

  const handleTitleChange = useCallback((title: string) => {
    if (!documentContent) return
    onDocumentUpdate(resetApproval({ ...documentContent, title }))
  }, [documentContent, onDocumentUpdate])

  const handleIntakeFieldUpdate = useCallback((key: string, value: string) => {
    if (!documentContent?.intake) return
    const intake = {
      ...documentContent.intake,
      fields: { ...documentContent.intake.fields, [key]: value },
    }
    intake.missingFields = getMissingRequiredFields(intake)
    let updated: DocumentContent = { ...documentContent, intake }
    if (documentContent.documentType === 'tour_itinerary' && ['destinations', 'route', 'travelRoute'].includes(key)) {
      const routeText = intake.fields.destinations || intake.fields.route || intake.fields.travelRoute || ''
      updated = {
        ...updated,
        itineraryPages: {
          ...documentContent.itineraryPages,
          cover: {
            ...documentContent.itineraryPages?.cover,
            routeStops: getInitialRouteStops(routeText),
            mapImage: undefined,
            mapAttribution: undefined,
            mapRouteSignature: undefined,
          },
        },
      }
    }
    onDocumentUpdate(resetApproval(updated))
  }, [documentContent, onDocumentUpdate])

  const handleCoverPageUpdate = useCallback((updates: Partial<ItineraryCoverSettings>) => {
    if (!documentContent) return
    onDocumentUpdate(resetApproval({
      ...documentContent,
      itineraryPages: {
        ...documentContent.itineraryPages,
        cover: { ...documentContent.itineraryPages?.cover, ...updates },
      },
    }))
  }, [documentContent, onDocumentUpdate])

  const handleClosingPageUpdate = useCallback((updates: Partial<ItineraryClosingSettings>) => {
    if (!documentContent) return
    onDocumentUpdate(resetApproval({
      ...documentContent,
      itineraryPages: {
        ...documentContent.itineraryPages,
        closing: { ...documentContent.itineraryPages?.closing, ...updates },
      },
    }))
  }, [documentContent, onDocumentUpdate])

  const handleRouteStopsChange = useCallback((routeStops: ItineraryRouteStop[]) => {
    handleCoverPageUpdate({
      routeStops,
      mapImage: undefined,
      mapAttribution: undefined,
      mapRouteSignature: undefined,
    })
  }, [handleCoverPageUpdate])

  const handleMapImageChange = useCallback((
    mapImage: DocumentImage,
    mapAttribution: string,
    mapRouteSignature: string
  ) => {
    handleCoverPageUpdate({ mapImage, mapAttribution, mapRouteSignature })
  }, [handleCoverPageUpdate])

  const addImageToSection = useCallback((sectionId: string, image: DocumentImage) => {
    if (!documentContent) return
    const updated = resetApproval({
      ...documentContent,
      sections: documentContent.sections.map(section =>
        section.id === sectionId
          ? { ...section, images: [...(section.images ?? []), image] }
          : section
      ),
    })
    onDocumentUpdate(updated)
  }, [documentContent, onDocumentUpdate])

  const handlePickLibraryImage = async (item: ItineraryImageCatalogItem) => {
    if (!imagePickerSectionId) return
    setImageError(null)
    try {
      const response = await fetch(item.url)
      if (!response.ok) throw new Error(`Could not load ${item.title}.`)
      const blob = await response.blob()
      const src = await readBlobAsDataUrl(blob)
      addImageToSection(imagePickerSectionId, {
        catalogId: item.id,
        src,
        altText: item.title,
        caption: item.title,
        width: item.width,
        height: item.height,
      })
      setImagePickerSectionId(null)
      setImageSearch('')
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Could not add that image.')
    }
  }

  const handleUploadImage = async (sectionId: string, file: File) => {
    setUploadingImageSectionId(sectionId)
    setImageError(null)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await fetch('/api/itinerary-images', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Image upload failed.')

      const item = result.image as ItineraryImageCatalogItem
      const imageResponse = await fetch(item.url)
      if (!imageResponse.ok) throw new Error(`Uploaded ${item.title}, but could not read it back.`)
      const src = await readBlobAsDataUrl(await imageResponse.blob())
      setImageCatalog(current => [item, ...current.filter(image => image.id !== item.id)])
      addImageToSection(sectionId, {
        catalogId: item.id,
        src,
        altText: item.title,
        caption: item.title,
        width: item.width,
        height: item.height,
      })
      setImageStatus(`Added “${item.title}” to the itinerary.`)
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Image upload failed.')
    } finally {
      setUploadingImageSectionId(null)
    }
  }

  const handleRemoveImage = useCallback((sectionId: string, imageIndex: number) => {
    if (!documentContent) return
    onDocumentUpdate(resetApproval({
      ...documentContent,
      sections: documentContent.sections.map(section => section.id === sectionId
        ? { ...section, images: section.images?.filter((_, index) => index !== imageIndex) }
        : section
      ),
    }))
  }, [documentContent, onDocumentUpdate])

  const handleAutoMatchImages = useCallback(async () => {
    if (!documentContent) return
    setImageError(null)
    setImageStatus(null)
    const matches = suggestItineraryImageMatches(documentContent.sections, imageCatalog)
    if (!matches.size) {
      setImageStatus(imageCatalog.length
        ? 'No confident location matches found. You can choose or upload photos for each section.'
        : 'No image library is loaded. Import the ZIP or add photos from your device.')
      return
    }

    setIsMatchingImages(true)
    try {
      const resolved = await Promise.all([...matches].map(async ([sectionId, item]) => {
        const response = await fetch(item.url)
        if (!response.ok) throw new Error(`Could not load the matched image “${item.title}”.`)
        const src = await readBlobAsDataUrl(await response.blob())
        return [sectionId, {
          catalogId: item.id,
          src,
          altText: item.title,
          caption: item.title,
          width: item.width,
          height: item.height,
        } satisfies DocumentImage] as const
      }))
      const imagesBySection = new Map(resolved)
      onDocumentUpdate(resetApproval({
        ...documentContent,
        sections: documentContent.sections.map(section => {
          const image = imagesBySection.get(section.id)
          return image ? { ...section, images: [...(section.images ?? []), image] } : section
        }),
      }))
      setImageStatus(`Added ${resolved.length} location-matched photo${resolved.length === 1 ? '' : 's'}. Review them in the preview or edit each section.`)
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Could not match itinerary images.')
    } finally {
      setIsMatchingImages(false)
    }
  }, [documentContent, imageCatalog, onDocumentUpdate])

  useEffect(() => {
    const documentKey = documentContent
      ? `${documentContent.metadata.generatedAt}:${documentContent.metadata.prompt}`
      : null
    if (
      documentContent?.documentType !== 'tour_itinerary' ||
      imageCatalog.length === 0 ||
      !documentKey ||
      autoMatchedDocumentKey.current === documentKey
    ) return

    autoMatchedDocumentKey.current = documentKey
    void handleAutoMatchImages()
  }, [documentContent?.documentType, documentContent?.metadata.generatedAt, documentContent?.metadata.prompt, imageCatalog, handleAutoMatchImages])

  const handleSaveLocally = async () => {
    setSaveError(null)
    try {
      await onSaveDocument()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this document locally.')
    }
  }

  const missingRequiredFields = documentContent?.intake
    ? getMissingRequiredFields(documentContent.intake)
    : []

  const handleApprovalToggle = () => {
    if (!documentContent || (documentContent.approval?.status !== 'approved' && missingRequiredFields.length > 0)) return
    const approval = documentContent.approval?.status === 'approved'
      ? { status: 'draft' as const }
      : { status: 'approved' as const, approvedAt: new Date().toISOString() }
    onDocumentUpdate({ ...documentContent, approval })
  }

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
    <div className="flex flex-col h-full min-h-0 bg-white">
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
        {documentContent.documentType === 'tour_itinerary' ? (
          <span className="text-xs font-medium text-gray-700">
            Beyond Escapes Official <span className="font-normal text-gray-400">(fixed for itinerary branding)</span>
          </span>
        ) : (
          <select
            value={selectedThemeId}
            onChange={e => onThemeChange(e.target.value)}
            className="text-xs border-0 bg-transparent text-gray-700 font-medium focus:outline-none cursor-pointer flex-1 max-w-xs"
          >
            {themes.map(theme => (
              <option key={theme.id} value={theme.id}>{theme.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Document Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {documentContent.documentType === 'tour_itinerary' && (
          <div className="px-4 pt-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-2.5">
              <ImagePlus size={15} className="text-blue-600" />
              <span className="flex-1 text-xs text-blue-900">
                {isLoadingImageCatalog
                  ? 'Loading destination photos...'
                  : imageCatalog.length
                  ? `${imageCatalog.length} destination photos available`
                  : 'Add destination photos to your itinerary'}
              </span>
              <button
                type="button"
                onClick={handleAutoMatchImages}
                disabled={isLoadingImageCatalog || isMatchingImages || imageCatalog.length === 0}
                className="rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isMatchingImages ? 'Matching...' : 'Auto-match locations'}
              </button>
            </div>
            {imageStatus && <p className="mt-1.5 text-[10px] text-green-700">{imageStatus}</p>}
            {imageError && <p className="mt-1.5 text-[10px] text-red-600">{imageError}</p>}
          </div>
        )}
        {viewMode === 'preview' ? (
          <DocumentPreview documentContent={documentContent} />
        ) : (
          <DocumentEditor
            documentContent={documentContent}
            onSectionUpdate={handleSectionUpdate}
            onSectionDelete={handleSectionDelete}
            onAddSection={handleAddSection}
            onTitleChange={handleTitleChange}
            onIntakeFieldUpdate={handleIntakeFieldUpdate}
            onCoverPageUpdate={handleCoverPageUpdate}
            onClosingPageUpdate={handleClosingPageUpdate}
            onRouteStopsChange={handleRouteStopsChange}
            onMapImageChange={handleMapImageChange}
            onImagePick={setImagePickerSectionId}
            onImageUpload={handleUploadImage}
            onImageRemove={handleRemoveImage}
            uploadingImageSectionId={uploadingImageSectionId}
          />
        )}
      </div>

      {/* Export Panel */}
      <div className="shrink-0 max-h-[35vh] overflow-y-auto border-t border-gray-200 px-4 py-3 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={handleSaveLocally}
            disabled={saveStatus === 'saving'}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {saveStatus === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saveStatus === 'saving' ? 'Saving...' : 'Save locally'}
          </button>
          <button
            onClick={handleApprovalToggle}
            disabled={documentContent.approval?.status !== 'approved' && missingRequiredFields.length > 0}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50 ${
              documentContent.approval?.status === 'approved'
                ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <BadgeCheck size={14} />
            {documentContent.approval?.status === 'approved' ? 'Reopen as draft' : 'Approve document'}
          </button>
        </div>
        <div className="flex items-center justify-between mb-2 text-[10px]">
          <span className={saveStatus === 'error' ? 'text-red-600' : 'text-gray-400'}>
            {saveStatus === 'error'
              ? saveError || 'Local save failed. Retry to save.'
              : saveStatus === 'saving'
                ? 'Saving changes locally...'
                : saveStatus === 'saved'
                  ? 'Saved locally'
                  : 'Changes save to this device'}
          </span>
          <span className={documentContent.approval?.status === 'approved' ? 'text-green-700' : 'text-amber-700'}>
            {documentContent.approval?.status === 'approved' ? 'Approved' : 'Draft - not approved'}
          </span>
        </div>
        {missingRequiredFields.length > 0 && (
          <p className="text-[10px] text-amber-700 mb-2">
            Complete these required fields before approval: {missingRequiredFields
              .map(key => getDocumentFieldLabel(documentContent.intake!.documentType, key))
              .join(', ')}
          </p>
        )}
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
      {imagePickerSectionId && (
        <ItineraryImagePicker
          images={imageCatalog}
          search={imageSearch}
          onSearch={setImageSearch}
          onSelect={handlePickLibraryImage}
          onClose={() => { setImagePickerSectionId(null); setImageSearch('') }}
        />
      )}
    </div>
  )
}

// Document Preview Component
function DocumentPreview({ documentContent }: { documentContent: DocumentContent }) {
  if (documentContent.documentType === 'tour_itinerary') {
    return <ItineraryDocumentPreview documentContent={documentContent} />
  }

  const documentType = documentContent.documentType
  const documentLabel = documentType ? BUSINESS_DOCUMENT_TEMPLATES[documentType].label : 'Travel Document'
  const isRoomReservation = documentType === 'room_reservation'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Document Header Preview */}
      <div className={`mb-6 ${isRoomReservation ? 'pb-3' : 'pb-4 border-b border-gray-200'}`}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <Image
            src="/images/beyond_escapes_logo.png"
            alt="Beyond Escapes"
            width={220}
            height={36}
            className="h-9 w-auto object-contain object-left"
          />
          {isRoomReservation
            ? <Image src="/images/beyond_escapes_icon.png" alt="Beyond Escapes" width={42} height={42} className="h-9 w-9 object-contain" />
            : <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">{documentLabel}</p>
                <p className="text-[9px] text-gray-500">Beyond Escapes | Sri Lanka</p>
              </div>}
        </div>
        {!isRoomReservation && <h1 className="text-lg font-bold text-gray-900 font-serif">{documentContent.title}</h1>}
      </div>

      {documentContent.intake && (
        <DocumentIntakePreview intake={documentContent.intake} />
      )}

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

function ItineraryDocumentPreview({ documentContent }: { documentContent: DocumentContent }) {
  const pageContent = getItineraryPageContent(documentContent)
  const sections = extractItinerarySections(documentContent.sections).remaining
  const fields = documentContent.intake?.fields ?? {}
  const cover = documentContent.itineraryPages?.cover ?? {}
  const closing = documentContent.itineraryPages?.closing ?? {}
  const routeText = fields.destinations?.trim() || fields.route?.trim() || fields.travelRoute?.trim()
  const routeStops = cover.routeStops ?? getInitialRouteStops(routeText)
  const routePlan = routeText || routeStops.map(stop => stop.name).join(' - ')
  const itinerarySections = sections.at(-1)?.type === 'page_break' ? sections.slice(0, -1) : sections

  return (
    <div className="space-y-5 p-5 max-w-3xl mx-auto">
      <article className="overflow-hidden rounded-lg border border-gray-200 bg-white p-5 shadow-sm doc-preview">
        <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-2">
          <Image
            src="/images/beyond_escapes_logo.png"
            alt="Beyond Escapes"
            width={220}
            height={36}
            className="h-8 w-auto object-contain object-left"
          />
          <div className="text-right font-sans">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-blue-700">Tour Itinerary</p>
            <p className="text-[8px] text-gray-500">Beyond Escapes | Sri Lanka</p>
          </div>
        </div>
        <h1 className="mb-2 text-center font-serif text-xl font-bold text-[#3973B9]">{documentContent.title}</h1>
        <Image
          src="/images/sri-lanka-ayubowan.png"
          alt="Ayubowan welcome banner with a Sri Lankan woman greeting in English and Sinhala"
          width={2167}
          height={726}
          className="mb-1 h-auto w-full rounded-md object-contain"
        />
        <div className="grid grid-cols-[0.8fr_1.2fr] gap-3">
          <div className="rounded-md bg-[#F4F8F5] p-2">
            <p className="mb-1 text-center font-sans text-[9px] font-bold text-[#3973B9]">SRI LANKA ROUTE MAP</p>
            <CoverMapPreview image={cover.mapImage} />
            <p className="mt-1 text-center font-sans text-[7px] text-gray-500">
              {cover.mapAttribution || 'Road map screenshot not saved'}
            </p>
          </div>
          <div className="space-y-2">
            <div>
              <h2 className="text-[11px] font-bold text-[#3973B9]">YOUR JOURNEY AT A GLANCE</h2>
              <p className="text-[9px] leading-relaxed text-gray-700">{pageContent.overview}</p>
            </div>
            <div>
              <h2 className="text-[10px] font-bold text-[#668678]">A WARM WELCOME</h2>
              <p className="text-[9px] leading-relaxed text-gray-700">{pageContent.welcome}</p>
            </div>
            {routePlan && (
              <div>
                <h2 className="text-[10px] font-bold text-[#3973B9]">ROUTE PLAN</h2>
                <p className="text-[9px] font-semibold text-gray-700">{routePlan}</p>
              </div>
            )}
            <div className="text-[8px] leading-relaxed text-gray-600">
              {fields.tripDuration && <p>Trip duration: {fields.tripDuration}</p>}
              {fields.travelDates && <p>Travel dates: {fields.travelDates}</p>}
              <p>Prepared by: {pageContent.preparedBy}</p>
              <p>{closing.phone ?? '+94 112 579 679'}</p>
              <p>{closing.email ?? 'tours@beyondescapes.com'}</p>
            </div>
          </div>
        </div>
        <p className="mt-3 border-t border-gray-100 pt-2 text-center font-sans text-[8px] text-gray-400">Page 1 | Editable cover page</p>
      </article>

      <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <p className="mb-3 font-sans text-[9px] font-semibold uppercase tracking-wide text-blue-700">Itinerary details</p>
        <div className="space-y-1 doc-preview">
          {itinerarySections.map(section => <SectionPreview key={section.id} section={section} />)}
        </div>
      </article>

      <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm doc-preview">
        <Image
          src="/images/beyond_escapes_logo.png"
          alt="Beyond Escapes"
          width={220}
          height={36}
          className="mx-auto mb-4 h-9 w-auto object-contain"
        />
        <div className="rounded-sm bg-[#3973B9] px-3 py-1.5 text-center font-sans text-xs font-bold text-white">
          CANCELLATION POLICY
        </div>
        <ul className="my-4 space-y-2 text-xs text-gray-700">
          {pageContent.cancellationPolicy.map((item, index) => <li key={index}>• {item}</li>)}
        </ul>
        <p className="my-6 text-center text-xs font-bold">****END OF SERVICES****</p>
        <div className="rounded-sm bg-[#3973B9] px-3 py-1.5 text-center font-sans text-xs font-bold text-white">
          {pageContent.companyName}
        </div>
        <div className="mt-2 space-y-1 text-center text-[10px] text-gray-600">
          <p>{pageContent.phone}</p>
          <p>{pageContent.email}</p>
          <p>{pageContent.address}</p>
        </div>
        <p className="mt-3 text-center font-sans text-[8px] text-gray-400">Final page | Editable cancellation and contact details</p>
      </article>
    </div>
  )
}

function CoverMapPreview({
  image,
}: {
  image?: DocumentImage
}) {
  if (image) {
    return (
      <Image
        src={image.src}
        alt={image.altText}
        width={image.width}
        height={image.height}
        unoptimized
        className="max-h-64 w-full rounded object-contain"
      />
    )
  }

  return (
    <div role="status" className="mx-auto flex min-h-40 max-h-64 w-full items-center justify-center rounded bg-blue-50 px-3 text-center text-xs text-blue-800">
      A real road map will appear here after the map editor generates or uploads one.
    </div>
  )
}

function DocumentIntakePreview({ intake }: { intake: NonNullable<DocumentContent['intake']> }) {
  const template = BUSINESS_DOCUMENT_TEMPLATES[intake.documentType]
  const fields = template.fields.filter(field => intake.fields[field.key]?.trim())
  const get = (key: string) => intake.fields[key]?.trim()

  if (!fields.length) return null

  if (intake.documentType === 'room_reservation') {
    const roomCount = (field: string, code: string, fullName: string) => {
      const value = get(field)
      if (value) return value
      const allocation = get('roomAllocation') || ''
      const match = new RegExp(`(?:\\b(\\d+)\\s*(?:${code}|${fullName})\\b|\\b(?:${code}|${fullName})\\s*[:= -]?\\s*(\\d+)\\b)`, 'i')
        .exec(allocation)
      return match?.[1] || match?.[2]?.padStart(2, '0') || ''
    }
    const metadataFields = [
      ['Tour Number', 'tourNumber'],
      ['Market', 'market'],
      ['Date', 'documentDate'],
    ] as const

    return (
      <div className="mb-5 text-[12px] leading-[1.25] text-gray-900 font-sans">
        <h1 className="mb-10 text-center text-base font-bold tracking-wide">ROOM RESERVATION</h1>
        <div className="mb-5">
          {metadataFields.filter(([, key]) => get(key)).map(([label, key]) => (
            <p key={key}><strong>{label}:</strong> {get(key)}</p>
          ))}
          {(get('hotel') || get('location')) && (
            <div className="mt-8">
              {get('hotel') && <p><strong>Hotel:</strong> {get('hotel')}</p>}
              {get('location') && <p><strong>Location:</strong> {get('location')}</p>}
            </div>
          )}
        </div>
        <table className="w-full table-fixed border-collapse border border-black text-[10px]">
          <colgroup>
            {[15.42, 33.64, 12.48, 7.79, 9.35, 7.4, 9.61, 4.29].map((width, index) => (
              <col key={index} style={{ width: `${width}%` }} />
            ))}
          </colgroup>
          <tbody>
            <tr>
              {[
                ['CLIENT NAME', get('clientName')],
                ['ADULT', get('adults')],
                ['CHILD', get('children')],
                ['INFANT', get('infants')],
              ].flatMap(([label, value]) => [
                <th key={`${label}-label`} className="border border-black bg-[#D9D9D9] px-1 py-1 text-left font-bold whitespace-nowrap">{label}</th>,
                <td key={`${label}-value`} className="border border-black px-1 py-1">{value || ''}</td>,
              ])}
            </tr>
          </tbody>
        </table>

        <table className="mt-4 w-full table-fixed border-collapse border border-black text-center text-[10px]">
          <colgroup>
            {[19.57, 18.18, 7.22, 6.49, 6.49, 6.49, 6.49, 18.18, 10.88].map((width, index) => (
              <col key={index} style={{ width: `${width}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {['CHECK-IN', 'CHECK-OUT', 'BASIS', 'SGL', 'DBL', 'TWN', 'TPL', 'ROOM CATEGORY', 'NIGHTS'].map(label => (
                <th key={label} className="border border-black bg-[#D9D9D9] px-1 py-1 font-bold whitespace-nowrap">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {[
                get('checkIn'),
                get('checkOut'),
                get('basis'),
                roomCount('singleRooms', 'SGL', 'SINGLES?'),
                roomCount('doubleRooms', 'DBL', 'DOUBLES?'),
                roomCount('twinRooms', 'TWN', 'TWINS?'),
                roomCount('tripleRooms', 'TPL', 'TRIPLES?'),
                get('roomCategory'),
                get('nights'),
              ].map((value, index) => (
                <td key={index} className="border border-black px-1 py-1">{value || ''}</td>
              ))}
            </tr>
          </tbody>
        </table>

        <div className="mt-9 border border-black">
          <h2 className="bg-[#D9D9D9] px-2 py-1 text-[10px] font-bold">REMARKS:</h2>
          <ul className="list-disc space-y-0.5 px-7 py-2 text-[11px]">
            {(get('remarks') || '').split(/\r?\n/).filter(line => line.trim()).map((line, index) => (
              <li key={index}>{line.trim().replace(/^[•*-]\s*/, '')}</li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <dl className="mb-5 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
      {fields.map(field => (
        <div key={field.key} className="contents">
          <dt className="font-semibold text-gray-600">{field.label}</dt>
          <dd className="min-w-0 text-gray-800 whitespace-pre-wrap break-words">{intake.fields[field.key]}</dd>
        </div>
      ))}
    </dl>
  )
}

function SectionPreview({ section }: { section: DocumentSection }) {
  return (
    <>
      <SectionBody section={section} />
      {section.images?.map((image, index) => (
        <figure key={`${section.id}-image-${index}`} className="my-3">
          <Image
            src={image.src}
            alt={image.altText}
            width={image.width}
            height={image.height}
            unoptimized
            className="mx-auto max-h-[360px] w-auto max-w-full rounded-lg object-contain"
          />
          {image.caption && (
            <figcaption className="mt-1 text-center text-xs text-gray-500">{image.caption}</figcaption>
          )}
        </figure>
      ))}
    </>
  )
}

function SectionBody({ section }: { section: DocumentSection }) {
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
  onIntakeFieldUpdate,
  onCoverPageUpdate,
  onClosingPageUpdate,
  onRouteStopsChange,
  onMapImageChange,
  onImagePick,
  onImageUpload,
  onImageRemove,
  uploadingImageSectionId,
}: {
  documentContent: DocumentContent
  onSectionUpdate: (section: DocumentSection) => void
  onSectionDelete: (id: string) => void
  onAddSection: (afterId: string, type: DocumentSection['type']) => void
  onTitleChange: (title: string) => void
  onIntakeFieldUpdate: (key: string, value: string) => void
  onCoverPageUpdate: (updates: Partial<ItineraryCoverSettings>) => void
  onClosingPageUpdate: (updates: Partial<ItineraryClosingSettings>) => void
  onRouteStopsChange: (stops: ItineraryRouteStop[]) => void
  onMapImageChange: (image: DocumentImage, attribution: string, routeSignature: string) => void
  onImagePick: (sectionId: string) => void
  onImageUpload: (sectionId: string, file: File) => void
  onImageRemove: (sectionId: string, index: number) => void
  uploadingImageSectionId: string | null
}) {
  const sectionsToEdit = documentContent.documentType === 'tour_itinerary'
    ? extractItinerarySections(documentContent.sections).remaining
    : documentContent.sections

  return (
    <div className="p-4 space-y-2">
      {documentContent.intake && (
        <StructuredFieldsEditor
          intake={documentContent.intake}
          onFieldUpdate={onIntakeFieldUpdate}
        />
      )}

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

      {documentContent.documentType === 'tour_itinerary' && (
        <ItineraryPagesEditor
          documentContent={documentContent}
          onCoverPageUpdate={onCoverPageUpdate}
          onClosingPageUpdate={onClosingPageUpdate}
          onRouteStopsChange={onRouteStopsChange}
          onMapImageChange={onMapImageChange}
        />
      )}

      {/* Sections */}
      {sectionsToEdit.map(section => (
        <SectionEditor
          key={section.id}
          section={section}
          onUpdate={onSectionUpdate}
          onDelete={() => onSectionDelete(section.id)}
          onAddAfter={(type) => onAddSection(section.id, type)}
          showImageTools={documentContent.documentType === 'tour_itinerary'}
          onImagePick={() => onImagePick(section.id)}
          onImageUpload={file => onImageUpload(section.id, file)}
          onImageRemove={index => onImageRemove(section.id, index)}
          isUploadingImage={uploadingImageSectionId === section.id}
        />
      ))}

      {/* Add Section Button */}
      <AddSectionButton onAdd={(type) => {
        const lastId = sectionsToEdit[sectionsToEdit.length - 1]?.id || 'none'
        onAddSection(lastId, type)
      }} />
    </div>
  )
}

function ItineraryPagesEditor({
  documentContent,
  onCoverPageUpdate,
  onClosingPageUpdate,
  onRouteStopsChange,
  onMapImageChange,
}: {
  documentContent: DocumentContent
  onCoverPageUpdate: (updates: Partial<ItineraryCoverSettings>) => void
  onClosingPageUpdate: (updates: Partial<ItineraryClosingSettings>) => void
  onRouteStopsChange: (stops: ItineraryRouteStop[]) => void
  onMapImageChange: (image: DocumentImage, attribution: string, routeSignature: string) => void
}) {
  const pageContent = getItineraryPageContent(documentContent)
  const cover = documentContent.itineraryPages?.cover ?? {}
  const closing = documentContent.itineraryPages?.closing ?? {}
  const fields = documentContent.intake?.fields ?? {}
  const routeText = fields.destinations?.trim() || fields.route?.trim() || fields.travelRoute?.trim() || ''
  const routeStops = cover.routeStops ?? getInitialRouteStops(routeText)

  return (
    <section className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <div>
        <h3 className="text-xs font-semibold text-blue-900">Cover & final page editor</h3>
        <p className="text-[10px] text-blue-700">These fields stay editable in Word. Artwork and maps are images only.</p>
      </div>

      <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
        <h4 className="text-[11px] font-semibold text-gray-800">First page</h4>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-gray-600">Journey overview</span>
          <textarea
            value={pageContent.overview}
            onChange={event => onCoverPageUpdate({ overview: event.target.value })}
            rows={4}
            className="w-full resize-y rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-gray-600">Ayubowan welcome message</span>
          <textarea
            value={pageContent.welcome}
            onChange={event => onCoverPageUpdate({ welcome: event.target.value })}
            rows={3}
            className="w-full resize-y rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-gray-600">Prepared by</span>
          <input
            value={cover.preparedBy ?? pageContent.preparedBy}
            onChange={event => onCoverPageUpdate({ preparedBy: event.target.value })}
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-400"
          />
        </label>

        <ItineraryMapEditor
          routeStops={routeStops}
          mapImage={cover.mapImage}
          mapRouteSignature={cover.mapRouteSignature}
          onRouteStopsChange={onRouteStopsChange}
          onMapImageChange={onMapImageChange}
        />
        {cover.mapImage && (
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium text-gray-600">Map attribution / source</span>
            <input
              value={cover.mapAttribution ?? ''}
              onChange={event => onCoverPageUpdate({ mapAttribution: event.target.value })}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-400"
            />
          </label>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
        <h4 className="text-[11px] font-semibold text-gray-800">Last page</h4>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-gray-600">Cancellation policy (one term per line)</span>
          <textarea
            value={pageContent.cancellationPolicy.join('\n')}
            onChange={event => onClosingPageUpdate({
              cancellationPolicy: event.target.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
            })}
            rows={4}
            className="w-full resize-y rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-400"
          />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([
            ['companyName', 'Company name', pageContent.companyName],
            ['phone', 'Phone', pageContent.phone],
            ['email', 'Email / website', pageContent.email],
            ['address', 'Address', pageContent.address],
          ] as const).map(([key, label, value]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-[10px] font-medium text-gray-600">{label}</span>
              <textarea
                value={value}
                onChange={event => onClosingPageUpdate({ [key]: event.target.value })}
                rows={key === 'address' ? 2 : 1}
                className="w-full resize-y rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-400"
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  )
}

function StructuredFieldsEditor({
  intake,
  onFieldUpdate,
}: {
  intake: NonNullable<DocumentContent['intake']>
  onFieldUpdate: (key: string, value: string) => void
}) {
  const template = BUSINESS_DOCUMENT_TEMPLATES[intake.documentType]
  const requiredKeys = new Set(template.requiredFields)
  const fields = template.fields.filter(field => requiredKeys.has(field.key) || intake.fields[field.key]?.trim())

  return (
    <section className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
      <div className="mb-2">
        <h3 className="text-xs font-semibold text-blue-900">Extracted {template.label} details</h3>
        <p className="text-[10px] text-blue-700">Edit these structured fields before approval or export.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {fields.map(field => (
          <label key={field.key} className="block">
            <span className="block text-[10px] font-medium text-gray-600 mb-1">
              {field.label}{requiredKeys.has(field.key) ? ' *' : ''}
            </span>
            <textarea
              value={intake.fields[field.key] || ''}
              onChange={event => onFieldUpdate(field.key, event.target.value)}
              rows={field.key === 'keyPoints' || field.key === 'lineItems' || field.key === 'remarks' ? 3 : 1}
              className="w-full resize-y rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-400"
            />
          </label>
        ))}
      </div>
      {intake.missingFields.length > 0 && (
        <p className="mt-2 text-[10px] text-amber-700">
          Required details still missing: {intake.missingFields
            .map(key => getDocumentFieldLabel(intake.documentType, key))
            .join(', ')}
        </p>
      )}
    </section>
  )
}

function SectionEditor({
  section,
  onUpdate,
  onDelete,
  onAddAfter,
  showImageTools,
  onImagePick,
  onImageUpload,
  onImageRemove,
  isUploadingImage,
}: {
  section: DocumentSection
  onUpdate: (s: DocumentSection) => void
  onDelete: () => void
  onAddAfter: (type: DocumentSection['type']) => void
  showImageTools: boolean
  onImagePick: () => void
  onImageUpload: (file: File) => void
  onImageRemove: (index: number) => void
  isUploadingImage: boolean
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

        {showImageTools && (
          <div className="mt-3 border-t border-gray-100 pt-2">
            {section.images?.map((image, index) => (
              <div key={`${section.id}-image-${index}`} className="mb-2 flex items-center gap-2 rounded-md bg-gray-50 p-1.5">
                <Image
                  src={image.src}
                  alt={image.altText}
                  width={72}
                  height={48}
                  unoptimized
                  className="h-12 w-[72px] rounded object-cover"
                />
                <span className="flex-1 truncate text-[10px] text-gray-600">{image.caption || image.altText}</span>
                <button
                  type="button"
                  onClick={() => onImageRemove(index)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title="Remove image"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onImagePick}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50"
              >
                <ImagePlus size={12} /> Choose library photo
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50">
                {isUploadingImage ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {isUploadingImage ? 'Uploading...' : 'Add from device'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={isUploadingImage}
                  onChange={event => {
                    const file = event.currentTarget.files?.[0]
                    if (file) onImageUpload(file)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </div>
          </div>
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

function ItineraryImagePicker({
  images,
  search,
  onSearch,
  onSelect,
  onClose,
}: {
  images: ItineraryImageCatalogItem[]
  search: string
  onSearch: (value: string) => void
  onSelect: (image: ItineraryImageCatalogItem) => void
  onClose: () => void
}) {
  const query = search.trim().toLowerCase()
  const filteredImages = images
    .map(image => ({ image, score: query ? scoreItineraryImage(query, image) : 0 }))
    .filter(({ image, score }) => !query || score > 0 || `${image.title} ${image.sourcePath}`.toLowerCase().includes(query))
    .sort((left, right) => right.score - left.score || left.image.title.localeCompare(right.image.title))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="itinerary-image-picker-title"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 p-4">
          <div className="flex-1">
            <h2 id="itinerary-image-picker-title" className="text-sm font-semibold text-gray-900">Choose a destination photo</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">Photos are optimized and embedded in this document.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close image picker">
            <X size={16} />
          </button>
        </div>
        <label className="relative m-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={event => onSearch(event.target.value)}
            placeholder="Search Colombo, Kandy, Sigiriya..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-400"
          />
        </label>
        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-3 pt-0 sm:grid-cols-3">
          {filteredImages.map(({ image }) => (
            <button
              key={image.id}
              type="button"
              onClick={() => onSelect(image)}
              className="overflow-hidden rounded-lg border border-gray-200 text-left hover:border-blue-400 hover:shadow-sm"
            >
              <Image
                src={image.url}
                alt={image.title}
                width={image.width}
                height={image.height}
                unoptimized
                className="h-28 w-full bg-gray-100 object-cover"
              />
              <span className="block truncate px-2 py-1.5 text-[11px] font-medium text-gray-700">{image.title}</span>
            </button>
          ))}
          {filteredImages.length === 0 && (
            <p className="col-span-full py-10 text-center text-xs text-gray-500">No matching photos found. Upload one from your device in the section editor.</p>
          )}
        </div>
      </section>
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
