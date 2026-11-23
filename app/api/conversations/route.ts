import { NextRequest, NextResponse } from 'next/server'
import { getConversations, saveConversation, deleteConversation } from '@/lib/conversations'
import { v4 as uuidv4 } from 'uuid'
import type { Conversation } from '@/types'
import { getCurrentUser, unauthorized } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    const conversations = await getConversations(user, request.nextUrl.searchParams.get('view') === 'summary')
    return NextResponse.json({ success: true, conversations })
  } catch (error) {
    console.error('Get conversations error:', error)
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    const body = await request.json()
    const conversation: Conversation = {
      id: uuidv4(),
      title: (typeof body?.title === 'string' ? body.title.trim().slice(0, 160) : '') || 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await saveConversation(conversation, user)
    return NextResponse.json({ success: true, conversation })
  } catch (error) {
    console.error('Create conversation error:', error)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
    }
    if (!await deleteConversation(id, user)) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete conversation error:', error)
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
