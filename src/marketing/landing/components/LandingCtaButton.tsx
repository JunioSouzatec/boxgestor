import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface LandingCtaButtonProps {
  href?: string
  to?: string
  variant?: 'primary' | 'ghost'
  children: ReactNode
  className?: string
  external?: boolean
  onClick?: () => void
}

export function LandingCtaButton({
  href,
  to,
  variant = 'primary',
  children,
  className = '',
  external = false,
  onClick,
}: LandingCtaButtonProps) {
  const classes = `landing-btn ${
    variant === 'primary' ? 'landing-btn-primary' : 'landing-btn-ghost'
  } ${className}`

  if (to) {
    return (
      <Link to={to} className={classes} onClick={onClick}>
        {children}
      </Link>
    )
  }

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        onClick={onClick}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  }

  return (
    <button type="button" className={classes} onClick={onClick}>
      {children}
    </button>
  )
}
