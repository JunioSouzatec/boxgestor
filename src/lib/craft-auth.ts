import { isSupabaseConfigured } from '@/lib/supabase'

/** Modo de autenticação do app */
export type CraftAuthMode = 'local' | 'supabase'

/**
 * local  = login demo (localStorage) — padrão
 * supabase = Supabase Auth real (requer VITE_SUPABASE_URL + ANON_KEY)
 */
export function getCraftAuthMode(): CraftAuthMode {
  const mode = import.meta.env.VITE_CRAFT_AUTH?.toLowerCase()
  if (mode === 'supabase' && isSupabaseConfigured()) {
    return 'supabase'
  }
  return 'local'
}

export function obterModoAuthLabel(): string {
  return getCraftAuthMode() === 'supabase' ? 'Login: Supabase Auth' : 'Login: Demo (local)'
}

export function isModoAuthSupabaseAtivo(): boolean {
  return getCraftAuthMode() === 'supabase'
}
