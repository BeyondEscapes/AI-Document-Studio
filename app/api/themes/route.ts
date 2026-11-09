import { NextRequest, NextResponse } from 'next/server'
import { getThemes, saveTheme, deleteTheme } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'

export async function GET() {
  try {
    const themes = getThemes()
    return NextResponse.json({ success: true, themes })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load themes' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Theme ID required' }, { status: 400 })
    if (id === 'beyond-escapes-official') {
      return NextResponse.json({ error: 'Cannot delete the default template' }, { status: 400 })
    }
    deleteTheme(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete theme' }, { status: 500 })
  }
}
