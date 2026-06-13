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
  obterModoPersistenciaLabel,
  testarConexaoSupabase,
  type ResultadoTesteSupabase,
} from '@/services/supabase-connection.service'

export type StatusBancoExibicao =
  | 'local'
  | 'supabase_conectado'
  | 'supabase_erro'
  | 'offline'

interface BancoStatusContextValue {
  status: StatusBancoExibicao
  statusLabel: string
  modoPersistencia: 'local' | 'supabase'
  modoPersistenciaLabel: string
  supabaseConfigurado: boolean
  testando: boolean
  ultimoTeste: ResultadoTesteSupabase | null
  testadoEm: string | null
  testarConexao: () => Promise<ResultadoTesteSupabase>
}

const BancoStatusContext = createContext<BancoStatusContextValue | null>(null)

const LABELS: Record<StatusBancoExibicao, string> = {
  local: 'Banco: Local',
  supabase_conectado: 'Banco: Supabase conectado',
  supabase_erro: 'Banco: Supabase com erro',
  offline: 'Banco: Offline',
}

function calcularStatus(
  online: boolean,
  modo: 'local' | 'supabase',
  conexaoOk: boolean | null
): StatusBancoExibicao {
  if (!online) return 'offline'
  if (modo === 'local') return 'local'
  if (conexaoOk === true) return 'supabase_conectado'
  if (conexaoOk === false) return 'supabase_erro'
  return isSupabaseConfigured() ? 'supabase_erro' : 'local'
}

export function BancoStatusProvider({ children }: { children: ReactNode }) {
  const online = useOnlineStatus()
  const modoPersistencia = getCraftPersistenceMode()
  const supabaseConfigurado = isSupabaseConfigured()

  const [testando, setTestando] = useState(false)
  const [conexaoOk, setConexaoOk] = useState<boolean | null>(null)
  const [ultimoTeste, setUltimoTeste] = useState<ResultadoTesteSupabase | null>(null)
  const [testadoEm, setTestadoEm] = useState<string | null>(null)

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

  useEffect(() => {
    if (!online) return
    if (!supabaseConfigurado) {
      setConexaoOk(null)
      return
    }
    void testarConexao()
  }, [online, supabaseConfigurado, testarConexao])

  const status = calcularStatus(online, modoPersistencia, conexaoOk)

  const value = useMemo(
    (): BancoStatusContextValue => ({
      status,
      statusLabel: LABELS[status],
      modoPersistencia,
      modoPersistenciaLabel: obterModoPersistenciaLabel(),
      supabaseConfigurado,
      testando,
      ultimoTeste,
      testadoEm,
      testarConexao,
    }),
    [
      status,
      modoPersistencia,
      supabaseConfigurado,
      testando,
      ultimoTeste,
      testadoEm,
      testarConexao,
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
