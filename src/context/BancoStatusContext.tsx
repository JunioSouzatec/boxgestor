import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { MSG, logDetalheTecnicoDev, mensagemAvisoPersistencia } from '@/lib/mensagens-usuario'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  contarPagamentosPendentesTotais,
  inscreverEventosPersistencia,
  reconciliarFilaSyncComPendenciasAtivas,
  type PersistenceStatusEvent,
} from '@/services/persistence-status.events'
import {
  obterModoPersistenciaLabel,
  testarConexaoSupabase,
  type ResultadoTesteSupabase,
} from '@/services/supabase-connection.service'
import { isModoSupabaseExperimentalAtivo } from '@/services/repository/repository.factory'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import { OFFICE_ID } from '@/types/base'

export type StatusBancoExibicao =
  | 'local'
  | 'supabase'
  | 'supabase_fallback'
  | 'offline_sync'

interface BancoStatusContextValue {
  status: StatusBancoExibicao
  statusLabel: string
  modoPersistencia: 'local' | 'supabase'
  modoPersistenciaLabel: string
  supabaseConfigurado: boolean
  modoSupabaseExperimental: boolean
  emFallbackLocal: boolean
  pagamentosPendentes: number
  pagamentosPendentesVinculoOs: boolean
  /** Pendências ativas reais (badge do topo) */
  pendenciasAtivas: number
  ultimoAviso: string | null
  /** Itens na fila bruta localStorage (somente diagnóstico) */
  filaSyncBruta: number
  testando: boolean
  ultimoTeste: ResultadoTesteSupabase | null
  testadoEm: string | null
  testarConexao: () => Promise<ResultadoTesteSupabase>
  limparAviso: () => void
}

const BancoStatusContext = createContext<BancoStatusContextValue | null>(null)

const LABELS: Record<StatusBancoExibicao, string> = {
  local: 'Banco: Local',
  supabase: 'Banco: Supabase',
  supabase_fallback: 'Banco: Supabase',
  offline_sync: 'Offline',
}

function montarStatusLabel(status: StatusBancoExibicao): string {
  return LABELS[status]
}

function calcularStatus(
  online: boolean,
  modo: 'local' | 'supabase',
  emFallback: boolean
): StatusBancoExibicao {
  if (modo === 'local') return 'local'
  if (!online) return 'offline_sync'
  if (emFallback) return 'supabase_fallback'
  return 'supabase'
}

