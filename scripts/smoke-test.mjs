import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { randomUUID, scryptSync } from 'node:crypto'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import JSZip from 'jszip'
import { BUSINESS_DOCUMENT_TEMPLATES } from '../lib/business-documents.ts'
import { DOCUMENT_LANGUAGES } from '../lib/document-languages.ts'

const data = await mkdtemp(path.join(tmpdir(), 'document-studio-smoke-'))
const password = 'fixture-password-1234'
const legacyEmail = 'legacy@example.test'
const legacyDb = new Database(path.join(data, 'studio.db'))
legacyDb.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL
  )
`)
const salt = '0'.repeat(32)
legacyDb.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)').run(
  randomUUID(), legacyEmail, 'Legacy fixture', `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
  'member', new Date().toISOString(),
)
legacyDb.close()
const host = '127.0.0.1'
const base = `http://${host}:${process.env.SMOKE_PORT || 3189}`
const prompts = {
  room_reservation: 'Request a deluxe double room for Avery Test at Example Hotel, Kandy, 2 adults, 10 to 12 June 2027, breakfast included.',
  hotel_voucher: 'Write a voucher for Avery Test, Example Hotel in Kandy, 10–12 June 2027, breakfast included, reservation pending.',
  tour_itinerary: 'Plan two days in Colombo and Kandy. Do not include a price.',
  invoice: 'Invoice Example Company for a USD 50 airport transfer, stated total USD 50, issued on 10 June 2027.',
  transport_confirmation: 'Draft a pending car transfer with Example Tours for Avery Test and one guest from Colombo Airport to Kandy at 9 am on 10 June 2027.',
  rooming_list: 'Rooming list for Example Hotel on 10–12 June 2027: Avery Test in room A.',
  business_letter: 'Write a business letter to Example Hotel requesting an accessible room.',
  tour_proposal: 'Propose a two-day cultural tour of Colombo and Kandy with guiding only.',
  other_business_document: 'Create a briefing for travel staff explaining the visitor check-in process.',
}

const cases = new Map(Object.entries(prompts).map(([type, prompt]) => [prompt, {
  type, fields: Object.fromEntries(BUSINESS_DOCUMENT_TEMPLATES[type].requiredFields.map(key => [key, key === 'destinations' ? 'Colombo, Kandy' : 'Fixture value'])),
}]))
const incomplete = 'Start a new invoice for Example Company. The total and issue date are unknown.'
const reviseIncomplete = 'Update only the incomplete invoice with a total. The issue date is still unknown.'
cases.set(incomplete, { type: 'invoice', fields: { billTo: 'Example Company' } })
cases.set(reviseIncomplete, { type: 'invoice', fields: { totalAmount: 'USD 50' } })
const observedLanguages = new Set()
const mail = new Map()

