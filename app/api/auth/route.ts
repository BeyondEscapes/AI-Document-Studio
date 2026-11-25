import { NextRequest, NextResponse } from 'next/server'
import {
  allowAuthAttempt, authenticate, createSession, endSession, issueEmailVerification, registerUser, verifyAccountEmail,
} from '@/lib/auth'
import { useMongoAuth } from '@/lib/mongodb-auth'
import { sendVerificationEmail, verificationMailConfig } from '@/lib/verification-email'

const verificationResponse = () => NextResponse.json({ success: true, verificationRequired: true }, { status: 202 })

export async function POST(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  try {
    if (useMongoAuth() && !process.env.MONGODB_URI) {
      return NextResponse.json({ error: 'Authentication is unavailable on this deployment.' }, { status: 503 })
    }
    const body = await request.json().catch(() => null)
    const action = body?.action
    if (action === 'logout') {
      await endSession()
      return NextResponse.json({ success: true })
    }
    if (!['login', 'signup', 'verify-email', 'resend-verification'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const signup = action === 'signup'
    if (email.length > 254 || !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email) ||
      !password || password.length > 128 || (signup && (password.length < 12 || !name || name.length > 80))) {
      return NextResponse.json({
        error: signup ? 'Enter your name, a valid email, and a password of 12 to 128 characters.' : 'Enter a valid email and password.',
      }, { status: 400 })
    }

    const emailAction = signup || action === 'resend-verification'
    const ip = process.env.VERCEL ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim().slice(0, 64) : undefined
    if (!await allowAuthAttempt(`source:${ip || 'shared'}:${emailAction ? 'email' : 'credentials'}`, emailAction ? 20 : 150) ||
      !await allowAuthAttempt(`${emailAction ? 'email' : action}:${email}`, emailAction ? 4 : 12)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, {
        status: 429, headers: { 'Retry-After': '600' },
      })
    }

    if (emailAction) {
      const mail = verificationMailConfig()
      if (!mail) return NextResponse.json({ error: 'Verification email is unavailable. Contact your workspace administrator.' }, { status: 503 })
      let token: string | undefined
      if (signup) {
        token = await registerUser(name, email, password)
      } else {
        const account = await authenticate(email, password)
        if (account) token = await issueEmailVerification(account)
      }
      if (token) await sendVerificationEmail(mail, email, token)
      // The same response avoids disclosing whether a submitted address is registered.
      return verificationResponse()
    }

    const account = await authenticate(email, password)
    if (action === 'verify-email') {
      const token = typeof body.token === 'string' && /^[a-f0-9]{64}$/.test(body.token) ? body.token : ''
      if (!account || !token || !await verifyAccountEmail(account.id, token)) {
        return NextResponse.json({ error: 'This link is invalid or expired, or the password is incorrect.' }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }

    if (!account || account.suspendedAt) {
      return NextResponse.json({ error: 'The email or password is incorrect.' }, { status: 401 })
    }
    if (account.verificationRequired && !account.emailVerifiedAt) {
      return NextResponse.json({ error: 'Verify your email before signing in.', verificationRequired: true }, { status: 403 })
    }
    if (account.verificationRequired && !account.accessApprovedAt) {
      return NextResponse.json({ error: 'Your email is verified. An administrator must approve workspace access before you can sign in.' }, { status: 403 })
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname)
    await createSession(account.id, !local || request.nextUrl.protocol === 'https:', account.sessionVersion ?? 0)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Authentication request failed:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ error: 'Could not complete the request. If your verification email did not arrive, request a new link.' }, { status: 500 })
  }
}
