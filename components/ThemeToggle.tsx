'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), [])

  function toggleTheme() {
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    document.cookie = `studio_theme=${next}; path=/; max-age=31536000; SameSite=Lax`
    setDark(!dark)
  }

  return (
    <button type="button" className="icon-button" onClick={toggleTheme}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  )
}
