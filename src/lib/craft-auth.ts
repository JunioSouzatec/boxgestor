import { isSupabaseConfigured } from '@/lib/supabase-env'
import { isFallbackLocalAtivo } from '@/lib/craft-auth-fallback'

/** Modo de autenticação do app */
export type CraftAuthMode = 'local' | 'supabase'

function lerModoAuthEnv(): string {
  return import.meta.env.VITE_CRAFT_AUTH?.toLowerCase()?.trim() ?? 'local'
}

/**
 * local  = login demo (localStorage) — padrão
 * supabase = Supabase Auth real (requer VITE_CRAFT_AUTH=supabase + env Supabase)
 * Fallback runtime (localStorage) força modo local sem alterar .env
 */
export function getCraftAuthMode(): CraftAuthMode {
  if (isFallbackLocalAtivo()) {
    return 'local'
  }
  if (lerModoAuthEnv() !== 'supabase') {
    return 'local'
  }
  return isSupabaseConfigured() ? 'supabase' : 'local'
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
