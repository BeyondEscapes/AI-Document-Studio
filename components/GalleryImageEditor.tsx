'use client'

import { useEffect, useRef, useState } from 'react'
import { FlipHorizontal2, RotateCcw, RotateCw, Save, X } from 'lucide-react'
import { encodeGalleryJpeg } from '@/lib/gallery-client'
import type { ItineraryImageCatalogItem } from '@/types'

const ADJUSTMENTS = [
  ['brightness', 'Brightness', 50, 150],
  ['contrast', 'Contrast', 50, 150],
  ['saturation', 'Saturation', 0, 180],
  ['warmth', 'Warmth', 0, 70],
  ['sharpness', 'Sharpness', 0, 60],
] as const

const DEFAULTS = {
  brightness: 100, contrast: 100, saturation: 100, warmth: 0, sharpness: 0,
  rotation: 0, mirror: false, crop: 0, scale: 1,
}
type Settings = typeof DEFAULTS
const PRESETS = {
  Original: DEFAULTS,
  Vivid: { ...DEFAULTS, contrast: 110, saturation: 128, sharpness: 18 },
  Warm: { ...DEFAULTS, brightness: 105, warmth: 25, saturation: 115 },
  'Black & white': { ...DEFAULTS, saturation: 0, contrast: 120 },
}

function outputSize(image: HTMLImageElement, settings: Settings, limit: number) {
  const rotated = settings.rotation % 2 !== 0
  const fullWidth = rotated ? image.naturalHeight : image.naturalWidth
  const fullHeight = rotated ? image.naturalWidth : image.naturalHeight
  const cropWidth = settings.crop ? Math.min(fullWidth, fullHeight * settings.crop) : fullWidth
  const cropHeight = settings.crop ? Math.min(fullHeight, fullWidth / settings.crop) : fullHeight
  const scale = Math.min(settings.scale, limit / Math.max(cropWidth, cropHeight))
  return { width: Math.max(1, Math.round(cropWidth * scale)), height: Math.max(1, Math.round(cropHeight * scale)), scale }
}

function drawImage(canvas: HTMLCanvasElement, image: HTMLImageElement, settings: Settings, limit: number) {
  const { width, height, scale } = outputSize(image, settings, limit)
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!context) throw new Error('Image processing is unavailable in this browser.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingQuality = 'high'
  context.translate(width / 2, height / 2)
  if (settings.mirror) context.scale(-1, 1)
  context.rotate(settings.rotation * Math.PI / 2)
  context.drawImage(image, -image.naturalWidth * scale / 2, -image.naturalHeight * scale / 2,
    image.naturalWidth * scale, image.naturalHeight * scale)

  const { brightness, contrast, saturation, warmth, sharpness } = settings
  if (brightness === 100 && contrast === 100 && saturation === 100 && !warmth && !sharpness) return
  const pixels = context.getImageData(0, 0, width, height)
  const original = sharpness ? pixels.data.slice() : pixels.data
  const strength = sharpness / 100
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const edge = x === 0 || x === width - 1 || y === 0 || y === height - 1
      const adjusted = (channel: number) => {
        const i = index + channel
        const center = original[i]
        if (!strength || edge) return center
        return center + strength * (4 * center - original[i - 4] - original[i + 4] - original[i - width * 4] - original[i + width * 4])
      }
      const red = adjusted(0)
      const green = adjusted(1)
      const blue = adjusted(2)
      const gray = .2126 * red + .7152 * green + .0722 * blue
      const tone = (value: number, temperature: number) =>
        ((gray + (value - gray) * saturation / 100) * brightness / 100 - 128) * contrast / 100 + 128 + temperature
      pixels.data[index] = tone(red, warmth * .45)
      pixels.data[index + 1] = tone(green, warmth * .13)
      pixels.data[index + 2] = tone(blue, -warmth * .35)
    }
  }
  context.putImageData(pixels, 0, 0)
}

