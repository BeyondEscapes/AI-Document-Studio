'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { ChatPanel } from '@/components/ChatPanel'
import { DocumentWorkspace } from '@/components/DocumentWorkspace'
import type { Conversation, DocumentContent, DocumentTheme, AppSettings } from '@/types'

export default function StudioPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [documentContent, setDocumentContent] = useState<DocumentContent | null>(null)
  const [themes, setThemes] = useState<DocumentTheme[]>([])
  const [selectedThemeId, setSelectedThemeId] = useState<string>('beyond-escapes-official')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean>(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [documentSaveStatus, setDocumentSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Load initial data
  useEffect(() => {
    loadConversations()
    loadThemes()
    loadSettings()
  }, [])

  const loadConversations = async () => {
    try {
      const res = await fetch('/api/conversations')
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
        if (data.settings.defaultThemeId) {
          setSelectedThemeId(data.settings.defaultThemeId)
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  const handleNewConversation = useCallback(() => {
    setActiveConversation(null)
    setDocumentContent(null)
    setIsDocPanelOpen(false)
    setDocumentSaveStatus('idle')
  }, [])

  const handleSelectConversation = useCallback(async (conversation: Conversation) => {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`)
      const data = await res.json()
      if (data.success) {
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
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      setConversations(prev => prev.filter(c => c.id !== id))
      if (activeConversation?.id === id) {
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

    setDocumentSaveStatus('saving')
    try {
      const res = await fetch(`/api/conversations/${activeConversation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentContent: content, selectedTheme: selectedThemeId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not save this document locally.')
      }

      setActiveConversation(data.conversation)
      setConversations(prev => prev.map(item =>
        item.id === data.conversation.id ? data.conversation : item
      ))
      setDocumentSaveStatus('saved')
    } catch (err) {
      setDocumentSaveStatus('error')
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
    <div className="flex h-screen overflow-hidden bg-gray-50">
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
        <div className={`flex flex-col ${isDocPanelOpen ? 'w-[480px]' : 'flex-1'} min-w-0 border-r border-gray-200`}>
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
              documentContent={documentContent}
              themes={themes}
              selectedThemeId={selectedThemeId}
              onThemeChange={setSelectedThemeId}
              onDocumentUpdate={handleDocumentUpdate}
              onSaveDocument={handleSaveDocument}
              saveStatus={documentSaveStatus}
              onClose={() => setIsDocPanelOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
