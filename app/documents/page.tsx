import { DocumentLibrary } from '@/components/DocumentLibrary'
import { WorkspaceHeader } from '@/components/WorkspaceHeader'
import { requireUser } from '@/lib/auth'
import { listSavedDocuments } from '@/lib/conversations'

export default async function DocumentsPage() {
  const user = await requireUser()
  const documents = await listSavedDocuments(user)
  return (
    <div className="workspace-frame">
      <WorkspaceHeader userId={user.id} name={user.name} role={user.role} />
      <main className="workspace-scroll">
        <div className="dashboard-content">
          <div className="dashboard-heading">
            <h1>Saved documents</h1>
            <p>Find, edit, and manage your drafts and approved documents.</p>
          </div>
          <DocumentLibrary documents={documents} />
        </div>
      </main>
    </div>
  )
}
