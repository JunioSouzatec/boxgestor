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
import { comunicacaoService } from '@/services/comunicacao/comunicacao.service'
import {
  adiarAlerta as adiarAlertaService,
  atualizarMensagemAlerta as atualizarMensagemAlertaService,
  calcularResumoAlertas,
  listarAlertasComunicacao,
  marcarAlertaEnviado as marcarAlertaEnviadoService,
  marcarAlertaResolvido as marcarAlertaResolvidoService,
  sincronizarAlertasAutomaticos,
} from '@/services/comunicacao/alertas-comunicacao.service'
import {
  ALERTAS_COMUNICACAO_EVENTO_ATUALIZADO,
  alertasComunicacaoModoSupabase,
  inicializarAlertasComunicacaoSupabase,
  refreshAlertasDoSupabase,
} from '@/services/comunicacao/alertas-comunicacao-sync.service'
import {
  COMUNICACAO_EVENTO_ATUALIZADO,
  comunicacaoModoSupabase,
  inicializarComunicacaoSupabase,
  refreshHistoricoDoSupabase,
} from '@/services/comunicacao/comunicacao-sync.service'
import {
  calcularResumoMensagensAgendadas,
  cancelarMensagemAgendada,
  criarMensagemAgendada,
  listarMensagensAgendadas,
  marcarMensagemAgendadaEnviada,
} from '@/services/comunicacao/mensagens-agendadas.service'
import type { AlertaComunicacao, ResumoAlertasComunicacao } from '@/types/alerta-comunicacao'
import type { HistoricoContato, TipoMensagem } from '@/types/comunicacao'
import type {
  CriarMensagemAgendadaInput,
  MensagemAgendada,
  MensagemAgendadaComStatus,
  ResumoMensagensAgendadas,
} from '@/types/mensagem-agendada'

interface RegistrarContatoInput {
  cliente_id: string
  cliente_nome: string
  tipo_mensagem: TipoMensagem
  ordem_servico_id?: string
  ordem_servico_numero?: number
  mensagemCompleta?: string
  responsavel_nome?: string
}

interface ComunicacaoContextValue {
  historico: HistoricoContato[]
  registrarContato: (input: RegistrarContatoInput) => HistoricoContato
  mensagensAgendadas: MensagemAgendadaComStatus[]
  resumoMensagensAgendadas: ResumoMensagensAgendadas
  criarMensagemAgendada: (input: CriarMensagemAgendadaInput) => MensagemAgendada
  marcarMensagemEnviada: (id: string, mensagemCompleta?: string) => void
  cancelarMensagemAgendada: (id: string) => void
  alertas: AlertaComunicacao[]
  resumoAlertas: ResumoAlertasComunicacao
  atualizarMensagemAlerta: (id: string, texto: string) => Promise<void>
  marcarAlertaEnviado: (id: string) => Promise<void>
  marcarAlertaResolvido: (id: string) => Promise<void>
  adiarAlerta: (id: string, data: string) => Promise<void>
  sincronizarAlertas: () => Promise<void>
  recarregar: () => void
}

const ComunicacaoContext = createContext<ComunicacaoContextValue | null>(null)

