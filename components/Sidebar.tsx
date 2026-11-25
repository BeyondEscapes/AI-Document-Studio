'use client'

import { useState } from 'react'
import {
  MessageSquarePlus, MessageSquare, Trash2, Settings, ChevronLeft,
  ChevronRight, FileText, Upload, Key, Check, X, AlertCircle,
  ChevronDown, ChevronUp, Palette, Loader2
} from 'lucide-react'
import { DOCUMENT_LANGUAGES, parseDocumentLanguage } from '@/lib/document-languages'
import type { Conversation, DocumentTheme, AppSettings } from '@/types'

interface SidebarProps {
  isOpen: boolean
  conversations: Conversation[]
  activeConversationId?: string
  openingId: string | null
  openError?: string
  onRetryOpen?: () => void
  onPrefetchConversation: (id: string) => void
  themes: DocumentTheme[]
  settings: AppSettings | null
  apiKeyConfigured: boolean
  selectedThemeId: string
  onNewConversation: () => void
  onSelectConversation: (conv: Conversation) => void
  onDeleteConversation: (id: string) => void
  onToggle: () => void
  onSettingsUpdate: (settings: Partial<AppSettings>) => Promise<void>
  onThemeUpload: () => void
  onThemeChange: (themeId: string) => void
}

export function Sidebar({
  isOpen, conversations, activeConversationId, themes, settings, apiKeyConfigured,
  openingId, openError, onRetryOpen, onPrefetchConversation,
  selectedThemeId, onNewConversation, onSelectConversation, onDeleteConversation,
  onToggle, onSettingsUpdate, onThemeUpload, onThemeChange,
}: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [savingLanguage, setSavingLanguage] = useState(false)
  const [settingsError, setSettingsError] = useState('')

  async function saveLanguage(language: string) {
    setSavingLanguage(true)
    setSettingsError('')
    try {
      await onSettingsUpdate({ language })
    } catch {
      setSettingsError('Could not save the document language. Try again.')
    } finally {
      setSavingLanguage(false)
    }
  }
  const [showThemes, setShowThemes] = useState(false)
  const [uploadingTheme, setUploadingTheme] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [themeName, setThemeName] = useState('')
  const [themeFile, setThemeFile] = useState<File | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleThemeUpload = async () => {
    if (!themeFile || !themeName.trim()) {
      setUploadError('Please provide a template name and file.')
      return
    }
    setUploadingTheme(true)
    setUploadError('')
    try {
      const formData = new FormData()
      formData.append('template', themeFile)
      formData.append('name', themeName)
      formData.append('description', `Custom template: ${themeName}`)
      const res = await fetch('/api/themes/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        setThemeName('')
        setThemeFile(null)
        onThemeUpload()
      } else {
        setUploadError(data.error || 'Upload failed')
      }
    } catch (err) {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploadingTheme(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingId(id)
    setTimeout(() => {
      onDeleteConversation(id)
      setDeletingId(null)
    }, 300)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return date.toLocaleDateString()
  }

  return (
    <div className={`flex flex-col bg-ui-panel border-r border-ui-line transition-[width] duration-300 ${isOpen ? 'w-72' : 'w-14'} flex-shrink-0`}>
      <div className={`flex h-14 shrink-0 items-center border-b border-ui-line ${isOpen ? 'justify-between px-3' : 'justify-center'}`}>
        {isOpen && <span className="text-sm font-semibold text-ui-body">Workspace</span>}
        <button
          type="button"
          onClick={onToggle}
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={isOpen}
          className="icon-button compact-icon"
        >
          {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* New Chat Button */}
      <div className="flex justify-center p-2">
        <button
          onClick={onNewConversation}
          aria-label="New document"
          className={`primary-button w-full ${!isOpen ? 'button-square' : ''}`}
          title="New conversation"
        >
          <MessageSquarePlus size={16} />
          {isOpen && <span>New document</span>}
        </button>
      </div>

      {/* API Key Warning */}
      {!apiKeyConfigured && isOpen && (
        <div className="mx-2 mb-2 p-2 rounded-lg bg-ui-warning-tint border border-ui-warning-tint">
          <div className="flex items-start gap-1.5">
            <AlertCircle size={13} className="text-ui-warning mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-ui-warning">API Key Missing</p>
              <p className="text-xs text-ui-warning mt-0.5">Add GEMINI_API_KEY to .env.local</p>
            </div>
          </div>
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto py-1">
        {isOpen && (
          <p className="px-3 py-1.5 text-[11px] font-semibold text-ui-muted uppercase tracking-wider">
            Recent Conversations
          </p>
        )}
        {conversations.length === 0 && isOpen && (
          <div className="px-3 py-4 text-center">
            <MessageSquare size={24} className="mx-auto text-ui-muted mb-2" />
            <p className="text-xs text-ui-muted">No conversations yet</p>
            <p className="text-xs text-ui-muted">Start by creating a document</p>
          </div>
        )}
        {openError && (
          <div role="alert" className="mx-2 my-1 rounded-lg bg-ui-danger-tint p-2 text-xs text-ui-danger">
            {openError} <button type="button" onClick={onRetryOpen} className="underline">Retry</button>
          </div>
        )}
        {conversations.map(conv => (
          <div
            key={conv.id}
            className={`group mx-1 flex items-center gap-1 rounded-lg transition-colors ${isOpen ? 'pr-2' : ''} ${
              activeConversationId === conv.id
                ? 'bg-ui-tint text-ui-accent'
                : 'hover:bg-ui-canvas text-ui-muted'
            } ${deletingId === conv.id ? 'opacity-50 scale-95 transition-all' : ''}`}
          >
            <button type="button" title={conv.documentContent?.title || conv.title} aria-label={conv.documentContent?.title || conv.title}
              aria-current={activeConversationId === conv.id ? 'true' : undefined}
              aria-busy={openingId === conv.id}
              onPointerEnter={() => onPrefetchConversation(conv.id)}
              onFocus={() => onPrefetchConversation(conv.id)}
              onClick={() => onSelectConversation(conv)}
              className={`flex min-w-0 flex-1 items-center gap-2 text-left ${isOpen ? 'px-2 py-2' : 'h-10 justify-center'}`}>
              {openingId === conv.id ? <Loader2 size={14} className="shrink-0 animate-spin" /> :
                <FileText size={14} className="shrink-0" />}
              {isOpen && <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{conv.documentContent?.title || conv.title}</span>
                <span className="block text-[10px] text-ui-muted">
                  {openingId === conv.id ? 'Opening…' : formatDate(conv.updatedAt)}
                </span>
              </span>}
            </button>
            {isOpen && (
                <button
                  type="button"
                  aria-label={`Delete ${conv.title}`}
                  onClick={(e) => handleDelete(conv.id, e)}
                  className="icon-button compact-icon danger-icon"
                >
                  <Trash2 size={12} />
                </button>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Sections */}
      <div className="border-t border-ui-line">
        {/* Template Selector */}
        {isOpen && (
          <div className="p-2">
            <button
              onClick={() => setShowThemes(!showThemes)}
              className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-ui-canvas text-sm text-ui-muted transition-colors"
            >
              <div className="flex items-center gap-2">
                <Palette size={14} />
                <span className="text-xs font-medium">Templates</span>
              </div>
              {showThemes ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showThemes && (
              <div className="mt-1 space-y-1">
                {themes.map(theme => (
                  <button
                    key={theme.id}
                    onClick={() => onThemeChange(theme.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      selectedThemeId === theme.id
                        ? 'bg-ui-tint text-ui-accent font-medium'
                        : 'hover:bg-ui-canvas text-ui-muted'
                    }`}
                  >
                    {selectedThemeId === theme.id && <Check size={10} className="flex-shrink-0" />}
                    {selectedThemeId !== theme.id && <div className="w-2.5 flex-shrink-0" />}
                    <span className="truncate">{theme.name}</span>
                    {theme.isDefault && (
                      <span className="ml-auto flex-shrink-0 text-[9px] bg-ui-tint text-ui-accent px-1 rounded">Default</span>
                    )}
                  </button>
                ))}

                {/* Upload New Template */}
                <div className="pt-2 border-t border-ui-line mt-2">
                  <p className="text-[10px] text-ui-muted mb-1 px-1">Upload custom template</p>
                  <input
                    type="text"
                    placeholder="Template name"
                    value={themeName}
                    onChange={e => setThemeName(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-ui-line rounded-lg focus:outline-none focus:ring-1 focus:ring-ui-accent mb-1"
                  />
                  <label className="block cursor-pointer">
                    <div className="w-full flex items-center gap-1.5 px-2 py-1 border border-dashed border-ui-line rounded-lg hover:border-ui-accent transition-colors">
                      <Upload size={10} className="text-ui-muted" />
                      <span className="text-xs text-ui-muted truncate">
                        {themeFile ? themeFile.name : 'Select .docx file'}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept=".docx"
                      className="hidden"
                      onChange={e => setThemeFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  {uploadError && <p className="text-[10px] text-ui-danger mt-1">{uploadError}</p>}
                  <button
                    onClick={handleThemeUpload}
                    disabled={uploadingTheme}
                    className="primary-button button-compact mt-1 w-full"
                  >
                    {uploadingTheme ? 'Uploading...' : 'Upload Template'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        {isOpen && (
          <div className="p-2 border-t border-ui-line">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-ui-canvas text-sm text-ui-muted transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings size={14} />
                <span className="text-xs font-medium">Settings</span>
              </div>
              {showSettings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showSettings && (
              <div className="mt-1 space-y-2 px-1">
                <div>
                  <p className="text-[10px] font-medium text-ui-muted mb-1 flex items-center gap-1">
                    <Key size={9} />
                    API Key Status
                  </p>
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${apiKeyConfigured ? 'bg-ui-tint text-ui-accent' : 'bg-ui-danger-tint text-ui-danger'}`}>
                    {apiKeyConfigured ? <Check size={10} /> : <X size={10} />}
                    {apiKeyConfigured ? 'Gemini API key configured' : 'API key not set'}
                  </div>
                  {!apiKeyConfigured && (
                    <p className="text-[10px] text-ui-muted mt-1">
                      Edit <code className="bg-ui-subtle px-0.5 rounded">.env.local</code> and add your GEMINI_API_KEY
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-medium text-ui-muted mb-1">AI Model</p>
                  <select
                    value={settings?.geminiModel || 'gemini-3.1-flash-lite'}
                    onChange={event => {
                      setSettingsError('')
                      void onSettingsUpdate({ geminiModel: event.target.value })
                        .catch(() => setSettingsError('Could not save the AI model. Try again.'))
                    }}
                    className="w-full px-2 py-1 text-xs border border-ui-line rounded-lg focus:outline-none focus:ring-1 focus:ring-ui-accent"
                  >
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Ultra Fast ~1.7s - Recommended)</option>
                    <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite (Fast)</option>
                    <option value="gemini-3.8-flash">Gemini 3.8 Flash (Latest)</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash (Standard)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="document-language" className="mb-1 block text-[10px] font-medium text-ui-muted">
                    Default document language
                  </label>
                  <select
                    id="document-language"
                    value={parseDocumentLanguage(settings?.language) ?? 'English'}
                    disabled={!settings || savingLanguage}
                    onChange={event => void saveLanguage(event.target.value)}
                    className="studio-language-select w-full rounded-lg border border-ui-line px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ui-accent"
                  >
                    {DOCUMENT_LANGUAGES.map(language => <option key={language} value={language}>{language}</option>)}
                  </select>
                  {savingLanguage && <p role="status" className="mt-1 text-[10px] text-ui-muted">Saving language?</p>}
                  {settingsError && <p role="alert" className="mt-1 text-[10px] text-ui-danger">{settingsError}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collapsed icons */}
        {!isOpen && (
          <div className="flex flex-col items-center gap-1 p-2">
            <button type="button" onClick={() => { onToggle(); setShowSettings(true) }} className="icon-button" aria-label="Settings" title="Settings">
              <Settings size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
