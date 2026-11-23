import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getConversation } from '@/lib/db'
import { WorkspaceHeader } from '@/components/WorkspaceHeader'
import StudioWorkspace from './StudioWorkspace'

export default async function StudioPage({ searchParams }: {
  searchParams: Promise<{ document?: string }>
}) {
  const user = await requireUser()
  const { document } = await searchParams
  const conversation = typeof document === 'string' ? getConversation(document, user) : null
  if (document && !conversation?.documentContent) notFound()
  return (
    <div className="workspace-frame">
      <WorkspaceHeader name={user.name} role={user.role} />
      <StudioWorkspace key={conversation?.id || 'new'} initialConversation={conversation} />
    </div>
  )
}
