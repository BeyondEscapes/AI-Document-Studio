import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
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
  return (
    <html lang="en" data-theme={theme} data-wallpaper={wallpaper}>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
