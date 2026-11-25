'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send, FileText, RefreshCw, AlertCircle, Sparkles, ChevronRight, ExternalLink,
  BedDouble, Bus, Mail, ReceiptText, Route, Ticket, Users,
} from 'lucide-react'
import { BUSINESS_DOCUMENT_TEMPLATES, getDocumentFieldLabel } from '@/lib/business-documents'
import { ChatWallpaper } from './ChatWallpaper'
import { useWorkspaceLanguage } from './WorkspaceLanguage'
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
  { label: 'Tour itinerary', detail: 'Plan a Sri Lanka trip', icon: Route, prompt: 'Create a 5-day Sri Lanka itinerary from Colombo to Kandy to Bentota' },
  { label: 'Room reservation', detail: 'Arrange a hotel stay', icon: BedDouble, prompt: 'Create a room reservation using the hotel and guest details I provide' },
  { label: 'Hotel voucher', detail: 'Confirm a booking', icon: Ticket, prompt: 'Prepare a hotel voucher from my confirmed booking details' },
  { label: 'Invoice', detail: 'Bill for services', icon: ReceiptText, prompt: 'Create an invoice from the line items, amounts, currency, and date I provide' },
  { label: 'Transport', detail: 'Confirm a transfer', icon: Bus, prompt: 'Prepare a transport confirmation using my service and booking details' },
  { label: 'Rooming list', detail: 'Organize guest rooms', icon: Users, prompt: 'Create a rooming list from the guest names and room assignments I provide' },
  { label: 'Business letter', detail: 'Draft correspondence', icon: Mail, prompt: 'Write a business letter using the recipient and key points I provide' },
]

export function ChatPanel({
  conversation, apiKeyConfigured, selectedThemeId, settings,
  onMessageSent, onToggleDocPanel, isDocPanelOpen,
}: ChatPanelProps) {
  const { language, t } = useWorkspaceLanguage()
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
          language,
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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const isEmptyConversation = messages.length === 0

  return (
    <div className="chat-panel flex h-full flex-col bg-ui-panel">
      {/* Header */}
      <div className="chat-panel-header flex h-14 shrink-0 items-center justify-between border-b border-ui-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles size={16} className="shrink-0 text-ui-accent" />
          <h1 className="truncate text-sm font-semibold text-ui-body">
            {conversation?.documentContent?.title || conversation?.title || t('newDocument')}
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
              {isDocPanelOpen ? t('hideDocument') : t('showDocument')}
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="chat-canvas wallpaper-surface relative isolate min-h-0 flex-1">
        <ChatWallpaper />
        <div className="relative h-full overflow-y-auto">
          {isEmptyConversation ? (
            <div className="flex min-h-full flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-9">
              <div className="chat-start-heading">
                <span className="document-symbol"><Sparkles size={22} aria-hidden="true" /></span>
                <h2>{t('whatToCreate')}</h2>
                <p>{t('chooseType')}</p>
              </div>

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
              <div className="chat-quick-start" role="group" aria-label="Quick start">
                {QUICK_PROMPTS.map(({ label, detail, icon: Icon, prompt }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleSubmit(prompt)}
                    disabled={!apiKeyConfigured || isLoading}
                    className="chat-prompt"
                  >
                    <Icon size={17} className="shrink-0 text-ui-accent" aria-hidden="true" />
                    <span><strong>{label}</strong><small>{detail}</small></span>
                    <ChevronRight size={14} className="ml-auto shrink-0 text-ui-muted" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-4 px-4 py-5">
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
        <div role="alert" className="mx-4 mb-2 flex items-start gap-2 rounded-xl border border-ui-danger-tint bg-ui-danger-tint p-3">
          <AlertCircle size={14} className="text-ui-danger mt-0.5 flex-shrink-0" />
          <p className="text-xs text-ui-danger">{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="ml-auto px-1 text-ui-danger">
            ×
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="chat-composer shrink-0 border-t border-ui-line px-3 pb-2 pt-2 sm:px-4">
        <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-xl border border-ui-line bg-ui-canvas px-2.5 py-1.5 focus-within:border-ui-accent focus-within:ring-2 focus-within:ring-ui-line">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResizeTextarea() }}
            onKeyDown={handleKeyDown}
            aria-label="Message Document Studio"
            placeholder={t('describe')}
            rows={1}
            disabled={isLoading}
            className="min-w-0 flex-1 bg-transparent text-sm text-ui-body placeholder-ui-muted resize-none outline-none min-h-[36px] max-h-40 py-1 disabled:opacity-50"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isLoading || !apiKeyConfigured}
            aria-label={t('send')}
            title="Send message"
            className="primary-button button-square shrink-0"
          >
            {isLoading ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
          </button>
        </div>
        <p className="chat-composer-hint mt-1 text-center text-[11px] text-ui-muted">
          <kbd>Enter</kbd> to send <span aria-hidden="true">·</span> <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
        </p>
      </div>
    </div>
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
