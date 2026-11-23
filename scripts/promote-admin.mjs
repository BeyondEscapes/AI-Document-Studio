import path from 'node:path'
import Database from 'better-sqlite3'

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Usage: npm run promote-admin -- account@example.com')
  process.exit(1)
}

let db
try {
  db = new Database(path.join(process.env.STUDIO_DATA_DIR || 'data', 'studio.db'), { fileMustExist: true })
  const result = db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email)
  if (!result.changes) throw new Error('No account found. Create the account in the studio first.')
  console.log(`Administrator access granted to ${email}.`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  db?.close()
}
