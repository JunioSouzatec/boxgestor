/**
 * Host-routing da landing comercial (mesmo build Vite / projeto Vercel).
 *
 * - useboxgestor.com.br → landing na raiz `/`
 * - demais hosts (vercel.app, teste., app., localhost) → sistema como hoje;
 *   landing continua em `/landing-preview`
 *
 * Domínios/DNS/aliases não são alterados por este módulo — só leitura de hostname.
 */

/** Hostname comercial da landing (apex). */
export const MARKETING_HOSTNAME = 'useboxgestor.com.br'

/**
 * Hostname oficial do sistema (login/cadastro).
 * Ainda pode não estar configurado na Vercel — usado só nos CTAs quando o
 * visitante já está no apex comercial.
 */
export const APP_PUBLIC_HOSTNAME = 'app.useboxgestor.com.br'

/** Origem absoluta do app (sem barra final). */
export const APP_PUBLIC_ORIGIN = `https://${APP_PUBLIC_HOSTNAME}`

/** Prefixo das rotas de preview da landing em hosts do sistema. */
export const LANDING_PREVIEW_BASE = '/landing-preview'

export function getHostname(): string {
  if (typeof window === 'undefined') return ''
  return window.location.hostname.toLowerCase()
}

/** True somente no apex comercial (não inclui www — redirect fica para depois). */
export function isMarketingHostname(hostname: string = getHostname()): boolean {
  return hostname === MARKETING_HOSTNAME
}

/**
 * Base path das páginas da landing neste host.
 * - marketing: `''` → `/`, `/planos`, …
 * - sistema/preview: `'/landing-preview'`
 */
export function getLandingBase(hostname: string = getHostname()): string {
  return isMarketingHostname(hostname) ? '' : LANDING_PREVIEW_BASE
}

/** Home da landing neste host (`/` ou `/landing-preview`). */
export function getLandingHomePath(hostname: string = getHostname()): string {
  return getLandingBase(hostname) || '/'
}

/** Monta path interno da landing (`recursos` → `/recursos` ou `/landing-preview/recursos`). */
export function landingPath(segment: string = '', hostname: string = getHostname()): string {
  const base = getLandingBase(hostname)
  const clean = segment.replace(/^\/+/, '')
  if (!clean) return getLandingHomePath(hostname)
  return `${base}/${clean}`
}

/** Banner “preview interno”: hosts onde a landing ainda não é a home oficial. */
export function isLandingPreviewMode(hostname: string = getHostname()): boolean {
  return !isMarketingHostname(hostname)
}
