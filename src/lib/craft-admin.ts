import type { AuthUser } from '@/types/auth'

const SYSTEM_ADMIN_EMAILS_ENV =
  (import.meta.env.VITE_SYSTEM_ADMIN_EMAILS as string | undefined) ??
  (import.meta.env.VITE_CRAFT_ADMIN_EMAILS as string | undefined) ??
  ''

/** E-mails autorizados como Administrador do Sistema (vírgula no .env — só dev/suporte). */
export function obterEmailsAdminSistema(): string[] {
  return SYSTEM_ADMIN_EMAILS_ENV.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function emailEhAdminSistema(email: string): boolean {
  const normalizado = email.trim().toLowerCase()
  if (!normalizado) return false
  return obterEmailsAdminSistema().includes(normalizado)
}

/**
 * Administrador do Sistema — diferente do Dono da oficina.
 * Pode ver Admin BoxGestor, diagnóstico, manutenção e ferramentas técnicas.
 */
export function ehAdminSistema(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  if (user.admin_sistema === true) return true
  return emailEhAdminSistema(user.email)
}

/** Marca admin_sistema quando o e-mail está na lista do .env (sem expor config à UI cliente). */
export function enriquecerUsuarioAdmin(user: AuthUser): AuthUser {
  if (user.admin_sistema === true) return user
  if (emailEhAdminSistema(user.email)) {
    return { ...user, admin_sistema: true }
  }
  return user
}

/** Credencial demo local — apenas ambiente de desenvolvimento. */
export const CREDENCIAIS_ADMIN_LOCAL = {
  email: 'admin@boxgestor.com',
  senha: 'boxgestor-admin',
} as const
