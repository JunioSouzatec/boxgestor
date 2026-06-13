import { isModoAuthLocalAtivo } from '@/lib/craft-auth'
import { isSupabaseConfigured } from '@/lib/supabase-env'
import type { IAuthService } from '@/services/auth/auth.types'
import { localAuthService } from '@/services/auth/local-auth.service'
import { supabaseAuthService } from '@/services/auth/supabase-auth.service'

/** Sempre local quando VITE_CRAFT_AUTH=local — ignora Supabase Auth */
export function createAuthService(): IAuthService {
  const envAuth = import.meta.env.VITE_CRAFT_AUTH?.toLowerCase()?.trim()

  if (envAuth === 'supabase' && isSupabaseConfigured()) {
    return supabaseAuthService
  }

  return localAuthService
}

export function isSupabaseAuthService(
  service: IAuthService
): service is typeof supabaseAuthService {
  return service === supabaseAuthService
}

export function isLocalAuthService(
  service: IAuthService
): service is typeof localAuthService {
  return service === localAuthService
}

export function deveUsarSupabaseAuth(): boolean {
  return !isModoAuthLocalAtivo() && isSupabaseConfigured()
}
