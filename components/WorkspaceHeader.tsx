'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Files, ImageIcon, LayoutDashboard, LogOut, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { rememberStudioConversation, studioReturnHref } from '@/lib/studio-navigation'

export function WorkspaceHeader({ userId, name, role }: { userId: string; name: string; role: 'member' | 'admin' }) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState(false)
  const entries = [
    { href: '/studio', label: 'Studio', icon: Sparkles },
    { href: '/documents', label: 'Documents', icon: Files },
    { href: '/gallery', label: 'Gallery', icon: ImageIcon },
    ...(role === 'admin' ? [{ href: '/admin', label: 'Admin', icon: LayoutDashboard }] : []),
  ]

  async function signOut() {
    setSigningOut(true)
    setError(false)
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
      if (!response.ok) throw new Error()
      rememberStudioConversation(userId)
      window.location.replace('/login')
    } catch {
      setError(true)
      setSigningOut(false)
    }
  }

  function resumeStudio(event: { preventDefault: () => void }) {
    event.preventDefault()
    if (pathname !== '/studio') router.push(studioReturnHref(userId))
  }

  return (
    <header className="workspace-header">
      <Link href="/studio" onNavigate={resumeStudio} className="workspace-brand" aria-label="Beyond Escapes Document Studio">
        <span className="workspace-brand-mark">
          <Image src="/images/beyond_escapes_icon_white.png" alt="" width={26} height={26} />
        </span>
        <span className="workspace-brand-label">Document Studio</span>
      </Link>
      <nav className="workspace-nav" aria-label="Workspace">
        {entries.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onNavigate={href === '/studio' ? resumeStudio : undefined}
            className="workspace-nav-link" aria-current={pathname === href ? 'page' : undefined}>
            <Icon size={16} aria-hidden="true" /><span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="workspace-account">
        <span className="workspace-account-name">{name}</span>
        <ThemeToggle />
        <button type="button" className="icon-button" onClick={signOut} disabled={signingOut}
          aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
        {error && <span className="header-error" role="alert">Could not sign out. Try again.</span>}
      </div>
    </header>
  )
}
