import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { LANDING_BRAND } from '@/marketing/landing/content/landing-content'
import {
  clearBootSeoMeta,
  getOfficialCanonicalUrl,
  getSeoRobotsContent,
  SEO_SHARE_IMAGE_URL,
} from '@/marketing/landing/lib/landing-host'

interface LandingSeoProps {
  title?: string
  description?: string
}

/**
 * SEO da landing.
 * - Apex `useboxgestor.com.br` + rotas comerciais → index, follow + canonical oficial
 * - Demais hosts / `/landing-preview` → noindex, nofollow (não indexar preview)
 */
export function LandingSeo({
  title = LANDING_BRAND.title,
  description = LANDING_BRAND.description,
}: LandingSeoProps) {
  const location = useLocation()

  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    clearBootSeoMeta()

    const robots = getSeoRobotsContent(location.pathname)
    const canonicalHref = getOfficialCanonicalUrl(location.pathname)

    const metas: Array<{ name?: string; property?: string; content: string }> = [
      { name: 'description', content: description },
      { name: 'robots', content: robots },
      { name: 'googlebot', content: robots },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'BoxGestor' },
      { property: 'og:locale', content: 'pt_BR' },
      { property: 'og:image', content: SEO_SHARE_IMAGE_URL },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: SEO_SHARE_IMAGE_URL },
    ]

    if (canonicalHref) {
      metas.push({ property: 'og:url', content: canonicalHref })
    }

    const criados: HTMLElement[] = []

    for (const meta of metas) {
      const el = document.createElement('meta')
      if (meta.name) el.setAttribute('name', meta.name)
      if (meta.property) el.setAttribute('property', meta.property)
      el.setAttribute('content', meta.content)
      el.setAttribute('data-landing-seo', 'true')
      document.head.appendChild(el)
      criados.push(el)
    }

    if (canonicalHref) {
      const link = document.createElement('link')
      link.setAttribute('rel', 'canonical')
      link.setAttribute('href', canonicalHref)
      link.setAttribute('data-landing-seo', 'true')
      document.head.appendChild(link)
      criados.push(link)
    }

    return () => {
      document.title = previousTitle
      for (const el of criados) el.remove()
    }
  }, [title, description, location.pathname])

  return null
}
