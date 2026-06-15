/** Ambiente admin remoto (produção Vercel + Supabase). */
import { isModoAuthSupabaseAtivo } from '@/lib/craft-auth'
import { isSupabaseConfigured } from '@/lib/supabase'

export function adminUsaSupabaseRemoto(): boolean {
  return isModoAuthSupabaseAtivo() && isSupabaseConfigured()
}

/** Fallback local só em desenvolvimento sem Supabase remoto. */
export function permitirFallbackLocalAdmin(): boolean {
  return import.meta.env.DEV && !adminUsaSupabaseRemoto()
}

export const MENSAGEM_ERRO_ADMIN_SUPABASE =
  'Não foi possível carregar dados administrativos do Supabase. Tente novamente.'

export const MENSAGEM_ERRO_ACAO_ADMIN =
  'Não foi possível concluir esta ação. Tente novamente.'

export const ADMIN_RPC_TIMEOUT_MS = 15_000

export class AdminRpcTimeoutError extends Error {
  constructor(operacao: string) {
    super(`Timeout ao executar ${operacao}.`)
    this.name = 'AdminRpcTimeoutError'
  }
}

/**
 * Executa RPC/admin fetch com timeout. Não aborta a requisição de rede,
 * mas evita loading infinito na UI.
 */
export async function executarComTimeoutAdmin<T>(
  operacao: string,
  executar: () => Promise<T>,
  timeoutMs = ADMIN_RPC_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      executar(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AdminRpcTimeoutError(operacao)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function logErroAdmin(operacao: string, err: unknown): void {
  console.error(`[Admin BoxGestor] ${operacao}`, err)
}
