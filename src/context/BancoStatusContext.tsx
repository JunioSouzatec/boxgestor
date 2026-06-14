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
  emFallback: boolean,
  pendentes: number
): StatusBancoExibicao {
  if (modo === 'local') return 'local'
  if (!online || pendentes > 0) return 'offline_sync'
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
  const [pendentesSync, setPendentesSync] = useState(() =>
    syncQueueService.contarPendentes(officeId)
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
      }
      if (event.type === 'fallback' || event.type === 'offline') {
        setEmFallbackLocal(true)
        setUltimoAviso(event.mensagem)
      }
      if (event.type === 'fila_atualizada') {
        setPendentesSync(event.pendentes)
      }
    })
  }, [])

  /** Fila não é processada automaticamente no login — evita duplicar clientes no Supabase */

  useEffect(() => {
    setPendentesSync(syncQueueService.contarPendentes(officeId))
  }, [officeId])

  const status = calcularStatus(
    online,
    modoPersistencia,
    emFallbackLocal || conexaoOk === false,
    pendentesSync
  )

  const value = useMemo(
    (): BancoStatusContextValue => ({
      status,
      statusLabel: LABELS[status],
      modoPersistencia,
      modoPersistenciaLabel: obterModoPersistenciaLabel(),
      supabaseConfigurado,
      modoSupabaseExperimental,
      emFallbackLocal,
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
      modoPersistencia,
      supabaseConfigurado,
      modoSupabaseExperimental,
      emFallbackLocal,
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
