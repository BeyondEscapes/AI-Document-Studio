import { MongoClient, type Filter } from 'mongodb'
import * as sqlite from '@/lib/db'
import { useMongoAuth } from '@/lib/mongodb-auth'
import type { Conversation } from '@/types'
import type { ConversationAccess, SavedDocument } from '@/lib/db'

type Record = Omit<Conversation, 'id'> & {
  _id: string
  ownerId: string | null
  savedDocument?: Pick<SavedDocument, 'title' | 'status' | 'type'>
}

export function nextConversationUpdate(previous?: string) {
  return new Date(Math.max(Date.now(), (Date.parse(previous ?? '') || 0) + 1)).toISOString()
}

export function useMongoDocuments() {
  return useMongoAuth() || Boolean(process.env.MONGODB_URI)
}

const cache = globalThis as typeof globalThis & {
  studioDocuments?: ReturnType<typeof connect>
}

async function connect() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is required for hosted document storage.')
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 })
  const records = client.db(process.env.MONGODB_DB || 'doc_theme').collection<Record>('studio_conversations')
  try {
    await Promise.all([
      records.createIndex({ ownerId: 1, updatedAt: -1 }),
      records.createIndex({ updatedAt: -1 }, { partialFilterExpression: { savedDocument: { $exists: true } } }),
    ])
    return records
  } catch (error) {
    await client.close()
    throw error
  }
}

function collection() {
  return cache.studioDocuments ??= connect().catch(error => {
    delete cache.studioDocuments
    throw error
  })
}

function owned(user: ConversationAccess, includeAll = false): Filter<Record> {
  if (user.role === 'admin') return includeAll ? {} : { ownerId: { $in: [user.id, null] } }
  return { ownerId: user.id }
}

function unpack({ _id, ownerId: _owner, savedDocument: _summary, ...data }: Record): Conversation {
  return { ...data, id: _id, messages: data.messages ?? [] }
}

export async function getConversations(user: ConversationAccess, summary = false): Promise<Conversation[]> {
  if (!useMongoDocuments()) {
    return summary ? sqlite.getConversationSummaries(user) : sqlite.getConversations(user)
  }
  const rows = await (await collection()).find(owned(user), summary ? {
    projection: { title: 1, createdAt: 1, updatedAt: 1, selectedTheme: 1, 'savedDocument.title': 1 },
  } : {}).sort({ updatedAt: -1 }).toArray()
  return rows.map(row => {
    const conversation = unpack(row)
    return summary && row.savedDocument?.title ? { ...conversation, title: row.savedDocument.title } : conversation
  })
}

export async function getConversation(id: string, user: ConversationAccess): Promise<Conversation | null> {
  if (!useMongoDocuments()) return sqlite.getConversation(id, user)
  const row = await (await collection()).findOne({ _id: id, ...owned(user, true) })
  return row ? unpack(row) : null
}

export async function saveConversation(conversation: Conversation, user: ConversationAccess, expectedUpdate?: string) {
  if (!useMongoDocuments()) return sqlite.saveConversation(conversation, user, expectedUpdate)
  const { id, ...data } = conversation
  const document = data.documentContent
  const savedDocument = document ? {
    title: document.title || data.title,
    type: document.documentType ?? 'other',
    status: document.approval?.status ?? 'draft',
  } : undefined
  const records = await collection()
  if (expectedUpdate === undefined) {
    await records.insertOne({ ...data, _id: id, ownerId: user.id, savedDocument }, { ignoreUndefined: true })
    return true
  }
  const result = await records.updateOne(
    { _id: id, updatedAt: expectedUpdate, ...owned(user, true) },
    {
      $set: {
        ...data,
        ...(savedDocument ? { savedDocument } : {}),
      },
      ...(savedDocument ? {} : { $unset: { savedDocument: '', documentContent: '' } }),
    },
    { ignoreUndefined: true },
  )
  return result.matchedCount > 0
}

export async function deleteConversation(id: string, user: ConversationAccess) {
  if (!useMongoDocuments()) return sqlite.deleteConversation(id, user)
  return (await (await collection()).deleteOne({ _id: id, ...owned(user, true) })).deletedCount > 0
}

export async function listSavedDocuments(user: ConversationAccess, all = false): Promise<SavedDocument[]> {
  if (!useMongoDocuments()) return sqlite.listSavedDocuments(user, all)
  const rows = await (await collection()).find({
    ...owned(user, all), savedDocument: { $exists: true },
  }, { projection: { savedDocument: 1, ownerId: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray()
  return rows.flatMap(({ _id, savedDocument, updatedAt, ownerId }) =>
    savedDocument ? [{ id: _id, ...savedDocument, updatedAt, ownerId, ownerName: null }] : [],
  )
}

export async function removeSavedDocument(id: string, user: ConversationAccess) {
  if (!useMongoDocuments()) return sqlite.removeSavedDocument(id, user)
  const record = await getConversation(id, user)
  if (!record?.documentContent) return false
  return saveConversation({
    ...record,
    updatedAt: nextConversationUpdate(record.updatedAt),
    documentContent: undefined,
    messages: record.messages.map(({ documentContent: _removed, ...message }) => message),
  }, user, record.updatedAt)
}
