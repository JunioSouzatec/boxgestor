import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getDataLocalHoje } from '@/lib/data-local'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useAuth } from '@/context/AuthContext'
import { comunicacaoService } from '@/services/comunicacao/comunicacao.service'
import {
  adiarAlerta as adiarAlertaService,
  atualizarMensagemAlerta as atualizarMensagemAlertaService,
  calcularResumoDeLista,
  listarAlertasComunicacao,
  marcarAlertaEnviado as marcarAlertaEnviadoService,
  marcarAlertaResolvido as marcarAlertaResolvidoService,
  resolverAlertaMensagemAgendada,
  sincronizarAlertasAutomaticos,
} from '@/services/comunicacao/alertas-comunicacao.service'
import {
  ALERTAS_COMUNICACAO_EVENTO_ATUALIZADO,
  alertasComunicacaoModoSupabase,
  inicializarAlertasComunicacaoSupabase,
  refreshAlertasDoSupabase,
} from '@/services/comunicacao/alertas-comunicacao-sync.service'
import {
  MENSAGENS_AGENDADAS_EVENTO_ATUALIZADO,
  inicializarMensagensAgendadasSupabase,
  publicarMensagemAgendada,
  carregarMensagensAgendadasRemoto,
} from '@/services/comunicacao/mensagens-agendadas-sync.service'
import {
  COMUNICACAO_EVENTO_ATUALIZADO,
  comunicacaoModoSupabase,
  inicializarComunicacaoSupabase,
  refreshHistoricoDoSupabase,
} from '@/services/comunicacao/comunicacao-sync.service'
import { SYNC_FORCADO_EVENTO } from '@/services/comunicacao/forcar-sincronizacao.service'
import { SYNC_MULTI_DEVICE_PULL_EVENTO } from '@/services/sync/multi-device-sync.service'
import { isDialogOsAberto } from '@/lib/ui-interaction'
import {
  calcularResumoMensagensAgendadas,
  cancelarMensagemAgendada,
  combinarDataHoraAgendamento,
  criarMensagemAgendada,
  adiarMensagemAgendada as adiarMensagemAgendadaService,
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
  adiarMensagemAgendada: (id: string, data: string, hora: string) => void
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

  const resumoAlertas = useMemo(() => calcularResumoDeLista(alertas), [alertas])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  const dadosAlertas = useMemo(
    () => ({
      ordens,
      clientes,
      motos,
      agendamentos,
      nomeOficina: configuracao.nome,
      tipoOficina: configuracao.tipo_oficina,
    }),
    [ordens, clientes, motos, agendamentos, configuracao.nome, configuracao.tipo_oficina]
  )

  const dadosAlertasRef = useRef(dadosAlertas)
  dadosAlertasRef.current = dadosAlertas

  const alertasSyncKey = useMemo(() => {
    const hoje = getDataLocalHoje()
    let osComPrevisao = 0
    for (const os of ordens) {
      if (
        os.data_previsao &&
        os.status !== 'entregue' &&
        os.status !== 'cancelada' &&
        os.modo_documento !== 'orcamento'
      ) {
        osComPrevisao++
      }
    }
    return `${oficinaId}|${hoje}|${ordens.length}|${osComPrevisao}|${agendamentos.length}`
  }, [oficinaId, ordens, agendamentos])

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
        inicializarMensagensAgendadasSupabase(oficinaId),
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
    void sincronizarAlertasAutomaticos(oficinaId, dadosAlertasRef.current).then(() => recarregar())
  }, [supabasePronto, oficinaId, alertasSyncKey, recarregar])

  useEffect(() => {
    const onSyncForcado = () => {
      void Promise.all([
        inicializarComunicacaoSupabase(oficinaId),
        inicializarAlertasComunicacaoSupabase(oficinaId),
      ]).then(() => {
        void sincronizarAlertasAutomaticos(oficinaId, dadosAlertas).then(() => recarregar())
      })
    }
    window.addEventListener(SYNC_FORCADO_EVENTO, onSyncForcado)
    return () => window.removeEventListener(SYNC_FORCADO_EVENTO, onSyncForcado)
  }, [oficinaId, dadosAlertas, recarregar])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    console.info('[Craft Comunicação] alertas finais', {
      quantidade: alertas.length,
      pendentes: resumoAlertas.pendentes,
      vencidos: resumoAlertas.vencidos,
      hoje: resumoAlertas.hoje,
      origem: alertasComunicacaoModoSupabase() ? 'supabase/cache' : 'local',
    })
  }, [alertas, resumoAlertas])

  useEffect(() => {
    if (!comunicacaoModoSupabase() && !alertasComunicacaoModoSupabase()) return

    let ultimoRefresh = 0
    const MIN_INTERVALO_MS = 60_000

    const refresh = (forcar = false) => {
      if (document.visibilityState === 'hidden') return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      if (isDialogOsAberto()) return
      const agora = Date.now()
      if (!forcar && agora - ultimoRefresh < MIN_INTERVALO_MS) return
      ultimoRefresh = agora

      void Promise.all([
        refreshHistoricoDoSupabase(oficinaId),
        refreshAlertasDoSupabase(oficinaId),
        carregarMensagensAgendadasRemoto(oficinaId),
      ]).then(() => {
        if (isDialogOsAberto()) return
        recarregar()
      })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    const onEvento = () => {
      if (isDialogOsAberto()) return
      recarregar()
    }

    const onPullMultiDevice = () => {
      refresh(true)
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(COMUNICACAO_EVENTO_ATUALIZADO, onEvento)
    window.addEventListener(ALERTAS_COMUNICACAO_EVENTO_ATUALIZADO, onEvento)
    window.addEventListener(MENSAGENS_AGENDADAS_EVENTO_ATUALIZADO, onEvento)
    window.addEventListener(SYNC_MULTI_DEVICE_PULL_EVENTO, onPullMultiDevice)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(COMUNICACAO_EVENTO_ATUALIZADO, onEvento)
      window.removeEventListener(ALERTAS_COMUNICACAO_EVENTO_ATUALIZADO, onEvento)
      window.removeEventListener(MENSAGENS_AGENDADAS_EVENTO_ATUALIZADO, onEvento)
      window.removeEventListener(SYNC_MULTI_DEVICE_PULL_EVENTO, onPullMultiDevice)
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
      void publicarMensagemAgendada(oficinaId, registro).then(() =>
        sincronizarAlertasAutomaticos(oficinaId, dadosAlertas).then(() => recarregar())
      )
      recarregar()
      return registro
    },
    [oficinaId, dadosAlertas, recarregar]
  )

  const marcarMensagemEnviada = useCallback(
    (id: string, mensagemCompleta?: string) => {
      const item = marcarMensagemAgendadaEnviada(oficinaId, id)
      if (item) {
        void publicarMensagemAgendada(oficinaId, item).then(async () => {
          await resolverAlertaMensagemAgendada(oficinaId, id, 'enviado')
          await sincronizarAlertasAutomaticos(oficinaId, dadosAlertas)
          recarregar()
        })
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
    [oficinaId, dadosAlertas, recarregar, responsavelNome]
  )

  const cancelarMensagemAgendadaCtx = useCallback(
    (id: string) => {
      const item = cancelarMensagemAgendada(oficinaId, id)
      if (item) {
        void publicarMensagemAgendada(oficinaId, item).then(async () => {
          await resolverAlertaMensagemAgendada(oficinaId, id, 'resolvido')
          await sincronizarAlertasAutomaticos(oficinaId, dadosAlertas)
          recarregar()
        })
      }
      recarregar()
    },
    [oficinaId, dadosAlertas, recarregar]
  )

  const adiarMensagemAgendada = useCallback(
    (id: string, data: string, hora: string) => {
      const novaDataHora = combinarDataHoraAgendamento(data, hora)
      const item = adiarMensagemAgendadaService(oficinaId, id, novaDataHora)
      if (item) {
        void publicarMensagemAgendada(oficinaId, item).then(() =>
          sincronizarAlertasAutomaticos(oficinaId, dadosAlertas).then(() => recarregar())
        )
      }
      recarregar()
    },
    [oficinaId, dadosAlertas, recarregar]
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
      adiarMensagemAgendada,
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
      adiarMensagemAgendada,
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
