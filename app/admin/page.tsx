import { WorkspaceText } from '@/components/WorkspaceLanguage'
import { redirect } from 'next/navigation'
import { BadgeCheck, FileText, Users } from 'lucide-react'
import { DocumentLibrary } from '@/components/DocumentLibrary'
import { WorkspaceHeader } from '@/components/WorkspaceHeader'
import { listUsers, requireUser } from '@/lib/auth'
import { listSavedDocuments } from '@/lib/conversations'

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Colombo' })

export default async function AdminPage() {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/documents')
  const [users, savedDocuments] = await Promise.all([listUsers(), listSavedDocuments(user, true)])
  const owners = new Map(users.map(account => [account.id, account.name]))
  const documents = savedDocuments.map(document => ({
    ...document,
    ownerName: document.ownerId ? owners.get(document.ownerId) ?? document.ownerName : null,
  }))
  const metrics = [
    { label: 'accounts' as const, value: users.length, icon: Users },
    { label: 'savedDocuments' as const, value: documents.length, icon: FileText },
    { label: 'approvedDocuments' as const, value: documents.filter(document => document.status === 'approved').length, icon: BadgeCheck },
  ]
  return (
    <div className="workspace-frame">
      <WorkspaceHeader userId={user.id} name={user.name} role={user.role} />
      <main className="workspace-scroll">
        <div className="dashboard-content">
          <div className="dashboard-heading">
            <h1><WorkspaceText label="adminDashboard" /></h1>
            <p><WorkspaceText label="adminIntro" /></p>
          </div>
          <div className="dashboard-metrics">
            {metrics.map(({ label, value, icon: Icon }) => (
              <div className="metric-card" key={label}>
                <span className="document-symbol"><Icon size={21} /></span>
                <div><p><WorkspaceText label={label} /></p><strong>{value}</strong></div>
              </div>
            ))}
          </div>
          <section aria-labelledby="team-documents">
            <h2 id="team-documents" className="dashboard-section-title"><WorkspaceText label="teamDocuments" /></h2>
            <DocumentLibrary documents={documents} showOwner />
          </section>
          <section aria-labelledby="team-accounts">
            <h2 id="team-accounts" className="dashboard-section-title"><WorkspaceText label="accounts" /></h2>
            <div className="dashboard-panel table-wrap">
              <table className="workspace-table">
                <thead><tr><th scope="col"><WorkspaceText label="name" /></th><th scope="col"><WorkspaceText label="email" /></th><th scope="col"><WorkspaceText label="role" /></th><th scope="col"><WorkspaceText label="joined" /></th></tr></thead>
                <tbody>{users.map(account => (
                  <tr key={account.id}>
                    <th scope="row">{account.name}</th><td>{account.email}</td>
                    <td><span className={`status-pill ${account.role === 'admin' ? 'status-approved' : ''}`}>
                      <WorkspaceText label={account.role === 'admin' ? 'administrator' : 'member'} />
                    </span></td>
                    <td><time dateTime={account.createdAt}>{dateFormat.format(new Date(account.createdAt))}</time></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
