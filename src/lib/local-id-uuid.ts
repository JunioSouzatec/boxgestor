/** Namespace fixo para IDs determinísticos local → Supabase UUID */
const SYNC_NAMESPACE = 'craft-oficina-sync-v1'

/**
 * Converte um id local (ex.: cli-001, oficina-craft-001) em UUID estável.
 * Mesmo id local sempre gera o mesmo UUID — evita duplicidade em re-sync.
 */
export async function localIdParaUuid(localId: string): Promise<string> {
  const payload = `${SYNC_NAMESPACE}:${localId.trim()}`
  const data = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function dataLocalParaIso(data?: string): string {
  if (!data?.trim()) return new Date().toISOString()
  if (data.includes('T')) return data
  return `${data.slice(0, 10)}T12:00:00.000Z`
}
