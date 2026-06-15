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

export const MENSAGEM_ERRO_LISTAGEM_OFICINAS =
  'Não foi possível carregar as oficinas. Tente novamente.'

export const MENSAGEM_ERRO_LISTAGEM_OFICINAS_TITULO =
  'Não foi possível carregar as oficinas.'

export const MENSAGEM_ERRO_LISTAGEM_OFICINAS_SUBTITULO =
  'Verifique sua conexão e tente novamente.'

export const MENSAGEM_ERRO_DETALHES_OFICINA =
  'Não foi possível carregar os detalhes da oficina. Tente novamente.'

export const MENSAGEM_ERRO_ACAO_ADMIN =
  'Não foi possível concluir esta ação. Tente novamente.'

export const ADMIN_RPC_TIMEOUT_MS = 15_000

/** Timeout padrão das RPCs admin críticas (8 s). */
export const ADMIN_LIST_OFFICES_TIMEOUT_MS = 8_000
export const ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS = 8_000
export const ADMIN_ARCHIVE_OFFICE_TIMEOUT_MS = 8_000

export type AdminStatusOperacao = 'ocioso' | 'carregando' | 'sucesso' | 'erro' | 'timeout'

export class AdminRpcTimeoutError extends Error {
  constructor(operacao: string) {
    super(`Timeout ao executar ${operacao}.`)
    this.name = 'AdminRpcTimeoutError'
  }
}

/**
 * Executa RPC/admin fetch com timeout via Promise.race.
 * Rejeita com AdminRpcTimeoutError se passar do limite — independente do Supabase responder.
 */
export async function executarComTimeoutAdmin<T>(
  operacao: string,
  executar: () => Promise<T>,
  timeoutMs = ADMIN_RPC_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let concluiu = false

  const promessaTimeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      if (concluiu) return
      const err = new AdminRpcTimeoutError(operacao)
      console.error(`[Admin BoxGestor] timeout ${operacao}`, err)
      reject(err)
    }, timeoutMs)
  })

  try {
    const resultado = await Promise.race([executar(), promessaTimeout])
    concluiu = true
    return resultado
  } finally {
    concluiu = true
    if (timer) clearTimeout(timer)
  }
}

/** Watchdog na UI — dispara mesmo se a Promise principal nunca resolver. */
export function iniciarWatchdogAdmin(ms: number, onDisparar: () => void): () => void {
  const id = setTimeout(onDisparar, ms)
  return () => clearTimeout(id)
}

export function formatarHoraAdmin(data: Date): string {
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function labelStatusAdmin(status: AdminStatusOperacao): string {
  switch (status) {
    case 'carregando':
      return 'carregando'
    case 'sucesso':
      return 'sucesso'
    case 'timeout':
      return 'timeout ao carregar oficinas'
    case 'erro':
      return 'erro'
    default:
      return 'ocioso'
  }
}

export function logErroAdmin(operacao: string, err: unknown): void {
  console.error(`[Admin BoxGestor] ${operacao}`, err)
}
