import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3'],
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }, {
      source: '/api/:path*',
      headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
    }, {
      source: '/verify-email',
      headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
    }]
  },
}

export default nextConfig
