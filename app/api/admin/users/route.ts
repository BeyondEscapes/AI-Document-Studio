import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, manageMemberAccount, unauthorized } from '@/lib/auth'

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 })
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const { id, action } = body ?? {}
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) ||
    (action !== 'suspend' && action !== 'reactivate' && action !== 'revoke-sessions' && action !== 'approve')) {
    return NextResponse.json({ error: 'Invalid account action.' }, { status: 400 })
  }
  try {
    if (!await manageMemberAccount(id, action)) {
      return NextResponse.json({ error: 'This action is unavailable for the selected account.' }, { status: 409 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Account management failed:', error)
    return NextResponse.json({ error: 'Could not update the account.' }, { status: 500 })
  }
}
