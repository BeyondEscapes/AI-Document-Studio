'use client'

import { useState, useCallback, useEffect, useRef, useId } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import {
  FileText, Download, X, Edit3, Eye, FileDown,
  ChevronDown, Trash2, Plus, AlertCircle,
  CheckCircle, Loader2, Palette, RefreshCw, Save, BadgeCheck,
  ImagePlus, Search, Upload, Sliders,
} from 'lucide-react'
import { BUSINESS_DOCUMENT_TEMPLATES, getDocumentFieldLabel, getMissingRequiredFields } from '@/lib/business-documents'
import {
  isItineraryDocument,
  prepareDocumentForLocalSave,
  scoreItineraryImage,
  suggestItineraryPageImages,
  suggestItineraryImageMatches,
} from '@/lib/itinerary-images'
import { folderKey, imageSearchText, itineraryPhotoFolder, uniqueImageFolders } from '@/lib/image-folders'
import { ItineraryPhotoReplacement } from './ItineraryPhotoReplacement'
import { getInitialRouteStops } from '@/lib/itinerary-route'
import { extractItinerarySections, getItineraryPageContent } from '@/lib/itinerary-page-content'
import { applyDetailLevel, DETAIL_LEVEL_CONFIGS } from '@/lib/itinerary-detail-levels'
import type {
  DocumentContent,
  DocumentImage,
  DocumentSection,
  DocumentTheme,
  ItineraryClosingSettings,
  ItineraryCoverSettings,
  ItineraryImageCatalogItem,
  ItineraryRouteStop,
  ItineraryDetailLevel,
} from '@/types'

const ItineraryMapEditor = dynamic(() => import('@/components/ItineraryMapEditor'), { ssr: false })

interface DocumentWorkspaceProps {
  startInEdit?: boolean
  cloudDocuments?: boolean
  serverPdfAvailable: boolean
  documentContent: DocumentContent | null
  themes: DocumentTheme[]
  selectedThemeId: string
  onThemeChange: (themeId: string) => void
  onDocumentUpdate: (content: DocumentContent) => void
  onSaveDocument: () => Promise<void>
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  saveError?: string | null
  onClose: () => void
}

type ViewMode = 'preview' | 'edit'

