import { NextRequest, NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/lib/db'
import { checkApiKey } from '@/lib/gemini'

export async function GET() {
  try {
    const settings = getSettings()
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
    const body = await request.json()
    // Filter to only allowed setting keys
    const allowed = ['defaultThemeId', 'defaultOutputFormats', 'geminiModel', 'language', 'autoSave']
    const filtered: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) filtered[key] = body[key]
    }
    saveSettings(filtered)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
