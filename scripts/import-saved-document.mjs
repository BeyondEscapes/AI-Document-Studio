import path from 'node:path'
import Database from 'better-sqlite3'
import { MongoClient } from 'mongodb'

const [conversationId, email] = process.argv.slice(2)
if (!conversationId || !email || !process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI and run npm run import:saved-document -- CONVERSATION_ID ACCOUNT_EMAIL [--hosted]')
  process.exit(1)
}

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
let local
try {
  local = new Database(path.join(process.env.STUDIO_DATA_DIR || 'data', 'studio.db'), { readonly: true, fileMustExist: true })
  const row = local.prepare('SELECT * FROM conversations WHERE id = ? AND document_content IS NOT NULL').get(conversationId)
  if (!row) throw new Error('The saved document was not found in the SQLite database.')
  const target = client.db(process.env.MONGODB_DB || 'doc_theme')
  const normalizedEmail = email.trim().toLowerCase()
  const hosted = process.argv.includes('--hosted') || process.env.STUDIO_AUTH_STORAGE === 'mongodb'
  const account = hosted
    ? await target.collection('studio_accounts').findOne({ _id: normalizedEmail }, { projection: { id: 1 } })
    : local.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)
  if (!account) throw new Error('Create the destination studio account before importing.')
  const documentContent = JSON.parse(row.document_content)
  const result = await target.collection('studio_conversations').updateOne({ _id: row.id }, {
    $setOnInsert: {
      ownerId: account.id,
      title: row.title,
      messages: JSON.parse(row.messages),
      documentContent,
      selectedTheme: row.selected_theme,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      savedDocument: {
        title: documentContent.title || row.title,
        type: documentContent.documentType ?? 'other',
        status: documentContent.approval?.status ?? 'draft',
      },
    },
  }, { upsert: true })
  console.log(result.upsertedCount ? 'Saved document imported into MongoDB.' : 'A record with this conversation ID already exists in MongoDB.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  local?.close()
  await client.close()
}
