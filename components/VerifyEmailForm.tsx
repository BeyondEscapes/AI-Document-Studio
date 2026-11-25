'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'

export function VerifyEmailForm() {
  const [link, setLink] = useState<{ email: string; token: string } | null>(null)
  const [complete, setComplete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    setLink({ email: params.get('email') ?? '', token: params.get('token') ?? '' })
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!link?.token || busy) return
    const password = new FormData(event.currentTarget).get('password')
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-email', ...link, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      window.history.replaceState(null, '', window.location.pathname)
      setLink(null)
      setComplete(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not verify your email.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-ui-canvas p-5">
      <section className="auth-form-wrap rounded-2xl border border-ui-line bg-ui-panel p-6" aria-labelledby="verify-title">
        <h1 id="verify-title">{complete ? 'Email verified' : 'Verify your email'}</h1>
        {complete ? (
          <p className="auth-intro">An administrator must approve your workspace access before you can sign in. <Link className="text-link" href="/login">Sign in</Link></p>
        ) : link?.token ? (
          <>
            <p className="auth-intro">Confirm your signup for <strong>{link.email}</strong> using the password you chose.</p>
            <form className="auth-form" onSubmit={submit}>
              <label>Password<input name="password" type="password" autoComplete="current-password" maxLength={128} required /></label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Verifying...' : 'Verify email'}</button>
            </form>
          </>
        ) : (
          <p className="auth-intro">
            {link ? 'Open the verification link from your email. If it has expired, sign in to request another link.' : 'Opening your verification link...'}
          </p>
        )}
        {!complete && <p className="auth-switch"><Link href="/login">Return to sign in</Link></p>}
      </section>
    </main>
  )
}
