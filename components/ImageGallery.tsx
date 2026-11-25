'use client'

import { useWorkspaceLanguage } from './WorkspaceLanguage'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronDown, ChevronRight, Folder, FolderPlus, ImageIcon, Pencil, Search, Upload, X } from 'lucide-react'
import { GalleryImageEditor } from './GalleryImageEditor'
import { folderKey, imageSearchText, uniqueImageFolders } from '@/lib/image-folders'
import { galleryRequest, prepareGalleryUpload } from '@/lib/gallery-client'
import type { ImageFolder, ItineraryImageCatalogItem } from '@/types'

const IMAGE_DRAG_TYPE = 'application/x-studio-gallery-image'
const PAGE_SIZE = 36
const NEW_FOLDER = { city: '', place: '' }

type GalleryData = { images: ItineraryImageCatalogItem[]; folders: ImageFolder[] }

function folderMatch(image: ItineraryImageCatalogItem, selection: string) {
  if (!selection) return true
  if (selection === 'unfiled') return !image.folder
  if (!image.folder) return false
  return selection === folderKey(image.folder) || selection === folderKey({ city: image.folder.city, place: '' })
}

export function ImageGallery() {
  const { t } = useWorkspaceLanguage()
  const [data, setData] = useState<GalleryData>()
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState('')
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [editing, setEditing] = useState<ItineraryImageCatalogItem>()
  const [organizing, setOrganizing] = useState<ItineraryImageCatalogItem | null>()
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dropFolder, setDropFolder] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const upload = useRef<HTMLInputElement>(null)
  const fileDragDepth = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    galleryRequest<GalleryData>('GET', undefined, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result)
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message)
    })
    return () => controller.abort()
  }, [loadAttempt])

  const cities = useMemo(() => {
    const groups = new Map<string, { city: ImageFolder; places: ImageFolder[] }>()
    for (const folder of data?.folders ?? []) {
      const key = folder.city.toLowerCase()
      const group = groups.get(key) ?? { city: { city: folder.city, place: '' }, places: [] }
      if (folder.place) group.places.push(folder)
      groups.set(key, group)
    }
    return [...groups.values()]
  }, [data])
  const folders = cities.flatMap(({ city, places }) => [city, ...places])
  const activeFolder = folders.find(folder => folderKey(folder) === selection)
  const filtered = useMemo(() => (data?.images ?? [])
    .filter(image => folderMatch(image, selection) && imageSearchText(image).includes(query.trim().toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title)), [data, query, selection])

  function select(key: string) {
    setSelection(key)
    setLimit(PAGE_SIZE)
  }

  function saveEntry(image: ItineraryImageCatalogItem) {
    setData(current => current && ({
      images: [image, ...current.images.filter(item => item.id !== image.id)],
      folders: uniqueImageFolders([...current.folders, ...(image.folder ? [image.folder] : [])]),
    }))
  }

  async function savePhoto(file: File, folder?: ImageFolder, title?: string) {
    const form = new FormData()
    form.set('gallery', '1')
    form.set('image', await prepareGalleryUpload(file))
    if (folder) {
      form.set('city', folder.city)
      form.set('place', folder.place)
    }
    if (title) form.set('title', title)
    const result = await galleryRequest<{ image: ItineraryImageCatalogItem }>('POST', form)
    saveEntry(result.image)
  }

  async function uploadFiles(files: File[], destination = activeFolder) {
    if (!files.length || uploading) return
    setUploading(true)
    setError('')
    setMessage('')
    let saved = 0
    const failures: string[] = []
    for (const file of files) {
      try {
        await savePhoto(file, destination)
        saved++
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`)
      }
    }
    setError(failures.join(' '))
    if (saved) setMessage(`${saved} ${saved === 1 ? 'photo' : 'photos'} uploaded.`)
    setUploading(false)
  }

  async function organize(image: ItineraryImageCatalogItem | null, folder: ImageFolder, title: string) {
    if (image) {
      const result = await galleryRequest<{ image: ItineraryImageCatalogItem }>('PATCH', { id: image.id, title, ...folder })
      saveEntry(result.image)
      setMessage('Photo details saved.')
    } else {
      const result = await galleryRequest<{ folder: ImageFolder }>('PUT', folder)
      setData(current => current && ({ ...current, folders: uniqueImageFolders([...current.folders, result.folder]) }))
      setCollapsed(current => current.filter(city => city !== result.folder.city.toLowerCase()))
      select(folderKey(result.folder))
      setQuery('')
      setMessage('Folder created.')
    }
  }

  function folderButton(folder: ImageFolder) {
    const key = folderKey(folder)
    return (
      <button type="button" className="gallery-folder-button" aria-pressed={selection === key}
        data-drop={dropFolder === key || undefined}
        onClick={() => select(key)}
        onDragOver={event => {
          const files = event.dataTransfer.types.includes('Files')
          if (!files && !event.dataTransfer.types.includes(IMAGE_DRAG_TYPE)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = files ? 'copy' : 'move'
          setDropFolder(key)
        }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropFolder('') }}
        onDrop={event => {
          event.preventDefault()
          setDropFolder('')
          if (event.dataTransfer.files.length) {
            void uploadFiles(Array.from(event.dataTransfer.files), folder)
            return
          }
          const image = data?.images.find(item => item.id === event.dataTransfer.getData(IMAGE_DRAG_TYPE))
          if (image && (!image.folder || folderKey(image.folder) !== key)) {
            setError('')
            setMessage('')
            void organize(image, folder, image.title).catch(error => setError(error.message))
          }
        }}>
        <Folder size={16} /><span>{folder.place || folder.city}</span>
      </button>
    )
  }

  return (
    <div className="gallery-page">
      <header className="dashboard-heading gallery-heading">
        <div><h1>{t('imageGallery')}</h1><p>{t('galleryIntro')}</p></div>
        <div className="gallery-actions">
          <button type="button" className="secondary-button" disabled={!data} onClick={() => setOrganizing(null)}><FolderPlus size={17} /> {t('newFolder')}</button>
          <button type="button" className="primary-button" disabled={!data || uploading} onClick={() => upload.current?.click()}><Upload size={17} />{uploading ? t('uploadingPhotos') : t('uploadPhotos')}</button>
          <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event => {
            void uploadFiles(Array.from(event.currentTarget.files ?? []))
            event.currentTarget.value = ''
          }} />
        </div>
      </header>

      {error && <p className="gallery-error" role="alert">{error} {!data && (
        <button type="button" className="secondary-button button-compact" onClick={() => { setError(''); setLoadAttempt(value => value + 1) }}>Retry</button>
      )}</p>}
      {message && <p className="gallery-status" role="status">{message}</p>}
      {!data && !error && <p role="status">{t('loadingPhotos')}</p>}
      {data && (
        <div className="gallery-shell">
          <aside className="gallery-sidebar" aria-label="Image folders">
            <h2>{t('folders')}</h2>
            <button type="button" className="gallery-folder-button" aria-pressed={!selection} onClick={() => select('')}><ImageIcon size={16} /><span>{t('allPhotos')}</span></button>
            <button type="button" className="gallery-folder-button" aria-pressed={selection === 'unfiled'} onClick={() => select('unfiled')}><Folder size={16} /><span>{t('unfiled')}</span></button>
            <ul className="gallery-city-list">
              {cities.map(({ city, places }) => {
                const key = city.city.toLowerCase()
                const expanded = !collapsed.includes(key)
                return (
                  <li key={key}>
                    <div className="gallery-city">
                      {places.length > 0 && <button type="button" className="gallery-expand"
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${city.city}`} aria-expanded={expanded}
                        onClick={() => setCollapsed(current => expanded ? [...current, key] : current.filter(item => item !== key))}>
                        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>}
                      {folderButton(city)}
                    </div>
                    {expanded && places.length > 0 && <ul className="gallery-place-list">{places.map(place => <li key={folderKey(place)}>{folderButton(place)}</li>)}</ul>}
                  </li>
                )
              })}
            </ul>
          </aside>
          <section className="gallery-content" aria-label="Photos"
            onDragEnter={event => {
              if (!event.dataTransfer.types.includes('Files')) return
              event.preventDefault()
              fileDragDepth.current++
              setDragging(true)
            }}
            onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}
            onDragLeave={event => {
              if (!event.dataTransfer.types.includes('Files')) return
              fileDragDepth.current = Math.max(0, fileDragDepth.current - 1)
              if (!fileDragDepth.current) setDragging(false)
            }}
            onDrop={event => {
              if (!event.dataTransfer.types.includes('Files')) return
              event.preventDefault()
              fileDragDepth.current = 0
              setDragging(false)
              void uploadFiles(Array.from(event.dataTransfer.files))
            }}>
            <div className="gallery-toolbar">
              <div>
                <h2>{activeFolder ? [activeFolder.city, activeFolder.place].filter(Boolean).join(' / ') : selection ? t('unfiled') : t('allPhotos')}</h2>
                <p>{filtered.length} {filtered.length === 1 ? 'photo' : 'photos'}</p>
              </div>
              <label className="gallery-search">
                <Search size={16} aria-hidden="true" />
                <input type="search" aria-label={t('searchPhotos')} placeholder={t('searchPhotos')} value={query}
                  onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE) }} />
              </label>
            </div>
            <button type="button" className="gallery-dropzone" data-dragging={dragging || undefined}
              disabled={uploading} onClick={() => upload.current?.click()}>
              <Upload size={17} /> {uploading ? t('uploadingPhotos') : t('dropPhotos')}
            </button>
            <div className="gallery-grid">
              {filtered.slice(0, limit).map(image => (
                <article key={image.id} className="gallery-card" draggable onDragStart={event => {
                  event.dataTransfer.setData(IMAGE_DRAG_TYPE, image.id)
                  event.dataTransfer.effectAllowed = 'move'
                }} onDragEnd={() => setDropFolder('')}>
                  <button type="button" className="gallery-photo" aria-label={`Edit ${image.title}`} onClick={() => setEditing(image)}>
                    <Image src={image.url} alt="" fill unoptimized draggable={false} />
                  </button>
                  <div className="gallery-card-details">
                    <h3 title={image.title}>{image.title}</h3>
                    <p>{image.width} × {image.height} px</p>
                    <div className="gallery-actions">
                      <button type="button" className="secondary-button button-compact" onClick={() => setEditing(image)}><Pencil size={13} /> {t('edit')}</button>
                      <button type="button" className="secondary-button button-compact" onClick={() => setOrganizing(image)}><Folder size={13} /> {t('organize')}</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!filtered.length && <p className="gallery-empty">{query ? 'No photos match your search.' : 'This folder has no photos yet.'}</p>}
            {filtered.length > limit && <button type="button" className="secondary-button gallery-more" onClick={() => setLimit(limit + PAGE_SIZE)}>{t('morePhotos')}</button>}
          </section>
        </div>
      )}
      {editing && <GalleryImageEditor image={editing} onClose={() => setEditing(undefined)} onSave={async (file, title) => {
        await savePhoto(file, editing.folder, title)
        setMessage('Edited copy saved to the gallery.')
        setEditing(undefined)
      }} />}
      {organizing !== undefined && <FolderDialog image={organizing} initialFolder={organizing?.folder ?? activeFolder ?? NEW_FOLDER}
        folders={folders} onClose={() => setOrganizing(undefined)} onSubmit={async (folder, title) => {
          await organize(organizing, folder, title)
          setOrganizing(undefined)
        }} />}
    </div>
  )
}

