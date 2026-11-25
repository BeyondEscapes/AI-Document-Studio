'use client'

import { useWorkspaceLanguage } from './WorkspaceLanguage'
import { documentLanguageTags } from '@/lib/document-languages'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { SavedDocument } from '@/lib/db'


export function DocumentLibrary({ documents, showOwner = false }: { documents: SavedDocument[]; showOwner?: boolean }) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const { language, t } = useWorkspaceLanguage()
  const dateFormat = new Intl.DateTimeFormat(documentLanguageTags[language], { dateStyle: 'medium', timeZone: 'Asia/Colombo' })
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<SavedDocument | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const available = documents.filter(document => !deletedIds.has(document.id))
  const term = query.trim().toLowerCase()
  const filtered = available.filter(document =>
    (!status || document.status === status) &&
    [document.title, document.type.replaceAll('_', ' '), document.ownerName]
      .some(value => value?.toLowerCase().includes(term)),
  )

  useEffect(() => {
    if (dialogOpen && !dialog.current?.open) dialog.current?.showModal()
  }, [dialogOpen])

  function openDialog(target: SavedDocument | null) {
    setSelected(target)
    setError('')
    setDialogOpen(true)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = new FormData(event.currentTarget).get('title')
    setBusy(true)
    setError('')
    try {
      const response = selected
        ? await fetch(`/api/documents?id=${encodeURIComponent(selected.id)}`, { method: 'DELETE' })
        : await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      dialog.current?.close()
      if (selected) {
        setDeletedIds(current => new Set([...current, selected.id]))
        router.refresh()
      } else {
        router.push(`/studio?document=${encodeURIComponent(result.id)}`)
      }
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : 'Could not complete the request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dashboard-panel" aria-label={showOwner ? t('teamDocuments') : t('savedDocuments')}>
      <div className="library-tools">
        <label className="library-search">
          <Search size={18} aria-hidden="true" />
          <input type="search" aria-label={t('searchDocuments')} placeholder={t('searchDocuments')} value={query}
            onChange={event => setQuery(event.target.value)} />
        </label>
        <select aria-label="Filter approval status" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">{t('allStatuses')}</option><option value="draft">{t('draft')}</option><option value="approved">{t('approved')}</option>
        </select>
        {!showOwner && <button type="button" className="primary-button library-new" onClick={() => openDialog(null)}>
          <Plus size={17} /> {t('newDocument')}
        </button>}
      </div>
      {filtered.length ? (
        <div className="table-wrap">
          <table className="workspace-table">
            <thead><tr><th scope="col">{t('document')}</th>{showOwner && <th scope="col">{t('owner')}</th>}<th scope="col">{t('status')}</th>
              <th scope="col">{t('updated')}</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{filtered.map(document => (
              <tr key={document.id}>
                <th scope="row"><div className="document-cell">
                  <span className="document-symbol"><FileText size={18} /></span>
                  <span><Link href={`/studio?document=${encodeURIComponent(document.id)}`}>{document.title}</Link>
                    <small>{document.type === 'other' ? 'General document' : document.type.replaceAll('_', ' ')}</small></span>
                </div></th>
                {showOwner && <td>{document.ownerName || 'Unassigned'}</td>}
                <td><span className={`status-pill ${document.status === 'approved' ? 'status-approved' : ''}`}>
                  {document.status === 'approved' ? t('approved') : t('draft')}
                </span></td>
                <td><time dateTime={document.updatedAt}>{dateFormat.format(new Date(document.updatedAt))}</time></td>
                <td><div className="document-actions">
                  <Link href={`/studio?document=${encodeURIComponent(document.id)}`} className="icon-button" title={t('edit')} aria-label={`${t('edit')} ${document.title}`}>
                    <Pencil size={16} />
                  </Link>
                  <button type="button" className="icon-button danger-icon" onClick={() => openDialog(document)}
                    title={t('delete')} aria-label={`${t('delete')} ${document.title}`}><Trash2 size={16} /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="library-empty">
          <span className="document-symbol"><FileText size={24} /></span>
          <h2>{available.length ? t('noMatchingDocuments') : t('noSavedDocuments')}</h2>
          <p>{available.length ? 'Try a different term or status.' : showOwner ? 'Team documents will appear here.' : 'Start with a blank document or create one with the studio assistant.'}</p>
          {!available.length && !showOwner && <Link className="text-link" href="/studio">{t('openStudio')}</Link>}
        </div>
      )}
      <dialog ref={dialog} className="library-dialog" aria-labelledby="document-dialog-title"
        onClose={() => setDialogOpen(false)}
        onCancel={event => { if (busy) event.preventDefault() }}>
        {dialogOpen && <form onSubmit={submit} className="dialog-form">
          <h2 id="document-dialog-title">{selected ? 'Delete saved document?' : 'Create a document'}</h2>
          {selected ? <p>“{selected.title}” will be removed. The conversation and its chat messages will stay in the studio.</p>
            : <label>Document title<input name="title" maxLength={160} placeholder="Enter a title" required /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={() => dialog.current?.close()}>{t('cancel')}</button>
            <button type="submit" disabled={busy} className={selected ? 'danger-button' : 'primary-button'}>
              {busy ? 'Please wait…' : selected ? 'Delete document' : 'Open editor'}
            </button>
          </div>
        </form>}
      </dialog>
    </section>
  )
}
