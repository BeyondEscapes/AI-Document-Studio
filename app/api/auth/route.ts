import { NextRequest, NextResponse } from 'next/server'
import {
  allowAuthAttempt, authenticate, consumeLoginChallenge, createSession, endSession, issueEmailVerification,
  loginChallengeCookie, registerUser, startLoginChallenge, verifyAccountEmail,
} from '@/lib/auth'
import { useMongoAuth } from '@/lib/mongodb-auth'
import { sendLoginCode, sendVerificationEmail, verificationMailConfig } from '@/lib/verification-email'

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
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname)
    const secure = !local || request.nextUrl.protocol === 'https:'
    const nonce = request.cookies.get(loginChallengeCookie)?.value
    if (action === 'logout') {
      await endSession()
      const response = NextResponse.json({ success: true })
      response.cookies.delete(loginChallengeCookie)
      return response
    }
    if (action === 'confirm-login') {
      const code = typeof body.code === 'string' && /^\d{6}$/.test(body.code) ? body.code : ''
      const challenge = code && nonce ? await consumeLoginChallenge(nonce, code) : null
      if (!challenge) return NextResponse.json({ error: 'The code is incorrect, expired, or has too many attempts.' }, { status: 400 })
      await createSession(challenge.accountId, secure, challenge.sessionVersion)
      const response = NextResponse.json({ success: true })
      response.cookies.delete(loginChallengeCookie)
      return response
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
    const mail = verificationMailConfig()
    if (!mail) return NextResponse.json({ error: 'Sign-in email is unavailable. Contact your workspace administrator.' }, { status: 503 })
    if (!await allowAuthAttempt(`login-mail:${email}`, 5)) {
      return NextResponse.json({ error: 'Too many sign-in emails requested. Try again later.' }, { status: 429 })
    }
    const challenge = await startLoginChallenge(account, nonce)
    await sendLoginCode(mail, email, challenge.code)
    const response = NextResponse.json({ success: true, loginCodeRequired: true }, { status: 202 })
    response.cookies.set(loginChallengeCookie, challenge.nonce, {
      httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: challenge.maxAge,
    })
    return response
  } catch (error) {
    console.error('Authentication request failed:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ error: 'Could not complete the request. If your verification email did not arrive, request a new link.' }, { status: 500 })
  }
}
