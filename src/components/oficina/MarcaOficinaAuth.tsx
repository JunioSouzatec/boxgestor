import { Link } from 'react-router-dom'
import { LogoOficina } from '@/components/oficina/LogoOficina'
import { APP_NAME, APP_TAGLINE } from '@/lib/app-brand'

interface MarcaOficinaAuthProps {
  className?: string
}

/** Marca do produto (BoxGestor) nas telas públicas de login/cadastro — não confundir com a oficina cliente. */
export function MarcaOficinaAuth({ className }: MarcaOficinaAuthProps) {
  return (
    <Link to="/login" className={className}>
      <div className="inline-flex flex-col items-center gap-2 text-center">
        <LogoOficina nome={APP_NAME} tamanho="lg" formato="circular" />
        <p className="text-xl font-bold tracking-tight">{APP_NAME}</p>
        <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
      </div>
    </Link>
  )
}
