import path from 'node:path'
import Database from 'better-sqlite3'
import { MongoClient } from 'mongodb'

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Usage: npm run promote-admin -- account@example.com')
  process.exit(1)
}

let db
let client
try {
  let found
  if (process.argv.includes('--mongo') || process.env.STUDIO_AUTH_STORAGE === 'mongodb') {
    if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI before promoting a hosted account.')
    client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    const result = await client.db(process.env.MONGODB_DB || 'doc_theme').collection('studio_accounts')
      .updateOne({
        _id: email,
        suspendedAt: null,
        $or: [{ verificationRequired: { $ne: true } }, { emailVerifiedAt: { $type: 'string' } }],
      }, { $set: { role: 'admin', accessApprovedAt: new Date().toISOString() } })
    found = result.matchedCount
  } else {
    db = new Database(path.join(process.env.STUDIO_DATA_DIR || 'data', 'studio.db'), { fileMustExist: true })
    found = db.prepare(`
      UPDATE users SET role = 'admin', access_approved_at = ?
      WHERE email = ? AND suspended_at IS NULL AND (verification_required = 0 OR email_verified_at IS NOT NULL)
    `).run(new Date().toISOString(), email).changes
  }
  if (!found) throw new Error('No eligible account found. Verify the account email and ensure the account is active.')
  console.log(`Administrator access granted to ${email}.`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  db?.close()
  await client?.close()
}
