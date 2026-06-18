import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useCraft } from '@/context/CraftContext'
import { lembretesService } from '@/services/lembretes/lembretes.service'
import { inicializarLembretesSupabase } from '@/services/lembretes/lembretes-sync.service'
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
}

const LembretesContext = createContext<LembretesContextValue | null>(null)

export function LembretesProvider({ children }: { children: ReactNode }) {
  const { oficinaId } = useCraft()
  const [versao, setVersao] = useState(0)

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  useEffect(() => {
    let ativo = true
    void inicializarLembretesSupabase(oficinaId).then(() => {
      if (ativo) recarregar()
    })
    return () => {
      ativo = false
    }
  }, [oficinaId, recarregar])

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
      recarregar()
      return regra
    },
    [oficinaId, recarregar]
  )

  const excluirRegra = useCallback(
    (id: string) => {
      lembretesService.excluirRegra(oficinaId, id)
      recarregar()
    },
    [oficinaId, recarregar]
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
        overrides
      )
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const criarLembretePersonalizado = useCallback(
    (os: OrdemServico, moto: Moto, input: LembretePersonalizadoInput) => {
      lembretesService.criarLembretePersonalizado(oficinaId, os, moto, input)
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const atualizarLembrete = useCallback(
    (lembreteId: string, input: AtualizarLembreteInput) => {
      lembretesService.atualizarLembrete(oficinaId, lembreteId, input)
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const registrarContato = useCallback(
    (lembreteId: string, input: RegistrarContatoLembreteInput) => {
      lembretesService.registrarContato(oficinaId, lembreteId, input)
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const marcarContatado = useCallback(
    (
      lembreteId: string,
      contato: Omit<HistoricoContatoLembrete, 'data'>,
      responsavel?: string
    ) => {
      lembretesService.marcarContatado(oficinaId, lembreteId, contato, responsavel)
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const cancelarLembrete = useCallback(
    (lembreteId: string, responsavel?: string) => {
      lembretesService.cancelarLembrete(oficinaId, lembreteId, responsavel)
      recarregar()
    },
    [oficinaId, recarregar]
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

  const value = useMemo(
    () => ({
      regras,
      lembretes,
      resumo,
      historico,
      historicoComunicacao,
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
    }),
    [
      regras,
      lembretes,
      resumo,
      historico,
      historicoComunicacao,
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
    ]
  )

  return <LembretesContext.Provider value={value}>{children}</LembretesContext.Provider>
}

export function useLembretes() {
  const ctx = useContext(LembretesContext)
  if (!ctx) throw new Error('useLembretes deve ser usado dentro de LembretesProvider')
  return ctx
}
