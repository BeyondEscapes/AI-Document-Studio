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
  const destination = destinations[currentPhoto]

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, action: mode }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      window.location.assign('/studio')
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : 'Something went wrong. Try again.')
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
          <h1 id="auth-title">{signup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="auth-intro">{signup ? 'Sign up to start using Document Studio.' : 'Sign in to open your workspace.'}</p>
          <form className="auth-form" onSubmit={submit}>
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
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="primary-button auth-submit" disabled={busy}>
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'} <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {signup ? 'Already have an account?' : 'New to Document Studio?'}{' '}
            <Link href={signup ? '/login' : '/signup'}>{signup ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