export function ComunicacaoProvider({ children }: { children: ReactNode }) {
  const { oficinaId } = useCraft()
  const { ordens, clientes, motos, agendamentos, configuracao } = useOficinaData()
  const { session } = useAuth()
  const [versao, setVersao] = useState(0)
  const [supabasePronto, setSupabasePronto] = useState(false)

  const responsavelNome =
    session?.user.nome?.trim() || session?.user.email?.trim() || undefined

  const historico = useMemo(() => {
    void versao
    return comunicacaoService.listarHistorico(oficinaId)
  }, [oficinaId, versao])

  const mensagensAgendadas = useMemo(() => {
    void versao
    return listarMensagensAgendadas(oficinaId)
  }, [oficinaId, versao])

  const resumoMensagensAgendadas = useMemo(() => {
    void versao
    return calcularResumoMensagensAgendadas(oficinaId)
  }, [oficinaId, versao])

  const alertas = useMemo(() => {
    void versao
    return listarAlertasComunicacao(oficinaId)
  }, [oficinaId, versao])

  const resumoAlertas = useMemo(() => {
    void versao
    return calcularResumoAlertas(oficinaId)
  }, [oficinaId, versao])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  const dadosAlertas = useMemo(
    () => ({
      ordens,
      clientes,
      motos,
      agendamentos,
      nomeOficina: configuracao.nome,
    }),
    [ordens, clientes, motos, agendamentos, configuracao.nome]
  )

  const sincronizarAlertas = useCallback(async () => {
    await sincronizarAlertasAutomaticos(oficinaId, dadosAlertas)
    recarregar()
  }, [oficinaId, dadosAlertas, recarregar])

  useEffect(() => {
    setSupabasePronto(false)
    let ativo = true

    void (async () => {
      await Promise.all([
        inicializarComunicacaoSupabase(oficinaId),
        inicializarAlertasComunicacaoSupabase(oficinaId),
      ])
      if (!ativo) return
      setSupabasePronto(true)
      recarregar()
    })()

    return () => {
      ativo = false
    }
  }, [oficinaId, recarregar])

  useEffect(() => {
    if (!supabasePronto) return
    void sincronizarAlertasAutomaticos(oficinaId, dadosAlertas).then(() => recarregar())
  }, [supabasePronto, oficinaId, dadosAlertas, recarregar])

  useEffect(() => {
    if (!comunicacaoModoSupabase() && !alertasComunicacaoModoSupabase()) return

    const refresh = () => {
      void Promise.all([
        refreshHistoricoDoSupabase(oficinaId),
        refreshAlertasDoSupabase(oficinaId),
      ]).then(() => recarregar())
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    const onEvento = () => recarregar()

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(COMUNICACAO_EVENTO_ATUALIZADO, onEvento)
    window.addEventListener(ALERTAS_COMUNICACAO_EVENTO_ATUALIZADO, onEvento)

    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(COMUNICACAO_EVENTO_ATUALIZADO, onEvento)
      window.removeEventListener(ALERTAS_COMUNICACAO_EVENTO_ATUALIZADO, onEvento)
    }
  }, [oficinaId, recarregar])

  const registrarContato = useCallback(
    (input: RegistrarContatoInput) => {
      const registro = comunicacaoService.registrarContato(oficinaId, {
        ...input,
        responsavel_nome: input.responsavel_nome ?? responsavelNome,
      })
      recarregar()
      return registro
    },
    [oficinaId, recarregar, responsavelNome]
  )

  const criarMensagemAgendadaCtx = useCallback(
    (input: CriarMensagemAgendadaInput) => {
      const registro = criarMensagemAgendada(oficinaId, input)
      recarregar()
      return registro
    },
    [oficinaId, recarregar]
  )

  const marcarMensagemEnviada = useCallback(
    (id: string, mensagemCompleta?: string) => {
      const item = marcarMensagemAgendadaEnviada(oficinaId, id)
      if (item) {
        comunicacaoService.registrarContato(oficinaId, {
          cliente_id: item.cliente_id,
          cliente_nome: item.cliente_nome,
          tipo_mensagem: item.tipo_mensagem,
          ordem_servico_id: item.ordem_servico_id,
          ordem_servico_numero: item.ordem_servico_numero,
          mensagemCompleta: mensagemCompleta ?? item.mensagem,
          responsavel_nome: responsavelNome,
        })
      }
      recarregar()
    },
    [oficinaId, recarregar, responsavelNome]
  )

  const cancelarMensagemAgendadaCtx = useCallback(
    (id: string) => {
      cancelarMensagemAgendada(oficinaId, id)
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const atualizarMensagemAlerta = useCallback(
    async (id: string, texto: string) => {
      await atualizarMensagemAlertaService(oficinaId, id, texto)
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const marcarAlertaEnviado = useCallback(
    async (id: string) => {
      await marcarAlertaEnviadoService(oficinaId, id)
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const marcarAlertaResolvido = useCallback(
    async (id: string) => {
      await marcarAlertaResolvidoService(oficinaId, id)
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const adiarAlerta = useCallback(
    async (id: string, data: string) => {
      await adiarAlertaService(oficinaId, id, data)
      recarregar()
    },
    [oficinaId, recarregar]
  )

  const value = useMemo(
    () => ({
      historico,
      registrarContato,
      mensagensAgendadas,
      resumoMensagensAgendadas,
      criarMensagemAgendada: criarMensagemAgendadaCtx,
      marcarMensagemEnviada,
      cancelarMensagemAgendada: cancelarMensagemAgendadaCtx,
      alertas,
      resumoAlertas,
      atualizarMensagemAlerta,
      marcarAlertaEnviado,
      marcarAlertaResolvido,
      adiarAlerta,
      sincronizarAlertas,
      recarregar,
    }),
    [
      historico,
      registrarContato,
      mensagensAgendadas,
      resumoMensagensAgendadas,
      criarMensagemAgendadaCtx,
      marcarMensagemEnviada,
      cancelarMensagemAgendadaCtx,
      alertas,
      resumoAlertas,
      atualizarMensagemAlerta,
      marcarAlertaEnviado,
      marcarAlertaResolvido,
      adiarAlerta,
      sincronizarAlertas,
      recarregar,
    ]
  )

  return <ComunicacaoContext.Provider value={value}>{children}</ComunicacaoContext.Provider>
}

export function useComunicacao() {
  const ctx = useContext(ComunicacaoContext)
  if (!ctx) throw new Error('useComunicacao deve ser usado dentro de ComunicacaoProvider')
  return ctx
}
