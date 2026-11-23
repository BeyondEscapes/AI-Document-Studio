'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { ChatPanel } from '@/components/ChatPanel'
import { DocumentWorkspace } from '@/components/DocumentWorkspace'
import { prepareDocumentForLocalSave } from '@/lib/itinerary-images'
import type { Conversation, DocumentContent, DocumentTheme, AppSettings } from '@/types'

export default function StudioWorkspace({ initialConversation }: { initialConversation: Conversation | null }) {
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
  const activeId = useRef(initialConversation?.id)
  const selectedRequest = useRef(0)
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve())
  const saveSequence = useRef(0)

  // Load initial data
  useEffect(() => {
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
    activeId.current = undefined
    setActiveConversation(null)
    setDocumentContent(null)
    setIsDocPanelOpen(false)
    setDocumentSaveStatus('idle')
    setDocumentSaveError(null)
  }, [])

  const handleSelectConversation = useCallback(async (conversation: Conversation) => {
    const requestNumber = ++selectedRequest.current
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`)
      const data = await res.json()
      if (data.success && selectedRequest.current === requestNumber) {
        activeId.current = data.conversation.id
        setActiveConversation(data.conversation)
        if (data.conversation.selectedTheme) setSelectedThemeId(data.conversation.selectedTheme)
        if (data.conversation.documentContent) {
          setDocumentContent(data.conversation.documentContent)
          setIsDocPanelOpen(true)
          setDocumentSaveStatus('saved')
        } else {
          setDocumentContent(null)
          setIsDocPanelOpen(false)
          setDocumentSaveStatus('idle')
        }
      }
    } catch (err) {
      console.error('Failed to load conversation:', err)
    }
  }, [])

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not delete conversation.')
      setConversations(prev => prev.filter(c => c.id !== id))
      if (activeConversation?.id === id) {
        activeId.current = undefined
        setActiveConversation(null)
        setDocumentContent(null)
        setIsDocPanelOpen(false)
        setDocumentSaveStatus('idle')
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
  }, [activeConversation])

  const handleMessageSent = useCallback((
    updatedConversation: Conversation,
    newDocContent?: DocumentContent,
    clearDocument = false
  ) => {
    activeId.current = updatedConversation.id
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
  }, [])

  const persistDocument = useCallback(async (content: DocumentContent) => {
    if (!activeConversation) {
      setDocumentSaveStatus('error')
      throw new Error('Start a conversation before saving a document.')
    }

    const id = activeConversation.id
    const sequence = ++saveSequence.current
    const isCurrent = () => activeId.current === id && sequence === saveSequence.current
    setDocumentSaveStatus('saving')
    setDocumentSaveError(null)
    const save = pendingSave.current.catch(() => undefined).then(async () => {
      const res = await fetch(`/api/conversations/${activeConversation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentContent: prepareDocumentForLocalSave(content),
          selectedTheme: selectedThemeId,
        }),
      })
      const responseText = await res.text()
      let data: { success?: boolean; error?: string; conversation?: Conversation }
      try {
        data = JSON.parse(responseText)
      } catch {
        if (res.status === 413) {
          throw new Error('The local server rejected this document as too large. Remove oversized embedded cover images and retry.')
        }
        throw new Error(`Could not save this document locally (HTTP ${res.status}).`)
      }
      const conversation = data.conversation
      if (!res.ok || !data.success || !conversation) {
        throw new Error(data.error || 'Could not save this document locally.')
      }

      if (isCurrent()) {
        setActiveConversation(conversation)
        setConversations(prev => prev.map(item =>
          item.id === conversation.id ? conversation : item
        ))
        setDocumentSaveStatus('saved')
      }
    })
    pendingSave.current = save
    try {
      await save
    } catch (err) {
      if (isCurrent()) {
        setDocumentSaveStatus('error')
        setDocumentSaveError(err instanceof Error ? err.message : 'Could not save this document locally.')
      }
      throw err
    }
  }, [activeConversation, selectedThemeId])

  const handleDocumentUpdate = useCallback((content: DocumentContent) => {
    setDocumentContent(content)
    void persistDocument(content).catch(err => console.error('Failed to save document locally:', err))
  }, [persistDocument])

  const handleSaveDocument = useCallback(async () => {
    if (documentContent) await persistDocument(documentContent)
  }, [documentContent, persistDocument])

  const handleSettingsUpdate = useCallback(async (newSettings: Partial<AppSettings>) => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      })
      setSettings(prev => prev ? { ...prev, ...newSettings } : null)
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }, [])

  const handleThemeUpload = useCallback(async () => {
    await loadThemes()
  }, [])

  return (
    <div className="studio-shell flex min-h-0 flex-1 overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        conversations={conversations}
        activeConversationId={activeConversation?.id}
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
        <div className={`flex-col ${isDocPanelOpen ? 'hidden lg:flex lg:w-[min(34vw,480px)]' : 'flex flex-1'} min-w-0 border-r border-gray-200`}>
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
              startInEdit={activeConversation?.id === initialConversation?.id && Boolean(initialConversation)}
              documentContent={documentContent}
              themes={themes}
              selectedThemeId={selectedThemeId}
              onThemeChange={setSelectedThemeId}
              onDocumentUpdate={handleDocumentUpdate}
              onSaveDocument={handleSaveDocument}
              saveStatus={documentSaveStatus}
              saveError={documentSaveError}
              onClose={() => setIsDocPanelOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
