import { ASSINATURA_STORAGE_KEY } from '@/services/assinatura/assinatura.service'
import { UPGRADE_REQUESTS_STORAGE_KEY } from '@/services/assinatura/upgrade-requests.service'
import { AUTH_STORAGE_KEY } from '@/services/auth/local-auth.service'
import { TENANTS_STORAGE_KEY } from '@/services/repository/local.repository'
import { OFFICE_ID } from '@/types/base'

/** Exibe ID interno de forma compacta no Admin. */
export function formatarOfficeIdCurto(officeId: string): string {
  if (officeId.length <= 12) return officeId
  return `${officeId.slice(0, 4)}…${officeId.slice(-4)}`
}

/**
 * Remove oficina do armazenamento local (modo dev/local).
 * Não apaga dados do Supabase remoto.
 */
export function excluirOficinaLocal(officeId: string): {
  ok: boolean
  mensagem: string
} {
  if (!officeId.trim()) {
    return { ok: false, mensagem: 'Oficina inválida.' }
  }

  if (officeId === OFFICE_ID) {
    return {
      ok: false,
      mensagem: 'A oficina demo principal não pode ser excluída por aqui.',
    }
  }

  try {
    const tenantsRaw = localStorage.getItem(TENANTS_STORAGE_KEY)
    if (tenantsRaw) {
      const payload = JSON.parse(tenantsRaw) as { tenants?: Record<string, unknown> }
      if (payload.tenants?.[officeId]) {
        delete payload.tenants[officeId]
        localStorage.setItem(TENANTS_STORAGE_KEY, JSON.stringify(payload))
      }
    }

    const assRaw = localStorage.getItem(ASSINATURA_STORAGE_KEY)
    if (assRaw) {
      const payload = JSON.parse(assRaw) as { assinaturas?: Record<string, unknown> }
      if (payload.assinaturas?.[officeId]) {
        delete payload.assinaturas[officeId]
        localStorage.setItem(ASSINATURA_STORAGE_KEY, JSON.stringify(payload))
      }
    }

    const authRaw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (authRaw) {
      const payload = JSON.parse(authRaw) as {
        users?: { office_id?: string; id?: string }[]
        session?: { user?: { office_id?: string } } | null
      }
      if (payload.users) {
        payload.users = payload.users.filter((u) => u.office_id !== officeId)
      }
      if (payload.session?.user?.office_id === officeId) {
        payload.session = null
      }
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload))
    }

    const reqRaw = localStorage.getItem(UPGRADE_REQUESTS_STORAGE_KEY)
    if (reqRaw) {
      const payload = JSON.parse(reqRaw) as { requests?: { office_id?: string }[] }
      if (payload.requests) {
        payload.requests = payload.requests.filter((r) => r.office_id !== officeId)
        localStorage.setItem(UPGRADE_REQUESTS_STORAGE_KEY, JSON.stringify(payload))
      }
    }

    window.dispatchEvent(new CustomEvent('craft-assinatura-updated'))

    return { ok: true, mensagem: 'Oficina removida do armazenamento local.' }
  } catch (err) {
    return {
      ok: false,
      mensagem: err instanceof Error ? err.message : 'Não foi possível excluir a oficina.',
    }
  }
}
