import { NextRequest, NextResponse } from 'next/server'
import { generateDocumentContent, checkApiKey, normalizeModel } from '@/lib/gemini'
import { getDocumentFieldLabel, getMissingRequiredFields, mergeDocumentIntakes } from '@/lib/business-documents'
import { saveConversation, getConversation, getTheme } from '@/lib/db'
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
    const { message, conversationId, model, selectedThemeId } = body

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
        parts: [{ text: m.role === 'assistant' && (m.documentContent || m.documentIntake)
          ? JSON.stringify({
              message: m.content,
              ...(m.documentIntake ? { documentIntake: m.documentIntake } : {}),
              ...(m.documentContent ? { documentContent: m.documentContent } : {}),
            })
          : m.content }],
      }))
    const previousIntake = [...conversation.messages]
      .reverse()
      .find(m => m.documentIntake)?.documentIntake

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
    const documentIntake = result.documentIntake
      ? mergeDocumentIntakes(result.isNewDocument ? undefined : previousIntake, result.documentIntake)
      : undefined
    const missingFields = documentIntake ? getMissingRequiredFields(documentIntake) : []
    let responseText = result.message
    let documentContent = result.documentContent

    if (documentIntake && missingFields.length > 0) {
      const missingLabels = missingFields
        .map(key => getDocumentFieldLabel(documentIntake.documentType, key))
      responseText = `I've identified this as a ${documentIntake.documentType.replaceAll('_', ' ')}. To prepare it accurately, could you provide these missing details: ${missingLabels.join(', ')}?`
      documentContent = null
    } else if (documentIntake && documentContent) {
      documentContent = {
        ...documentContent,
        documentType: documentIntake.documentType,
        intake: documentIntake,
        approval: { status: 'draft' },
      }
    } else if (documentContent) {
      responseText = 'I could not identify and validate the document details. Please tell me which business document you need and provide its source details.'
      documentContent = null
    }

    if (documentIntake) {
      documentIntake.missingFields = missingFields
    }

    // Add assistant message
    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
      documentContent: documentContent || undefined,
      documentIntake: documentIntake || undefined,
    }
    conversation.messages.push(assistantMessage)

    // Auto-title conversation from first message
    if (conversation.messages.length <= 2 || conversation.title === 'New Conversation') {
      const titleText = message.length > 50 ? message.substring(0, 50) + '...' : message
      conversation.title = titleText
    }

    // Keep an incomplete new document from leaving a different document active in the workspace.
    const documentCleared = Boolean(documentIntake && missingFields.length > 0 && conversation.documentContent)
    if (documentContent) {
      conversation.documentContent = documentContent
    } else if (documentCleared) {
      conversation.documentContent = undefined
    }
    if (typeof selectedThemeId === 'string' && getTheme(selectedThemeId)) {
      conversation.selectedTheme = selectedThemeId
    }

    conversation.updatedAt = new Date().toISOString()

    // Save conversation
    saveConversation(conversation)

    return NextResponse.json({
      success: true,
      conversationId: conversation.id,
      message: assistantMessage,
      documentCleared,
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
