import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useAuth } from '@/context/AuthContext'
import { lembretesService } from '@/services/lembretes/lembretes.service'
import {
  contarLembretesLocaisPendentes,
  inicializarLembretesSupabase,
  lembretesModoSupabase,
  LEMBRETES_EVENTO_ATUALIZADO,
  obterEstadoSyncLembretes,
  refreshRemotoParaCache,
  sincronizarLembretesCompleto,
  type EstadoSyncLembretesOffice,
} from '@/services/lembretes/lembretes-sync.service'
import { obterResponsavelLogado } from '@/services/lembretes/lembretes-responsavel'
import type { Moto, OrdemServico } from '@/types'
import type {
  AtualizarLembreteInput,
  HistoricoComunicacaoItem,
  HistoricoContatoLembrete,
  LembreteComStatus,
  LembretePersonalizadoInput,
  LembreteRegraOverride,
  RegistrarContatoLembreteInput,
  RegraLembrete,
  RegraLembreteInput,
  ResumoLembretes,
} from '@/types/lembrete'

interface LembretesContextValue {
  regras: RegraLembrete[]
  lembretes: LembreteComStatus[]
  resumo: ResumoLembretes
  historico: HistoricoContatoLembrete[]
  historicoComunicacao: HistoricoComunicacaoItem[]
  syncInfo: EstadoSyncLembretesOffice & { sincronizando: boolean; pendentes: number }
  salvarRegra: (input: RegraLembreteInput, id?: string) => RegraLembrete
  excluirRegra: (id: string) => void
  criarLembretesDeRegras: (
    os: OrdemServico,
    moto: Moto,
    clienteNome: string,
    regras: RegraLembrete[],
    nomeOficina: string,
    overrides?: LembreteRegraOverride[]
  ) => void
  criarLembretePersonalizado: (
    os: OrdemServico,
    moto: Moto,
    input: LembretePersonalizadoInput
  ) => void
  atualizarLembrete: (lembreteId: string, input: AtualizarLembreteInput) => void
  registrarContato: (lembreteId: string, input: RegistrarContatoLembreteInput) => void
  marcarContatado: (
    lembreteId: string,
    contato: Omit<HistoricoContatoLembrete, 'data'>,
    responsavel?: string
  ) => void
  cancelarLembrete: (lembreteId: string, responsavel?: string) => void
  listarPorCliente: (clienteId: string) => LembreteComStatus[]
  listarPorMoto: (motoId: string) => LembreteComStatus[]
  listarPorOS: (ordemServicoId: string) => LembreteComStatus[]
  listarHistoricoPorCliente: (clienteId: string) => HistoricoComunicacaoItem[]
  listarHistoricoPorMoto: (motoId: string) => HistoricoComunicacaoItem[]
  listarHistoricoPorOS: (ordemServicoId: string) => HistoricoComunicacaoItem[]
  recarregar: () => void
  sincronizarAgora: () => Promise<void>
}

const LembretesContext = createContext<LembretesContextValue | null>(null)

