import { LANDING_LINKS } from '@/marketing/landing/content/landing-content'
import {
  APP_PUBLIC_ORIGIN,
  isMarketingHostname,
  landingPath,
} from '@/marketing/landing/lib/landing-host'

export type LandingNavLink =
  | { to: string; href?: undefined; external?: boolean }
  | { href: string; to?: undefined; external?: boolean }

/**
 * Login / Entrar.
 * No apex comercial → app.useboxgestor.com.br (destino oficial).
 * Nos hosts do sistema/preview → `/login` relativo (continua testável).
 */
export function linkEntrarSistema(): LandingNavLink {
  if (isMarketingHostname()) {
    return { href: `${APP_PUBLIC_ORIGIN}/login` }
  }
  return { to: LANDING_LINKS.entrar }
}

/**
 * Teste grátis / cadastro.
 * Mesma regra do login: origem do app no apex; relativo nos demais hosts.
 */
export function linkTestarBoxGestor(): LandingNavLink {
  if (isMarketingHostname()) {
    return { href: `${APP_PUBLIC_ORIGIN}/cadastro` }
  }
  return { to: LANDING_LINKS.testar }
}

export function linkWhatsAppComercial(): { href: string; external: boolean } {
  const numero = LANDING_LINKS.whatsappNumero.trim()
  if (!numero) {
    return { href: `${landingPath('contato')}#whatsapp`, external: false }
  }
  const digits = numero.replace(/\D/g, '')
  return {
    href: `https://wa.me/${digits}?text=${encodeURIComponent(
      'Olá! Quero conhecer o BoxGestor e falar sobre minha oficina.'
    )}`,
    external: true,
  }
}
