import { isSupabaseConfigured } from '@/lib/supabase-env'
import { isFallbackLocalAtivo } from '@/lib/craft-auth-fallback'

/** Modo de autenticação do app */
export type CraftAuthMode = 'local' | 'supabase'

function lerModoAuthEnv(): string {
  return import.meta.env.VITE_CRAFT_AUTH?.toLowerCase()?.trim() ?? ''
}

/**
 * local  = login demo (localStorage)
 * supabase = Supabase Auth real
 * Em produção (PROD) com Supabase configurado, o padrão é supabase se VITE_CRAFT_AUTH não for "local".
 */
export function getCraftAuthMode(): CraftAuthMode {
  if (isFallbackLocalAtivo()) {
    return 'local'
  }

  const env = lerModoAuthEnv()
  if (env === 'local') return 'local'
  if (env === 'supabase') {
    return isSupabaseConfigured() ? 'supabase' : 'local'
  }

  if (import.meta.env.PROD && isSupabaseConfigured()) {
    return 'supabase'
  }

  return env ? 'local' : 'local'
}

export function isModoAuthLocalAtivo(): boolean {
  return getCraftAuthMode() === 'local'
}

export function obterModoAuthLabel(): string {
  if (isFallbackLocalAtivo()) {
    return 'Login: Demo (fallback local)'
  }
  return getCraftAuthMode() === 'supabase' ? 'Login: Supabase Auth' : 'Login: Demo (local)'
}

export function isModoAuthSupabaseAtivo(): boolean {
  return getCraftAuthMode() === 'supabase'
}
