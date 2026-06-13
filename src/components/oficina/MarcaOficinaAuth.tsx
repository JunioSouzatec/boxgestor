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
    return (
      <Link to="/login" className={className}>
        <div className="inline-flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20">
            C
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight">Craft</p>
            <p className="text-xs text-muted-foreground">Gestão de Oficina</p>
          </div>
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
        <div>
          <p className="text-xl font-bold tracking-tight">{nome}</p>
          <p className="text-xs text-muted-foreground">Gestão de Oficina</p>
        </div>
      </div>
    </Link>
  )
}
