import { Link } from 'react-router-dom'
import { LandingBrand } from '@/marketing/landing/components/LandingBrand'
import {
  LANDING_LINKS,
  NAV_ITEMS,
} from '@/marketing/landing/content/landing-content'

function SocialPlaceholder({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-dashed border-white/15 px-3 py-1 text-xs text-[var(--lg-muted)]"
      title={`${label} — URL oficial ainda não configurada`}
    >
      {label}
    </span>
  )
}

export function LandingFooter() {
  return (
    <footer className="border-t border-white/5 bg-black/40">
      <div className="landing-container grid gap-10 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="space-y-4">
          <LandingBrand />
          <p className="max-w-sm text-sm text-[var(--lg-muted)]">
            Sistema de gestão para oficinas. Organize operação, atendimento e financeiro em um só
            lugar.
          </p>
          <div className="flex flex-wrap gap-2" aria-label="Redes sociais">
            {LANDING_LINKS.instagram ? (
              <a href={LANDING_LINKS.instagram} target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
            ) : (
              <SocialPlaceholder label="Instagram" />
            )}
            {LANDING_LINKS.facebook ? (
              <a href={LANDING_LINKS.facebook} target="_blank" rel="noopener noreferrer">
                Facebook
              </a>
            ) : (
              <SocialPlaceholder label="Facebook" />
            )}
            {LANDING_LINKS.whatsappNumero ? (
              <a
                href={`https://wa.me/${LANDING_LINKS.whatsappNumero.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            ) : (
              <SocialPlaceholder label="WhatsApp" />
            )}
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-white">Site</p>
          <ul className="space-y-2 text-sm text-[var(--lg-muted)]">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to={LANDING_LINKS.entrar} className="hover:text-white">
                Entrar
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-white">Contato</p>
          <p className="text-sm text-[var(--lg-muted)]">
            E-mail:{' '}
            <a className="text-white hover:text-[var(--lg-orange)]" href={`mailto:${LANDING_LINKS.suporteEmail}`}>
              {LANDING_LINKS.suporteEmail}
            </a>
          </p>
          <p className="mt-4 text-xs text-[var(--lg-muted)]">
            Preview interno — página ainda não publicada como home oficial.
          </p>
        </div>
      </div>
      <div className="border-t border-white/5 py-4 text-center text-xs text-[var(--lg-muted)]">
        © {new Date().getFullYear()} BoxGestor. Todos os direitos reservados.
      </div>
    </footer>
  )
}
