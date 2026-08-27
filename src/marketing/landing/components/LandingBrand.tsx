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
 * Usa SOMENTE o asset oficial apontado em LANDING_LOGO_SRC.
 * Se null, mostra apenas o wordmark — sem inventar símbolo/B/seta.
 */
export function LandingBrand({ compact = false, className = '' }: LandingBrandProps) {
  return (
    <Link
      to={LANDING_BASE}
      className={`inline-flex items-center gap-3 ${className}`}
      aria-label={`${LANDING_BRAND.name} — início`}
    >
      {LANDING_LOGO_SRC ? (
        <img
          src={LANDING_LOGO_SRC}
          alt={`Logo oficial ${LANDING_BRAND.name}`}
          className={compact ? 'h-9 w-auto' : 'h-11 w-auto'}
          loading="eager"
          decoding="async"
        />
      ) : null}
      <span className="flex flex-col leading-none">
        <span
          className={`landing-display tracking-[0.08em] text-white ${
            compact ? 'text-base' : 'text-lg sm:text-xl'
          }`}
        >
          {LANDING_BRAND.name}
        </span>
        {!compact ? (
          <span className="mt-1 text-[0.7rem] text-[var(--lg-muted)]">{LANDING_BRAND.slogan}</span>
        ) : null}
      </span>
    </Link>
  )
}