export function LembretesProvider({ children }: { children: ReactNode }) {
  const { oficinaId } = useCraft()
  const { configuracao } = useOficinaData()
  const { session, loading } = useAuth()
  const [versao, setVersao] = useState(0)
  const [sincronizando, setSincronizando] = useState(false)
  const [syncInfo, setSyncInfo] = useState(() => ({
    ...obterEstadoSyncLembretes(oficinaId),
    sincronizando: false,
    pendentes: contarLembretesLocaisPendentes(oficinaId),
  }))

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  const responsavelAtual = useMemo(
    () =>
      obterResponsavelLogado({
        id: session?.user?.id,
        nome: session?.user?.nome,
        email: session?.user?.email,
      }),
    [session?.user?.id, session?.user?.nome, session?.user?.email]
  )

  const atualizarSyncInfo = useCallback(
    (officeId: string) => {
      setSyncInfo({
        ...obterEstadoSyncLembretes(officeId),
        sincronizando: false,
        pendentes: contarLembretesLocaisPendentes(officeId),
      })
    },
    []
  )

  const executarSync = useCallback(
    async (officeId: string) => {
      if (!lembretesModoSupabase()) {
        atualizarSyncInfo(officeId)
        return
      }
      setSincronizando(true)
      setSyncInfo((prev) => ({ ...prev, sincronizando: true }))
      try {
        await sincronizarLembretesCompleto(officeId)
        recarregar()
      } finally {
        atualizarSyncInfo(officeId)
        setSincronizando(false)
      }
    },
    [atualizarSyncInfo, recarregar]
  )

  const sincronizarAgora = useCallback(async () => {
    await executarSync(oficinaId)
  }, [executarSync, oficinaId])

  useEffect(() => {
    if (loading) return
    if (!session?.user?.id) return
    if (!oficinaId) return

    let ativo = true
    void inicializarLembretesSupabase(oficinaId).then(() => {
      if (ativo) {
        recarregar()
        atualizarSyncInfo(oficinaId)
      }
    })
    return () => {
      ativo = false
    }
  }, [oficinaId, recarregar, atualizarSyncInfo, loading, session?.user?.id])

  useEffect(() => {
    if (!lembretesModoSupabase()) return
    if (loading || !session?.user?.id) return

    const refresh = () => {
      void refreshRemotoParaCache(oficinaId).then((ok) => {
        if (ok) {
          recarregar()
          atualizarSyncInfo(oficinaId)
        }
      })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    const onEvento = () => {
      recarregar()
      atualizarSyncInfo(oficinaId)
    }

    // Sem listener de focus — em DevTools mobile dispara em loop
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(LEMBRETES_EVENTO_ATUALIZADO, onEvento)

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh()
    }, 60_000)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(LEMBRETES_EVENTO_ATUALIZADO, onEvento)
      window.clearInterval(timer)
    }
  }, [oficinaId, recarregar, atualizarSyncInfo, loading, session?.user?.id])

  const posAlteracao = useCallback(async () => {
    recarregar()
    await executarSync(oficinaId)
  }, [executarSync, oficinaId, recarregar])

  const regras = useMemo(() => {
    void versao
    return lembretesService.listarRegras(oficinaId)
  }, [oficinaId, versao])

  const lembretes = useMemo(() => {
    void versao
    return lembretesService.listarLembretes(oficinaId)
  }, [oficinaId, versao])

  const resumo = useMemo(() => {
    void versao
    return lembretesService.calcularResumo(oficinaId)
  }, [oficinaId, versao])

  const historicoComunicacao = useMemo(() => {
    void versao
    return lembretesService.listarHistoricoComunicacao(oficinaId)
  }, [oficinaId, versao])

  const historico = useMemo(() => {
    void versao
    return lembretesService.listarHistorico(oficinaId)
  }, [oficinaId, versao])

  const salvarRegra = useCallback(
    (input: RegraLembreteInput, id?: string) => {
      const regra = lembretesService.salvarRegra(oficinaId, input, id)
      void posAlteracao()
      return regra
    },
    [oficinaId, posAlteracao]
  )

  const excluirRegra = useCallback(
    (id: string) => {
      lembretesService.excluirRegra(oficinaId, id)
      void posAlteracao()
    },
    [oficinaId, posAlteracao]
  )

  const criarLembretesDeRegras = useCallback(
    (
      os: OrdemServico,
      moto: Moto,
      clienteNome: string,
      regrasSel: RegraLembrete[],
      nomeOficina: string,
      overrides?: LembreteRegraOverride[]
    ) => {
      lembretesService.criarLembretesDeRegras(
        oficinaId,
        os,
        moto,
        clienteNome,
        regrasSel,
        nomeOficina,
        overrides,
        responsavelAtual,
        configuracao.tipo_oficina
      )
      void posAlteracao()
    },
    [oficinaId, posAlteracao, responsavelAtual, configuracao.tipo_oficina]
  )

  const criarLembretePersonalizado = useCallback(
    (os: OrdemServico, moto: Moto, input: LembretePersonalizadoInput) => {
      lembretesService.criarLembretePersonalizado(oficinaId, os, moto, input, responsavelAtual)
      void posAlteracao()
    },
    [oficinaId, posAlteracao, responsavelAtual]
  )

  const atualizarLembrete = useCallback(
    (lembreteId: string, input: AtualizarLembreteInput) => {
      lembretesService.atualizarLembrete(oficinaId, lembreteId, {
        ...input,
        responsavel: input.responsavel ?? responsavelAtual.nome,
      })
      void posAlteracao()
    },
    [oficinaId, posAlteracao, responsavelAtual.nome]
  )

  const registrarContato = useCallback(
    (lembreteId: string, input: RegistrarContatoLembreteInput) => {
      lembretesService.registrarContato(oficinaId, lembreteId, {
        ...input,
        responsavel: input.responsavel || responsavelAtual.nome,
      })
      void posAlteracao()
    },
    [oficinaId, posAlteracao, responsavelAtual.nome]
  )

  const marcarContatado = useCallback(
    (
      lembreteId: string,
      contato: Omit<HistoricoContatoLembrete, 'data'>,
      responsavel?: string
    ) => {
      lembretesService.marcarContatado(
        oficinaId,
        lembreteId,
        contato,
        responsavel ?? responsavelAtual.nome
      )
      void posAlteracao()
    },
    [oficinaId, posAlteracao, responsavelAtual.nome]
  )

  const cancelarLembrete = useCallback(
    (lembreteId: string, responsavel?: string) => {
      lembretesService.cancelarLembrete(oficinaId, lembreteId, responsavel ?? responsavelAtual.nome)
      void posAlteracao()
    },
    [oficinaId, posAlteracao, responsavelAtual.nome]
  )

  const listarPorCliente = useCallback(
    (clienteId: string) => lembretesService.listarPorCliente(oficinaId, clienteId),
    [oficinaId]
  )

  const listarPorMoto = useCallback(
    (motoId: string) => lembretesService.listarPorMoto(oficinaId, motoId),
    [oficinaId]
  )

  const listarPorOS = useCallback(
    (ordemServicoId: string) => lembretesService.listarPorOS(oficinaId, ordemServicoId),
    [oficinaId]
  )

  const listarHistoricoPorCliente = useCallback(
    (clienteId: string) => lembretesService.listarHistoricoPorCliente(oficinaId, clienteId),
    [oficinaId]
  )

  const listarHistoricoPorMoto = useCallback(
    (motoId: string) => lembretesService.listarHistoricoPorMoto(oficinaId, motoId),
    [oficinaId]
  )

  const listarHistoricoPorOS = useCallback(
    (ordemServicoId: string) => lembretesService.listarHistoricoPorOS(oficinaId, ordemServicoId),
    [oficinaId]
  )

  const syncInfoCompleto = useMemo(
    () => ({ ...syncInfo, sincronizando }),
    [syncInfo, sincronizando]
  )

  const value = useMemo(
    () => ({
      regras,
      lembretes,
      resumo,
      historico,
      historicoComunicacao,
      syncInfo: syncInfoCompleto,
      salvarRegra,
      excluirRegra,
      criarLembretesDeRegras,
      criarLembretePersonalizado,
      atualizarLembrete,
      registrarContato,
      marcarContatado,
      cancelarLembrete,
      listarPorCliente,
      listarPorMoto,
      listarPorOS,
      listarHistoricoPorCliente,
      listarHistoricoPorMoto,
      listarHistoricoPorOS,
      recarregar,
      sincronizarAgora,
    }),
    [
      regras,
      lembretes,
      resumo,
      historico,
      historicoComunicacao,
      syncInfoCompleto,
      salvarRegra,
      excluirRegra,
      criarLembretesDeRegras,
      criarLembretePersonalizado,
      atualizarLembrete,
      registrarContato,
      marcarContatado,
      cancelarLembrete,
      listarPorCliente,
      listarPorMoto,
      listarPorOS,
      listarHistoricoPorCliente,
      listarHistoricoPorMoto,
      listarHistoricoPorOS,
      recarregar,
      sincronizarAgora,
    ]
  )

  return <LembretesContext.Provider value={value}>{children}</LembretesContext.Provider>
}

export function useLembretes() {
  const ctx = useContext(LembretesContext)
  if (!ctx) throw new Error('useLembretes deve ser usado dentro de LembretesProvider')
  return ctx
}
