import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { LogoOficina } from '@/components/oficina/LogoOficina'
import {
  obterConfiguracaoPublica,
  obterLogoUrlOficina,
  obterNomeExibidoOficina,
} from '@/lib/oficina-marca'
import { aplicarTemaOficina } from '@/lib/oficina-tema'
import type { ConfiguracaoOficina } from '@/types/oficina'

interface MarcaOficinaAuthProps {
  className?: string
}

export function MarcaOficinaAuth({ className }: MarcaOficinaAuthProps) {
  const { session } = useAuth()
  const [config, setConfig] = useState<ConfiguracaoOficina | null>(() =>
    obterConfiguracaoPublica(session?.user.office_id)
  )

  useEffect(() => {
    const cfg = obterConfiguracaoPublica(session?.user.office_id)
    setConfig(cfg)
    if (cfg) aplicarTemaOficina(cfg)
  }, [session?.user.office_id])

  if (!config) {
    const nomeFallback = 'Oficina'
    return (
      <Link to="/login" className={className}>
        <div className="inline-flex flex-col items-center gap-2 text-center">
          <LogoOficina nome={nomeFallback} tamanho="lg" formato="circular" />
          <p className="text-xl font-bold tracking-tight">{nomeFallback}</p>
        </div>
      </Link>
    )
  }

  const logoUrl = obterLogoUrlOficina(config)
  const nome = obterNomeExibidoOficina(config)

  return (
    <Link to="/login" className={className}>
      <div className="inline-flex flex-col items-center gap-3 text-center">
        <LogoOficina logoUrl={logoUrl} nome={nome} tamanho="lg" formato="circular" />
        <p className="text-xl font-bold tracking-tight">{nome}</p>
      </div>
    </Link>
  )
}
