import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { DATA_DIR, ensureDataDir } from '@/lib/storage'
import type { Conversation, DocumentTheme, AppSettings } from '@/types'

const DB_PATH = path.join(DATA_DIR, 'studio.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  
  ensureDataDir()
  
  const db = new Database(DB_PATH)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema(db)
    _db = db
    return db
  } catch (error) {
    db.close()
    throw error
  }
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

  const columns = db.pragma('table_info(conversations)') as { name: string }[]
  if (!columns.some(column => column.name === 'owner_id')) {
    // Serialize the schema check with the migration during concurrent startup.
    db.transaction(() => {
      const current = db.pragma('table_info(conversations)') as { name: string }[]
      if (!current.some(column => column.name === 'owner_id')) {
        db.exec('ALTER TABLE conversations ADD COLUMN owner_id TEXT')
      }
    }).immediate()
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS conversations_owner_updated ON conversations(owner_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS auth_attempts (
      key TEXT PRIMARY KEY,
      window INTEGER NOT NULL,
      attempts INTEGER NOT NULL
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
    geminiModel: 'gemini-3.1-flash-lite',
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
        if (typeof currentVal === 'string' && (currentVal.includes('gemini-2.0') || currentVal.includes('gemini-1.5') || !currentVal)) {
          db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify('gemini-3.1-flash-lite'), key)
        }
      } catch {}
    }
  }
}

// Conversation CRUD
export interface ConversationAccess {
  id: string
  role: 'member' | 'admin'
}

export function getConversations(user: ConversationAccess): Conversation[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM conversations WHERE owner_id = ? OR (? AND owner_id IS NULL) ORDER BY updated_at DESC')
    .all(user.id, Number(user.role === 'admin')) as Array<Record<string, unknown>>
  return rows.map(parseConversation)
}

export function getConversationSummaries(user: ConversationAccess): Conversation[] {
  const rows = getDb().prepare(
    'SELECT id, title, selected_theme, created_at, updated_at FROM conversations WHERE owner_id = ? OR (? AND owner_id IS NULL) ORDER BY updated_at DESC',
  ).all(user.id, Number(user.role === 'admin')) as Array<Record<string, unknown>>
  return rows.map(parseConversation)
}

export function getConversation(id: string, user: ConversationAccess): Conversation | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM conversations WHERE id = ? AND (owner_id = ? OR ?)')
    .get(id, user.id, Number(user.role === 'admin')) as Record<string, unknown> | undefined
  return row ? parseConversation(row) : null
}

export function saveConversation(conversation: Conversation, user: ConversationAccess, expectedUpdate?: string): boolean {
  const db = getDb()
  if (expectedUpdate !== undefined) {
    return db.prepare(`
      UPDATE conversations SET title = ?, messages = ?, document_content = ?, selected_theme = ?, updated_at = ?
      WHERE id = ? AND updated_at = ? AND (owner_id = ? OR ?)
    `).run(
      conversation.title, JSON.stringify(conversation.messages),
      conversation.documentContent ? JSON.stringify(conversation.documentContent) : null,
      conversation.selectedTheme || null, conversation.updatedAt, conversation.id, expectedUpdate,
      user.id, Number(user.role === 'admin'),
    ).changes > 0
  }
  const result = db.prepare(`
    INSERT INTO conversations (id, title, messages, document_content, selected_theme, created_at, updated_at, owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, messages = excluded.messages,
      document_content = excluded.document_content, selected_theme = excluded.selected_theme,
      updated_at = excluded.updated_at
    WHERE conversations.owner_id = excluded.owner_id OR ?
  `).run(
    conversation.id,
    conversation.title,
    JSON.stringify(conversation.messages),
    conversation.documentContent ? JSON.stringify(conversation.documentContent) : null,
    conversation.selectedTheme || null,
    conversation.createdAt,
    conversation.updatedAt,
    user.id,
    Number(user.role === 'admin')
  )
  return result.changes > 0
}

export function deleteConversation(id: string, user: ConversationAccess): boolean {
  return getDb().prepare('DELETE FROM conversations WHERE id = ? AND (owner_id = ? OR ?)')
    .run(id, user.id, Number(user.role === 'admin')).changes > 0
}

export interface SavedDocument {
  id: string
  title: string
  type: string
  status: string
  updatedAt: string
  ownerName: string | null
  ownerId: string | null
}

export function listSavedDocuments(user: ConversationAccess, all = false): SavedDocument[] {
  return getDb().prepare(`
    SELECT conversations.id,
      COALESCE(NULLIF(json_extract(document_content, '$.title'), ''), title) AS title,
      COALESCE(json_extract(document_content, '$.documentType'), 'other') AS type,
      COALESCE(json_extract(document_content, '$.approval.status'), 'draft') AS status,
      updated_at AS updatedAt, users.name AS ownerName, conversations.owner_id AS ownerId
    FROM conversations LEFT JOIN users ON users.id = conversations.owner_id
    WHERE document_content IS NOT NULL AND (owner_id = ? OR (? AND (owner_id IS NULL OR ?)))
    ORDER BY updated_at DESC
  `).all(user.id, Number(user.role === 'admin'), Number(all)) as SavedDocument[]
}

export function removeSavedDocument(id: string, user: ConversationAccess): boolean {
  return getDb().transaction(() => {
    const conversation = getConversation(id, user)
    if (!conversation?.documentContent) return false
    return saveConversation({
      ...conversation,
      documentContent: undefined,
      messages: conversation.messages.map(({ documentContent: _removed, ...message }) => message),
      updatedAt: new Date().toISOString(),
    }, user)
  }).immediate()
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

export function getSettings(user: ConversationAccess): AppSettings {
  const read = <T>(key: string, fallback: T) => getSetting(`${user.id}:${key}`, getSetting(key, fallback))
  const model = read('geminiModel', 'gemini-3.1-flash-lite')
  const effectiveModel = (typeof model === 'string' && (model.includes('gemini-2.0') || model.includes('gemini-1.5') || !model))
    ? 'gemini-3.1-flash-lite'
    : model

  return {
    defaultThemeId: read('defaultThemeId', 'beyond-escapes-official'),
    defaultOutputFormats: read('defaultOutputFormats', ['docx', 'pdf']),
    geminiModel: effectiveModel,
    language: read('language', 'English'),
    autoSave: read('autoSave', true),
  }
}

export function saveSettings(settings: Partial<AppSettings>, user: ConversationAccess): void {
  for (const [key, value] of Object.entries(settings)) {
    setSetting(`${user.id}:${key}`, value)
  }
}
