import { Link } from 'react-router-dom'
import { LogoOficina } from '@/components/oficina/LogoOficina'
import {
  obterLogoUrlOficina,
  obterNomeExibidoOficina,
} from '@/lib/oficina-marca'
import type { ConfiguracaoOficina } from '@/types/oficina'
import { cn } from '@/lib/utils'

interface MarcaOficinaHeaderProps {
  config: ConfiguracaoOficina
  colapsado?: boolean
  linkTo?: string
  className?: string
  tamanhoLogo?: 'xs' | 'sm' | 'md'
}

export function MarcaOficinaHeader({
  config,
  colapsado = false,
  linkTo,
  className,
  tamanhoLogo = 'sm',
}: MarcaOficinaHeaderProps) {
  const logoUrl = obterLogoUrlOficina(config)
  const nome = obterNomeExibidoOficina(config)

  const conteudo = (
    <>
      <LogoOficina
        logoUrl={logoUrl}
        nome={nome}
        tamanho={tamanhoLogo}
        formato="circular"
      />
      {!colapsado && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold tracking-wide">{nome}</p>
        </div>
      )}
    </>
  )

  const classes = cn('flex items-center gap-3', className)

  if (linkTo) {
    return (
      <Link to={linkTo} className={cn(classes, 'hover:opacity-90 transition-opacity')}>
        {conteudo}
      </Link>
    )
  }

  return <div className={classes}>{conteudo}</div>
}
