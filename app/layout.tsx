import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import { WorkspaceLanguage } from '@/components/WorkspaceLanguage'
import { getCurrentUser } from '@/lib/auth'
import { getSettings } from '@/lib/db'
import { documentLanguageCookie, documentLanguageTags, parseDocumentLanguage } from '@/lib/document-languages'
import './globals.css'
import './workspace.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Document Studio | Beyond Escapes',
  description: 'AI-powered document creation studio for Beyond Escapes Sri Lanka',
  icons: { icon: '/images/beyond_escapes_icon.png' },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const preferences = await cookies()
  const theme = preferences.get('studio_theme')?.value === 'dark' ? 'dark' : 'light'
  const wallpaper = preferences.get('studio_wallpaper')?.value === 'on' ? 'on' : 'off'
  const user = await getCurrentUser()
  const language = (user && (
    parseDocumentLanguage(preferences.get(documentLanguageCookie(user.id))?.value)
    ?? parseDocumentLanguage(getSettings(user).language)
  )) || 'English'
  return (
    <html lang={documentLanguageTags[language]} data-theme={theme} data-wallpaper={wallpaper}>
      <body className={inter.className}><WorkspaceLanguage key={user?.id} initialLanguage={language}>{children}</WorkspaceLanguage></body>
    </html>
  )
}
