import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getCraftAuthMode, obterModoAuthLabel } from '@/lib/craft-auth'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase-env'
import type { SupabaseDatabase } from '@/types/supabase'

export { isSupabaseConfigured } from '@/lib/supabase-env'

if (import.meta.env.DEV) {
  if (isSupabaseConfigured()) {
    const persistence = getCraftPersistenceMode()
    console.info(
      `[BoxGestor] Supabase configurado (${supabaseUrl}). ` +
        `Auth: ${obterModoAuthLabel()}. ` +
        `Persistência: ${persistence === 'supabase' ? 'supabase experimental' : 'localStorage'}.`
    )
  } else {
    console.info(
      '[BoxGestor] Supabase não configurado — o app continua usando localStorage. ' +
        'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local.'
    )
  }
}

/** Modo de persistência configurado (padrão: local) */
export type CraftPersistenceMode = 'local' | 'supabase'

export function getCraftPersistenceMode(): CraftPersistenceMode {
  const mode = import.meta.env.VITE_CRAFT_PERSISTENCE?.toLowerCase()?.trim()

  if (mode === 'local') return 'local'
  if (mode === 'supabase' && isSupabaseConfigured()) {
    return 'supabase'
  }

  if (import.meta.env.PROD && isSupabaseConfigured() && mode !== 'local') {
    return 'supabase'
  }

  return 'local'
}

/** Cliente Supabase singleton — null se variáveis não configuradas */
let client: SupabaseClient<SupabaseDatabase> | null = null

export function getSupabaseClient(): SupabaseClient<SupabaseDatabase> | null {
  if (!isSupabaseConfigured()) {
    return null
  }

  if (!client) {
    client = createClient<SupabaseDatabase>(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: getCraftAuthMode() === 'supabase',
      },
    })
  }

  return client
}

/**
 * Retorna cliente ou lança erro descritivo.
 * Use apenas quando Supabase estiver explicitamente ativado.
 */
export function requireSupabaseClient(): SupabaseClient<SupabaseDatabase> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local'
    )
  }
  return supabase
}

/** Reseta singleton (útil em testes) */
export function resetSupabaseClient(): void {
  client = null
}
