import { useMemo } from 'react'
import { useOficinaData } from '@/context/CraftContext'
import { obterTermosOficina, type TermosOficina } from '@/lib/termos-oficina'

export function useTermosOficina(): TermosOficina {
  const { configuracao } = useOficinaData()
  return useMemo(
    () => obterTermosOficina(configuracao.tipo_oficina),
    [configuracao.tipo_oficina]
  )
}
