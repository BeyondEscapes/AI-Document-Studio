import { cache } from 'react'
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { getDb, type ConversationAccess } from '@/lib/db'
import { MongoServerError } from 'mongodb'
import { mongoAuthCollections, useMongoAuth } from '@/lib/mongodb-auth'

const deriveKey = promisify(scrypt)
const cookieName = 'studio_session'
const sessionLifetime = 7 * 24 * 60 * 60

export interface StudioUser extends ConversationAccess {
  name: string
  email: string
  createdAt: string
}

interface AuthRow extends StudioUser {
  passwordHash: string
}

const userFields = 'users.id, users.name, users.email, users.role, users.created_at AS createdAt'

export async function listUsers(): Promise<StudioUser[]> {
  if (useMongoAuth()) return (await mongoAuthCollections()).accounts
    .find<StudioUser>({}, { projection: { _id: 0, passwordHash: 0 } }).sort({ createdAt: -1 }).toArray()
  return getDb().prepare(`SELECT ${userFields} FROM users ORDER BY created_at DESC`).all() as StudioUser[]
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function allowAuthAttempt(key: string) {
  if (useMongoAuth()) {
    const { attempts } = await mongoAuthCollections()
    const windowLength = 600_000
    const window = Math.floor(Date.now() / windowLength)
    const counter = await attempts.findOneAndUpdate(
      { _id: hashToken(`${window}:${key}`) },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * windowLength) } },
      { upsert: true, returnDocument: 'after' },
    )
    return Boolean(counter && counter.count <= 12)
  }
  const minute = Math.floor(Date.now() / 60_000)
  const row = getDb().prepare(`
    INSERT INTO auth_attempts (key, window, attempts) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET attempts =
      CASE WHEN window <= excluded.window - 10 THEN 1 ELSE attempts + 1 END,
      window = CASE WHEN window <= excluded.window - 10 THEN excluded.window ELSE window END
    RETURNING attempts
  `).get(key, minute) as { attempts: number }
  return row.attempts <= 12
}

export async function registerUser(name: string, email: string, password: string): Promise<string | null> {
  const id = randomUUID()
  const salt = randomBytes(16).toString('hex')
  const digest = (await deriveKey(password, salt, 64) as Buffer).toString('hex')
  if (useMongoAuth()) {
    const { accounts } = await mongoAuthCollections()
    try {
      await accounts.insertOne({
        _id: email, id, name, email, role: 'member', passwordHash: `${salt}:${digest}`,
        createdAt: new Date().toISOString(),
      })
      return id
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) return null
      throw error
    }
  }
  const result = getDb().prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(email) DO NOTHING
  `).run(id, name, email, `${salt}:${digest}`, new Date().toISOString())
  return result.changes > 0 ? id : null
}

export async function authenticate(email: string, password: string): Promise<string | null> {
  const row = useMongoAuth()
    ? await (await mongoAuthCollections()).accounts.findOne({ _id: email })
    : getDb().prepare(`SELECT ${userFields}, password_hash AS passwordHash FROM users WHERE email = ?`)
      .get(email) as AuthRow | undefined
  const [salt, hash] = row?.passwordHash.split(':') ?? ['0'.repeat(32), '0'.repeat(128)]
  const digest = await deriveKey(password, salt, 64) as Buffer
  return timingSafeEqual(digest, Buffer.from(hash, 'hex')) && row ? row.id : null
}

export async function createSession(userId: string, secure: boolean) {
  const token = randomBytes(32).toString('hex')
  const jar = await cookies()
  const previous = jar.get(cookieName)?.value
  if (useMongoAuth()) {
    const { sessions } = await mongoAuthCollections()
    await sessions.insertOne({
      _id: hashToken(token), accountId: userId, expiresAt: new Date(Date.now() + sessionLifetime * 1000),
    })
    if (previous) await sessions.deleteOne({ _id: hashToken(previous) })
  } else {
    const db = getDb()
    const now = Date.now()
    db.transaction(() => {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
      db.prepare('DELETE FROM auth_attempts WHERE window <= ?').run(Math.floor(now / 60_000) - 10)
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
        .run(hashToken(token), userId, now + sessionLifetime * 1000)
      if (previous) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(previous))
    })()
  }
  jar.set(cookieName, token, {
    maxAge: sessionLifetime, httpOnly: true, sameSite: 'lax', secure, path: '/',
  })
}

export async function endSession() {
  const jar = await cookies()
  const token = jar.get(cookieName)?.value
  if (token) {
    if (useMongoAuth()) await (await mongoAuthCollections()).sessions.deleteOne({ _id: hashToken(token) })
    else getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  }
  jar.delete(cookieName)
}

export const getCurrentUser = cache(async (): Promise<StudioUser | null> => {
  const token = (await cookies()).get(cookieName)?.value
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  if (useMongoAuth()) {
    const { accounts, sessions } = await mongoAuthCollections()
    const session = await sessions.findOne({ _id: hashToken(token), expiresAt: { $gt: new Date() } })
    return session ? accounts.findOne<StudioUser>({ id: session.accountId }, {
      projection: { _id: 0, passwordHash: 0 },
    }) : null
  }
  return getDb().prepare(`
    SELECT ${userFields} FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE token_hash = ? AND expires_at > ?
  `).get(hashToken(token), Date.now()) as StudioUser | undefined ?? null
})

export async function requireUser(): Promise<StudioUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export function unauthorized() {
  return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 })
}
