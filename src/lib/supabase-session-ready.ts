import { getSupabaseClient } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

const avisosSessaoEmitidos = new Set<string>()

/** Tokens da sessão React/AuthContext — fallback se getSession() falhar. */
let appAccessToken: string | null = null
let appRefreshToken: string | null = null

function logSessaoUmaVez(chave: string, mensagem: string, extra?: Record<string, unknown>): void {
  if (avisosSessaoEmitidos.has(chave)) return
  avisosSessaoEmitidos.add(chave)
  console.warn(mensagem, extra ?? {})
}

/** Chamado pelo AuthContext quando a sessão do app muda. */
export function registrarTokensSessaoApp(
  accessToken?: string | null,
  refreshToken?: string | null
): void {
  appAccessToken = accessToken?.trim() || null
  appRefreshToken = refreshToken?.trim() || null
  if (appAccessToken) {
    avisosSessaoEmitidos.delete('sem_sessao')
  }
}

export function limparTokensSessaoApp(): void {
  appAccessToken = null
  appRefreshToken = null
}

async function tentarRestaurarComTokensApp(): Promise<Session | null> {
  if (!appAccessToken) return null
  const supabase = getSupabaseClient()
  if (!supabase) return null

  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: appAccessToken,
      refresh_token: appRefreshToken || appAccessToken,
    })
    if (error) {
      console.warn('[Craft Supabase] setSession com token do app falhou', error.message)
      return null
    }
    if (data.session?.user?.id && data.session.access_token) {
      return data.session
    }
  } catch (e) {
    console.warn('[Craft Supabase] setSession exception', e)
  }
  return null
}

/**
 * Aguarda a sessão Supabase Auth ficar disponível no client.
 * Ordem: getSession → tokens do AuthContext → getUser/refresh.
 */
export async function aguardarSessaoAuthSupabase(opcoes?: {
  tentativas?: number
  intervaloMs?: number
  silencioso?: boolean
}): Promise<Session | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const tentativas = opcoes?.tentativas ?? 12
  const intervaloMs = opcoes?.intervaloMs ?? 200

  for (let i = 0; i < tentativas; i++) {
    try {
      const { data, error } = await supabase.auth.getSession()
      if (!error && data.session?.user?.id && data.session.access_token) {
        registrarTokensSessaoApp(
          data.session.access_token,
          data.session.refresh_token
        )
        return data.session
      }
    } catch {
      /* retry */
    }

    // A partir da 2ª tentativa, tenta hidratar com token do React
    if (i >= 1 && appAccessToken) {
      const restaurada = await tentarRestaurarComTokensApp()
      if (restaurada) return restaurada
    }

    if (i < tentativas - 1) {
      await new Promise((r) => setTimeout(r, intervaloMs))
    }
  }

  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data.user?.id) {
      const { data: sess } = await supabase.auth.getSession()
      if (sess.session?.access_token) {
        registrarTokensSessaoApp(
          sess.session.access_token,
          sess.session.refresh_token
        )
        return sess.session
      }
    }
  } catch {
    /* ignore */
  }

  const restaurada = await tentarRestaurarComTokensApp()
  if (restaurada) return restaurada

  if (!opcoes?.silencioso) {
    logSessaoUmaVez(
      'sem_sessao',
      '[Craft Supabase] Sem sessão Auth após aguardar — persistência remota adiada.',
      {
        tentativas,
        temTokenApp: Boolean(appAccessToken),
      }
    )
  }
  return null
}

export function limparAvisosSessaoAuth(): void {
  avisosSessaoEmitidos.clear()
}

export function isUuidOfficeId(valor: string | null | undefined): boolean {
  if (!valor) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    valor.trim()
  )
}

/** Diagnóstico admin (RPC) — loga claims sem dados sensíveis de outras oficinas. */
export async function logDebugAuthAdminStatus(): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  const sessao = await aguardarSessaoAuthSupabase({ tentativas: 4, silencioso: true })
  if (!sessao) {
    console.warn('[Admin BoxGestor][diag] sem sessão Supabase no client')
    return
  }
  const { data, error } = await supabase.rpc('debug_auth_admin_status')
  if (error) {
    console.warn('[Admin BoxGestor][diag] debug_auth_admin_status', error.message)
    return
  }
  console.info('[Admin BoxGestor][diag] auth_admin_status', data)
}
