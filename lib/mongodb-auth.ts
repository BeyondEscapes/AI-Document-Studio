import { MongoClient } from 'mongodb'
import type { StudioUser } from './auth'

interface Account extends StudioUser {
  _id: string
  passwordHash: string
  verificationHash?: string
  verificationExpiresAt?: number
  sessionVersion?: number
}

export function useMongoAuth() {
  return process.env.STUDIO_AUTH_STORAGE === 'mongodb' ||
    Boolean(process.env.VERCEL && !process.env.STUDIO_DATA_DIR)
}

const cache = globalThis as typeof globalThis & {
  studioAuthCollections?: ReturnType<typeof connect>
}

async function connect() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is required for hosted authentication.')
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 })
  const db = client.db(process.env.MONGODB_DB || 'doc_theme')
  const accounts = db.collection<Account>('studio_accounts')
  const sessions = db.collection<{ _id: string; accountId: string; expiresAt: Date; sessionVersion?: number }>('studio_sessions')
  const loginChallenges = db.collection<{
    _id: string; accountId: string; codeHash: string; sessionVersion: number; expiresAt: Date; attempts: number
  }>('studio_login_challenges')
  const attempts = db.collection<{ _id: string; count: number; expiresAt: Date }>('studio_auth_attempts')
  try {
    await Promise.all([
      accounts.createIndex({ id: 1 }, { unique: true }),
      sessions.createIndex({ accountId: 1 }),
      sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      loginChallenges.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      attempts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ])
    return { accounts, sessions, attempts, loginChallenges }
  } catch (error) {
    await client.close()
    throw error
  }
}

export function mongoAuthCollections() {
  return cache.studioAuthCollections ??= connect().catch(error => {
    delete cache.studioAuthCollections
    throw error
  })
}
