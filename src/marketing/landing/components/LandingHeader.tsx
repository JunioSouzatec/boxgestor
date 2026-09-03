import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, User, X } from 'lucide-react'
import { LandingBrand } from '@/marketing/landing/components/LandingBrand'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import { getNavItems } from '@/marketing/landing/content/landing-content'
import { linkEntrarSistema, linkTestarBoxGestor } from '@/marketing/landing/lib/landing-links'

export function LandingHeader() {
  const [aberto, setAberto] = useState(false)
  const navItems = getNavItems()
  const entrar = linkEntrarSistema()
  const testar = linkTestarBoxGestor()

  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto])

  useEffect(() => {
    document.body.style.overflow = aberto ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [aberto])

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#050505]/90 backdrop-blur-md">
      <div className="landing-container flex h-[4.25rem] items-center justify-between gap-4">
        <LandingBrand compact />

        <nav className="hidden items-center gap-7 xl:flex" aria-label="Principal">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative text-sm transition-colors ${
                  isActive
                    ? 'font-semibold text-[var(--lg-orange)]'
                    : 'text-white/80 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  {isActive ? (
                    <span className="absolute -bottom-2 left-0 right-0 h-0.5 rounded bg-[var(--lg-orange)]" />
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 xl:flex">
          <LandingCtaButton {...entrar} variant="ghost" className="gap-2">
            <User size={16} aria-hidden />
            Entrar
          </LandingCtaButton>
          <LandingCtaButton {...testar} variant="primary">
            Testar por 15 dias
          </LandingCtaButton>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--lg-radius-btn)] border border-white/15 text-white xl:hidden"
          aria-expanded={aberto}
          aria-controls="landing-mobile-menu"
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
        </button>
      </div>

      {aberto ? (
        <div id="landing-mobile-menu" className="border-t border-white/5 bg-[#0a0a0c] xl:hidden">
          <nav className="landing-container flex flex-col gap-1 py-4" aria-label="Mobile">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-lg px-3 py-3 text-base text-white hover:bg-white/5"
                onClick={() => setAberto(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 px-1 pb-2">
              <LandingCtaButton {...entrar} variant="ghost" onClick={() => setAberto(false)}>
                Entrar
              </LandingCtaButton>
              <LandingCtaButton {...testar} variant="primary" onClick={() => setAberto(false)}>
                Testar por 15 dias
              </LandingCtaButton>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
