'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, FileText, RefreshCw, AlertCircle, Sparkles, ChevronRight, ExternalLink } from 'lucide-react'
import { BUSINESS_DOCUMENT_TEMPLATES, getDocumentFieldLabel } from '@/lib/business-documents'
import type { Conversation, ChatMessage, DocumentContent, AppSettings } from '@/types'

interface ChatPanelProps {
  conversation: Conversation | null
  apiKeyConfigured: boolean
  selectedThemeId: string
  settings: AppSettings | null
  onMessageSent: (conversation: Conversation, docContent?: DocumentContent, clearDocument?: boolean) => void
  onToggleDocPanel: () => void
  isDocPanelOpen: boolean
}

const QUICK_PROMPTS = [
  'Create a 5-day Sri Lanka itinerary from Colombo to Kandy to Bentota',
  'Create a room reservation using the hotel and guest details I provide',
  'Prepare a hotel voucher from my confirmed booking details',
  'Create an invoice from the line items, amounts, currency, and date I provide',
  'Prepare a transport confirmation using my service and booking details',
  'Create a rooming list from the guest names and room assignments I provide',
  'Write a business letter using the recipient and key points I provide',
]

export function ChatPanel({
  conversation, apiKeyConfigured, selectedThemeId, settings,
  onMessageSent, onToggleDocPanel, isDocPanelOpen,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const currentConvId = useRef<string | null>(null)

  useEffect(() => {
    if (conversation) {
      setMessages(conversation.messages)
      currentConvId.current = conversation.id
    } else {
      setMessages([])
      currentConvId.current = null
    }
    setError(null)
  }, [conversation?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const autoResizeTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [])

  const handleSubmit = async (messageText?: string) => {
    const text = (messageText || input).trim()
    if (!text || isLoading) return
    if (!apiKeyConfigured) {
      setError('Please configure your Gemini API key in .env.local to use AI features.')
      return
    }

    setInput('')
    setError(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Add optimistic user message
    const tempUserMsg: ChatMessage = {
      id: 'temp-user-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    const tempLoadingMsg: ChatMessage = {
      id: 'temp-loading-' + Date.now(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isLoading: true,
    }
    setMessages(prev => [...prev, tempUserMsg, tempLoadingMsg])
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: currentConvId.current,
          model: settings?.geminiModel || 'gemini-3.5-flash',
          selectedThemeId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Server error: ${res.status}`)
      }

      if (data.success) {
        currentConvId.current = data.conversationId
        // Reload full conversation to get accurate state
        const convRes = await fetch(`/api/conversations/${data.conversationId}`)
        const convData = await convRes.json()
        if (convData.success) {
          setMessages(convData.conversation.messages)
          onMessageSent(convData.conversation, data.message?.documentContent, data.documentCleared)
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to send message. Please try again.'
      setError(errMsg)
      // Remove loading message
      setMessages(prev => prev.filter(m => !m.isLoading && m.id !== tempUserMsg.id))
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const isEmptyConversation = messages.length === 0

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 h-14">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-blue-500" />
          <h1 className="text-sm font-semibold text-gray-800">
            {conversation?.title || 'New Document'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {messages.some(m => m.documentContent) && (
            <button
              onClick={onToggleDocPanel}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDocPanelOpen
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            >
              <FileText size={13} />
              {isDocPanelOpen ? 'Hide Document' : 'View Document'}
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {isEmptyConversation ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-8">
            {/* Welcome */}
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <Sparkles size={24} className="text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              AI Document Studio
            </h2>
            <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
              Describe the document you need. The same AI chat creates travel documents and business paperwork using Beyond Escapes templates.
            </p>

            {!apiKeyConfigured && (
              <div className="w-full max-w-sm mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">API Key Required</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Add your Gemini API key to <code className="bg-amber-100 px-1 rounded">.env.local</code>:
                    </p>
                    <code className="block text-xs mt-1 bg-amber-100 p-2 rounded text-amber-800">
                      GEMINI_API_KEY=your_key_here
                    </code>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 mt-1 underline"
                    >
                      Get a free API key <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Prompts */}
            <div className="w-full max-w-sm space-y-2">
              <p className="text-xs font-medium text-gray-500 mb-2">Quick start:</p>
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(prompt)}
                  disabled={!apiKeyConfigured || isLoading}
                  className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-xs text-gray-600 hover:text-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 group"
                >
                  <ChevronRight size={12} className="text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} onViewDocument={onToggleDocPanel} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
          <AlertCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-100">
        <div className="relative flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResizeTextarea() }}
            onKeyDown={handleKeyDown}
            placeholder="Ask for a reservation, voucher, itinerary, invoice, confirmation, letter, or another business document..."
            rows={1}
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none outline-none min-h-[36px] max-h-40 py-1 disabled:opacity-50"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {isLoading ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          Press Enter to send • Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

function DocumentIntakeCard({ intake }: { intake: NonNullable<ChatMessage['documentIntake']> }) {
  const template = BUSINESS_DOCUMENT_TEMPLATES[intake.documentType]
  const suppliedFields = template.fields.filter(field => intake.fields[field.key]?.trim())

  return (
    <div className="w-full mt-1 rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-xs">
      <p className="font-semibold text-blue-800">{template.label} details</p>
      {suppliedFields.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {suppliedFields.map(field => (
            <div key={field.key} className="contents">
              <dt className="text-gray-500">{field.label}</dt>
              <dd className="min-w-0 text-gray-800 break-words">{intake.fields[field.key]}</dd>
            </div>
          ))}
        </dl>
      )}
      {intake.missingFields.length > 0 && (
        <p className="mt-2 text-amber-700">
          Still needed: {intake.missingFields.map(key => getDocumentFieldLabel(intake.documentType, key)).join(', ')}
        </p>
      )}
    </div>
  )
}

function ChatMessageBubble({ message, onViewDocument }: { message: ChatMessage; onViewDocument: () => void }) {
  const isUser = message.role === 'user'

  if (message.isLoading) {
    return (
      <div className="flex items-start gap-3 message-enter">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} className="text-white" />
        </div>
        <div className="flex-1 bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3">
          <div className="flex items-center gap-1.5">
            <div className="loading-dot"></div>
            <div className="loading-dot"></div>
            <div className="loading-dot"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-3 message-enter ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isUser
          ? 'bg-gray-200 text-gray-600'
          : 'bg-gradient-to-br from-blue-500 to-blue-600'
      }`}>
        {isUser ? (
          <span className="text-xs font-semibold">U</span>
        ) : (
          <Sparkles size={13} className="text-white" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-tr-sm'
            : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-tl-sm'
        }`}>
          {message.content}
        </div>

        {/* Document Preview Badge */}
        {message.documentContent && (
          <button
            onClick={onViewDocument}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50 rounded-lg text-xs text-blue-600 font-medium transition-all shadow-sm"
          >
            <FileText size={12} />
            <span>View: {message.documentContent.title}</span>
            <ChevronRight size={11} />
          </button>
        )}

        {message.documentIntake && (
          <DocumentIntakeCard intake={message.documentIntake} />
        )}

        <span className="text-[10px] text-gray-400 px-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
