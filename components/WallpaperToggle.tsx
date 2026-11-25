'use client'

import { ImageIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

export function WallpaperToggle() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(document.documentElement.dataset.wallpaper === 'on')
  }, [])

  function toggleWallpaper() {
    const next = enabled ? 'off' : 'on'
    document.documentElement.dataset.wallpaper = next
    document.cookie = `studio_wallpaper=${next}; path=/; max-age=31536000; SameSite=Lax`
    setEnabled(next === 'on')
  }

  return (
    <button type="button" className="icon-button wallpaper-toggle" onClick={toggleWallpaper}
      aria-label="Workspace wallpaper" aria-pressed={enabled}
      title={enabled ? 'Turn off wallpaper' : 'Turn on wallpaper'}>
      <ImageIcon size={18} aria-hidden="true" />
    </button>
  )
}
