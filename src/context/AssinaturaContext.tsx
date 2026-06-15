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
import { sincronizarAssinaturaDoSupabase } from '@/services/assinatura/assinatura-supabase.service'
import { isModoAuthSupabaseAtivo } from '@/lib/craft-auth'
import {
  calcularUsoPlano,
  limiteAtingidoComAssinatura,
  podeEscreverNoPlano,
  proximoDoLimiteComAssinatura,
  temRecursoComAssinatura,
  planoPermiteModuloComAssinatura,
  type TipoLimite,
  type UsoPlano,
} from '@/services/assinatura/plano-features'
import type { ModuloCraft } from '@/services/auth/permissions'
import type { AssinaturaOffice, PlanoTier, RecursoPlano, LimitesPlano } from '@/types/plano'
import {
  diasRestantesTrial,
  getLimitesPlano,
  normalizarPlanoTier,
  testePremiumAtivo,
  testePremiumExpirado,
  trialExpirado,
} from '@/types/plano'

interface AssinaturaContextValue {
  assinatura: AssinaturaOffice
  plano: PlanoTier
  uso: UsoPlano
  limites: LimitesPlano | null
  testeAtivo: boolean
  testeExpirado: boolean
  diasRestantesTeste: number | null
  podeEscrever: boolean
  temRecurso: (recurso: RecursoPlano) => boolean
  planoPermiteModulo: (modulo: ModuloCraft) => boolean
  limiteAtingido: (tipo: TipoLimite) => boolean
  proximoDoLimite: (tipo: TipoLimite) => boolean
  fazerUpgrade: (plano: PlanoTier) => void
}

const AssinaturaContext = createContext<AssinaturaContextValue | null>(null)

export function AssinaturaProvider({ children }: { children: ReactNode }) {
  const { oficinaId } = useCraft()
  const { session } = useAuth()
  const { clientes, motos, ordens } = useOficinaData()
  const { carregarUsuarios, carregarConvitesPendentes } = useAuth()
  const [versao, setVersao] = useState(0)
  const [qtdUsuarios, setQtdUsuarios] = useState(1)

  useEffect(() => {
    const atualizar = () => setVersao((v) => v + 1)
    window.addEventListener('craft-assinatura-updated', atualizar)
    return () => window.removeEventListener('craft-assinatura-updated', atualizar)
  }, [])

  useEffect(() => {
    if (!isModoAuthSupabaseAtivo()) return
    const officeUuid = session?.user?.office_id ?? oficinaId
    if (!officeUuid) return

    void sincronizarAssinaturaDoSupabase(officeUuid).then((synced) => {
      if (synced) setVersao((v) => v + 1)
    })
  }, [session?.user?.office_id, oficinaId])

  useEffect(() => {
    void Promise.all([carregarUsuarios(), carregarConvitesPendentes()]).then(
      ([lista, pendentes]) => {
        setQtdUsuarios(lista.length + pendentes.length)
      }
    )
  }, [carregarUsuarios, carregarConvitesPendentes, versao, oficinaId])

  const assinatura = useMemo(() => {
    void versao
    return assinaturaService.obterAssinatura(oficinaId)
  }, [oficinaId, versao])

  const plano = normalizarPlanoTier(assinatura.plano)
  const assinaturaComPlano = useMemo(
    () => ({ ...assinatura, plano }),
    [assinatura, plano]
  )

  const mesAtual = new Date().toISOString().slice(0, 7)
  const osMes = ordens.filter((o) => (o.criado_em ?? o.created_at ?? '').startsWith(mesAtual)).length

  const uso = useMemo(
    () =>
      calcularUsoPlano({
        clientes: clientes.length,
        motos: motos.length,
        osMes,
        osTotal: ordens.length,
        usuarios: qtdUsuarios,
      }),
    [clientes.length, motos.length, osMes, ordens.length, qtdUsuarios]
  )

  const limites = getLimitesPlano(plano)
  const testeAtivo = testePremiumAtivo(assinaturaComPlano)
  const testeExpirado = testePremiumExpirado(assinaturaComPlano)
  const diasRestantesTeste = diasRestantesTrial(assinaturaComPlano)
  const podeEscrever = podeEscreverNoPlano(assinaturaComPlano)

  const fazerUpgrade = useCallback(
    (novoPlano: PlanoTier) => {
      assinaturaService.simularUpgrade(oficinaId, normalizarPlanoTier(novoPlano))
      setVersao((v) => v + 1)
    },
    [oficinaId]
  )

  const value = useMemo(
    () => ({
      assinatura: assinaturaComPlano,
      plano,
      uso,
      limites,
      testeAtivo,
      testeExpirado,
      diasRestantesTeste,
      podeEscrever,
      temRecurso: (recurso: RecursoPlano) => temRecursoComAssinatura(assinaturaComPlano, recurso),
      planoPermiteModulo: (modulo: ModuloCraft) =>
        planoPermiteModuloComAssinatura(assinaturaComPlano, modulo),
      limiteAtingido: (tipo: TipoLimite) =>
        limiteAtingidoComAssinatura(assinaturaComPlano, tipo, uso),
      proximoDoLimite: (tipo: TipoLimite) =>
        proximoDoLimiteComAssinatura(assinaturaComPlano, tipo, uso),
      fazerUpgrade,
    }),
    [
      assinaturaComPlano,
      plano,
      uso,
      limites,
      testeAtivo,
      testeExpirado,
      diasRestantesTeste,
      podeEscrever,
      fazerUpgrade,
    ]
  )

  return <AssinaturaContext.Provider value={value}>{children}</AssinaturaContext.Provider>
}

export function useAssinatura() {
  const ctx = useContext(AssinaturaContext)
  if (!ctx) throw new Error('useAssinatura deve ser usado dentro de AssinaturaProvider')
  return ctx
}

/** Compatibilidade com checks legados. */
export { trialExpirado }