export function GalleryImageEditor({ image, onSave, onClose }: {
  image: ItineraryImageCatalogItem
  onSave: (file: File, title: string) => Promise<void>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [source, setSource] = useState<HTMLImageElement>()
  const [settings, setSettings] = useState(DEFAULTS)
  const [compare, setCompare] = useState(false)
  const [title, setTitle] = useState(`${image.title} (edited)`.slice(0, 160))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    dialog.current?.showModal()
    const photo = new window.Image()
    photo.onload = () => setSource(photo)
    photo.onerror = () => setError('Could not open the source image.')
    photo.src = image.url
    return () => {
      photo.onload = null
      photo.onerror = null
    }
  }, [image.url])

  useEffect(() => {
    if (!source || !canvas.current) return
    try {
      drawImage(canvas.current, source, compare ? DEFAULTS : settings, 850)
    } catch {
      setError('Could not render the image preview.')
    }
  }, [source, settings, compare])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!source || busy) return
    setBusy(true)
    setError('')
    try {
      const output = document.createElement('canvas')
      drawImage(output, source, settings, 3200)
      const blob = await encodeGalleryJpeg(output)
      await onSave(new File([blob], 'edited-photo.jpg', { type: blob.type }), title.trim())
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the edited image.')
    } finally {
      setBusy(false)
    }
  }

  const size = source && outputSize(source, settings, 3200)
  return (
    <dialog ref={dialog} className="gallery-dialog gallery-editor" aria-labelledby="photo-editor-title"
      onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <form onSubmit={save}>
        <header className="gallery-dialog-header">
          <h2 id="photo-editor-title">Edit photo</h2>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Close editor"><X size={18} /></button>
        </header>
        <div className="gallery-editor-layout">
          <div className="gallery-preview">
            <canvas ref={canvas} hidden={!source} role="img" aria-label={compare ? 'Original photo' : 'Edited photo preview'} />
            {!source && <p>{error || 'Opening image…'}</p>}
          </div>
          <fieldset className="gallery-editor-controls" disabled={busy || !source}>
            <div className="gallery-actions" aria-label="Filters">
              {Object.entries(PRESETS).map(([name, preset]) => (
                <button className="secondary-button button-compact" type="button" key={name}
                  onClick={() => setSettings(current => ({ ...preset, rotation: current.rotation, mirror: current.mirror, crop: current.crop, scale: current.scale }))}>{name}</button>
              ))}
            </div>
            {ADJUSTMENTS.map(([key, label, min, max]) => (
              <label className="gallery-range" key={key}>
                <span>{label}</span><output>{settings[key]}</output>
                <input type="range" min={min} max={max} value={settings[key]}
                  onChange={event => setSettings(current => ({ ...current, [key]: Number(event.target.value) }))} />
              </label>
            ))}
            <div className="gallery-actions">
              <button type="button" className="icon-button" title="Rotate left" aria-label="Rotate left" onClick={() => setSettings(current => ({ ...current, rotation: (current.rotation + 3) % 4 }))}><RotateCcw size={17} /></button>
              <button type="button" className="icon-button" title="Rotate right" aria-label="Rotate right" onClick={() => setSettings(current => ({ ...current, rotation: (current.rotation + 1) % 4 }))}><RotateCw size={17} /></button>
              <button type="button" className="icon-button" title="Flip horizontally" aria-label="Flip horizontally" aria-pressed={settings.mirror} onClick={() => setSettings(current => ({ ...current, mirror: !current.mirror }))}><FlipHorizontal2 size={17} /></button>
              <button type="button" className="secondary-button button-compact" aria-pressed={compare} onClick={() => setCompare(!compare)}>Original preview</button>
              <button type="button" className="secondary-button button-compact" onClick={() => { setSettings(DEFAULTS); setCompare(false) }}>Reset</button>
            </div>
            <div className="gallery-editor-grid">
              <label>Center crop
                <select value={settings.crop} onChange={event => setSettings(current => ({ ...current, crop: Number(event.target.value) }))}>
                  <option value={0}>Original ratio</option><option value={1}>Square</option>
                  <option value={4 / 3}>4:3 landscape</option><option value={16 / 9}>16:9 wide</option><option value={3 / 4}>3:4 portrait</option>
                </select>
              </label>
              <label>Resolution
                <select value={settings.scale} onChange={event => setSettings(current => ({ ...current, scale: Number(event.target.value) }))}>
                  <option value={1}>Original size</option><option value={1.5}>1.5× upscale</option><option value={2}>2× upscale</option>
                </select>
              </label>
            </div>
            {size && <p className="gallery-note">{size.width} × {size.height} px · Maximum 3200 px per side</p>}
            <label>Copy title<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>
          </fieldset>
        </div>
        <footer className="gallery-dialog-footer">
          {error && <p className="gallery-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button" disabled={busy || !source || !title.trim()}>
            <Save size={16} />{busy ? 'Saving…' : 'Save edited copy'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
