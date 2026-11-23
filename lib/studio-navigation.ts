function key(userId: string) {
  return `studio-active-conversation:${userId}`
}

export function rememberStudioConversation(userId: string, id?: string) {
  try {
    if (id) sessionStorage.setItem(key(userId), id)
    else sessionStorage.removeItem(key(userId))
  } catch {
    // Studio navigation remains available when browser storage is disabled.
  }
}

export function studioReturnHref(userId: string) {
  try {
    const id = sessionStorage.getItem(key(userId))
    if (id) return `/studio?conversation=${encodeURIComponent(id)}`
  } catch {
    // Use the default Studio route when browser storage is unavailable.
  }
  return '/studio'
}
