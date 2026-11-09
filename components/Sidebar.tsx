'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  MessageSquarePlus, MessageSquare, Trash2, Settings, ChevronLeft,
  ChevronRight, FileText, Upload, Key, Check, X, AlertCircle,
  ChevronDown, ChevronUp, Palette
} from 'lucide-react'
import type { Conversation, DocumentTheme, AppSettings } from '@/types'

interface SidebarProps {
  isOpen: boolean
  conversations: Conversation[]
  activeConversationId?: string
  themes: DocumentTheme[]
  settings: AppSettings | null
  apiKeyConfigured: boolean
  selectedThemeId: string
  onNewConversation: () => void
  onSelectConversation: (conv: Conversation) => void
  onDeleteConversation: (id: string) => void
  onToggle: () => void
  onSettingsUpdate: (settings: Partial<AppSettings>) => void
  onThemeUpload: () => void
  onThemeChange: (themeId: string) => void
}

export function Sidebar({
  isOpen, conversations, activeConversationId, themes, settings, apiKeyConfigured,
  selectedThemeId, onNewConversation, onSelectConversation, onDeleteConversation,
  onToggle, onSettingsUpdate, onThemeUpload, onThemeChange,
}: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false)
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
    <div className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-300 ${isOpen ? 'w-72' : 'w-14'} flex-shrink-0`}>
      {/* Logo Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100 h-14">
        {isOpen && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 relative flex-shrink-0">
              <Image src="/images/beyond_escapes_icon.png" alt="Beyond Escapes" fill className="object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate leading-tight">AI Document Studio</p>
              <p className="text-[10px] text-gray-500 truncate leading-tight">Beyond Escapes</p>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
        >
          {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-2">
        <button
          onClick={onNewConversation}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors ${!isOpen ? 'justify-center' : ''}`}
          title="New conversation"
        >
          <MessageSquarePlus size={16} />
          {isOpen && <span>New Document</span>}
        </button>
      </div>

      {/* API Key Warning */}
      {!apiKeyConfigured && isOpen && (
        <div className="mx-2 mb-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-1.5">
            <AlertCircle size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-800">API Key Missing</p>
              <p className="text-xs text-amber-700 mt-0.5">Add GEMINI_API_KEY to .env.local</p>
            </div>
          </div>
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto py-1">
        {isOpen && (
          <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Recent Conversations
          </p>
        )}
        {conversations.length === 0 && isOpen && (
          <div className="px-3 py-4 text-center">
            <MessageSquare size={24} className="mx-auto text-gray-300 mb-2" />
            <p className="text-xs text-gray-400">No conversations yet</p>
            <p className="text-xs text-gray-400">Start by creating a document</p>
          </div>
        )}
        {conversations.map(conv => (
          <div
            key={conv.id}
            onClick={() => onSelectConversation(conv)}
            className={`group flex items-center gap-2 mx-1 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
              activeConversationId === conv.id
                ? 'bg-blue-50 text-blue-700'
                : 'hover:bg-gray-50 text-gray-700'
            } ${deletingId === conv.id ? 'opacity-50 scale-95 transition-all' : ''}`}
          >
            <FileText size={14} className={`flex-shrink-0 ${activeConversationId === conv.id ? 'text-blue-500' : 'text-gray-400'}`} />
            {isOpen && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{conv.title}</p>
                  <p className="text-[10px] text-gray-400">{formatDate(conv.updatedAt)}</p>
                </div>
                <button
                  onClick={(e) => handleDelete(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 hover:text-red-500 text-gray-400 transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Sections */}
      <div className="border-t border-gray-100">
        {/* Template Selector */}
        {isOpen && (
          <div className="p-2">
            <button
              onClick={() => setShowThemes(!showThemes)}
              className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-600 transition-colors"
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
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    {selectedThemeId === theme.id && <Check size={10} className="flex-shrink-0" />}
                    {selectedThemeId !== theme.id && <div className="w-2.5 flex-shrink-0" />}
                    <span className="truncate">{theme.name}</span>
                    {theme.isDefault && (
                      <span className="ml-auto flex-shrink-0 text-[9px] bg-blue-100 text-blue-600 px-1 rounded">Default</span>
                    )}
                  </button>
                ))}

                {/* Upload New Template */}
                <div className="pt-2 border-t border-gray-100 mt-2">
                  <p className="text-[10px] text-gray-400 mb-1 px-1">Upload custom template</p>
                  <input
                    type="text"
                    placeholder="Template name"
                    value={themeName}
                    onChange={e => setThemeName(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 mb-1"
                  />
                  <label className="block cursor-pointer">
                    <div className="w-full flex items-center gap-1.5 px-2 py-1 border border-dashed border-gray-300 rounded-lg hover:border-blue-400 transition-colors">
                      <Upload size={10} className="text-gray-400" />
                      <span className="text-xs text-gray-500 truncate">
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
                  {uploadError && <p className="text-[10px] text-red-500 mt-1">{uploadError}</p>}
                  <button
                    onClick={handleThemeUpload}
                    disabled={uploadingTheme}
                    className="w-full mt-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded-lg disabled:opacity-50 transition-colors"
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
          <div className="p-2 border-t border-gray-100">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-600 transition-colors"
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
                  <p className="text-[10px] font-medium text-gray-500 mb-1 flex items-center gap-1">
                    <Key size={9} />
                    API Key Status
                  </p>
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${apiKeyConfigured ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {apiKeyConfigured ? <Check size={10} /> : <X size={10} />}
                    {apiKeyConfigured ? 'Gemini API key configured' : 'API key not set'}
                  </div>
                  {!apiKeyConfigured && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      Edit <code className="bg-gray-100 px-0.5 rounded">.env.local</code> and add your GEMINI_API_KEY
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-medium text-gray-500 mb-1">AI Model</p>
                  <select
                    value={settings?.geminiModel || 'gemini-3.5-flash'}
                    onChange={e => onSettingsUpdate({ geminiModel: e.target.value })}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended - High Stability)</option>
                    <option value="gemini-3.8-flash">Gemini 3.8 Flash (Latest)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Fast)</option>
                    <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>
                  </select>
                </div>

                <div>
                  <p className="text-[10px] font-medium text-gray-500 mb-1">Default Language</p>
                  <select
                    value={settings?.language || 'English'}
                    onChange={e => onSettingsUpdate({ language: e.target.value })}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="English">English</option>
                    <option value="Sinhala">Sinhala</option>
                    <option value="Tamil">Tamil</option>
                    <option value="German">German</option>
                    <option value="French">French</option>
                    <option value="Spanish">Spanish</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collapsed icons */}
        {!isOpen && (
          <div className="flex flex-col items-center gap-1 p-2">
            <button onClick={() => { onToggle(); setShowSettings(true) }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Settings">
              <Settings size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
