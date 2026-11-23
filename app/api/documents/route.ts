import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { removeSavedDocument, saveConversation } from '@/lib/conversations'
import { isBusinessDocumentType } from '@/lib/business-documents'
import type { Conversation } from '@/types'

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
  const restored = body?.documentContent
  if (restored !== undefined && (!restored || typeof restored.title !== 'string' ||
    !Array.isArray(restored.sections) || typeof restored.metadata?.generatedAt !== 'string' ||
    (restored.documentType !== undefined && !isBusinessDocumentType(restored.documentType)))) {
    return NextResponse.json({ error: 'Invalid document content' }, { status: 400 })
  }
  const conversation: Conversation = {
    id, title, messages: [], createdAt: timestamp, updatedAt: timestamp,
    selectedTheme: typeof body?.selectedTheme === 'string' ? body.selectedTheme : undefined,
    documentContent: restored ?? {
      title,
      sections: [{ id: randomUUID(), type: 'paragraph', content: '' }],
      approval: { status: 'draft' },
      metadata: { generatedAt: timestamp, prompt: '' },
    },
  }
  try {
    await saveConversation(conversation, user)
    return NextResponse.json({ id, success: true, conversation }, { status: 201 })
  } catch (error) {
    console.error('Could not create document:', error)
    return NextResponse.json({ error: 'Could not save the document.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = request.nextUrl.searchParams.get('id')
  if (!id || !await removeSavedDocument(id, user)) {
    return NextResponse.json({ error: 'Saved document not found.' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
