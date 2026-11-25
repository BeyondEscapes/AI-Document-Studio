import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return NextResponse.next()
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 })
  }
  if (origin) {
    try {
      const source = new URL(origin)
      const forwardedProtocol = process.env.VERCEL ? request.headers.get('x-forwarded-proto') : null
      const protocol = forwardedProtocol === 'https' ? 'https:' : request.nextUrl.protocol
      if (source.host === host && source.protocol === protocol) return NextResponse.next()
    } catch {
      // Malformed origins are denied below.
    }
    return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = { matcher: '/api/:path*' }
