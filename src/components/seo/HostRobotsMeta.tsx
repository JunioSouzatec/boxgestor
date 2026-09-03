import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  clearBootSeoMeta,
  getSeoRobotsContent,
  isLandingPreviewPath,
  isMarketingHostname,
  OFFICIAL_COMMERCIAL_PATHS,
  normalizeAppPath,
} from '@/marketing/landing/lib/landing-host'

/** Rotas onde `LandingSeo` já aplica robots (evita meta duplicada conflitante). */
function isLandingSeoRoute(pathname: string): boolean {
  if (isLandingPreviewPath(pathname)) return true
  if (!isMarketingHostname()) return false
  return (OFFICIAL_COMMERCIAL_PATHS as readonly string[]).includes(normalizeAppPath(pathname))
}

/**
 * Diretiva robots nos hosts/rotas do sistema.
 * Em rotas da landing, `LandingSeo` é a fonte da verdade.
 */
export function HostRobotsMeta() {
  const location = useLocation()

  useEffect(() => {
    if (isLandingSeoRoute(location.pathname)) {
      document
        .querySelectorAll('meta[data-host-seo="true"]')
        .forEach((el) => el.remove())
      return
    }

    clearBootSeoMeta()

    const content = getSeoRobotsContent(location.pathname)
    const attrs: Array<{ name: string; content: string }> = [
      { name: 'robots', content },
      { name: 'googlebot', content },
    ]

    const criados: HTMLMetaElement[] = []
    for (const meta of attrs) {
      document
        .querySelectorAll(`meta[name="${meta.name}"][data-host-seo="true"]`)
        .forEach((el) => el.remove())

      const el = document.createElement('meta')
      el.setAttribute('name', meta.name)
      el.setAttribute('content', meta.content)
      el.setAttribute('data-host-seo', 'true')
      document.head.appendChild(el)
      criados.push(el)
    }

    return () => {
      for (const el of criados) el.remove()
    }
  }, [location.pathname])

  return null
}
