import { redirect } from 'next/navigation'
import { AuthScreen } from '@/components/AuthScreen'
import { getCurrentUser } from '@/lib/auth'

export default async function SignupPage() {
  if (await getCurrentUser()) redirect('/studio')
  return <AuthScreen mode="signup" />
}
