import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SupabaseDatabase } from '@/types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Indica se URL e anon key estão definidas no ambiente */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl?.trim() && supabaseAnonKey?.trim())
}

if (import.meta.env.DEV) {
  if (isSupabaseConfigured()) {
    const mode = import.meta.env.VITE_CRAFT_PERSISTENCE?.toLowerCase() ?? 'local'
    console.info(
      `[Craft Oficina] Supabase configurado (${supabaseUrl}). ` +
        `Persistência: ${mode === 'supabase' ? 'supabase experimental (fase 1 + fallback local)' : 'localStorage'}.`
    )
  } else {
    console.info(
      '[Craft Oficina] Supabase não configurado — o app continua usando localStorage. ' +
        'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local.'
    )
  }
}

/** Modo de persistência configurado (padrão: local) */
export type CraftPersistenceMode = 'local' | 'supabase'

export function getCraftPersistenceMode(): CraftPersistenceMode {
  const mode = import.meta.env.VITE_CRAFT_PERSISTENCE?.toLowerCase()
  if (mode === 'supabase' && isSupabaseConfigured()) {
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
        detectSessionInUrl: true,
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
