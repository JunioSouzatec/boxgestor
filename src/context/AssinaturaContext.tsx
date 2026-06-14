import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/context/AuthContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
import {
  calcularUsoPlano,
  limiteAtingido,
  proximoDoLimite,
  temRecurso,
  planoPermiteModulo,
  type TipoLimite,
  type UsoPlano,
} from '@/services/assinatura/plano-features'
import type { ModuloCraft } from '@/services/auth/permissions'
import type { AssinaturaOffice, PlanoTier, RecursoPlano, LimitesPlano } from '@/types/plano'
import { getLimitesPlano, normalizarPlanoTier } from '@/types/plano'

interface AssinaturaContextValue {
  assinatura: AssinaturaOffice
  plano: PlanoTier
  uso: UsoPlano
  limites: LimitesPlano | null
  temRecurso: (recurso: RecursoPlano) => boolean
  planoPermiteModulo: (modulo: ModuloCraft) => boolean
  limiteAtingido: (tipo: TipoLimite) => boolean
  proximoDoLimite: (tipo: TipoLimite) => boolean
  fazerUpgrade: (plano: PlanoTier) => void
}

const AssinaturaContext = createContext<AssinaturaContextValue | null>(null)

export function AssinaturaProvider({ children }: { children: ReactNode }) {
  const { oficinaId } = useCraft()
  const { clientes, motos, ordens } = useOficinaData()
  const { carregarUsuarios } = useAuth()
  const [versao, setVersao] = useState(0)
  const [qtdUsuarios, setQtdUsuarios] = useState(1)

  useEffect(() => {
    void carregarUsuarios().then((lista) => setQtdUsuarios(lista.length))
  }, [carregarUsuarios, versao])

  const assinatura = useMemo(() => {
    void versao
    return assinaturaService.obterAssinatura(oficinaId)
  }, [oficinaId, versao])

  const plano = normalizarPlanoTier(assinatura.plano)

  const mesAtual = new Date().toISOString().slice(0, 7)
  const osMes = ordens.filter((o) => (o.criado_em ?? o.created_at ?? '').startsWith(mesAtual)).length

  const uso = useMemo(
    () =>
      calcularUsoPlano({
        clientes: clientes.length,
        motos: motos.length,
        osMes,
        usuarios: qtdUsuarios,
      }),
    [clientes.length, motos.length, osMes, qtdUsuarios]
  )

  const limites = getLimitesPlano(plano)

  const fazerUpgrade = useCallback(
    (novoPlano: PlanoTier) => {
      assinaturaService.simularUpgrade(oficinaId, normalizarPlanoTier(novoPlano))
      setVersao((v) => v + 1)
    },
    [oficinaId]
  )

  const value = useMemo(
    () => ({
      assinatura: { ...assinatura, plano },
      plano,
      uso,
      limites,
      temRecurso: (recurso: RecursoPlano) => temRecurso(plano, recurso),
      planoPermiteModulo: (modulo: ModuloCraft) => planoPermiteModulo(plano, modulo),
      limiteAtingido: (tipo: TipoLimite) => limiteAtingido(plano, tipo, uso),
      proximoDoLimite: (tipo: TipoLimite) => proximoDoLimite(plano, tipo, uso),
      fazerUpgrade,
    }),
    [assinatura, plano, uso, limites, fazerUpgrade]
  )

  return <AssinaturaContext.Provider value={value}>{children}</AssinaturaContext.Provider>
}

export function useAssinatura() {
  const ctx = useContext(AssinaturaContext)
  if (!ctx) throw new Error('useAssinatura deve ser usado dentro de AssinaturaProvider')
  return ctx
}
