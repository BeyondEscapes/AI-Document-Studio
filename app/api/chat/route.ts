import { NextRequest, NextResponse } from 'next/server'
import { generateDocumentContent, checkApiKey, normalizeModel } from '@/lib/gemini'
import { saveConversation, getConversation } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import type { ChatMessage, Conversation } from '@/types'

export async function POST(request: NextRequest) {
  try {
    // Check API key first
    const apiKeyCheck = checkApiKey()
    if (!apiKeyCheck.configured) {
      return NextResponse.json(
        { error: apiKeyCheck.error, type: 'API_KEY_MISSING' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { message, conversationId, model } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (message.length > 10000) {
      return NextResponse.json({ error: 'Message too long (max 10,000 characters)' }, { status: 400 })
    }

    // Load or create conversation
    let conversation: Conversation
    if (conversationId) {
      const existing = getConversation(conversationId)
      if (existing) {
        conversation = existing
      } else {
        conversation = {
          id: conversationId,
          title: 'New Conversation',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }
    } else {
      conversation = {
        id: uuidv4(),
        title: 'New Conversation',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }

    // Build conversation history for Gemini (excluding system messages)
    const history = conversation.messages
      .filter(m => m.role !== 'system' && !m.isLoading)
      .map(m => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.role === 'assistant' && m.documentContent
          ? JSON.stringify({ message: m.content, documentContent: m.documentContent })
          : m.content }],
      }))

    // Add user message to conversation
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    conversation.messages.push(userMessage)

    // Generate AI response with normalized model
    const result = await generateDocumentContent(message, history, normalizeModel(model))

    // Add assistant message
    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: result.message,
      timestamp: new Date().toISOString(),
      documentContent: result.documentContent || undefined,
    }
    conversation.messages.push(assistantMessage)

    // Auto-title conversation from first message
    if (conversation.messages.length <= 2 || conversation.title === 'New Conversation') {
      const titleText = message.length > 50 ? message.substring(0, 50) + '...' : message
      conversation.title = titleText
    }

    // Update document content on conversation
    if (result.documentContent) {
      conversation.documentContent = result.documentContent
    }

    conversation.updatedAt = new Date().toISOString()

    // Save conversation
    saveConversation(conversation)

    return NextResponse.json({
      success: true,
      conversationId: conversation.id,
      message: assistantMessage,
      conversation: {
        id: conversation.id,
        title: conversation.title,
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `AI generation failed: ${errMsg}` },
      { status: 500 }
    )
  }
}
