import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { removeSavedDocument, saveConversation } from '@/lib/db'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > 160) {
    return NextResponse.json({ error: 'Enter a document title of up to 160 characters.' }, { status: 400 })
  }
  const timestamp = new Date().toISOString()
  const id = randomUUID()
  saveConversation({
    id, title, messages: [], createdAt: timestamp, updatedAt: timestamp,
    documentContent: {
      title,
      sections: [{ id: randomUUID(), type: 'paragraph', content: '' }],
      approval: { status: 'draft' },
      metadata: { generatedAt: timestamp, prompt: '' },
    },
  }, user)
  return NextResponse.json({ id }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = request.nextUrl.searchParams.get('id')
  if (!id || !removeSavedDocument(id, user)) {
    return NextResponse.json({ error: 'Saved document not found.' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
