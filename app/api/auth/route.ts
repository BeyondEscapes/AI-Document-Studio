import { NextRequest, NextResponse } from 'next/server'
import { allowAuthAttempt, authenticate, createSession, endSession, registerUser } from '@/lib/auth'
import { useMongoAuth } from '@/lib/mongodb-auth'

export async function POST(request: NextRequest) {
  if (request.headers.get('sec-fetch-site') === 'cross-site' ||
    !request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  try {
    if (useMongoAuth() && !process.env.MONGODB_URI) {
      return NextResponse.json({ error: 'Sign-in is unavailable until MongoDB is configured on this deployment.' }, { status: 503 })
    }
    const body = await request.json()
    if (body?.action === 'logout') {
      await endSession()
      return NextResponse.json({ success: true })
    }
    if (body?.action !== 'login' && body?.action !== 'signup') {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const signup = body.action === 'signup'
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !password || password.length > 128 || (signup && (password.length < 12 || !name || name.length > 80))) {
      return NextResponse.json({
        error: signup ? 'Enter your name, a valid email, and a password of 12–128 characters.' : 'Enter a valid email and password.',
      }, { status: 400 })
    }
    if (!await allowAuthAttempt(`${body.action}:${email}`)) {
      return NextResponse.json({ error: 'Too many attempts. Try again in ten minutes.' }, { status: 429 })
    }
    const id = signup ? await registerUser(name, email, password) : await authenticate(email, password)
    if (!id) {
      return NextResponse.json({
        error: signup ? 'This email is already registered. Try signing in.' : 'The email or password is incorrect.',
      }, { status: signup ? 409 : 401 })
    }
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname)
    await createSession(id, !isLocal || request.nextUrl.protocol === 'https:' || forwardedProtocol === 'https')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Authentication request failed:', error)
    return NextResponse.json({ error: 'Could not complete the request.' }, { status: 500 })
  }
}
