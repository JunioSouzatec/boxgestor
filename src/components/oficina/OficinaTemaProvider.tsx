import { useEffect } from 'react'
import { useOficinaData } from '@/context/CraftContext'
import { aplicarTemaOficina } from '@/lib/oficina-tema'

/** Aplica cores e tema claro/escuro conforme configuração da oficina */
export function OficinaTemaProvider({ children }: { children: React.ReactNode }) {
  const { configuracao } = useOficinaData()

  useEffect(() => {
    aplicarTemaOficina(configuracao)
  }, [configuracao])

  return <>{children}</>
}
