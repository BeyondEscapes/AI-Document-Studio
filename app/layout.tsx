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
  const wallpaper = (await cookies()).get('studio_wallpaper')?.value === 'on' ? 'on' : 'off'
  return (
    <html lang="en" data-wallpaper={wallpaper}>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
