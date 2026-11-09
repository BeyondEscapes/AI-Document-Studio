import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import type { Conversation, DocumentTheme, AppSettings } from '@/types'

const DB_PATH = path.join(process.cwd(), 'data', 'studio.db')

let _db: Database.Database | null = null

function getDb(): Database.Database {
  if (_db) return _db
  
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  
  initSchema(_db)
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      document_content TEXT,
      selected_theme TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      template_path TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      preview_image_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Insert default theme if not exists
  const defaultTheme = db.prepare('SELECT id FROM themes WHERE id = ?').get('beyond-escapes-official')
  if (!defaultTheme) {
    const templatePath = path.join(process.cwd(), 'assets', 'beyond-escapes-template.docx')
    if (fs.existsSync(templatePath)) {
      db.prepare(`
        INSERT INTO themes (id, name, description, template_path, is_default, created_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(
        'beyond-escapes-official',
        'Beyond Escapes Official Template',
        'The official Beyond Escapes Sri Lanka branded itinerary template with blue heading bars, logo header, and professional layout.',
        templatePath,
        new Date().toISOString()
      )
    }
  }

  // Insert default settings if not exists
  const defaultSettings: AppSettings = {
    defaultThemeId: 'beyond-escapes-official',
    defaultOutputFormats: ['docx', 'pdf'],
    geminiModel: 'gemini-3.5-flash',
    language: 'English',
    autoSave: true,
  }
  for (const [key, value] of Object.entries(defaultSettings)) {
    const existing = db.prepare('SELECT key, value FROM settings WHERE key = ?').get(key) as { key: string; value: string } | undefined
    if (!existing) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
    } else if (key === 'geminiModel') {
      try {
        const currentVal = JSON.parse(existing.value)
        if (typeof currentVal === 'string' && (currentVal.includes('gemini-2.0') || currentVal.includes('gemini-1.5'))) {
          db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify('gemini-3.8-flash'), key)
        }
      } catch {}
    }
  }
}

// Conversation CRUD
export function getConversations(): Conversation[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>
  return rows.map(parseConversation)
}

export function getConversation(id: string): Conversation | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? parseConversation(row) : null
}

export function saveConversation(conversation: Conversation): void {
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO conversations (id, title, messages, document_content, selected_theme, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    conversation.id,
    conversation.title,
    JSON.stringify(conversation.messages),
    conversation.documentContent ? JSON.stringify(conversation.documentContent) : null,
    conversation.selectedTheme || null,
    conversation.createdAt,
    conversation.updatedAt
  )
}

export function deleteConversation(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

function parseConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    title: row.title as string,
    messages: JSON.parse(row.messages as string || '[]'),
    documentContent: row.document_content ? JSON.parse(row.document_content as string) : undefined,
    selectedTheme: row.selected_theme as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// Theme CRUD
export function getThemes(): DocumentTheme[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM themes ORDER BY is_default DESC, created_at ASC').all() as Array<Record<string, unknown>>
  return rows.map(parseTheme)
}

export function getTheme(id: string): DocumentTheme | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM themes WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? parseTheme(row) : null
}

export function saveTheme(theme: DocumentTheme): void {
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO themes (id, name, description, template_path, is_default, preview_image_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    theme.id,
    theme.name,
    theme.description,
    theme.templatePath,
    theme.isDefault ? 1 : 0,
    theme.previewImagePath || null,
    theme.createdAt
  )
}

export function deleteTheme(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM themes WHERE id = ?').run(id)
}

function parseTheme(row: Record<string, unknown>): DocumentTheme {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    templatePath: row.template_path as string,
    isDefault: (row.is_default as number) === 1,
    previewImagePath: row.preview_image_path as string | undefined,
    createdAt: row.created_at as string,
  }
}

// Settings
export function getSetting<T>(key: string, defaultValue: T): T {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return defaultValue
  try {
    return JSON.parse(row.value) as T
  } catch {
    return defaultValue
  }
}

export function setSetting(key: string, value: unknown): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
}

export function getSettings(): AppSettings {
  const model = getSetting('geminiModel', 'gemini-3.5-flash')
  const effectiveModel = (typeof model === 'string' && (model.includes('gemini-2.0') || model.includes('gemini-1.5')))
    ? 'gemini-3.5-flash'
    : model

  return {
    defaultThemeId: getSetting('defaultThemeId', 'beyond-escapes-official'),
    defaultOutputFormats: getSetting('defaultOutputFormats', ['docx', 'pdf']),
    geminiModel: effectiveModel,
    language: getSetting('language', 'English'),
    autoSave: getSetting('autoSave', true),
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  for (const [key, value] of Object.entries(settings)) {
    setSetting(key, value)
  }
}
