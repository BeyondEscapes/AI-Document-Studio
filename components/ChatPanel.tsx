'use client'

import { useState, useEffect, useRef, useCallback, useId } from 'react'
import {
  Send, FileText, RefreshCw, AlertCircle, Sparkles, ChevronRight, ExternalLink,
  Camera, Compass, MapPin, Mountain, Palmtree, Plane, Route, Sailboat, Ticket, Waves,
} from 'lucide-react'
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
      content: 'Generating itinerary...',
      timestamp: new Date().toISOString(),
      isLoading: true,
    }
    setMessages(prev => [...prev, tempUserMsg, tempLoadingMsg])
    setIsLoading(true)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 45000)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          conversationId: currentConvId.current,
          model: settings?.geminiModel || 'gemini-3.1-flash-lite',
          selectedThemeId,
        }),
      })
      clearTimeout(timeoutId)

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Server error: ${res.status}`)
      }

      if (data.success) {
        currentConvId.current = data.conversationId
        // Instantly update using data.conversation returned directly by /api/chat
        if (data.conversation && Array.isArray(data.conversation.messages)) {
          setMessages(data.conversation.messages)
          onMessageSent(data.conversation, data.message?.documentContent, data.documentCleared)
        } else if (data.message) {
          setMessages(prev => [...prev.filter(m => !m.isLoading), data.message])
          if (data.conversation) {
            onMessageSent(data.conversation, data.message?.documentContent, data.documentCleared)
          }
        } else {
          // Fallback if conversation object was omitted
          const convRes = await fetch(`/api/conversations/${data.conversationId}`)
          const convData = await convRes.json()
          if (convData.success && convData.conversation) {
            setMessages(convData.conversation.messages)
            onMessageSent(convData.conversation, data.message?.documentContent, data.documentCleared)
          }
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId)
      const errMsg = err?.name === 'AbortError'
        ? 'Generation timed out. Please try sending again.'
        : err instanceof Error ? err.message : 'Failed to send message. Please try again.'
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
    <div className="flex flex-col h-full bg-ui-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ui-line h-14">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles size={16} className="shrink-0 text-ui-accent" />
          <h1 className="truncate text-sm font-semibold text-ui-body">
            {conversation?.documentContent?.title || conversation?.title || 'New document'}
          </h1>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-2">
          {(conversation?.documentContent || messages.some(m => m.documentContent)) && (
            <button
              onClick={onToggleDocPanel}
              aria-pressed={isDocPanelOpen}
              className="secondary-button button-compact"
            >
              <FileText size={13} />
              {isDocPanelOpen ? 'Hide document' : 'View document'}
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="chat-canvas relative isolate min-h-0 flex-1">
        <ChatWallpaper />
        <div className="relative h-full overflow-y-auto">
          {isEmptyConversation ? (
            <div className="flex min-h-full flex-col items-center justify-center px-6 py-8">
              {/* Welcome */}
              <div className="w-14 h-14 bg-ui-action rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                <Sparkles size={24} className="text-white" />
              </div>
              <h2 className="text-xl font-semibold text-ui-body mb-2">
                AI Document Studio
              </h2>
              <p className="text-sm text-ui-muted text-center max-w-sm mb-6">
                Describe the document you need. The same AI chat creates travel documents and business paperwork using Beyond Escapes templates.
              </p>

              {!apiKeyConfigured && (
                <div className="w-full max-w-sm mb-6 p-4 bg-ui-warning-tint border border-ui-warning-tint rounded-xl">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-ui-warning mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-ui-warning">API Key Required</p>
                      <p className="text-xs text-ui-warning mt-1">
                        Add your Gemini API key to <code className="bg-ui-warning-tint px-1 rounded">.env.local</code>:
                      </p>
                      <code className="block text-xs mt-1 bg-ui-warning-tint p-2 rounded text-ui-warning">
                        GEMINI_API_KEY=your_key_here
                      </code>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-ui-warning hover:text-ui-warning mt-1 underline"
                      >
                        Get a free API key <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Prompts */}
              <div className="w-full max-w-sm space-y-2">
                <p className="text-xs font-medium text-ui-muted mb-2">Quick start:</p>
                {QUICK_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSubmit(prompt)}
                    disabled={!apiKeyConfigured || isLoading}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-ui-line bg-ui-panel hover:border-ui-accent hover:bg-ui-tint text-xs text-ui-muted hover:text-ui-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 group"
                  >
                    <ChevronRight size={12} className="text-ui-muted group-hover:text-ui-accent flex-shrink-0" />
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
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mb-2 p-3 bg-ui-danger-tint border border-ui-danger-tint rounded-xl flex items-start gap-2">
          <AlertCircle size={14} className="text-ui-danger mt-0.5 flex-shrink-0" />
          <p className="text-xs text-ui-danger">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-ui-danger hover:text-ui-danger">
            ×
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="px-4 pb-4 pt-2 border-t border-ui-line">
        <div className="relative flex items-end gap-2 bg-ui-canvas border border-ui-line rounded-xl px-3 py-2 focus-within:border-ui-accent focus-within:ring-2 focus-within:ring-ui-line">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResizeTextarea() }}
            onKeyDown={handleKeyDown}
            placeholder="Ask for a reservation, voucher, itinerary, invoice, confirmation, letter, or another business document..."
            rows={1}
            disabled={isLoading}
            className="min-w-0 flex-1 bg-transparent text-sm text-ui-body placeholder-ui-muted resize-none outline-none min-h-[36px] max-h-40 py-1 disabled:opacity-50"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isLoading}
            className="primary-button button-square shrink-0"
          >
            {isLoading ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
          </button>
        </div>
        <p className="text-[10px] text-ui-muted mt-1.5 text-center">
          Press Enter to send • Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

function ChatWallpaper() {
  const patternId = useId()

  return (
    <svg aria-hidden="true" focusable="false" className="chat-wallpaper">
      <defs>
        <pattern id={patternId} width="236" height="208" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <Plane x={20} y={25} size={25} strokeWidth={1.25} />
            <Compass x={101} y={12} size={23} strokeWidth={1.25} />
            <Palmtree x={183} y={32} size={26} strokeWidth={1.25} />
            <Ticket x={60} y={68} size={23} strokeWidth={1.25} />
            <Mountain x={143} y={77} size={27} strokeWidth={1.25} />
            <Sailboat x={17} y={120} size={25} strokeWidth={1.25} />
            <MapPin x={99} y={121} size={21} strokeWidth={1.25} />
            <Camera x={197} y={126} size={23} strokeWidth={1.25} />
            <Waves x={57} y={170} size={26} strokeWidth={1.25} />
            <Route x={153} y={168} size={24} strokeWidth={1.25} />
            <path d="M69 32h6m-3-3v6M129 52h6m-3-3v6M205 90h6m-3-3v6M54 143h6m-3-3v6M116 183h6m-3-3v6M21 188h6m-3-3v6" />
            <path d="M26 80h.1M91 102h.1M165 19h.1M162 137h.1M207 181h.1M223 59h.1" strokeWidth="3" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}

function DocumentIntakeCard({ intake }: { intake: NonNullable<ChatMessage['documentIntake']> }) {
  const template = BUSINESS_DOCUMENT_TEMPLATES[intake.documentType]
  const suppliedFields = template.fields.filter(field => intake.fields[field.key]?.trim())

  return (
    <div className="w-full mt-1 rounded-xl border border-ui-line bg-ui-panel px-3 py-2.5 text-xs">
      <p className="font-semibold text-ui-accent">{template.label} details</p>
      {suppliedFields.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {suppliedFields.map(field => (
            <div key={field.key} className="contents">
              <dt className="text-ui-muted">{field.label}</dt>
              <dd className="min-w-0 text-ui-body break-words">{intake.fields[field.key]}</dd>
            </div>
          ))}
        </dl>
      )}
      {intake.missingFields.length > 0 && (
        <p className="mt-2 text-ui-warning">
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
        <div className="w-7 h-7 rounded-lg bg-ui-action flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} className="text-white" />
        </div>
        <div className="flex-1 bg-ui-canvas rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="loading-dot"></div>
            <div className="loading-dot"></div>
            <div className="loading-dot"></div>
          </div>
          {message.content ? (
            <span className="text-xs text-ui-accent font-medium animate-pulse">{message.content}</span>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-3 message-enter ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isUser
          ? 'bg-ui-subtle text-ui-muted'
          : 'bg-ui-action'
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
            ? 'bg-ui-action text-white rounded-tr-sm'
            : 'bg-ui-canvas border border-ui-line text-ui-body rounded-tl-sm'
        }`}>
          {message.content}
        </div>

        {/* Document Preview Badge */}
        {message.documentContent && (
          <button
            onClick={onViewDocument}
            className="secondary-button button-compact max-w-full"
          >
            <FileText size={12} className="shrink-0" />
            <span className="truncate">View: {message.documentContent.title}</span>
            <ChevronRight size={11} className="shrink-0" />
          </button>
        )}

        {message.documentIntake && (
          <DocumentIntakeCard intake={message.documentIntake} />
        )}

        <span className="text-[10px] text-ui-muted px-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
