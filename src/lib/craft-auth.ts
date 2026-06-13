import { isSupabaseConfigured } from '@/lib/supabase-env'

/** Modo de autenticação do app */
export type CraftAuthMode = 'local' | 'supabase'

function lerModoAuthEnv(): string {
  return import.meta.env.VITE_CRAFT_AUTH?.toLowerCase()?.trim() ?? 'local'
}

/**
 * local  = login demo (localStorage) — padrão
 * supabase = Supabase Auth real (requer VITE_CRAFT_AUTH=supabase + env Supabase)
 */
export function getCraftAuthMode(): CraftAuthMode {
  if (lerModoAuthEnv() !== 'supabase') {
    return 'local'
  }
  return isSupabaseConfigured() ? 'supabase' : 'local'
}

export function isModoAuthLocalAtivo(): boolean {
  return getCraftAuthMode() === 'local'
}

export function obterModoAuthLabel(): string {
  return getCraftAuthMode() === 'supabase' ? 'Login: Supabase Auth' : 'Login: Demo (local)'
}

export function isModoAuthSupabaseAtivo(): boolean {
  return getCraftAuthMode() === 'supabase'
}
