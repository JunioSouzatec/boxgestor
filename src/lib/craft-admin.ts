import type { AuthUser } from '@/types/auth'

const ADMIN_EMAILS_ENV = (import.meta.env.VITE_CRAFT_ADMIN_EMAILS as string | undefined) ?? ''

/** E-mails autorizados como Administrador do Sistema (separados por vírgula no .env). */
export function obterEmailsAdminSistema(): string[] {
  return ADMIN_EMAILS_ENV.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Administrador do Sistema Craft — diferente do Dono da oficina.
 * Pode ver diagnóstico, manutenção e ferramentas técnicas.
 */
export function ehAdminSistema(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  if (user.admin_sistema === true) return true
  return obterEmailsAdminSistema().includes(user.email.trim().toLowerCase())
}

export const CREDENCIAIS_ADMIN_LOCAL = {
  email: 'admin@craft.com',
  senha: 'craft-admin',
} as const
