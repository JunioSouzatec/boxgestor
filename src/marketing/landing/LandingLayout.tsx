import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { LandingFooter } from '@/marketing/landing/components/LandingFooter'
import { LandingHeader } from '@/marketing/landing/components/LandingHeader'
import '@/marketing/landing/styles/landing.css'

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Syne:wght@600;700;800&display=swap'

export default function LandingLayout() {
  useEffect(() => {
    const preconnect1 = document.createElement('link')
    preconnect1.rel = 'preconnect'
    preconnect1.href = 'https://fonts.googleapis.com'
    preconnect1.setAttribute('data-landing-font', 'true')

    const preconnect2 = document.createElement('link')
    preconnect2.rel = 'preconnect'
    preconnect2.href = 'https://fonts.gstatic.com'
    preconnect2.crossOrigin = 'anonymous'
    preconnect2.setAttribute('data-landing-font', 'true')

    const fontLink = document.createElement('link')
    fontLink.rel = 'stylesheet'
    fontLink.href = FONT_HREF
    fontLink.setAttribute('data-landing-font', 'true')

    document.head.append(preconnect1, preconnect2, fontLink)
    return () => {
      document.querySelectorAll('[data-landing-font="true"]').forEach((el) => el.remove())
    }
  }, [])

  return (
    <div className="landing-root">
      <LandingHeader />
      <main id="conteudo-principal">
        <Outlet />
      </main>
      <LandingFooter />
    </div>
  )
}
