import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getConversation, useMongoDocuments } from '@/lib/conversations'
import { WorkspaceHeader } from '@/components/WorkspaceHeader'
import StudioWorkspace from './StudioWorkspace'

export default async function StudioPage({ searchParams }: {
  searchParams: Promise<{ document?: string; conversation?: string }>
}) {
  const user = await requireUser()
  const { document, conversation: resume } = await searchParams
  const id = document ?? resume
  const conversation = typeof id === 'string' ? await getConversation(id, user) : null
  if (document && !conversation?.documentContent) notFound()
  return (
    <div className="workspace-frame">
      <WorkspaceHeader userId={user.id} name={user.name} role={user.role} />
      <StudioWorkspace key={conversation?.id || 'new'} userId={user.id} initialConversation={conversation}
        openInEdit={Boolean(document)} cloudDocuments={useMongoDocuments()} />
    </div>
  )
}
