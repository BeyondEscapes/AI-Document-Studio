import '../gallery.css'
import { ImageGallery } from '@/components/ImageGallery'
import { WorkspaceHeader } from '@/components/WorkspaceHeader'
import { requireUser } from '@/lib/auth'

export default async function GalleryPage() {
  const user = await requireUser()
  return (
    <div className="workspace-frame">
      <WorkspaceHeader userId={user.id} name={user.name} role={user.role} />
      <main className="workspace-scroll">
        <ImageGallery />
      </main>
    </div>
  )
}
