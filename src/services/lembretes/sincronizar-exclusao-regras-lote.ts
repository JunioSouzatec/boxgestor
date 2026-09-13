import { withTimeout } from '@/lib/with-timeout'
import type { ResultadoPersistenciaLembretes } from '@/services/lembretes/supabase-lembretes.persistence'
import type { RegraLembrete } from '@/types/lembrete'

export const LOTE_REGRAS_TIMEOUT_MS = 12_000

export const MSG_EXCLUSAO_LOTE_PENDENTE =
  'Exclusão registrada neste dispositivo. A sincronização ficará pendente.'

export interface ResultadoSyncExclusaoRegrasLote {
  sincronizado: boolean
  pendente: boolean
  timeout: boolean
  enviados: number
}

export interface DependenciasSyncExclusaoRegrasLote {
  persistirSelecionadas: (
    officeId: string,
    regras: RegraLembrete[]
  ) => Promise<ResultadoPersistenciaLembretes>
  enfileirarRetry: (officeId: string) => void
  estaOnline?: () => boolean
  timeoutMs?: number
}

/**
 * Um único envio direcionado das regras afetadas, com timeout só no remoto.
 * Não faz pull de regras/histórico da oficina.
 */
export async function sincronizarExclusaoRegrasLote(
  officeId: string,
  regrasAfetadas: RegraLembrete[],
  deps: DependenciasSyncExclusaoRegrasLote
): Promise<ResultadoSyncExclusaoRegrasLote> {
  if (regrasAfetadas.length === 0) {
    return { sincronizado: true, pendente: false, timeout: false, enviados: 0 }
  }

  const estaOnline = deps.estaOnline ?? (() => navigator.onLine)
  if (!estaOnline()) {
    deps.enfileirarRetry(officeId)
    return { sincronizado: false, pendente: true, timeout: false, enviados: 0 }
  }

  const timeoutMs = deps.timeoutMs ?? LOTE_REGRAS_TIMEOUT_MS
  try {
    const persistido = await withTimeout(
      deps.persistirSelecionadas(officeId, regrasAfetadas),
      timeoutMs,
      'exclusão em lote de regras'
    )
    if (persistido.ok) {
      return {
        sincronizado: true,
        pendente: false,
        timeout: false,
        enviados: persistido.enviados.regras,
      }
    }
    deps.enfileirarRetry(officeId)
    return {
      sincronizado: false,
      pendente: true,
      timeout: false,
      enviados: persistido.enviados.regras,
    }
  } catch (erro) {
    deps.enfileirarRetry(officeId)
    const timeout = erro instanceof Error && erro.message.startsWith('Timeout:')
    return { sincronizado: false, pendente: true, timeout, enviados: 0 }
  }
}
