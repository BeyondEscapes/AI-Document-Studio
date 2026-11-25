'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, MapPin } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

const destinations = [
  { name: 'Sri Lanka’s south coast', asset: '/images/auth-coast-hd.webp' },
  { name: 'Sigiriya, Sri Lanka', asset: '/images/auth-sigiriya-hd.webp' },
]

export function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup'
  const [currentPhoto, setCurrentPhoto] = useState(signup ? 1 : 0)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [canResend, setCanResend] = useState(false)
  const [codeRequired, setCodeRequired] = useState(false)
  const destination = destinations[currentPhoto]

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const action = codeRequired ? 'confirm-login'
      : submitter?.getAttribute('value') === 'resend-verification' ? 'resend-verification' : mode
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, action }),
      })
      const result = await response.json()
      if (!response.ok) {
        if (result.verificationRequired) setCanResend(true)
        throw new Error(result.error)
      }
      if (result.loginCodeRequired) {
        setCanResend(false)
        setCodeRequired(true)
      } else if (result.verificationRequired) {
        setCanResend(true)
        setNotice('Check your inbox for the verification link. If the address already has an active account, sign in.')
      } else {
        window.location.assign('/studio')
      }
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <aside className="auth-visual" aria-label={destination.name}>
        <Image key={destination.asset} src={destination.asset} alt="" fill preload
          sizes="(max-width: 760px) max(100vw, 620px), max(53vw, 240dvh)" />
        <div className="auth-visual-shade" />
        <div className="auth-visual-inner">
          <Image className="auth-logo" src="/images/beyond_escapes_logo_white.png" alt="Beyond Escapes" width={218} height={42} />
          <div>
            <p className="auth-visual-heading">Document Studio</p>
            <p className="auth-visual-description">Create and manage branded travel documents.</p>
            <div className="auth-visual-footer">
              <span><MapPin size={16} /> {destination.name}</span>
              <div className="auth-photo-tabs" aria-label="Background photo">
                {destinations.map((photo, index) => (
                  <button type="button" key={photo.asset} aria-label={photo.name}
                    aria-pressed={currentPhoto === index} onClick={() => setCurrentPhoto(index)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>
      <section className="auth-main" aria-labelledby="auth-title">
        <div className="auth-theme"><ThemeToggle /></div>
        <div className="auth-form-wrap">
          <h1 id="auth-title">{codeRequired ? 'Check your email' : signup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="auth-intro">{codeRequired ? 'Enter the six-digit sign-in code we sent you. The code expires in five minutes.' : signup ? 'Sign up to start using Document Studio.' : 'Sign in to open your workspace.'}</p>
          <form className="auth-form" onSubmit={submit}>
            {codeRequired ? (
              <label>Sign-in code
                <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
                  minLength={6} maxLength={6} autoFocus required />
              </label>
            ) : (
              <>
                {signup && <label>Full name<input name="name" autoComplete="name" placeholder="Your full name" maxLength={80} required /></label>}
                <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required /></label>
                <label htmlFor="auth-password">Password</label>
                <div className="password-field">
                  <input id="auth-password" name="password" type={passwordVisible ? 'text' : 'password'}
                    autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'At least 12 characters' : 'Enter your password'}
                    minLength={signup ? 12 : undefined} maxLength={128} required />
                  <button type="button" aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                    onClick={() => setPasswordVisible(value => !value)}>
                    {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </>
            )}
            {notice && <p className="rounded-lg bg-ui-tint px-3 py-2 text-sm text-ui-accent" role="status">{notice}</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="primary-button auth-submit" disabled={busy}>
              {busy ? 'Please wait…' : codeRequired ? 'Verify code' : signup ? 'Create account' : 'Sign in'} <ArrowRight size={18} />
            </button>
            {!codeRequired && canResend && (
              <button type="submit" value="resend-verification" className="secondary-button" disabled={busy}>
                Resend verification email
              </button>
            )}
          </form>
          {codeRequired ? (
            <button type="button" className="secondary-button mt-3 w-full" disabled={busy}
              onClick={() => { setCodeRequired(false); setError(''); setNotice('') }}>
              Restart sign-in to request a new code
            </button>
          ) : (
            <p className="auth-switch">
              {signup ? 'Already have an account?' : 'New to Document Studio?'}{' '}
              <Link href={signup ? '/login' : '/signup'}>{signup ? 'Sign in' : 'Create an account'}</Link>
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
