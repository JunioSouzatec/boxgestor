import { OFFICE_ID } from '@/types/base'
import type { AuthSession } from '@/types/auth'

/** Office ID seguro a partir da sessão — fallback para demo local */
export function obterOfficeIdDaSessao(
  session: AuthSession | null | undefined,
  fallback: string = OFFICE_ID
): string {
  const id = session?.user?.office_id?.trim()
  return id || fallback
}

export function sessaoLocalValida(session: AuthSession | null | undefined): session is AuthSession {
  return Boolean(session?.user?.id && session.user.office_id && session.access_token)
}