function FolderDialog({ image, initialFolder, folders, onClose, onSubmit }: {
  image: ItineraryImageCatalogItem | null
  initialFolder: ImageFolder
  folders: ImageFolder[]
  onClose: () => void
  onSubmit: (folder: ImageFolder, title: string) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [folder, setFolder] = useState(initialFolder)
  const [title, setTitle] = useState(image?.title ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(folder, title)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the folder.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="gallery-dialog gallery-folder-dialog" aria-labelledby="gallery-folder-title"
      onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <form onSubmit={submit}>
        <header className="gallery-dialog-header">
          <h2 id="gallery-folder-title">{image ? 'Organize photo' : 'New folder'}</h2>
          <button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X size={18} /></button>
        </header>
        <fieldset className="gallery-folder-fields" disabled={busy}>
          {image && <label>Photo title<input value={title} required maxLength={160} onChange={event => setTitle(event.target.value)} /></label>}
          <label>City or location<input value={folder.city} list="gallery-cities" required maxLength={80}
            onChange={event => setFolder({ city: event.target.value, place: '' })} /></label>
          <datalist id="gallery-cities">{folders.filter(item => !item.place).map(item => <option key={folderKey(item)} value={item.city} />)}</datalist>
          <label>Place <span>(optional)</span><input value={folder.place} list="gallery-places" maxLength={100}
            onChange={event => setFolder({ ...folder, place: event.target.value })} /></label>
          <datalist id="gallery-places">{folders.filter(item => item.place && item.city.toLowerCase() === folder.city.toLowerCase())
            .map(item => <option key={folderKey(item)} value={item.place} />)}</datalist>
        </fieldset>
        <footer className="gallery-dialog-footer">
          {error && <p className="gallery-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button" disabled={busy || !folder.city.trim() || !!image && !title.trim()}>
            {busy ? 'Saving…' : image ? 'Save details' : 'Create folder'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
