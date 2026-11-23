import { NextRequest, NextResponse } from 'next/server'
import { getThemes, deleteTheme } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'

export async function GET() {
  try {
    if (!await getCurrentUser()) return unauthorized()
    const themes = getThemes()
    return NextResponse.json({ success: true, themes })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load themes' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (user.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 })
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
