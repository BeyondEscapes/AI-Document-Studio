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
  verificationRequired?: boolean
  emailVerifiedAt?: string | null
  accessApprovedAt?: string | null
  suspendedAt?: string | null
}

interface AuthRow extends StudioUser {
  passwordHash: string
  sessionVersion?: number
}

const userFields = `users.id, users.name, users.email, users.role, users.created_at AS createdAt,
  users.verification_required AS verificationRequired, users.email_verified_at AS emailVerifiedAt,
  users.suspended_at AS suspendedAt, users.access_approved_at AS accessApprovedAt`
const publicAccountFields = { _id: 0, passwordHash: 0, verificationHash: 0, verificationExpiresAt: 0, sessionVersion: 0 } as const

export async function listUsers(): Promise<StudioUser[]> {
  if (useMongoAuth()) return (await mongoAuthCollections()).accounts
    .find<StudioUser>({}, { projection: publicAccountFields }).sort({ createdAt: -1 }).toArray()
  return getDb().prepare(`SELECT ${userFields} FROM users ORDER BY created_at DESC`).all() as StudioUser[]
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function allowAuthAttempt(key: string, limit = 12) {
  const window = Math.floor(Date.now() / 600_000)
  if (useMongoAuth()) {
    const { attempts } = await mongoAuthCollections()
    const counter = await attempts.findOneAndUpdate(
      { _id: hashToken(`${window}:${key}`) },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * 600_000) } },
      { upsert: true, returnDocument: 'after' },
    )
    return Boolean(counter && counter.count <= limit)
  }
  const row = getDb().prepare(`
    INSERT INTO auth_attempts (key, window, attempts) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET attempts =
      CASE WHEN window < excluded.window THEN 1 ELSE attempts + 1 END,
      window = CASE WHEN window < excluded.window THEN excluded.window ELSE window END
    RETURNING attempts
  `).get(hashToken(key), window) as { attempts: number }
  return row.attempts <= limit
}

function createVerification() {
  const token = randomBytes(32).toString('hex')
  return { token, verificationHash: hashToken(token), verificationExpiresAt: Date.now() + 30 * 60_000 }
}

