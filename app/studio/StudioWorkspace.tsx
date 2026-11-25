'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { ChatPanel } from '@/components/ChatPanel'
import { DocumentWorkspace } from '@/components/DocumentWorkspace'
import { prepareDocumentForLocalSave } from '@/lib/itinerary-images'
import { rememberStudioConversation } from '@/lib/studio-navigation'
import type { Conversation, DocumentContent, DocumentTheme, AppSettings } from '@/types'

export default function StudioWorkspace({ userId, initialConversation, cloudDocuments, openInEdit, serverPdfAvailable }: {
  userId: string
  initialConversation: Conversation | null
  cloudDocuments: boolean
  openInEdit: boolean
  serverPdfAvailable: boolean
}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(initialConversation)
  const [documentContent, setDocumentContent] = useState<DocumentContent | null>(initialConversation?.documentContent ?? null)
  const [themes, setThemes] = useState<DocumentTheme[]>([])
  const [selectedThemeId, setSelectedThemeId] = useState(initialConversation?.selectedTheme || 'beyond-escapes-official')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean>(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(Boolean(initialConversation?.documentContent))
  const [documentSaveStatus, setDocumentSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(initialConversation?.documentContent ? 'saved' : 'idle')
  const [documentSaveError, setDocumentSaveError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [openError, setOpenError] = useState<{ conversation: Conversation; message: string } | null>(null)
  const conversationRequests = useRef(new Map<string, { promise: Promise<Conversation>; expires: number }>())
  const activeId = useRef(initialConversation?.id)
  const selectedRequest = useRef(0)
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve())
  const saveSequence = useRef(0)

  const setActiveId = useCallback((id?: string) => {
    activeId.current = id
    rememberStudioConversation(userId, id)
  }, [userId])

  // Load initial data
  useEffect(() => {
    rememberStudioConversation(userId, activeId.current)
    if (window.matchMedia('(max-width: 767px)').matches) setIsSidebarOpen(false)
    loadConversations()
    loadThemes()
    loadSettings()
  }, [])

  const loadConversations = async () => {
    try {
      const res = await fetch('/api/conversations?view=summary')
      const data = await res.json()
      if (data.success) setConversations(data.conversations)
    } catch (err) {
      console.error('Failed to load conversations:', err)
    }
  }

  const loadThemes = async () => {
    try {
      const res = await fetch('/api/themes')
      const data = await res.json()
      if (data.success) setThemes(data.themes)
    } catch (err) {
      console.error('Failed to load themes:', err)
    }
  }

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.success) {
        setSettings(data.settings)
        setApiKeyConfigured(data.apiKeyConfigured)
        if (data.settings.defaultThemeId && !activeId.current) {
          setSelectedThemeId(data.settings.defaultThemeId)
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  const handleNewConversation = useCallback(() => {
    selectedRequest.current += 1
    setOpeningId(null)
    setOpenError(null)
    setActiveId()
    setActiveConversation(null)
    setDocumentContent(null)
    setIsDocPanelOpen(false)
    setDocumentSaveStatus('idle')
    setDocumentSaveError(null)
  }, [setActiveId])

  const loadConversation = useCallback((id: string) => {
    const existing = conversationRequests.current.get(id)
    if (existing && existing.expires > Date.now()) return existing.promise
    const promise = fetch(`/api/conversations/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || !data.conversation) throw new Error(data.error || 'Could not open this conversation.')
        return data.conversation as Conversation
      })
      .catch(error => {
        if (conversationRequests.current.get(id)?.promise === promise) conversationRequests.current.delete(id)
        throw error
      })
    conversationRequests.current.set(id, { promise, expires: Date.now() + 30_000 })
    for (const [key, request] of conversationRequests.current) {
      if (request.expires <= Date.now()) conversationRequests.current.delete(key)
    }
    return promise
  }, [])

  const prefetchConversation = useCallback((id: string) => {
    if (id !== activeId.current) void loadConversation(id).catch(() => undefined)
  }, [loadConversation])

  const handleSelectConversation = useCallback(async (conversation: Conversation) => {
    const requestNumber = ++selectedRequest.current
    setOpenError(null)
    if (activeId.current === conversation.id) {
      setOpeningId(null)
      setIsDocPanelOpen(Boolean(documentContent))
      return
    }
    setOpeningId(conversation.id)
    try {
      const loaded = await loadConversation(conversation.id)
      if (selectedRequest.current !== requestNumber) return
      setActiveId(loaded.id)
      setActiveConversation(loaded)
      setSelectedThemeId(loaded.selectedTheme || settings?.defaultThemeId || 'beyond-escapes-official')
      setDocumentContent(loaded.documentContent ?? null)
      setIsDocPanelOpen(Boolean(loaded.documentContent))
      setDocumentSaveStatus(loaded.documentContent ? 'saved' : 'idle')
      setDocumentSaveError(null)
    } catch (error) {
      if (selectedRequest.current === requestNumber) {
        setOpenError({ conversation, message: error instanceof Error ? error.message : 'Could not open this conversation.' })
      }
    } finally {
      if (selectedRequest.current === requestNumber) setOpeningId(null)
    }
  }, [documentContent, loadConversation, setActiveId, settings?.defaultThemeId])

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not delete conversation.')
      conversationRequests.current.delete(id)
      setConversations(prev => prev.filter(c => c.id !== id))
      if (activeConversation?.id === id) {
        setActiveId()
        setActiveConversation(null)
        setDocumentContent(null)
        setIsDocPanelOpen(false)
        setDocumentSaveStatus('idle')
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
  }, [activeConversation, setActiveId])

  const handleMessageSent = useCallback((
    updatedConversation: Conversation,
    newDocContent?: DocumentContent,
    clearDocument = false
  ) => {
    conversationRequests.current.delete(updatedConversation.id)
    setActiveId(updatedConversation.id)
    setActiveConversation(updatedConversation)
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === updatedConversation.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = updatedConversation
        return updated
      }
      return [updatedConversation, ...prev]
    })
    if (newDocContent) {
      setDocumentContent(newDocContent)
      setIsDocPanelOpen(true)
      setDocumentSaveStatus('saved')
    } else if (clearDocument) {
      setDocumentContent(null)
      setIsDocPanelOpen(false)
      setDocumentSaveStatus('idle')
    }
  }, [setActiveId])

  const persistDocument = useCallback(async (content: DocumentContent, recoverMissing = false) => {
    if (!activeConversation) {
      setDocumentSaveStatus('error')
      throw new Error('Start a conversation before saving a document.')
    }

    const id = activeConversation.id
    conversationRequests.current.delete(id)
    const sequence = ++saveSequence.current
    const isCurrent = () => activeId.current === id && sequence === saveSequence.current
    setDocumentSaveStatus('saving')
    setDocumentSaveError(null)
    const save = pendingSave.current.catch(() => undefined).then(async () => {
      const documentContent = prepareDocumentForLocalSave(content)
      let res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentContent,
          selectedTheme: selectedThemeId,
        }),
      })
      if (res.status === 404 && recoverMissing && isCurrent()) {
        res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: (content.title.trim() || 'Untitled document').slice(0, 160),
            documentContent,
            selectedTheme: selectedThemeId,
          }),
        })
      }
      const responseText = await res.text()
      let data: { success?: boolean; error?: string; conversation?: Conversation }
      try {
        data = JSON.parse(responseText)
      } catch {
        if (res.status === 413) {
          throw new Error('This document is too large to save. Remove oversized embedded cover images and retry.')
        }
        throw new Error(`Could not save this document (HTTP ${res.status}).`)
      }
      const conversation = data.conversation
      if (!res.ok || !data.success || !conversation) {
        throw new Error(res.status === 404
          ? 'This conversation could not be found. Choose Save document to recover a copy of the open document.'
          : data.error || 'Could not save this document.')
      }
      conversationRequests.current.delete(id)

      if (isCurrent()) {
        setActiveId(conversation.id)
        setActiveConversation(conversation)
        setConversations(prev => [conversation, ...prev.filter(item => item.id !== conversation.id && item.id !== id)])
        setDocumentSaveStatus('saved')
      }
    })
    pendingSave.current = save
    try {
      await save
    } catch (err) {
      if (isCurrent()) {
        setDocumentSaveStatus('error')
        setDocumentSaveError(err instanceof Error ? err.message : 'Could not save this document.')
      }
      throw err
    }
  }, [activeConversation, selectedThemeId, setActiveId])

  const handleDocumentUpdate = useCallback((content: DocumentContent) => {
    setDocumentContent(content)
    void persistDocument(content).catch(err => console.error('Failed to save document:', err))
  }, [persistDocument])

  const handleSaveDocument = useCallback(async () => {
    if (documentContent) await persistDocument(documentContent, cloudDocuments)
  }, [cloudDocuments, documentContent, persistDocument])

  const handleSettingsUpdate = useCallback(async (newSettings: Partial<AppSettings>) => {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings),
    })
    if (!response.ok) throw new Error('Failed to save settings')
    setSettings(prev => prev ? { ...prev, ...newSettings } : prev)
  }, [])

  const handleThemeUpload = useCallback(async () => {
    await loadThemes()
  }, [])

  return (
    <div className="studio-shell flex min-h-0 flex-1 overflow-hidden bg-ui-canvas">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        conversations={conversations}
        activeConversationId={activeConversation?.id}
        openingId={openingId}
        openError={openError?.message}
        onRetryOpen={openError ? () => void handleSelectConversation(openError.conversation) : undefined}
        onPrefetchConversation={prefetchConversation}
        themes={themes}
        settings={settings}
        apiKeyConfigured={apiKeyConfigured}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onToggle={() => setIsSidebarOpen(prev => !prev)}
        onSettingsUpdate={handleSettingsUpdate}
        onThemeUpload={handleThemeUpload}
        selectedThemeId={selectedThemeId}
        onThemeChange={setSelectedThemeId}
      />

      {/* Main Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Chat Panel */}
        <div className={`flex-col ${isDocPanelOpen ? 'hidden lg:flex lg:w-[min(34vw,480px)]' : 'flex flex-1'} min-w-0 border-r border-ui-line`}>
          <ChatPanel
            conversation={activeConversation}
            apiKeyConfigured={apiKeyConfigured}
            selectedThemeId={selectedThemeId}
            onMessageSent={handleMessageSent}
            onToggleDocPanel={() => setIsDocPanelOpen(prev => !prev)}
            isDocPanelOpen={isDocPanelOpen}
            settings={settings}
          />
        </div>

        {/* Document Workspace */}
        {isDocPanelOpen && (
          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
            <DocumentWorkspace
              key={activeConversation?.id}
              startInEdit={openInEdit && activeConversation?.id === initialConversation?.id}
              documentContent={documentContent}
              themes={themes}
              selectedThemeId={selectedThemeId}
              onThemeChange={setSelectedThemeId}
              onDocumentUpdate={handleDocumentUpdate}
              onSaveDocument={handleSaveDocument}
              saveStatus={documentSaveStatus}
              saveError={documentSaveError}
              cloudDocuments={cloudDocuments}
              serverPdfAvailable={serverPdfAvailable}
              onClose={() => setIsDocPanelOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
