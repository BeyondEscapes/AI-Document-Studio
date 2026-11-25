'use client'

import Image from 'next/image'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { folderKey, imageFolder } from '@/lib/image-folders'
import type { DocumentImage, ImageFolder, ItineraryImageCatalogItem } from '@/types'

export function ItineraryPhotoReplacement({ photo, folder, images, loading, onConfirm, onClose }: {
  photo: DocumentImage
  folder?: ImageFolder
  images: ItineraryImageCatalogItem[]
  loading: boolean
  onConfirm: (image: ItineraryImageCatalogItem) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selectedId, setSelectedId] = useState<string>()
  const alternatives = images.filter(image => {
    const location = imageFolder(image)
    return folder && location && image.id !== photo.catalogId && image.url !== photo.src &&
      folderKey(folder) === folderKey(folder.place ? location : { city: location.city, place: '' })
  }).sort((a, b) => a.title.localeCompare(b.title))
  const selectedIndex = alternatives.findIndex(image => image.id === selectedId)
  const selected = alternatives[selectedIndex]

  useEffect(() => { dialog.current?.showModal() }, [])

  function browse(offset: number) {
    const index = selectedIndex < 0 ? (offset > 0 ? 0 : alternatives.length - 1)
      : (selectedIndex + offset + alternatives.length) % alternatives.length
    setSelectedId(alternatives[index].id)
    dialog.current?.querySelectorAll('[data-photo-option]')[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  return (
    <dialog ref={dialog} aria-labelledby="replace-photo-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-2xl overflow-hidden rounded-xl border border-ui-line bg-ui-panel text-ui-body shadow-xl backdrop:bg-black/50"
      onCancel={event => { event.preventDefault(); onClose() }}>
      <div className="flex max-h-[90dvh] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-ui-line p-4">
          <div>
            <h2 id="replace-photo-title" className="text-sm font-semibold">Change itinerary photo</h2>
            {folder && <p className="mt-1 text-xs text-ui-muted">{[folder.city, folder.place].filter(Boolean).join(' / ')}</p>}
          </div>
          <button type="button" className="icon-button" aria-label="Close photo replacement" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="min-h-0 overflow-y-auto p-4">
          <figure>
            <div className="relative h-[min(36dvh,270px)] rounded-lg bg-ui-canvas">
              <Image src={selected?.url ?? photo.src} alt={selected?.title ?? photo.altText} fill unoptimized className="rounded-lg object-contain" />
            </div>
            <figcaption className="mt-2 text-center text-xs text-ui-muted" aria-live="polite">
              {selected ? selected.title : `Current photo · ${photo.caption || photo.altText}`}
            </figcaption>
          </figure>
          {alternatives.length > 0 ? (
            <div className="mt-3 flex items-center gap-2">
              <button type="button" className="icon-button shrink-0" aria-label="Previous photo" onClick={() => browse(-1)}><ChevronLeft size={17} /></button>
              <div className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto p-1" aria-label="Gallery photos for this location">
                {alternatives.map(image => (
                  <button key={image.id} type="button" data-photo-option aria-pressed={image.id === selectedId}
                    aria-label={image.title} title={image.title} onClick={() => setSelectedId(image.id)}
                    className="w-24 shrink-0 snap-start overflow-hidden rounded-md border-2 border-transparent text-left hover:border-ui-line aria-pressed:border-ui-accent">
                    <Image src={image.url} alt="" width={96} height={64} unoptimized className="h-16 w-full rounded object-cover" />
                    <span className="block truncate px-1 py-1 text-[10px]">{image.title}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="icon-button shrink-0" aria-label="Next photo" onClick={() => browse(1)}><ChevronRight size={17} /></button>
            </div>
          ) : (
            <p className="mt-4 text-center text-xs text-ui-muted" role="status">
              {loading ? 'Loading gallery photos…' : folder ? 'There are no other gallery photos for this location.' : 'No gallery location could be matched to this photo.'}
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-ui-line p-3">
          <button type="button" className="secondary-button button-compact" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button button-compact" disabled={!selected}
            onClick={() => { if (selected) onConfirm(selected) }}>Confirm replacement</button>
        </footer>
      </div>
    </dialog>
  )
}
