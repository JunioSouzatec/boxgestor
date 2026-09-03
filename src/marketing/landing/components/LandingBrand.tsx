import { Link } from 'react-router-dom'
import {
  LANDING_BASE,
  LANDING_BRAND,
  LANDING_LOGO_SRC,
} from '@/marketing/landing/content/landing-content'

interface LandingBrandProps {
  compact?: boolean
  className?: string
}

/**
 * Logo oficial do BoxGestor (arquivo em public/landing).
 * Sem redesenho — apenas exibição do asset fornecido.
 */
export function LandingBrand({ compact = false, className = '' }: LandingBrandProps) {
  return (
    <Link
      to={LANDING_BASE}
      className={`inline-flex items-center ${className}`}
      aria-label={`${LANDING_BRAND.name} — início`}
    >
      {LANDING_LOGO_SRC ? (
        <img
          src={LANDING_LOGO_SRC}
          alt={`Logo oficial ${LANDING_BRAND.name}`}
          className={
            compact
              ? 'h-10 w-auto max-w-[200px] object-contain object-left sm:h-11'
              : 'h-12 w-auto max-w-[240px] object-contain object-left sm:h-14'
          }
          loading="eager"
          decoding="async"
        />
      ) : (
        <span className="flex flex-col leading-none">
          <span
            className={`landing-display tracking-[0.08em] text-white ${
              compact ? 'text-base' : 'text-lg sm:text-xl'
            }`}
          >
            {LANDING_BRAND.name}
          </span>
          {!compact ? (
            <span className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-[var(--lg-muted)]">
              {LANDING_BRAND.slogan}
            </span>
          ) : null}
        </span>
      )}
    </Link>
  )
}
