import { NextRequest, NextResponse } from 'next/server'
import { getConversation, saveConversation, deleteConversation, nextConversationUpdate } from '@/lib/conversations'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { isBusinessDocumentType } from '@/lib/business-documents'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    const { id } = await params
    const conversation = await getConversation(id, user)
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, conversation })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    const { id } = await params
    const body = await request.json()
    const existing = await getConversation(id, user)
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    const document = body?.documentContent
    if (document !== undefined && (!document || typeof document.title !== 'string' ||
      !Array.isArray(document.sections) || typeof document.metadata?.generatedAt !== 'string' ||
      (document.documentType !== undefined && !isBusinessDocumentType(document.documentType)))) {
      return NextResponse.json({ error: 'Invalid document content' }, { status: 400 })
    }
    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 160) : ''
    const updated = {
      ...existing,
      title: title || existing.title,
      documentContent: document ?? existing.documentContent,
      selectedTheme: typeof body?.selectedTheme === 'string' ? body.selectedTheme : existing.selectedTheme,
      updatedAt: nextConversationUpdate(existing.updatedAt),
    }
    if (document && !existing.documentContent) {
      return NextResponse.json({ error: 'This saved document was deleted.' }, { status: 409 })
    }
    if (!await saveConversation(updated, user, existing.updatedAt)) {
      return NextResponse.json({ error: 'This conversation changed. Try saving again.' }, { status: 409 })
    }
    return NextResponse.json({ success: true, conversation: updated })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    const { id } = await params
    if (!await deleteConversation(id, user)) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
