import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  contarPagamentosPendentesNaFila,
  inscreverEventosPersistencia,
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
  ultimoAviso: string | null
  pendentesSync: number
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
  supabase_fallback: 'Banco: Supabase com fallback local',
  offline_sync: 'Offline aguardando sincronização',
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

function montarStatusLabel(
  status: StatusBancoExibicao,
  pagamentosPendentes: number
): string {
  if (status === 'supabase' && pagamentosPendentes > 0) {
    return 'Banco: Supabase · Pagamentos pendentes'
  }
  return LABELS[status]
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
  const [pendentesSync, setPendentesSync] = useState(() =>
    syncQueueService.contarPendentes(officeId)
  )
  const [pagamentosPendentes, setPagamentosPendentes] = useState(() =>
    contarPagamentosPendentesNaFila(syncQueueService.listar(officeId, 'pendente'))
  )

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
    if (!online) return
    if (!supabaseConfigurado) {
      setConexaoOk(null)
      return
    }
    void testarConexao()
  }, [online, supabaseConfigurado, testarConexao])

  useEffect(() => {
    return inscreverEventosPersistencia((event: PersistenceStatusEvent) => {
      if (event.type === 'supabase_ok') {
        setEmFallbackLocal(false)
        setUltimoAviso(null)
        setPagamentosPendentes(
          contarPagamentosPendentesNaFila(syncQueueService.listar(officeId, 'pendente'))
        )
      }
      if (event.type === 'pagamento_ok') {
        setEmFallbackLocal(false)
        setUltimoAviso(event.mensagem)
        setPagamentosPendentes(
          contarPagamentosPendentesNaFila(syncQueueService.listar(officeId, 'pendente'))
        )
      }
      if (event.type === 'pagamentos_pendentes') {
        setEmFallbackLocal(false)
        setUltimoAviso(event.mensagem)
        setPagamentosPendentes(event.pendentes)
      }
      if (event.type === 'fallback') {
        const escopo = event.escopo ?? 'geral'
        if (escopo === 'geral') {
          setEmFallbackLocal(true)
        }
        setUltimoAviso(event.mensagem)
      }
      if (event.type === 'offline') {
        setEmFallbackLocal(true)
        setUltimoAviso(event.mensagem)
      }
      if (event.type === 'fila_atualizada') {
        setPendentesSync(event.pendentes)
        setPagamentosPendentes(
          contarPagamentosPendentesNaFila(syncQueueService.listar(officeId, 'pendente'))
        )
      }
    })
  }, [officeId])

  useEffect(() => {
    setPendentesSync(syncQueueService.contarPendentes(officeId))
    setPagamentosPendentes(
      contarPagamentosPendentesNaFila(syncQueueService.listar(officeId, 'pendente'))
    )
  }, [officeId])

  const status = calcularStatus(
    online,
    modoPersistencia,
    emFallbackLocal || conexaoOk === false
  )

  const statusLabel = montarStatusLabel(status, pagamentosPendentes)

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
      ultimoAviso,
      pendentesSync,
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
      ultimoAviso,
      pendentesSync,
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
