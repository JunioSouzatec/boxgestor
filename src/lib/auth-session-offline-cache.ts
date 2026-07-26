import type { AuthSession } from '@/types/auth'

const STORAGE_KEY = 'craft_auth_offline_cache_v1'

/** Persiste sessão autenticada para reabrir o app offline (já logado). */
export function salvarSessaoOfflineCache(session: AuthSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    /* quota / private mode */
  }
}

export function lerSessaoOfflineCache(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    if (!parsed?.user?.id || !parsed.user.office_id) return null
    return parsed
  } catch {
    return null
  }
}

export function limparSessaoOfflineCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function sessaoOfflineCacheValida(
  cached: AuthSession | null,
  userId?: string | null
): cached is AuthSession {
  if (!cached?.user?.id || !cached.user.office_id) return false
  if (userId && cached.user.id !== userId) return false
  if (cached.expires_at) {
    const exp = Date.parse(cached.expires_at)
    if (!Number.isNaN(exp) && exp < Date.now()) return false
  }
  return true
}
