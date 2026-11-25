const localHosts = ['localhost', '127.0.0.1', '[::1]']

export function verificationMailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.VERIFICATION_EMAIL_FROM?.trim()
  const appUrl = process.env.STUDIO_PUBLIC_URL?.trim()
  if (!apiKey || !from || !appUrl) return undefined
  try {
    const url = new URL(appUrl)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && localHosts.includes(url.hostname))) ||
      url.username || url.password) return undefined
    return { apiKey, from, origin: url.origin }
  } catch {
    return undefined
  }
}

export async function sendVerificationEmail(
  config: NonNullable<ReturnType<typeof verificationMailConfig>>,
  email: string,
  token: string,
) {
  const link = new URL('/verify-email', config.origin)
  link.hash = new URLSearchParams({ email, token }).toString()
  await sendMail(config, email, 'Verify your Document Studio email',
    `Open this link and enter the password you chose when you signed up:\n\n${link.href}\n\nThe link expires in 30 minutes. If you did not create this account, you can ignore this message.`)
}

export async function sendLoginCode(
  config: NonNullable<ReturnType<typeof verificationMailConfig>>,
  email: string,
  code: string,
) {
  await sendMail(config, email, 'Your Document Studio sign-in code',
    `Your sign-in code is ${code}. It expires in 5 minutes. If you did not try to sign in, ignore this email.`)
}

async function sendMail(config: { apiKey: string; from: string }, email: string, subject: string, text: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.from, to: [email], subject, text }),
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`Verification email provider returned ${response.status}`)
}
