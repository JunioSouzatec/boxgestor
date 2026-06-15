import { APP_NAME as APP_NAME_DEFAULT } from '@/lib/app-brand'

/** Nome do app (VITE_APP_NAME ou BoxGestor). */
export function obterNomeApp(): string {
  const env = import.meta.env.VITE_APP_NAME?.trim()
  return env || APP_NAME_DEFAULT
}

/**
 * Origem pública do app (sem barra final).
 * Produção: use VITE_APP_URL na Vercel/Netlify quando window não estiver disponível (SSR/build).
 */
export function getAppOrigin(): string {
  const envUrl = import.meta.env.VITE_APP_URL?.trim()
  if (envUrl) {
    return envUrl.replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

/** Monta URL absoluta para rotas públicas (convite, login, cadastro). */
export function getAppUrl(path: string): string {
  const origin = getAppOrigin()
  const rota = path.startsWith('/') ? path : `/${path}`
  return origin ? `${origin}${rota}` : rota
}

export function isProducaoOnline(): boolean {
  return import.meta.env.PROD && Boolean(import.meta.env.VITE_SUPABASE_URL?.trim())
}