const gemini = createServer(async (request, response) => {
  try {
    let input = ''
    for await (const chunk of request) input += chunk
    const body = JSON.parse(input)
    if (request.url === '/emails') {
      const [recipient] = body.to
      const url = body.text.match(/http[^\s]+/)?.[0]
      if (!url) throw new Error('Missing verification link')
      mail.set(recipient, new URLSearchParams(new URL(url).hash.slice(1)).get('token'))
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ id: 'mock-email' }))
      return
    }
    const latest = body.contents.at(-1).parts[0].text
    const repair = latest.startsWith('The intake already has every required field.')
    const prompt = repair ? body.contents.at(-3).parts[0].text : latest
    const instruction = body.systemInstruction.parts.map(item => item.text).join(' ')
    const language = /OUTPUT LANGUAGE: The default is (\w+)/.exec(instruction)?.[1]
    observedLanguages.add(language)
    const fixture = cases.get(prompt)
    const result = {
      message: fixture ? 'Document fixture reply' : 'Hello, how can I help?',
      isNewDocument: prompt !== reviseIncomplete,
      documentIntake: fixture && { documentType: fixture.type, fields: fixture.fields },
      documentContent: fixture && (fixture.type !== 'business_letter' || repair) && {
        title: 'Fixture ' + fixture.type,
        sections: [{id: 'day', type: 'heading1', content: 'Day 1: Colombo'}, {id: 'body', type: 'paragraph', content: 'Fixture itinerary prose.'}],
        metadata: {language},
      },
    }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(result)}]},finishReason:'STOP'}]}))
  } catch (error) {
    response.writeHead(500).end(JSON.stringify({error: {message: String(error)}}))
  }
})
await new Promise(resolve => gemini.listen(0, host, resolve))
const mailPreload = path.join(data, 'mail-preload.cjs')
await writeFile(mailPreload, `
const fetchOriginal = globalThis.fetch
globalThis.fetch = (input, init) => fetchOriginal(
  input === 'https://api.resend.com/emails' ? ${JSON.stringify(`http://${host}:${gemini.address().port}/emails`)} : input,
  init,
)
`)
const server = spawn(process.execPath, [
  'node_modules/next/dist/bin/next', process.env.SMOKE_PRODUCTION === '1' ? 'start' : 'dev', '--hostname', host, '--port', new URL(base).port,
], {
  env: {
    ...process.env, STUDIO_DATA_DIR: data, STUDIO_AUTH_STORAGE: 'sqlite', MONGODB_URI: '', VERCEL: '',
    GEMINI_API_KEY: 'smoke-test-key', GOOGLE_GEMINI_BASE_URL: `http://${host}:${gemini.address().port}`,
    RESEND_API_KEY: 'smoke-email-key', VERIFICATION_EMAIL_FROM: 'studio@example.test', STUDIO_PUBLIC_URL: base,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require="${mailPreload.split(path.sep).join('/')}"`].filter(Boolean).join(' '),
    NEXT_TELEMETRY_DISABLED: '1',
  },
  windowsHide: true,
})
let logs = ''
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-8000) })

const json = body => ({ headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) })
const request = (pathname, options = {}, cookie = '') => fetch(base + pathname, {
  signal: AbortSignal.timeout(140_000), ...options, headers: { cookie, ...options.headers },
})
const read = async (response, status = 200) => {
  const body = await response.json()
  assert.equal(response.status, status, JSON.stringify(body))
  return body
}
const auth = (action, email, fields = {}) => request('/api/auth', {
  method: 'POST', ...json({ action, email, name: 'Smoke Fixture', password, ...fields }),
  headers: { 'Content-Type': 'application/json', origin: base },
})
const login = async email => {
  const response = await auth('login', email)
  assert.equal(response.status, 200, await response.clone().text())
  return response.headers.get('set-cookie').split(';')[0]
}
const register = async email => {
  const signup = await auth('signup', email)
  assert.equal(signup.status, 202, await signup.clone().text())
  assert.equal(signup.headers.get('set-cookie'), null)
  const token = mail.get(email)
  assert.match(token, /^[a-f0-9]{64}$/)
  assert.equal((await auth('login', email)).status, 403)
  assert.equal((await auth('verify-email', email, { token, password: 'incorrect-password' })).status, 400)
  const verification = await auth('verify-email', email, { token })
  assert.equal(verification.status, 200, await verification.clone().text())
  assert.equal(verification.headers.get('set-cookie'), null)
  assert.equal((await auth('verify-email', email, { token })).status, 400)
  assert.equal((await auth('login', email)).status, 403)
}

try {
  for (let retry = 0; ; retry++) {
    const response = await request('/api/settings', {signal:AbortSignal.timeout(15000)}).catch(() => null)
    if (response?.status === 401) break
    if (server.exitCode !== null || retry === 49) throw new Error('Smoke server did not start')
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  const legacySession = await login(legacyEmail)
  await read(await request('/api/settings', {}, legacySession))
  const adminEmail = 'first@example.test'
  const memberEmail = 'second@example.test'
  await register(adminEmail)
  const promote = spawnSync(process.execPath, ['scripts/promote-admin.mjs', adminEmail], {
    env: { ...process.env, STUDIO_DATA_DIR: data, STUDIO_AUTH_STORAGE: 'sqlite' }, encoding: 'utf8', windowsHide: true,
  })
  assert.equal(promote.status, 0, promote.stderr)
  const cookie = await login(adminEmail)
  await register(memberEmail)
  const db = new Database(path.join(data, 'studio.db'))
  const { id: memberId } = db.prepare('SELECT id FROM users WHERE email = ?').get(memberEmail)
  db.close()
  const manage = (action, session = cookie, headers = {}) => request('/api/admin/users', {
    method: 'PATCH', ...json({ id: memberId, action }), headers: { ...json({}).headers, ...headers },
  }, session)
  await read(await manage('approve', cookie, { origin: 'https://another-site.example' }), 403)
  await read(await manage('approve'))
  const revokedCookie = await login(memberEmail)
  await read(await manage('suspend', revokedCookie), 403)
  await read(await manage('revoke-sessions'))
  await read(await request('/api/settings', {}, revokedCookie), 401)
  const suspendedCookie = await login(memberEmail)
  await read(await manage('suspend'))
  await read(await request('/api/settings', {}, suspendedCookie), 401)
  assert.equal((await auth('login', memberEmail)).status, 401)
  await read(await manage('reactivate'))
  await read(await request('/api/settings', {}, suspendedCookie), 401)
  const otherCookie = await login(memberEmail)
  const verificationPage = await request('/verify-email')
  assert.equal(verificationPage.status, 200)
  assert.equal(verificationPage.headers.get('referrer-policy'), 'no-referrer')
  assert.match(verificationPage.headers.get('content-security-policy'), /frame-ancestors/)
  const attemptsEmail = 'ratelimit@example.test'
  for (let attempt = 0; attempt < 12; attempt++) assert.equal((await auth('login', attemptsEmail)).status, 401)
  assert.equal((await auth('login', attemptsEmail)).status, 429)
  const duplicate = await auth('signup', memberEmail, { password: 'different-password-1234' })
  assert.equal(duplicate.status, 202)
  const resendEmail = 'resend@example.test'
  assert.equal((await auth('signup', resendEmail)).status, 202)
  const oldToken = mail.get(resendEmail)
  const expirationDb = new Database(path.join(data, 'studio.db'))
  expirationDb.prepare('UPDATE users SET verification_expires_at = 1 WHERE email = ?').run(resendEmail)
  expirationDb.close()
  assert.equal((await auth('verify-email', resendEmail, { token: oldToken })).status, 400)
  assert.equal((await auth('resend-verification', resendEmail)).status, 202)
  const newToken = mail.get(resendEmail)
  assert.notEqual(oldToken, newToken)
  assert.equal((await auth('verify-email', resendEmail, { token: oldToken })).status, 400)
  assert.equal((await auth('verify-email', resendEmail, { token: newToken })).status, 200)
  const abandonedEmail = 'abandoned@example.test'
  assert.equal((await auth('signup', abandonedEmail)).status, 202)
  const abandonedToken = mail.get(abandonedEmail)
  const abandonedDb = new Database(path.join(data, 'studio.db'))
  abandonedDb.prepare('UPDATE users SET verification_expires_at = 1 WHERE email = ?').run(abandonedEmail)
  abandonedDb.close()
  const replacementPassword = 'replacement-fixture-1234'
  assert.equal((await auth('signup', abandonedEmail, { password: replacementPassword })).status, 202)
  const replacementToken = mail.get(abandonedEmail)
  assert.notEqual(replacementToken, abandonedToken)
  assert.equal((await auth('verify-email', abandonedEmail, { token: replacementToken })).status, 400)
  assert.equal((await auth('verify-email', abandonedEmail, { token: replacementToken, password: replacementPassword })).status, 200)
  const invalidWord = new FormData()
  invalidWord.set('name', 'Invalid test template')
  invalidWord.set('template', new File(['PK fake'], 'test.docx'))
  assert.equal((await request('/api/themes/upload', {method:'POST',body:invalidWord}, otherCookie)).status, 403)
  assert.equal((await request('/api/themes/upload', {method:'POST',body:invalidWord}, cookie)).status, 400)
  const official = await readFile('assets/beyond-escapes-template.docx')
  const wordForm = bytes => {
    const form = new FormData()
    form.set('name', 'Test template')
    form.set('template', new File([bytes], 'test.docx'))
    return form
  }
  const accepted = await read(await request('/api/themes/upload', {method:'POST',body:wordForm(official)}, cookie), 201)
  assert.equal(accepted.theme.templatePath, undefined)
  const external = await JSZip.loadAsync(official)
  external.file('word/_rels/test.xml.rels', '<Relationships><Relationship Target="https://example.test/" TargetMode="External"/></Relationships>')
  const rejectedTemplate = await request('/api/themes/upload', {
    method:'POST', body:wordForm(await external.generateAsync({type:'nodebuffer'})),
  }, cookie)
  assert.equal(rejectedTemplate.status, 400)
  assert.equal((await request('/api/themes', {}, cookie)).headers.get('cache-control'), 'private, no-store')
  assert.equal((await request('/admin', {}, cookie)).status, 200)
  console.log('Verified signup, email expiry and replay, resend, approval, account management, session revocation, and cross-origin denial.')
  const post = async (url, body, status = 200) => read(await request(url, {method:'POST', ...json(body)}, cookie), status)
  const generated = new Map()
  for (const [type, message] of Object.entries(prompts)) {
    const result = await post('/api/chat', {message})
    assert.equal(result.message.documentContent?.documentType, type, JSON.stringify(result.message))
    assert.equal(result.message.documentIntake.missingFields.length, 0)
    generated.set(type, result.message.documentContent)
  }
  const draft = await post('/api/documents', {title:'Existing draft'}, 201)
  const pathname = '/api/conversations/' + draft.id
  await read(await request(pathname, {}, otherCookie), 404)
  const rejected = await post('/api/chat', {message:incomplete, conversationId:draft.id})
  assert.equal(rejected.message.documentContent, undefined)
  assert.ok(rejected.message.documentIntake.missingFields.includes('issueDate'))
  assert.equal(rejected.documentCleared, true)
  const clarification = await post('/api/chat', {message:reviseIncomplete, conversationId:draft.id})
  assert.equal(clarification.message.documentContent, undefined)
  assert.equal(clarification.message.documentIntake.fields.billTo, 'Example Company')
  assert.equal((await read(await request(pathname, {}, cookie))).conversation.documentContent.title, 'Existing draft')
  await read(await request(pathname, {method:'PUT', ...json({title:'Edited draft'})}, cookie))
  assert.equal((await read(await request(pathname, {}, cookie))).conversation.title, 'Edited draft')
  for (const language of DOCUMENT_LANGUAGES) {
    await post('/api/settings', {language})
    const result = await post('/api/chat', {message:'Hello', language})
    assert.equal(result.message.documentContent, undefined)
  }
  assert.deepEqual(observedLanguages, new Set(DOCUMENT_LANGUAGES))
  const gallery = await read(await request('/api/itinerary-images?gallery=1', {}, cookie))
  assert.ok(gallery.images.length)
  const asset = await readFile(path.join('public','itinerary-images', gallery.images[0].id + '.jpg'))
  const form = new FormData()
  form.set('image', new File([asset], 'smoke.jpg', {type:'image/jpeg'}))
  form.set('city','Smoke City')
  form.set('place','Smoke Place')
  const uploaded = await read(await request('/api/itinerary-images', {method:'POST',body:form}, cookie), 201)
  assert.equal((await request(uploaded.image.url, {}, cookie)).status, 200)
  const moved = await read(await request('/api/itinerary-images', {method:'PATCH', ...json({id:uploaded.image.id,title:'Smoke photo',city:'Kandy',place:'Smoke Place'})}, cookie))
  assert.equal(moved.image.folder.city, 'Kandy')
  const itinerary = generated.get('tour_itinerary')
  const photo = {catalogId: uploaded.image.id, src: uploaded.image.url, altText:'Smoke photo', width:uploaded.image.width, height:uploaded.image.height}
  itinerary.itineraryPages.cover = {mapImage:photo}
  itinerary.sections[0].images = [photo]
  for (const [type, documentContent] of generated) {
    const template = type === 'business_letter' ? { themeId: accepted.theme.id } : {}
    const result = await post('/api/export', {documentContent, format:'docx', ...template})
    const download = await request(result.downloadUrl, {}, cookie)
    assert.equal(download.status, 200)
    const archive = await JSZip.loadAsync(await download.arrayBuffer())
    const body = await archive.file('word/document.xml').async('string')
    if (type === 'tour_itinerary') {
      assert.doesNotMatch(body, /USD 920|Per vehicle per tour|Optional - Entrance fees|ABOVE RATE INCLUDES/)
      assert.ok(Object.keys(archive.files).some(name => name.startsWith('word/media/image')))
    }
  }
  const pdfResponse = await request('/api/export', {method:'POST', ...json({documentContent:generated.get('business_letter'), format:'pdf'})}, cookie)
  const pdf = await pdfResponse.json()
  if (pdfResponse.ok) {
    const download = await request(pdf.downloadUrl, {}, cookie)
    assert.equal(download.status, 200)
    assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0,5).toString(), '%PDF-')
    console.log('Server PDF conversion and download passed.')
  } else {
    assert.equal(pdfResponse.status, 500)
    assert.equal(pdf.browserPdfAvailable, true, JSON.stringify(pdf))
    assert.equal((await request(pdf.docxDownloadUrl, {}, cookie)).status, 200)
    assert.notEqual(process.env.SMOKE_REQUIRE_PDF, '1', pdf.error)
    console.log('Server PDF converter unavailable. Verified browser-PDF fallback response and DOCX download.')
  }
  await read(await request('/api/documents?id='+draft.id, {method:'DELETE'}, cookie))
  const pages = await Promise.all(['/studio','/documents','/gallery'].map(page => request(page, {}, cookie)))
  for (const response of pages) assert.equal(response.status, 200)
  console.log('Passed nine document prompts and DOCX downloads, required-field checks, draft preservation, account isolation, six languages, gallery upload and move, and workspace page loads.')
} catch (error) {
  console.error(error)
  console.error(logs)
  process.exitCode = 1
} finally {
  gemini.close()
  server.kill()
}
