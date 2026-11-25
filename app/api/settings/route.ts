import { NextRequest, NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/lib/db'
import { documentLanguageCookie, parseDocumentLanguage } from '@/lib/document-languages'
import { checkApiKey } from '@/lib/gemini'
import { getCurrentUser, unauthorized } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    const settings = getSettings(user)
    settings.language = parseDocumentLanguage(request.cookies.get(documentLanguageCookie(user.id))?.value)
      ?? parseDocumentLanguage(settings.language) ?? 'English'
    const apiKeyStatus = checkApiKey()
    return NextResponse.json({ 
      success: true, 
      settings,
      apiKeyConfigured: apiKeyStatus.configured,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid settings.' }, { status: 400 })
    }
    if ('language' in body) {
      const language = parseDocumentLanguage(body.language)
      if (!language) return NextResponse.json({ error: 'Unsupported document language.' }, { status: 400 })
      body.language = language
    }
    // Filter to only allowed setting keys
    const allowed = ['defaultThemeId', 'defaultOutputFormats', 'geminiModel', 'language', 'autoSave']
    const filtered: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) filtered[key] = body[key]
    }
    saveSettings(filtered, user)
    const response = NextResponse.json({ success: true })
    if (typeof filtered.language === 'string') {
      response.cookies.set(documentLanguageCookie(user.id), filtered.language, {
        httpOnly: true,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      })
    }
    return response
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
