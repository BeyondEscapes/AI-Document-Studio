export async function galleryRequest<T>(method = 'GET', body?: FormData | object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/itinerary-images?gallery=1', {
    method,
    signal,
    ...(body instanceof FormData
      ? { body }
      : body && { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(result?.error ?? (response.status === 413 ? 'The image exceeds the upload limit.' : 'The image library request failed.'))
  }
  return result as T
}

export function encodeGalleryJpeg(canvas: HTMLCanvasElement, quality = .94): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Could not encode the image.'))
    }, 'image/jpeg', quality)
  })
}

export async function prepareGalleryUpload(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.')
  if (file.size <= 3_800_000) return file
  const image = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 3200 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Image processing is unavailable in this browser.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await encodeGalleryJpeg(canvas, .88)
    if (blob.size > 3_800_000) throw new Error('The image exceeds the upload limit after compression.')
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: blob.type })
  } finally {
    image.close()
  }
}