function resetApproval(content: DocumentContent): DocumentContent {
  return { ...content, approval: { status: 'draft' } }
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
  onSaveDocument, saveStatus, saveError, onClose, startInEdit, cloudDocuments, serverPdfAvailable
}: DocumentWorkspaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(startInEdit ? 'edit' : 'preview')
  const [manualSaveError, setManualSaveError] = useState<string | null>(null)
  const [imageCatalog, setImageCatalog] = useState<ItineraryImageCatalogItem[]>([])
  const [imagePickerSectionId, setImagePickerSectionId] = useState<string | null>(null)
  const [replacement, setReplacement] = useState<{ sectionId: string; index: number; photo: DocumentImage }>()
  const [imageSearch, setImageSearch] = useState('')
  const [imageStatus, setImageStatus] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [isLoadingImageCatalog, setIsLoadingImageCatalog] = useState(false)
  const [isMatchingImages, setIsMatchingImages] = useState(false)
  const [uploadingImageSectionId, setUploadingImageSectionId] = useState<string | null>(null)
  const autoMatchedDocumentKey = useRef<string | null>(null)
  const [browserPdf, setBrowserPdf] = useState(!serverPdfAvailable)
  const [printDocument, setPrintDocument] = useState<DocumentContent | null>(null)
  const printSheet = useRef<HTMLDivElement>(null)
  const [exportStatus, setExportStatus] = useState<{
    docx: 'idle' | 'loading' | 'success' | 'error'
    pdf: 'idle' | 'loading' | 'success' | 'error'
    docxError?: string
    pdfError?: string
    docxFilename?: string
    pdfFilename?: string
  }>({ docx: 'idle', pdf: 'idle' })

  const isItinerary = isItineraryDocument(documentContent)

  useEffect(() => {
    if (!printDocument || !printSheet.current) return
    const sheet = printSheet.current
    const originalTitle = document.title
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    function finish() {
      setPrintDocument(null)
    }
    window.addEventListener('afterprint', finish, { once: true })
    const images = [...sheet.querySelectorAll('img')].map(image => {
      image.loading = 'eager'
      return image.decode().catch(() => undefined)
    })
    void Promise.race([
      Promise.all(images),
      new Promise<void>(resolve => { timer = setTimeout(resolve, 4000) }),
    ]).then(() => {
      if (cancelled) return
      document.title = printDocument.title || 'Beyond Escapes document'
      window.print()
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.title = originalTitle
      window.removeEventListener('afterprint', finish)
    }
  }, [printDocument])

  useEffect(() => {
    if (!isItinerary) {
      setImageCatalog([])
      setImageStatus(null)
      setImageError(null)
      setIsLoadingImageCatalog(false)
      return
    }

    const controller = new AbortController()
    setIsLoadingImageCatalog(true)
    fetch('/api/itinerary-images', { signal: controller.signal })
      .then(async response => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not load the itinerary image library.')
        if (!controller.signal.aborted) setImageCatalog(result.images as ItineraryImageCatalogItem[])
      })
      .catch(error => {
        if (!controller.signal.aborted) setImageError(error instanceof Error ? error.message : 'Could not load the image library.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingImageCatalog(false)
      })

    return () => controller.abort()
  }, [isItinerary])

  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!documentContent) return
    if (isItineraryDocument(documentContent) && !hasCurrentItineraryMap(documentContent)) {
      setViewMode('edit')
      setExportStatus(prev => ({
        ...prev,
        [format]: 'error',
        [`${format}Error`]: 'A real road map matching the current stops is required. The map editor is opening to create or upload one; export again after it appears on the cover.',
      }))
      return
    }
    if (format === 'pdf' && browserPdf) {
      setExportStatus(prev => ({ ...prev, pdf: 'idle', pdfError: undefined }))
      setPrintDocument(documentContent)
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
          documentContent: prepareDocumentForLocalSave(documentContent),
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

      const responseText = await res.text()
      let data:
        | { success: true; filename: string; downloadUrl: string }
        | {
            success?: false
            error?: string
            docxAvailable?: boolean
            docxFilename?: string
            docxDownloadUrl?: string
            browserPdfAvailable?: boolean
          }
      try {
        data = JSON.parse(responseText)
      } catch {
        if (res.status === 413) {
          throw new Error('This document is too large to export. Remove oversized embedded cover images and retry.')
        }
        throw new Error(`Export failed (HTTP ${res.status}).`)
      }

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
        if (format === 'pdf' && (data.browserPdfAvailable || res.status === 502 || res.status === 503)) {
          setBrowserPdf(true)
          setExportStatus(prev => ({ ...prev, pdf: 'idle', pdfError: undefined }))
          setPrintDocument(documentContent)
          return
        }
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
        if (data.docxAvailable && data.docxDownloadUrl && data.docxFilename) {
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
        [`${format}Error`]: err instanceof Error ? err.message : 'Export failed.',
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
    if (isItineraryDocument(documentContent) && ['destinations', 'route', 'travelRoute'].includes(key)) {
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
    addImageToSection(imagePickerSectionId, {
      catalogId: item.id,
      src: item.url,
      altText: item.title,
      caption: item.title,
      width: item.width,
      height: item.height,
    })
    setImagePickerSectionId(null)
    setImageSearch('')
  }

  function openPhotoReplacement(sectionId: string, index: number) {
    const photo = documentContent?.sections.find(section => section.id === sectionId)?.images?.[index]
    if (photo) setReplacement({ sectionId, index, photo })
  }

  function confirmPhotoReplacement(item: ItineraryImageCatalogItem) {
    if (!documentContent || !replacement) return
    const section = documentContent.sections.find(section => section.id === replacement.sectionId)
    if (!section?.images || section.images[replacement.index] !== replacement.photo) {
      setReplacement(undefined)
      return
    }
    const images = [...section.images]
    images[replacement.index] = {
      ...replacement.photo,
      catalogId: item.id,
      src: item.url,
      altText: item.title,
      caption: item.title,
      width: item.width,
      height: item.height,
    }
    onDocumentUpdate(resetApproval({
      ...documentContent,
      sections: documentContent.sections.map(current => current.id === section.id ? { ...section, images } : current),
    }))
    setReplacement(undefined)
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
      setImageCatalog(current => [item, ...current.filter(image => image.id !== item.id)])
      addImageToSection(sectionId, {
        catalogId: item.id,
        src: item.url,
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
      const resolved = [...matches].map(([sectionId, item]) => [
        sectionId, {
          catalogId: item.id,
          src: item.url,
          altText: item.title,
          caption: item.title,
          width: item.width,
          height: item.height,
        } satisfies DocumentImage,
      ] as const)
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

  const bodySections = isItinerary && documentContent
    ? extractItinerarySections(documentContent.sections).remaining
    : (documentContent?.sections ?? [])

  const bodySectionIds = new Set(bodySections.map(s => s.id))

  const totalBodyPhotos = bodySections.reduce(
    (count, section) => count + (section.images?.length ?? 0),
    0
  )
  const hasBodyPhotos = totalBodyPhotos > 0

  const handleAddPhotosToAllPages = useCallback((replaceExisting = false) => {
    if (!documentContent) return
    setImageError(null)
    setImageStatus(null)
    if (!imageCatalog.length) {
      setImageError('No destination photos are available. Add photos to the image library and try again.')
      return
    }

    const assignments = suggestItineraryPageImages(documentContent.sections, imageCatalog, { replaceExisting })
    if (!assignments.size) {
      setImageStatus('All itinerary pages already have photos. Front cover and last page are unchanged.')
      return
    }

    onDocumentUpdate(resetApproval({
      ...documentContent,
      sections: documentContent.sections.map(section => {
        // Front and back pages must never be modified
        if (!bodySectionIds.has(section.id)) return section
        const item = assignments.get(section.id)
        if (!item) {
          return replaceExisting ? { ...section, images: [] } : section
        }
        const image: DocumentImage = {
          catalogId: item.id,
          src: item.url,
          altText: item.title,
          caption: item.title,
          width: item.width,
          height: item.height,
        }
        return {
          ...section,
          images: replaceExisting ? [image] : [...(section.images ?? []), image],
        }
      }),
    }))
    setImageStatus(`Added photos to ${assignments.size} itinerary day${assignments.size === 1 ? '' : 's'} in 1 click. Front and last pages are unchanged.`)
  }, [documentContent, imageCatalog, bodySectionIds, onDocumentUpdate])

  const handleRemoveAllPhotos = useCallback(() => {
    if (!documentContent) return
    setImageError(null)
    setImageStatus(null)
    const photoCount = bodySections.reduce(
      (count, section) => count + (section.images?.length ?? 0),
      0
    )
    if (!photoCount) {
      setImageStatus('There are no itinerary photos to remove. Front and last pages are unchanged.')
      return
    }

    onDocumentUpdate(resetApproval({
      ...documentContent,
      // Clear images ONLY from body sections; front page and last page are untouched
      sections: documentContent.sections.map(section =>
        bodySectionIds.has(section.id) && section.images?.length
          ? { ...section, images: [] }
          : section
      ),
    }))
    setImageStatus(`Removed ${photoCount} photo${photoCount === 1 ? '' : 's'} from itinerary days in 1 click. Front and last pages are unchanged.`)
  }, [documentContent, bodySections, bodySectionIds, onDocumentUpdate])

  const handleToggleAllPhotos = useCallback(() => {
    if (hasBodyPhotos) {
      handleRemoveAllPhotos()
    } else {
      handleAddPhotosToAllPages(true)
    }
  }, [hasBodyPhotos, handleRemoveAllPhotos, handleAddPhotosToAllPages])

  useEffect(() => {
    const documentKey = documentContent
      ? `${documentContent.metadata.generatedAt}:${documentContent.metadata.prompt}`
      : null
    if (
      !isItinerary ||
      imageCatalog.length === 0 ||
      !documentKey ||
      autoMatchedDocumentKey.current === documentKey
    ) return

    autoMatchedDocumentKey.current = documentKey
    void handleAutoMatchImages()
  }, [isItinerary, documentContent?.metadata.generatedAt, documentContent?.metadata.prompt, imageCatalog, handleAutoMatchImages])

  const [detailStatus, setDetailStatus] = useState<string | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const optionsId = useId()
  const currentDetailLevel: ItineraryDetailLevel = documentContent?.detailLevel || 'medium'

  const handleDetailLevelChange = useCallback((level: ItineraryDetailLevel) => {
    if (!documentContent) return
    if ((documentContent.detailLevel || 'medium') === level) return
    setDetailStatus(null)
    const updated = applyDetailLevel(documentContent, level)
    onDocumentUpdate(resetApproval(updated))
    const config = DETAIL_LEVEL_CONFIGS[level]
    setDetailStatus(`Switched to ${config.label} detail level (${config.sublabel}). Front and closing pages are preserved.`)
  }, [documentContent, onDocumentUpdate])

  const handleSave = async () => {
    setManualSaveError(null)
    try {
      await onSaveDocument()
    } catch (err) {
      setManualSaveError(err instanceof Error ? err.message : 'Could not save this document.')
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
      <div className="flex flex-col h-full bg-ui-canvas items-center justify-center p-8">
        <FileText size={40} className="text-ui-muted mb-3" />
        <h3 className="text-sm font-medium text-ui-muted">No document generated yet</h3>
        <p className="text-xs text-ui-muted mt-1 text-center">
          Chat with AI to generate your document content
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-ui-panel">
      <div className="document-toolbar" aria-label="Document view and options">
        <div className="document-toolbar-title">
          <FileText size={15} className="shrink-0 text-ui-accent" aria-hidden="true" />
          <h2 title={documentContent.title}>{documentContent.title}</h2>
        </div>
        <div className="document-toolbar-actions">
          <div className="document-segments" role="group" aria-label="Document view">
            <button type="button" onClick={() => setViewMode('preview')} aria-pressed={viewMode === 'preview'}>
              <Eye size={13} aria-hidden="true" /> Preview
            </button>
            <button type="button" onClick={() => setViewMode('edit')} aria-pressed={viewMode === 'edit'}>
              <Edit3 size={13} aria-hidden="true" /> Edit
            </button>
          </div>
          {isItinerary ? (
            <button type="button" className="secondary-button button-compact document-options-toggle"
              onClick={() => setOptionsOpen(open => !open)}
              aria-expanded={optionsOpen} aria-controls={optionsId} aria-label="Itinerary options" title="Itinerary options">
              <Sliders size={13} aria-hidden="true" />
              <span>{DETAIL_LEVEL_CONFIGS[currentDetailLevel].label} · {totalBodyPhotos} {totalBodyPhotos === 1 ? 'photo' : 'photos'}</span>
              <ChevronDown size={12} aria-hidden="true" />
            </button>
          ) : (
            <label className="document-template" title="Document template">
              <Palette size={13} aria-hidden="true" />
              <select value={selectedThemeId} aria-label="Document template" onChange={e => onThemeChange(e.target.value)}>
                {themes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" onClick={onClose} className="icon-button compact-icon" aria-label="Close document" title="Close document">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isItinerary && (
        <section className="document-options-panel" id={optionsId} hidden={!optionsOpen} aria-label="Itinerary options">
          <div className="document-options-row">
            <span>Detail level</span>
            <div className="document-segments" role="group" aria-label="Detail level">
              {(['low', 'medium', 'high'] as const).map(level => (
                <button key={level} type="button" onClick={() => handleDetailLevelChange(level)}
                  aria-pressed={currentDetailLevel === level} title={DETAIL_LEVEL_CONFIGS[level].sublabel}>
                  {DETAIL_LEVEL_CONFIGS[level].label}
                </button>
              ))}
            </div>
          </div>
          <div className="document-options-row">
            <span>Day photos</span>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={handleToggleAllPhotos}
                disabled={!hasBodyPhotos && (isLoadingImageCatalog || imageCatalog.length === 0)}
                className={hasBodyPhotos ? 'secondary-button button-compact button-error' : 'primary-button button-compact'}
                title={hasBodyPhotos ? 'Remove all day photos' : 'Add photos to all itinerary days'}>
                {hasBodyPhotos ? <Trash2 size={13} /> : <ImagePlus size={13} />}
                {hasBodyPhotos ? 'Remove photos' : 'Add photos'}
              </button>
              <button type="button"
                onClick={() => hasBodyPhotos ? handleAddPhotosToAllPages(true) : handleAutoMatchImages()}
                disabled={isLoadingImageCatalog || isMatchingImages || imageCatalog.length === 0}
                className="secondary-button button-compact">
                <RefreshCw size={13} className={isMatchingImages ? 'animate-spin' : ''} />
                {hasBodyPhotos ? 'Rematch photos' : 'Auto-match'}
              </button>
            </div>
          </div>
          <p className="document-options-template"><Palette size={12} aria-hidden="true" /> Beyond Escapes Official template</p>
          {([
            { message: detailStatus, clear: setDetailStatus, label: 'detail update' },
            { message: imageStatus, clear: setImageStatus, label: 'photo update' },
            { message: imageError, clear: setImageError, label: 'photo error' },
          ] as const).map(({ message, clear, label }) => message && (
            <div key={label} className="document-options-notice" role={label === 'photo error' ? 'alert' : 'status'}>
              {message}
              <button type="button" onClick={() => clear(null)} aria-label={'Dismiss ' + label}>
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
        </section>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {viewMode === 'preview' ? (
          <div className="studio-paper"><DocumentPreview documentContent={documentContent} onImageReplace={openPhotoReplacement} /></div>
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
            onImageReplace={openPhotoReplacement}
            onImageUpload={handleUploadImage}
            onImageRemove={handleRemoveImage}
            uploadingImageSectionId={uploadingImageSectionId}
          />
        )}
      </div>

      <section aria-label="Save and export" className="shrink-0 border-t border-ui-line bg-ui-panel px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={`status-pill ${documentContent.approval?.status === 'approved' ? 'status-approved' : ''}`}>
              {documentContent.approval?.status === 'approved' ? 'Approved' : 'Draft'}
            </span>
            <span role="status" className="text-[11px] text-ui-muted">
              {saveStatus === 'saving' ? 'Saving?' : saveStatus === 'saved' ? (cloudDocuments ? 'Saved to MongoDB' : 'Saved') : ''}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={handleSave} disabled={saveStatus === 'saving'}
              className="secondary-button button-compact">
              {saveStatus === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save
            </button>
            <button type="button" onClick={handleApprovalToggle}
              disabled={documentContent.approval?.status !== 'approved' && missingRequiredFields.length > 0}
              className="secondary-button button-compact">
              <BadgeCheck size={13} />
              {documentContent.approval?.status === 'approved' ? 'Reopen draft' : 'Approve'}
            </button>
            <button type="button" onClick={() => handleExport('docx')} disabled={exportStatus.docx === 'loading'}
              className="primary-button button-compact" title="Download Word document">
              {exportStatus.docx === 'loading' ? <Loader2 size={13} className="animate-spin" />
                : exportStatus.docx === 'success' ? <CheckCircle size={13} /> : <Download size={13} />}
              Word
            </button>
            <button type="button" onClick={() => handleExport('pdf')} disabled={exportStatus.pdf === 'loading' || Boolean(printDocument)}
              className="secondary-button button-compact" title={browserPdf ? 'Choose Save as PDF in the browser print dialog' : 'Download PDF'}>
              {exportStatus.pdf === 'loading' || printDocument ? <Loader2 size={13} className="animate-spin" />
                : exportStatus.pdf === 'success' ? <CheckCircle size={13} /> : <FileDown size={13} />}
              {browserPdf ? 'Save as PDF' : 'PDF'}
            </button>
          </div>
        </div>
        {(saveError || manualSaveError || exportStatus.docxError || exportStatus.pdfError) && (
          <div role="alert" className="mt-1 space-y-1 text-xs text-ui-danger">
            {[saveError || manualSaveError, exportStatus.docxError, exportStatus.pdfError]
              .filter((message, index, messages) => message && messages.indexOf(message) === index)
              .map(message => <p key={message}>{message}</p>)}
          </div>
        )}
        {missingRequiredFields.length > 0 && (
          <p className="mt-1 text-[11px] text-ui-warning">
            Required for approval: {missingRequiredFields
              .map(key => getDocumentFieldLabel(documentContent.intake!.documentType, key)).join(', ')}
          </p>
        )}
      </section>
      {printDocument && createPortal(
        <div ref={printSheet} className="document-print-sheet studio-paper" aria-hidden="true">
          <DocumentPreview documentContent={printDocument} />
        </div>,
        document.body,
      )}
      {replacement && (
        <ItineraryPhotoReplacement
          photo={replacement.photo}
          folder={itineraryPhotoFolder(documentContent.sections, replacement.sectionId, replacement.photo, imageCatalog)}
          images={imageCatalog}
          loading={isLoadingImageCatalog}
          onConfirm={confirmPhotoReplacement}
          onClose={() => setReplacement(undefined)}
        />
      )}
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
type ReplacePhoto = (sectionId: string, index: number) => void

function DocumentPreview({ documentContent, onImageReplace }: {
  documentContent: DocumentContent
  onImageReplace?: ReplacePhoto
}) {
  if (isItineraryDocument(documentContent)) {
    return <ItineraryDocumentPreview documentContent={documentContent} onImageReplace={onImageReplace} />
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

function ItineraryDocumentPreview({ documentContent, onImageReplace }: {
  documentContent: DocumentContent
  onImageReplace?: ReplacePhoto
}) {
  const pageContent = getItineraryPageContent(documentContent)
  const sections = extractItinerarySections(documentContent.sections).remaining
  const fields = documentContent.intake?.fields ?? {}
  const cover = documentContent.itineraryPages?.cover ?? {}
  const routeText = fields.destinations?.trim() || fields.route?.trim() || fields.travelRoute?.trim() || ''
  const routeStops = cover.routeStops ?? getInitialRouteStops(routeText)
  const routePlan = routeStops.map((stop, index) => `${index + 1}. ${stop.name}`).join('  >  ')
    || routeText
  const itinerarySections = sections.at(-1)?.type === 'page_break' ? sections.slice(0, -1) : sections

  return (
    <div className="space-y-5 p-5 max-w-3xl mx-auto">
      <article className="print-cover overflow-hidden rounded-lg border border-gray-200 bg-white p-5 shadow-sm doc-preview">
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
        <h1 className="mb-2 text-center font-serif text-2xl font-bold text-[#3973B9]">{documentContent.title}</h1>
        <Image
          src="/images/sri-lanka-ayubowan.png"
          alt="Ayubowan welcome banner with a Sri Lankan woman greeting in English and Sinhala"
          width={2167}
          height={726}
          className="mb-1 h-auto w-full rounded-md object-contain"
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md bg-[#F4F8F5] p-3">
            <p className="mb-1 text-center font-sans text-[9px] font-bold text-[#3973B9]">SRI LANKA ROUTE MAP</p>
            <CoverMapPreview image={cover.mapImage} />
            <div className="mt-2 border-t border-[#d9e7dc] pt-2">
              <p className="mb-1 text-center font-sans text-[9px] font-bold text-[#3973B9]">ROUTE STOPS</p>
              <p className="text-center font-sans text-[9px] leading-relaxed text-gray-700">{routePlan}</p>
            </div>
            <p className="mt-1 text-center font-sans text-[7px] text-gray-500">
              {cover.mapAttribution || 'Road map screenshot not saved'}
            </p>
          </div>
          <div className="space-y-3 rounded-md bg-[#F8FAFC] p-3">
            <div>
              <h2 className="text-xs font-bold text-[#3973B9]">YOUR JOURNEY AT A GLANCE</h2>
              <p className="text-[10px] leading-relaxed text-gray-700">{pageContent.overview}</p>
            </div>
            <div>
              <h2 className="text-[11px] font-bold text-[#668678]">A WARM WELCOME</h2>
              <p className="text-[10px] leading-relaxed text-gray-700">{pageContent.welcome}</p>
            </div>
            <div className="border-t border-gray-200 pt-2 text-[9px] leading-relaxed text-gray-600">
              <h2 className="mb-1 font-sans text-[10px] font-bold text-[#3973B9]">TRIP DETAILS</h2>
              {fields.tripDuration && <p>Trip duration: {fields.tripDuration}</p>}
              {fields.travelDates && <p>Travel dates: {fields.travelDates}</p>}
              <p>Prepared by: {pageContent.preparedBy}</p>
            </div>
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-md border border-blue-100">
          <p className="bg-[#3973B9] px-3 py-1.5 text-center font-sans text-[10px] font-bold text-white">{pageContent.companyName}</p>
          <div className="space-y-1 bg-[#F8FAFC] px-3 py-2 text-center font-sans text-[9px] text-gray-600">
            <p>{pageContent.phone}</p>
            <p>{pageContent.email}</p>
            <p>{pageContent.address}</p>
          </div>
        </div>
        <p className="mt-2 border-t border-gray-100 pt-2 text-center font-sans text-[8px] text-gray-400">Page 1 | Editable cover page</p>
      </article>

      <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <p className="mb-3 font-sans text-[9px] font-semibold uppercase tracking-wide text-blue-700">Itinerary details</p>
        <div className="space-y-1 doc-preview">
          {itinerarySections.map(section => <SectionPreview key={section.id} section={section} onImageReplace={onImageReplace} />)}
        </div>
        <p className="my-8 text-center font-serif text-sm font-bold tracking-wider text-gray-900">
          ****END OF SERVICES****
        </p>
      </article>

      {/* Closing Document Pages: Quotation, Optional Entrance Fees, Inclusions, Exclusions, Cancellation Policy */}
      <article className="print-closing rounded-lg border border-gray-200 bg-white p-6 shadow-sm doc-preview space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-2">
          <Image
            src="/images/beyond_escapes_logo.png"
            alt="Beyond Escapes"
            width={220}
            height={36}
            className="h-8 w-auto object-contain object-left"
          />
          <Image
            src="/images/beyond_escapes_icon.png"
            alt="Beyond Escapes Icon"
            width={36}
            height={36}
            className="h-8 w-8 object-contain"
          />
        </div>

        {/* Quotation */}
        <div>
          <h2 className="mb-2 font-serif text-sm font-bold text-gray-900">Quotation</h2>
          <div className="overflow-hidden rounded border border-black text-xs font-sans">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-black">
                  <th className="border-r border-black px-3 py-1.5 text-left font-bold text-gray-900">Services</th>
                  <th className="px-3 py-1.5 text-left font-bold text-gray-900 w-44">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/40 text-gray-800">
                {pageContent.quotation.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="border-r border-black/40 px-3 py-1.5">{item.service}</td>
                    <td className="px-3 py-1.5 font-medium">{item.amount}</td>
                  </tr>
                ))}
                {pageContent.quotation.total && (
                  <tr className="border-t-2 border-black font-bold text-gray-900">
                    <td className="border-r border-black px-3 py-1.5">Total</td>
                    <td className="px-3 py-1.5">{pageContent.quotation.total}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Optional - Entrance fees */}
        {pageContent.optionalEntranceFees.length > 0 && (
          <div>
            <h2 className="mb-2 font-serif text-sm font-bold text-gray-900">Optional - Entrance fees</h2>
            <div className="overflow-hidden rounded border border-black text-xs font-sans">
              <table className="w-full border-collapse">
                <tbody className="divide-y divide-black/30 text-gray-800">
                  {pageContent.optionalEntranceFees.map((item, idx) => (
                    <tr key={idx}>
                      <td className="border-r border-black/30 px-3 py-1.5">{item.attraction}</td>
                      <td className="px-3 py-1.5 font-medium w-44">{item.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VALUE ADDED SERVICES ON COMPLEMENTARY BASIS */}
        {pageContent.valueAddedServices.length > 0 && (
          <div>
            <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-wide text-[#1B365D] underline">
              VALUE ADDED SERVICES ON COMPLEMENTARY BASIS
            </h2>
            <ul className="space-y-1.5 text-xs text-gray-800 list-disc list-inside">
              {pageContent.valueAddedServices.map((item, idx) => (
                <li key={idx} className="marker:text-red-500">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ABOVE RATE INCLUDES */}
        {pageContent.rateIncludes.length > 0 && (
          <div>
            <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-wide text-[#1B365D] underline">
              ABOVE RATE INCLUDES
            </h2>
            <ul className="space-y-1.5 text-xs text-gray-800 list-disc list-inside">
              {pageContent.rateIncludes.map((item, idx) => (
                <li key={idx} className="marker:text-[#1B365D]">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* THE ABOVE RATE EXCLUDES */}
        {pageContent.rateExcludes.length > 0 && (
          <div>
            <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-wide text-[#1B365D] underline">
              THE ABOVE RATE EXCLUDES
            </h2>
            <ul className="space-y-1.5 text-xs text-gray-800 list-disc list-inside">
              {pageContent.rateExcludes.map((item, idx) => {
                const isHighlight = item.toLowerCase().includes('compulsory');
                return (
                  <li key={idx} className="marker:text-[#1B365D]">
                    {isHighlight ? (
                      <span className="bg-yellow-200 px-1 py-0.5 rounded font-medium">{item}</span>
                    ) : item}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* CANCELLATION POLICY */}
        {pageContent.cancellationPolicy.length > 0 && (
          <div>
            <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-wide text-red-600 underline">
              CANCELLATION POLICY
            </h2>
            <ul className="space-y-1.5 text-xs text-red-600 list-disc list-inside font-medium">
              {pageContent.cancellationPolicy.map((item, idx) => (
                <li key={idx} className="marker:text-red-600">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Company Details & Footer */}
        <div className="pt-6 border-t border-gray-200 text-center space-y-1">
          <p className="font-serif text-xs font-bold text-[#1B365D] tracking-wide">{pageContent.companyName}</p>
          <p className="text-[10px] text-gray-700">{pageContent.phone}</p>
          <p className="text-[10px] text-gray-700">{pageContent.email}</p>
          <p className="text-[10px] text-gray-700">Skype: Beyond.Escapes</p>
          <p className="text-[10px] text-gray-600">{pageContent.address}</p>
          <div className="mt-4 flex items-center justify-center gap-2 pt-2">
            <Image
              src="/images/beyond_escapes_logo.png"
              alt="Beyond Escapes"
              width={160}
              height={26}
              className="h-6 w-auto object-contain"
            />
            <Image
              src="/images/beyond_escapes_icon.png"
              alt="Beyond Escapes Icon"
              width={26}
              height={26}
              className="h-6 w-6 object-contain"
            />
          </div>
        </div>

        <p className="mt-3 text-center font-sans text-[8px] text-gray-400">
          Closing pages | Quotation, Optional entrance fees, Inclusions, Exclusions &amp; Cancellation Policy
        </p>
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
        className="max-h-[28rem] w-full rounded object-contain"
      />
    )
  }

  return (
    <div role="status" className="mx-auto flex min-h-40 max-h-[28rem] w-full items-center justify-center rounded bg-blue-50 px-3 text-center text-xs text-blue-800">
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

function SectionPreview({ section, onImageReplace }: { section: DocumentSection; onImageReplace?: ReplacePhoto }) {
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
          {onImageReplace && (
            <div className="mt-1 flex justify-center print:hidden">
              <button type="button" className="secondary-button button-compact"
                aria-label={`Change photo: ${image.altText}`} onClick={() => onImageReplace(section.id, index)}>
                <RefreshCw size={12} aria-hidden="true" /> Change photo
              </button>
            </div>
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
        <div className="print-page-break my-4 border-t-2 border-dashed border-gray-200 relative">
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
  onImageReplace,
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
  onImageReplace: ReplacePhoto
  onImageUpload: (sectionId: string, file: File) => void
  onImageRemove: (sectionId: string, index: number) => void
  uploadingImageSectionId: string | null
}) {
  const isItinerary = isItineraryDocument(documentContent)
  const sectionsToEdit = isItinerary
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
      <div className="flex items-start gap-2 p-3 bg-ui-canvas rounded-xl border border-ui-line">
        <span className="text-[10px] text-ui-muted uppercase tracking-wider mt-1 w-14 flex-shrink-0">Title</span>
        <input
          type="text"
          value={documentContent.title}
          onChange={e => onTitleChange(e.target.value)}
          className="flex-1 bg-transparent text-sm font-semibold text-ui-body outline-none focus:ring-0"
          placeholder="Document title"
        />
      </div>

      {isItinerary && (
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
          showImageTools={isItinerary}
          onImagePick={() => onImagePick(section.id)}
          onImageReplace={index => onImageReplace(section.id, index)}
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
  const fields = documentContent.intake?.fields ?? {}
  const routeText = fields.destinations?.trim() || fields.route?.trim() || fields.travelRoute?.trim() || ''
  const routeStops = cover.routeStops ?? getInitialRouteStops(routeText)

  return (
    <section className="space-y-3 rounded-xl border border-ui-line bg-ui-tint/40 p-3">
      <div>
        <h3 className="text-xs font-semibold text-ui-accent">Itinerary fields</h3>
        <p className="text-[10px] text-ui-accent">Edit the quotation, closing terms, and cover details.</p>
      </div>

      <div className="space-y-3 rounded-lg border border-ui-line bg-ui-panel p-3">
        <h4 className="text-[11px] font-semibold text-ui-body">Quotation &amp; Closing Page</h4>

        {/* Quotation Editor */}
        <div className="space-y-2 rounded border border-ui-line bg-ui-canvas/50 p-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold text-ui-muted">Quotation (one per line: Service | Amount)</span>
            <ClosingLinesField
              value={pageContent.quotation.items.map(it => `${it.service} | ${it.amount}`).join('\n')}
              onChange={value => {
                const items = value.split(/\r?\n/).map(line => {
                  const parts = line.split(/[|\t]/)
                  return { service: parts[0]?.trim() || '', amount: parts[1]?.trim() || '' }
                }).filter(it => it.service || it.amount)
                onClosingPageUpdate({
                  quotation: {
                    items,
                    total: pageContent.quotation.total,
                  },
                })
              }}
              rows={3}
              className="w-full resize-y rounded-lg border border-ui-line bg-ui-panel px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
              placeholder="Per vehicle per tour | USD 760.00"
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[9px] font-medium text-ui-muted">Total Amount</span>
            <input
              value={pageContent.quotation.total}
              onChange={event => onClosingPageUpdate({
                quotation: {
                  items: pageContent.quotation.items,
                  total: event.target.value,
                },
              })}
              className="w-full rounded-lg border border-ui-line bg-ui-panel px-2 py-1 text-xs text-ui-body outline-none focus:border-ui-accent"
              placeholder="USD 920.00"
            />
          </label>
        </div>

        {/* Optional Entrance Fees */}
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-ui-muted">Optional - Entrance fees (one per line: Attraction | Amount)</span>
          <ClosingLinesField
            value={pageContent.optionalEntranceFees.map(it => `${it.attraction} | ${it.amount}`).join('\n')}
            onChange={value => onClosingPageUpdate({
              optionalEntranceFees: value.split(/\r?\n/).map(line => {
                const parts = line.split(/[|\t]/)
                return { attraction: parts[0]?.trim() || '', amount: parts[1]?.trim() || '' }
              }).filter(it => it.attraction || it.amount),
            })}
            rows={4}
            className="w-full resize-y rounded-lg border border-ui-line px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
            placeholder="Dambulla Cave Temple | USD 10.00"
          />
        </label>

        {/* Value Added Services */}
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-ui-muted">Value added services on complementary basis (one item per line)</span>
          <ClosingLinesField
            value={pageContent.valueAddedServices.join('\n')}
            onChange={value => onClosingPageUpdate({
              valueAddedServices: value.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
            })}
            rows={3}
            className="w-full resize-y rounded-lg border border-ui-line px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
          />
        </label>

        {/* Above Rate Includes */}
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-ui-muted">Above rate includes (one item per line)</span>
          <ClosingLinesField
            value={pageContent.rateIncludes.join('\n')}
            onChange={value => onClosingPageUpdate({
              rateIncludes: value.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
            })}
            rows={4}
            className="w-full resize-y rounded-lg border border-ui-line px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
          />
        </label>

        {/* The Above Rate Excludes */}
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-ui-muted">The above rate excludes (one item per line)</span>
          <ClosingLinesField
            value={pageContent.rateExcludes.join('\n')}
            onChange={value => onClosingPageUpdate({
              rateExcludes: value.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
            })}
            rows={4}
            className="w-full resize-y rounded-lg border border-ui-line px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
          />
        </label>

        {/* Cancellation Policy */}
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-ui-muted">Cancellation policy (one term per line)</span>
          <ClosingLinesField
            value={pageContent.cancellationPolicy.join('\n')}
            onChange={value => onClosingPageUpdate({
              cancellationPolicy: value.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
            })}
            rows={4}
            className="w-full resize-y rounded-lg border border-ui-line px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
          />
        </label>

        {/* Company Contact Details */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([
            ['companyName', 'Company name', pageContent.companyName],
            ['phone', 'Phone', pageContent.phone],
            ['email', 'Email / website', pageContent.email],
            ['address', 'Address', pageContent.address],
          ] as const).map(([key, label, value]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-[10px] font-medium text-ui-muted">{label}</span>
              <textarea
                value={value}
                onChange={event => onClosingPageUpdate({ [key]: event.target.value })}
                rows={key === 'address' ? 2 : 1}
                className="w-full resize-y rounded-lg border border-ui-line px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-ui-line bg-ui-panel p-3">
        <h4 className="text-[11px] font-semibold text-ui-body">First page</h4>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-ui-muted">Journey overview</span>
          <textarea
            value={pageContent.overview}
            onChange={event => onCoverPageUpdate({ overview: event.target.value })}
            rows={4}
            className="w-full resize-y rounded-lg border border-ui-line px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-ui-muted">Ayubowan welcome message</span>
          <textarea
            value={pageContent.welcome}
            onChange={event => onCoverPageUpdate({ welcome: event.target.value })}
            rows={3}
            className="w-full resize-y rounded-lg border border-ui-line px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-ui-muted">Prepared by</span>
          <input
            value={cover.preparedBy ?? pageContent.preparedBy}
            onChange={event => onCoverPageUpdate({ preparedBy: event.target.value })}
            className="w-full rounded-lg border border-ui-line px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
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
            <span className="mb-1 block text-[10px] font-medium text-ui-muted">Map attribution / source</span>
            <input
              value={cover.mapAttribution ?? ''}
              onChange={event => onCoverPageUpdate({ mapAttribution: event.target.value })}
              className="w-full rounded-lg border border-ui-line px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
            />
          </label>
        )}
      </div>
    </section>
  )
}

function ClosingLinesField({
  value,
  onChange,
  ...props
}: {
  value: string
  onChange: (value: string) => void
  rows: number
  className: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <textarea
      {...props}
      value={draft ?? value}
      onChange={event => {
        setDraft(event.target.value)
        onChange(event.target.value)
      }}
      onBlur={() => setDraft(null)}
    />
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
    <section className="p-3 bg-ui-tint/60 rounded-xl border border-ui-line">
      <div className="mb-2">
        <h3 className="text-xs font-semibold text-ui-accent">Extracted {template.label} details</h3>
        <p className="text-[10px] text-ui-accent">Edit these structured fields before approval or export.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {fields.map(field => (
          <label key={field.key} className="block">
            <span className="block text-[10px] font-medium text-ui-muted mb-1">
              {field.label}{requiredKeys.has(field.key) ? ' *' : ''}
            </span>
            <textarea
              value={intake.fields[field.key] || ''}
              onChange={event => onFieldUpdate(field.key, event.target.value)}
              rows={field.key === 'keyPoints' || field.key === 'lineItems' || field.key === 'remarks' ? 3 : 1}
              className="w-full resize-y rounded-lg border border-ui-line bg-ui-panel px-2 py-1.5 text-xs text-ui-body outline-none focus:border-ui-accent"
            />
          </label>
        ))}
      </div>
      {intake.missingFields.length > 0 && (
        <p className="mt-2 text-[10px] text-ui-warning">
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
  onImageReplace,
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
  onImageReplace: (index: number) => void
  onImageUpload: (file: File) => void
  onImageRemove: (index: number) => void
  isUploadingImage: boolean
}) {
  const [showAdd, setShowAdd] = useState(false)
  const typeBadgeColor = {
    title: 'bg-ui-tint text-ui-accent',
    heading1: 'bg-ui-tint text-ui-accent',
    heading2: 'bg-ui-tint text-ui-accent',
    heading3: 'bg-sky-50 text-sky-600',
    paragraph: 'bg-ui-subtle text-ui-muted',
    bullet_list: 'bg-ui-tint text-ui-accent',
    numbered_list: 'bg-teal-50 text-teal-600',
    table: 'bg-ui-warning-tint text-ui-warning',
    page_break: 'bg-ui-danger-tint text-ui-danger',
  }[section.type] || 'bg-ui-subtle text-ui-muted'

  const updateItems = (itemsText: string) => {
    const items = itemsText.split('\n').filter(l => l.trim())
    onUpdate({ ...section, items })
  }

  return (
    <div className="group relative">
      <div className="p-3 bg-ui-panel border border-ui-line rounded-xl hover:border-ui-line transition-colors">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${typeBadgeColor}`}>
            {section.type.replace('_', ' ')}
          </span>
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="p-1 rounded hover:bg-ui-subtle text-ui-muted hover:text-ui-muted"
              title="Add section below"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded hover:bg-ui-danger-tint text-ui-muted hover:text-ui-danger"
              title="Delete section"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Content based on type */}
        {section.type === 'page_break' ? (
          <div className="text-xs text-ui-muted italic text-center py-1">— Page Break —</div>
        ) : section.type === 'bullet_list' || section.type === 'numbered_list' ? (
          <textarea
            value={(section.items || []).join('\n')}
            onChange={e => updateItems(e.target.value)}
            className="w-full text-sm text-ui-body outline-none resize-none bg-transparent min-h-[60px]"
            placeholder="One item per line"
          />
        ) : section.type === 'table' ? (
          <div className="text-xs text-ui-muted italic">Table editing — use the AI to modify table content</div>
        ) : (
          <textarea
            value={section.content}
            onChange={e => onUpdate({ ...section, content: e.target.value })}
            className="w-full text-sm text-ui-body outline-none resize-none bg-transparent min-h-[36px]"
            placeholder="Enter content..."
            rows={section.type === 'paragraph' ? 3 : 1}
          />
        )}

        {showImageTools && (
          <div className="mt-3 border-t border-ui-line pt-2">
            {section.images?.map((image, index) => (
              <div key={`${section.id}-image-${index}`} className="mb-2 flex items-center gap-2 rounded-md bg-ui-canvas p-1.5">
                <Image
                  src={image.src}
                  alt={image.altText}
                  width={72}
                  height={48}
                  unoptimized
                  className="h-12 w-[72px] rounded object-cover"
                />
                <span className="flex-1 truncate text-[10px] text-ui-muted">{image.caption || image.altText}</span>
                <button type="button" className="secondary-button button-compact"
                  aria-label={`Change photo: ${image.altText}`} onClick={() => onImageReplace(index)}>
                  <RefreshCw size={12} aria-hidden="true" /> Change photo
                </button>
                <button
                  type="button"
                  onClick={() => onImageRemove(index)}
                  className="rounded p-1 text-ui-muted hover:bg-ui-danger-tint hover:text-ui-danger"
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
                className="inline-flex items-center gap-1 rounded-md border border-ui-line px-2 py-1 text-[10px] text-ui-muted hover:bg-ui-canvas"
              >
                <ImagePlus size={12} /> Choose library photo
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-ui-line px-2 py-1 text-[10px] text-ui-muted hover:bg-ui-canvas">
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
  const [remote, setRemote] = useState<{ query: string; images: ItineraryImageCatalogItem[] }>()
  const [limit, setLimit] = useState(24)
  const [folder, setFolder] = useState('')
  const folders = uniqueImageFolders(images.flatMap(image => image.folder ? [
    { city: image.folder.city, place: '' }, image.folder,
  ] : []))
  useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/itinerary-images?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (!response.ok) return
        const result = await response.json()
        if (!controller.signal.aborted) setRemote({ query, images: result.images })
      } catch {
        // Keep local matches available if remote search is unavailable.
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])
  const localMatches = images
    .map(image => ({ image, score: query ? scoreItineraryImage(query, image) : 0 }))
    .filter(({ image, score }) => !query || score > 0 || imageSearchText(image).includes(query))
    .sort((left, right) => right.score - left.score || left.image.title.localeCompare(right.image.title))
  const matches = query && remote?.query === query ? remote.images : localMatches.map(({ image }) => image)
  const filteredImages = folder ? matches.filter(({ folder: location }) => location && (
    folder === folderKey(location) || folder === folderKey({ city: location.city, place: '' })
  )) : matches

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
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-ui-panel shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-ui-line p-4">
          <div className="flex-1">
            <h2 id="itinerary-image-picker-title" className="text-sm font-semibold text-ui-body">Choose a destination photo</h2>
            <p className="mt-0.5 text-[11px] text-ui-muted">Photos are optimized and embedded in this document.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ui-muted hover:bg-ui-subtle hover:text-ui-muted" aria-label="Close image picker">
            <X size={16} />
          </button>
        </div>
        <div className="m-3 grid gap-2 sm:grid-cols-2">
          <label className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-muted" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search gallery photos"
              value={search}
              onChange={event => { setLimit(24); onSearch(event.target.value) }}
              placeholder="Search Colombo, Kandy, Sigiriya..."
              className="w-full rounded-lg border border-ui-line py-2 pl-9 pr-3 text-xs outline-none focus:border-ui-accent"
            />
          </label>
          <select aria-label="Filter gallery photos by folder" value={folder}
            onChange={event => { setFolder(event.target.value); setLimit(24) }}
            className="w-full rounded-lg border border-ui-line bg-ui-panel px-3 py-2 text-xs outline-none focus:border-ui-accent">
            <option value="">All folders</option>
            {folders.map(location => (
              <option key={folderKey(location)} value={folderKey(location)}>
                {location.place ? `${location.city} / ${location.place}` : location.city}
              </option>
            ))}
          </select>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-3 pt-0 sm:grid-cols-3">
          {filteredImages.slice(0, limit).map(image => (
            <button
              key={image.id}
              type="button"
              onClick={() => onSelect(image)}
              className="overflow-hidden rounded-lg border border-ui-line text-left hover:border-ui-accent hover:shadow-sm"
            >
              <Image
                src={image.url}
                alt={image.title}
                width={image.width}
                height={image.height}
                unoptimized
                className="h-28 w-full bg-ui-subtle object-cover"
              />
              <span className="block truncate px-2 py-1.5 text-[11px] font-medium text-ui-muted">{image.title}</span>
            </button>
          ))}
          {filteredImages.length === 0 && (
            <p className="col-span-full py-10 text-center text-xs text-ui-muted">No matching photos found. Upload one from your device in the section editor.</p>
          )}
          {filteredImages.length > limit && (
            <button type="button" onClick={() => setLimit(current => current + 24)}
              className="col-span-full rounded-lg border border-ui-line p-2 text-xs text-ui-muted">
              Show more photos
            </button>
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
        className={`flex items-center gap-1 text-xs text-ui-muted hover:text-ui-accent transition-colors ${compact ? 'px-2 py-1' : 'w-full justify-center px-3 py-2 border border-dashed border-ui-line rounded-xl hover:border-ui-accent hover:bg-ui-tint'}`}
      >
        <Plus size={12} />
        {!compact && <span>Add Section</span>}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 left-0 bg-ui-panel border border-ui-line rounded-xl shadow-lg py-1 min-w-[180px]">
          {types.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => { onAdd(type); setIsOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-ui-muted hover:bg-ui-canvas hover:text-ui-accent transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
