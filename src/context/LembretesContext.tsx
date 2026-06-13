import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useCraft } from '@/context/CraftContext'
import { lembretesService } from '@/services/lembretes/lembretes.service'
import type { Moto, OrdemServico } from '@/types'
import type {
  AtualizarLembreteInput,
  HistoricoContatoLembrete,
  LembreteComStatus,
  LembretePersonalizadoInput,
  LembreteRegraOverride,
  RegraLembrete,
  RegraLembreteInput,
  ResumoLembretes,
} from '@/types/lembrete'

interface LembretesContextValue {
  regras: RegraLembrete[]
  lembretes: LembreteComStatus[]
  resumo: ResumoLembretes
  historico: HistoricoContatoLembrete[]
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
  marcarContatado: (
    lembreteId: string,
    contato: Omit<HistoricoContatoLembrete, 'data'>
  ) => void
  cancelarLembrete: (lembreteId: string) => void
  recarregar: () => void
}

const LembretesContext = createContext<LembretesContextValue | null>(null)

export function LembretesProvider({ children }: { children: ReactNode }) {
  const { oficinaId } = useCraft()
  const [versao, setVersao] = useState(0)

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

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

  const marcarContatado = useCallback(
    (lembreteId: string, contato: Omit<HistoricoContatoLembrete, 'data'>) => {
      lembretesService.marcarContatado(oficinaId, lembreteId, contato)
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const cancelarLembrete = useCallback(
    (lembreteId: string) => {
      lembretesService.cancelarLembrete(oficinaId, lembreteId)
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const value = useMemo(
    () => ({
      regras,
      lembretes,
      resumo,
      historico,
      salvarRegra,
      excluirRegra,
      criarLembretesDeRegras,
      criarLembretePersonalizado,
      atualizarLembrete,
      marcarContatado,
      cancelarLembrete,
      recarregar,
    }),
    [
      regras,
      lembretes,
      resumo,
      historico,
      salvarRegra,
      excluirRegra,
      criarLembretesDeRegras,
      criarLembretePersonalizado,
      atualizarLembrete,
      marcarContatado,
      cancelarLembrete,
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
