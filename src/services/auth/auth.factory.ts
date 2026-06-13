import { getCraftAuthMode } from '@/lib/craft-auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { IAuthService } from '@/services/auth/auth.types'
import { localAuthService } from '@/services/auth/local-auth.service'
import { supabaseAuthService } from '@/services/auth/supabase-auth.service'

export function createAuthService(): IAuthService {
  if (getCraftAuthMode() === 'supabase' && isSupabaseConfigured()) {
    return supabaseAuthService
  }
  return localAuthService
}

export function isSupabaseAuthService(service: IAuthService): service is typeof supabaseAuthService {
  return service === supabaseAuthService
}
