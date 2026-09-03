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

/** Rotas comerciais oficiais no apex (sem `/landing-preview`). */
export const OFFICIAL_COMMERCIAL_PATHS = [
  '/',
  '/recursos',
  '/como-funciona',
  '/planos',
  '/sobre',
  '/contato',
] as const

/** Normaliza pathname para comparação (`/recursos/` → `/recursos`). */
export function normalizeAppPath(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/** True para `/landing-preview` e `/landing-preview/*` (qualquer host). */
export function isLandingPreviewPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname)
  return path === LANDING_PREVIEW_BASE || path.startsWith(`${LANDING_PREVIEW_BASE}/`)
}

/**
 * Path canônico comercial a partir da URL atual.
 * Não usar em rotas `/landing-preview*` — essas nunca são indexáveis/canonical.
 */
export function getOfficialCommercialPath(pathname: string): string {
  return normalizeAppPath(pathname)
}

/**
 * True só no apex + rota comercial oficial (indexável).
 * `/landing-preview*` é sempre false, inclusive em useboxgestor.com.br.
 */
export function isOfficialIndexablePath(
  pathname: string,
  hostname: string = getHostname(),
): boolean {
  if (isLandingPreviewPath(pathname)) return false
  if (!isMarketingHostname(hostname)) return false
  const path = getOfficialCommercialPath(pathname)
  return (OFFICIAL_COMMERCIAL_PATHS as readonly string[]).includes(path)
}

/**
 * Canonical absoluto das páginas comerciais indexáveis.
 * Retorna null em preview / hosts não comerciais (sem canonical).
 */
export function getOfficialCanonicalUrl(
  pathname: string,
  hostname: string = getHostname(),
): string | null {
  if (!isOfficialIndexablePath(pathname, hostname)) return null
  const path = getOfficialCommercialPath(pathname)
  if (path === '/') return `https://${MARKETING_HOSTNAME}/`
  return `https://${MARKETING_HOSTNAME}${path}`
}

/** Diretiva robots: indexável só no apex comercial (nunca em `/landing-preview*`). */
export function getSeoRobotsContent(
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : '/',
  hostname: string = getHostname(),
): 'index, follow' | 'noindex, nofollow' {
  return isOfficialIndexablePath(pathname, hostname) ? 'index, follow' : 'noindex, nofollow'
}

/** Remove meta robots do boot do index.html quando o React assume o SEO. */
export function clearBootSeoMeta(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll('meta[data-host-seo-boot="true"]').forEach((el) => el.remove())
}

/** Logo público usado em Open Graph / Twitter (asset existente em `/public/landing`). */
export const SEO_SHARE_IMAGE_PATH = '/landing/logo-boxgestor.png'
export const SEO_SHARE_IMAGE_URL = `https://${MARKETING_HOSTNAME}${SEO_SHARE_IMAGE_PATH}`