export async function registerUser(name: string, email: string, password: string): Promise<string | undefined> {
  const id = randomUUID()
  const salt = randomBytes(16).toString('hex')
  const digest = await deriveKey(password, salt, 64) as Buffer
  const passwordHash = `${salt}:${digest.toString('hex')}`
  const { token, verificationHash, verificationExpiresAt } = createVerification()
  const now = Date.now()
  const createdAt = new Date(now).toISOString()

  if (useMongoAuth()) {
    const { accounts } = await mongoAuthCollections()
    try {
      await accounts.insertOne({
        _id: email, id, name, email, role: 'member', passwordHash,
        createdAt, verificationRequired: true, sessionVersion: 0, verificationHash, verificationExpiresAt,
      })
      return token
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error
      const result = await accounts.updateOne({
        _id: email, role: 'member', verificationRequired: true, emailVerifiedAt: null, suspendedAt: null,
        $or: [{ verificationExpiresAt: { $lte: now } }, { verificationExpiresAt: { $exists: false } }],
      }, { $set: { name, passwordHash, verificationHash, verificationExpiresAt } })
      return result.matchedCount ? token : undefined
    }
  }
  const result = getDb().prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at, verification_required, verification_hash, verification_expires_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash,
      verification_hash = excluded.verification_hash, verification_expires_at = excluded.verification_expires_at
    WHERE users.role = 'member' AND users.verification_required = 1 AND users.email_verified_at IS NULL
      AND users.suspended_at IS NULL AND COALESCE(users.verification_expires_at, 0) <= ?
  `).run(id, name, email, passwordHash, createdAt, verificationHash, verificationExpiresAt, now)
  return result.changes ? token : undefined
}

export async function authenticate(email: string, password: string): Promise<AuthRow | null> {
  const row = useMongoAuth()
    ? await (await mongoAuthCollections()).accounts.findOne({ _id: email })
    : getDb().prepare(`SELECT ${userFields}, password_hash AS passwordHash, session_version AS sessionVersion FROM users WHERE email = ?`)
      .get(email) as AuthRow | undefined
  const [salt, hash] = row?.passwordHash.split(':') ?? ['0'.repeat(32), '0'.repeat(128)]
  const digest = await deriveKey(password, salt, 64) as Buffer
  const expected = Buffer.from(hash ?? '', 'hex')
  return expected.length === digest.length && timingSafeEqual(digest, expected) && row ? row : null
}

export async function createSession(userId: string, secure: boolean, sessionVersion: number) {
  const token = randomBytes(32).toString('hex')
  const jar = await cookies()
  const previous = jar.get(cookieName)?.value
  if (useMongoAuth()) {
    const { sessions } = await mongoAuthCollections()
    await sessions.insertOne({
      _id: hashToken(token), accountId: userId, sessionVersion, expiresAt: new Date(Date.now() + sessionLifetime * 1000),
    })
    if (previous) await sessions.deleteOne({ _id: hashToken(previous) })
  } else {
    const db = getDb()
    const now = Date.now()
    db.transaction(() => {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
      db.prepare('DELETE FROM auth_attempts WHERE window <= ?').run(Math.floor(now / 600_000) - 2)
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, session_version) VALUES (?, ?, ?, ?)')
        .run(hashToken(token), userId, now + sessionLifetime * 1000, sessionVersion)
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
    if (!session) return null
    const { sessionVersion, ...projection } = publicAccountFields
    const account = await accounts.findOne<StudioUser & { sessionVersion?: number }>({
      id: session.accountId, suspendedAt: null,
      $or: [{ verificationRequired: { $ne: true } }, { emailVerifiedAt: { $type: 'string' }, accessApprovedAt: { $type: 'string' } }],
    }, { projection })
    if (!account || (account.sessionVersion ?? 0) !== (session.sessionVersion ?? 0)) return null
    const { sessionVersion: _version, ...user } = account
    return user
  }
  return getDb().prepare(`
    SELECT ${userFields} FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE token_hash = ? AND expires_at > ? AND users.suspended_at IS NULL
      AND (users.verification_required = 0 OR (users.email_verified_at IS NOT NULL AND users.access_approved_at IS NOT NULL))
      AND sessions.session_version = users.session_version
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


export async function issueEmailVerification({ id, passwordHash }: AuthRow) {
  const { token, verificationHash, verificationExpiresAt } = createVerification()
  const changed = useMongoAuth()
    ? (await (await mongoAuthCollections()).accounts.updateOne({
        id, passwordHash, verificationRequired: true, emailVerifiedAt: null, suspendedAt: null,
      }, { $set: { verificationHash, verificationExpiresAt } })).matchedCount
    : getDb().prepare(`
        UPDATE users SET verification_hash = ?, verification_expires_at = ?
        WHERE id = ? AND password_hash = ? AND verification_required = 1 AND email_verified_at IS NULL AND suspended_at IS NULL
      `).run(verificationHash, verificationExpiresAt, id, passwordHash).changes
  return changed ? token : undefined
}

export async function verifyAccountEmail(id: string, token: string) {
  const now = Date.now()
  const emailVerifiedAt = new Date(now).toISOString()
  const verificationHash = hashToken(token)
  if (useMongoAuth()) {
    const result = await (await mongoAuthCollections()).accounts.updateOne({
      id, verificationHash, verificationExpiresAt: { $gt: now },
      verificationRequired: true, emailVerifiedAt: null, suspendedAt: null,
    }, { $set: { emailVerifiedAt }, $unset: { verificationHash: '', verificationExpiresAt: '' } })
    return result.modifiedCount === 1
  }
  return getDb().prepare(`
    UPDATE users SET email_verified_at = ?, verification_hash = NULL, verification_expires_at = NULL
    WHERE id = ? AND verification_hash = ? AND verification_expires_at > ?
      AND verification_required = 1 AND email_verified_at IS NULL AND suspended_at IS NULL
  `).run(emailVerifiedAt, id, verificationHash, now).changes === 1
}

export type AccountAction = 'suspend' | 'reactivate' | 'revoke-sessions' | 'approve'

export async function manageMemberAccount(id: string, action: AccountAction) {
  if (action === 'approve') {
    const approvedAt = new Date().toISOString()
    if (useMongoAuth()) {
      const result = await (await mongoAuthCollections()).accounts.updateOne({
        id, role: 'member', verificationRequired: true, emailVerifiedAt: { $type: 'string' }, suspendedAt: null,
      }, { $set: { accessApprovedAt: approvedAt } })
      return result.matchedCount === 1
    }
    return getDb().prepare(`
      UPDATE users SET access_approved_at = ?
      WHERE id = ? AND role = 'member' AND verification_required = 1
        AND email_verified_at IS NOT NULL AND suspended_at IS NULL
    `).run(approvedAt, id).changes === 1
  }
  const suspendedAt = action === 'suspend' ? new Date().toISOString() : null
  if (useMongoAuth()) {
    const { accounts, sessions } = await mongoAuthCollections()
    const account = await accounts.findOneAndUpdate({ id, role: 'member' }, {
      $inc: { sessionVersion: 1 },
      ...(action === 'revoke-sessions' ? {} : { $set: { suspendedAt } }),
    }, { returnDocument: 'after', projection: { sessionVersion: 1 } })
    if (!account) return false
    await sessions.deleteMany({ accountId: id, $or: [
      { sessionVersion: { $exists: false } },
      { sessionVersion: { $lt: account.sessionVersion ?? 0 } },
    ] })
    return true
  }
  const db = getDb()
  return db.transaction(() => {
    const result = action === 'revoke-sessions'
      ? db.prepare("UPDATE users SET session_version = session_version + 1 WHERE id = ? AND role = 'member'").run(id)
      : db.prepare("UPDATE users SET session_version = session_version + 1, suspended_at = ? WHERE id = ? AND role = 'member'").run(suspendedAt, id)
    if (!result.changes) return false
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    return true
  }).immediate()
}
