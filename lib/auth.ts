import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { getDb, type ConversationAccess } from '@/lib/db'

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

export function listUsers(): StudioUser[] {
  return getDb().prepare(`SELECT ${userFields} FROM users ORDER BY created_at DESC`).all() as StudioUser[]
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function allowAuthAttempt(key: string) {
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
  const result = getDb().prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(email) DO NOTHING
  `).run(id, name, email, `${salt}:${digest}`, new Date().toISOString())
  return result.changes > 0 ? id : null
}

export async function authenticate(email: string, password: string): Promise<string | null> {
  const row = getDb().prepare(`SELECT ${userFields}, password_hash AS passwordHash FROM users WHERE email = ?`)
    .get(email) as AuthRow | undefined
  const [salt, hash] = row?.passwordHash.split(':') ?? ['0'.repeat(32), '0'.repeat(128)]
  const digest = await deriveKey(password, salt, 64) as Buffer
  return timingSafeEqual(digest, Buffer.from(hash, 'hex')) && row ? row.id : null
}

export async function createSession(userId: string, secure: boolean) {
  const token = randomBytes(32).toString('hex')
  const db = getDb()
  const now = Date.now()
  db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
    db.prepare('DELETE FROM auth_attempts WHERE window <= ?').run(Math.floor(now / 60_000) - 10)
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), userId, now + sessionLifetime * 1000)
  })()
  const jar = await cookies()
  const previous = jar.get(cookieName)?.value
  if (previous) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(previous))
  jar.set(cookieName, token, {
    maxAge: sessionLifetime, httpOnly: true, sameSite: 'lax', secure, path: '/',
  })
}

export async function endSession() {
  const jar = await cookies()
  const token = jar.get(cookieName)?.value
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  jar.delete(cookieName)
}

export async function getCurrentUser(): Promise<StudioUser | null> {
  const token = (await cookies()).get(cookieName)?.value
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  return getDb().prepare(`
    SELECT ${userFields} FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE token_hash = ? AND expires_at > ?
  `).get(hashToken(token), Date.now()) as StudioUser | undefined ?? null
}

export async function requireUser(): Promise<StudioUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export function unauthorized() {
  return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 })
}
