'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useWorkspaceLanguage } from './WorkspaceLanguage'
import { documentLanguageTags } from '@/lib/document-languages'
import type { AccountAction, StudioUser } from '@/lib/auth'

export function UserManagement({ accounts }: { accounts: StudioUser[] }) {
  const router = useRouter()
  const { language, t } = useWorkspaceLanguage()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string>()
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>()
  const dateFormat = new Intl.DateTimeFormat(documentLanguageTags[language], { dateStyle: 'medium', timeZone: 'Asia/Colombo' })
  const query = search.trim().toLowerCase()
  const filtered = accounts.filter(account => `${account.name} ${account.email}`.toLowerCase().includes(query))

  async function update(account: StudioUser, action: AccountAction) {
    if (busy) return
    if (action === 'suspend' && !window.confirm(`Suspend ${account.email} and sign them out?`)) return
    if (action === 'revoke-sessions' && !window.confirm(`Sign ${account.email} out on all devices?`)) return
    setBusy(account.id)
    setFeedback(undefined)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, action }),
      })
      if (!response.ok) throw new Error((await response.json()).error)
      setFeedback({ text: action === 'revoke-sessions' ? 'All sessions revoked.' : 'Account updated.' })
      router.refresh()
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not update the account.', error: true })
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="dashboard-panel">
      <div className="library-tools">
        <label className="library-search">
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            aria-label="Search accounts" placeholder="Search by name or email" />
        </label>
        {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
      </div>
      <div className="table-wrap">
        <table className="workspace-table">
          <thead><tr>
            <th scope="col">{t('name')}</th><th scope="col">{t('email')}</th><th scope="col">{t('role')}</th>
            <th scope="col">Email status</th><th scope="col">Access</th><th scope="col">{t('joined')}</th><th scope="col">Actions</th>
          </tr></thead>
          <tbody>{filtered.map(account => (
            <tr key={account.id}>
              <th scope="row">{account.name}</th><td>{account.email}</td>
              <td>{t(account.role === 'admin' ? 'administrator' : 'member')}</td>
              <td>{account.emailVerifiedAt ? 'Verified' : account.verificationRequired ? 'Pending' : 'Existing account'}</td>
              <td>{account.suspendedAt ? 'Suspended' : account.verificationRequired && !account.accessApprovedAt ? 'Awaiting approval' : 'Active'}</td>
              <td><time dateTime={account.createdAt}>{dateFormat.format(new Date(account.createdAt))}</time></td>
              <td>{account.role === 'member' && <div className="flex flex-wrap gap-2">
                {account.verificationRequired && account.emailVerifiedAt && !account.accessApprovedAt && !account.suspendedAt && (
                  <button type="button" className="primary-button button-compact" disabled={Boolean(busy)}
                    onClick={() => void update(account, 'approve')}>Approve access</button>
                )}
                <button type="button" className="secondary-button button-compact" disabled={Boolean(busy)}
                  onClick={() => void update(account, account.suspendedAt ? 'reactivate' : 'suspend')}>
                  {account.suspendedAt ? 'Reactivate' : 'Suspend'}
                </button>
                <button type="button" className="secondary-button button-compact" disabled={Boolean(busy)}
                  onClick={() => void update(account, 'revoke-sessions')}>Sign out all devices</button>
              </div>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!filtered.length && <p className="p-4 text-sm">No matching accounts.</p>}
    </div>
  )
}
