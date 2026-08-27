import { useEffect } from 'react'
import { LANDING_BRAND } from '@/marketing/landing/content/landing-content'

interface LandingSeoProps {
  title?: string
  description?: string
}

/** Preview: noindex/nofollow até autorização de lançamento. */
export function LandingSeo({
  title = LANDING_BRAND.title,
  description = LANDING_BRAND.description,
}: LandingSeoProps) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    const metas: Array<{ name?: string; property?: string; content: string }> = [
      { name: 'description', content: description },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'googlebot', content: 'noindex, nofollow' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'BoxGestor' },
    ]

    const criados: HTMLMetaElement[] = []
    for (const meta of metas) {
      const el = document.createElement('meta')
      if (meta.name) el.setAttribute('name', meta.name)
      if (meta.property) el.setAttribute('property', meta.property)
      el.setAttribute('content', meta.content)
      el.setAttribute('data-landing-seo', 'true')
      document.head.appendChild(el)
      criados.push(el)
    }

    return () => {
      document.title = previousTitle
      for (const el of criados) el.remove()
    }
  }, [title, description])

  return null
}
