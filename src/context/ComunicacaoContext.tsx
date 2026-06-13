import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useCraft } from '@/context/CraftContext'
import { comunicacaoService } from '@/services/comunicacao/comunicacao.service'
import type { HistoricoContato, TipoMensagem } from '@/types/comunicacao'

interface RegistrarContatoInput {
  cliente_id: string
  cliente_nome: string
  tipo_mensagem: TipoMensagem
  ordem_servico_id?: string
  ordem_servico_numero?: number
  mensagemCompleta?: string
}

interface ComunicacaoContextValue {
  historico: HistoricoContato[]
  registrarContato: (input: RegistrarContatoInput) => HistoricoContato
  recarregar: () => void
}

const ComunicacaoContext = createContext<ComunicacaoContextValue | null>(null)

export function ComunicacaoProvider({ children }: { children: ReactNode }) {
  const { oficinaId } = useCraft()
  const [versao, setVersao] = useState(0)

  const historico = useMemo(() => {
    void versao
    return comunicacaoService.listarHistorico(oficinaId)
  }, [oficinaId, versao])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  const registrarContato = useCallback(
    (input: RegistrarContatoInput) => {
      const registro = comunicacaoService.registrarContato(oficinaId, input)
      recarregar()
      return registro
    },
    [oficinaId, recarregar]
  )

  const value = useMemo(
    () => ({ historico, registrarContato, recarregar }),
    [historico, registrarContato, recarregar]
  )

  return <ComunicacaoContext.Provider value={value}>{children}</ComunicacaoContext.Provider>
}

export function useComunicacao() {
  const ctx = useContext(ComunicacaoContext)
  if (!ctx) throw new Error('useComunicacao deve ser usado dentro de ComunicacaoProvider')
  return ctx
}
