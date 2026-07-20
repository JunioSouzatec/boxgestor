import { getSupabaseClient } from '@/lib/supabase'
import { getCurrentSupabaseSession } from '@/services/auth/supabase-auth-safe.service'

const CIRCUIT_MS = 10 * 60 * 1000
const circuitAbertoAte = new Map<string, number>()

export function isErroAuthSupabase(mensagem: string | null | undefined): boolean {
  if (!mensagem) return false
  const m = mensagem.toLowerCase()
  return (
    m.includes('401') ||
    m.includes('unauthorized') ||
    m.includes('jwt') ||
    m.includes('invalid api key') ||
    m.includes('not authenticated') ||
    (m.includes('session') && m.includes('expired')) ||
    m.includes('permission denied') ||
    m.includes('row-level security')
  )
}

export function abrirCircuitLembretes(officeId: string, motivo: string): void {
  circuitAbertoAte.set(officeId, Date.now() + CIRCUIT_MS)
  console.warn('[BoxGestor Sync][queue] lembretes_circuit_open', {
    officeId,
    motivo: motivo.slice(0, 160),
    pausaMs: CIRCUIT_MS,
  })
}

export function lembretesCircuitAberto(officeId: string): boolean {
  const ate = circuitAbertoAte.get(officeId)
  if (!ate) return false
  if (Date.now() >= ate) {
    circuitAbertoAte.delete(officeId)
    return false
  }
  return true
}

export function fecharCircuitLembretes(officeId: string): void {
  circuitAbertoAte.delete(officeId)
}

/** Sessão JWT pronta para chamar tabelas TO authenticated. */
export async function garantirSessaoLembretes(): Promise<{
  ok: boolean
  userId?: string
  motivo?: string
}> {
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, motivo: 'sem_cliente' }

  const session = await getCurrentSupabaseSession()
  if (!session?.access_token || !session.user?.id) {
    return { ok: false, motivo: 'sem_sessao' }
  }

  const exp = session.expires_at
  if (typeof exp === 'number' && exp * 1000 < Date.now() - 5_000) {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session?.access_token) {
      return { ok: false, motivo: 'sessao_expirada' }
    }
  }

  return { ok: true, userId: session.user.id }
}