export function BancoStatusProvider({
  children,
  officeId = OFFICE_ID,
}: {
  children: ReactNode
  officeId?: string
}) {
  const online = useOnlineStatus()
  const modoPersistencia = getCraftPersistenceMode()
  const supabaseConfigurado = isSupabaseConfigured()
  const modoSupabaseExperimental = isModoSupabaseExperimentalAtivo()

  const [testando, setTestando] = useState(false)
  const [conexaoOk, setConexaoOk] = useState<boolean | null>(null)
  const [ultimoTeste, setUltimoTeste] = useState<ResultadoTesteSupabase | null>(null)
  const [testadoEm, setTestadoEm] = useState<string | null>(null)
  const [emFallbackLocal, setEmFallbackLocal] = useState(false)
  const [ultimoAviso, setUltimoAviso] = useState<string | null>(null)
  const [pendenciasAtivas, setPendenciasAtivas] = useState(() =>
    contarPagamentosPendentesTotais(officeId).total
  )
  const [filaSyncBruta, setFilaSyncBruta] = useState(() =>
    syncQueueService.contarPendentes(officeId)
  )
  const [pagamentosPendentes, setPagamentosPendentes] = useState(() =>
    contarPagamentosPendentesTotais(officeId).total
  )
  const [pagamentosPendentesVinculoOs, setPagamentosPendentesVinculoOs] = useState(
    () => contarPagamentosPendentesTotais(officeId).vinculoOs > 0
  )

  const sincronizarContagemLocal = useCallback(() => {
    reconciliarFilaSyncComPendenciasAtivas(officeId)
    const { total, vinculoOs } = contarPagamentosPendentesTotais(officeId)
    setPagamentosPendentes(total)
    setPendenciasAtivas(total)
    setPagamentosPendentesVinculoOs(vinculoOs > 0)
    setFilaSyncBruta(syncQueueService.contarPendentes(officeId))
    return total
  }, [officeId])

  const testarConexao = useCallback(async () => {
    setTestando(true)
    try {
      const resultado = await testarConexaoSupabase()
      setUltimoTeste(resultado)
      setConexaoOk(resultado.ok)
      setTestadoEm(new Date().toISOString())
      return resultado
    } finally {
      setTestando(false)
    }
  }, [])

  const limparAviso = useCallback(() => setUltimoAviso(null), [])

  useEffect(() => {
    return inscreverEventosPersistencia((event: PersistenceStatusEvent) => {
      if (event.type === 'supabase_ok') {
        setEmFallbackLocal(false)
        setUltimoAviso(null)
        sincronizarContagemLocal()
      }
      if (event.type === 'pagamento_ok') {
        setEmFallbackLocal(false)
        logDetalheTecnicoDev('pagamento_ok', event)
        sincronizarContagemLocal()
      }
      if (event.type === 'pagamentos_pendentes') {
        setEmFallbackLocal(false)
        logDetalheTecnicoDev('pagamentos_pendentes', event)
        setUltimoAviso(MSG.atencaoSync)
        sincronizarContagemLocal()
      }
      if (event.type === 'fallback') {
        const escopo = event.escopo ?? 'geral'
        if (escopo === 'geral') {
          setEmFallbackLocal(true)
        }
        logDetalheTecnicoDev('fallback', event)
        setUltimoAviso(mensagemAvisoPersistencia('fallback', event.mensagem, escopo))
      }
      if (event.type === 'offline') {
        setEmFallbackLocal(true)
        logDetalheTecnicoDev('offline', event)
        setUltimoAviso(MSG.semConexao)
      }
      if (event.type === 'fila_atualizada') {
        setPendenciasAtivas(event.pendentes)
        setPagamentosPendentes(event.pendentes)
        setFilaSyncBruta(syncQueueService.contarPendentes(officeId))
        if (event.vinculo_os !== undefined) {
          setPagamentosPendentesVinculoOs(event.vinculo_os)
        }
      }
      if (event.type === 'diagnostico_pendencias_atualizado') {
        setPagamentosPendentes(event.pendentes)
        setPendenciasAtivas(event.pendentes)
        setPagamentosPendentesVinculoOs(event.vinculo_os)
        setFilaSyncBruta(syncQueueService.contarPendentes(officeId))
        if (event.pendentes === 0) {
          setUltimoAviso(null)
        }
      }
    })
  }, [officeId, sincronizarContagemLocal])

  useEffect(() => {
    sincronizarContagemLocal()
  }, [officeId, sincronizarContagemLocal])

  const status = calcularStatus(
    online,
    modoPersistencia,
    emFallbackLocal || conexaoOk === false
  )

  const statusLabel = montarStatusLabel(status)

  const value = useMemo(
    (): BancoStatusContextValue => ({
      status,
      statusLabel,
      modoPersistencia,
      modoPersistenciaLabel: obterModoPersistenciaLabel(),
      supabaseConfigurado,
      modoSupabaseExperimental,
      emFallbackLocal,
      pagamentosPendentes,
      pagamentosPendentesVinculoOs,
      pendenciasAtivas,
      ultimoAviso,
      filaSyncBruta,
      testando,
      ultimoTeste,
      testadoEm,
      testarConexao,
      limparAviso,
    }),
    [
      status,
      statusLabel,
      modoPersistencia,
      supabaseConfigurado,
      modoSupabaseExperimental,
      emFallbackLocal,
      pagamentosPendentes,
      pagamentosPendentesVinculoOs,
      pendenciasAtivas,
      ultimoAviso,
      filaSyncBruta,
      testando,
      ultimoTeste,
      testadoEm,
      testarConexao,
      limparAviso,
    ]
  )

  return <BancoStatusContext.Provider value={value}>{children}</BancoStatusContext.Provider>
}

export function useBancoStatus(): BancoStatusContextValue {
  const ctx = useContext(BancoStatusContext)
  if (!ctx) {
    throw new Error('useBancoStatus deve ser usado dentro de BancoStatusProvider')
  }
  return ctx
}
