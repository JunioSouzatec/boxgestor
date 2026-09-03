import { LANDING_LINKS } from '@/marketing/landing/content/landing-content'

export function linkTestarBoxGestor() {
  return LANDING_LINKS.testar
}

export function linkWhatsAppComercial(): { href: string; external: boolean } {
  const numero = LANDING_LINKS.whatsappNumero.trim()
  if (!numero) {
    return { href: '/landing-preview/contato#whatsapp', external: false }
  }
  const digits = numero.replace(/\D/g, '')
  return {
    href: `https://wa.me/${digits}?text=${encodeURIComponent(
      'Olá! Quero conhecer o BoxGestor e falar sobre minha oficina.'
    )}`,
    external: true,
  }
}
