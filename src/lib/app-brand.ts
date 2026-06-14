/** Marca comercial do produto (SaaS) — separada do nome de cada oficina cliente. */
export const APP_NAME = 'BoxGestor'
export const APP_SHORT_NAME = 'BoxGestor'
export const APP_TAGLINE = 'Gestão para oficinas de motos'
export const APP_DESCRIPTION =
  'Sistema completo para oficinas: clientes, motos, ordens de serviço, estoque e financeiro.'

export const APP_SUPPORT_EMAIL = 'suporte@boxgestor.com.br'

export function tituloPaginaApp(titulo?: string): string {
  if (!titulo?.trim()) return APP_NAME
  return `${titulo.trim()} — ${APP_NAME}`
}
