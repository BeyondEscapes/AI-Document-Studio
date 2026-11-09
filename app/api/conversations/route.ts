import { NextRequest, NextResponse } from 'next/server'
import { getConversations, saveConversation, deleteConversation } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import type { Conversation } from '@/types'

export async function GET() {
  try {
    const conversations = getConversations()
    return NextResponse.json({ success: true, conversations })
  } catch (error) {
    console.error('Get conversations error:', error)
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const conversation: Conversation = {
      id: uuidv4(),
      title: body.title || 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    saveConversation(conversation)
    return NextResponse.json({ success: true, conversation })
  } catch (error) {
    console.error('Create conversation error:', error)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
    }
    deleteConversation(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete conversation error:', error)
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
