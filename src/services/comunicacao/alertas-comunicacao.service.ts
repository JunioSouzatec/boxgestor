import {
  compararDatasLocais,
  diasEntreDatasLocais,
  getDataLocalHoje,
} from '@/lib/data-local'
import { gerarId } from '@/lib/utils'
import {
  listarAlertasLocal,
  obterAlertaPorLocalId,
  salvarAlertasOfficeLocal,
} from '@/services/comunicacao/alertas-comunicacao.storage'
import { persistirAlertaComunicacao } from '@/services/comunicacao/alertas-comunicacao-sync.service'
import {
  getLabelStatusOS,
  montarMensagem,
  sugerirTipoMensagem,
} from '@/services/comunicacao/comunicacao.service'
import { lembretesService } from '@/services/lembretes/lembretes.service'
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import {
  dataLocalDeAgendamento,
  listarMensagensAgendadas,
} from '@/services/comunicacao/mensagens-agendadas.service'
import { getLabelTipoMensagemOficina } from '@/lib/mensagem-agendada-helpers'
import type {
  AlertaComunicacao,
  FiltroAlertasComunicacao,
  PrioridadeAlertaComunicacao,
  ResumoAlertasComunicacao,
  TipoAlertaComunicacao,
} from '@/types/alerta-comunicacao'
import type { TipoMensagem, VariaveisMensagem } from '@/types/comunicacao'
import { formatarMoeda } from '@/lib/utils'
import type { Agendamento, Cliente, Moto, OrdemServico } from '@/types'
import type { TipoOficina } from '@/types/tipo-oficina'

export interface DadosParaAlertas {
  ordens: OrdemServico[]
  clientes: Cliente[]
  motos: Moto[]
  agendamentos: Agendamento[]
  nomeOficina: string
  tipoOficina?: TipoOficina
}

export function calcularPrioridadeAlerta(
  dueDate: string,
  hoje = getDataLocalHoje()
): PrioridadeAlertaComunicacao | null {
  const cmp = compararDatasLocais(dueDate, hoje)
  if (cmp < 0) return 'vencido'
  if (cmp === 0) return 'hoje'
  const dias = diasEntreDatasLocais(hoje, dueDate)
  if (dias <= 7) return 'proximos_dias'
  return null
}

export function calcularPrioridadeMensagemAgendada(
  agendadoPara: string,
  hoje = getDataLocalHoje(),
  agora: Date = new Date()
): PrioridadeAlertaComunicacao | null {
  const agendado = new Date(agendadoPara)
  if (agendado.getTime() < agora.getTime()) return 'vencido'
  return calcularPrioridadeAlerta(dataLocalDeAgendamento(agendadoPara), hoje)
}

export function alertaEstaVisivel(alerta: AlertaComunicacao, hoje = getDataLocalHoje()): boolean {
  if (alerta.status === 'adiado' && alerta.adiado_ate) {
    return compararDatasLocais(alerta.adiado_ate, hoje) <= 0
  }
  return true
}

/** Recalcula prioridade com base na data atual (após carga do Supabase). */
export function normalizarAlertasAposCarga(alertas: AlertaComunicacao[]): AlertaComunicacao[] {
  return alertas.map((alerta) => {
    if (alerta.status !== 'pendente' && alerta.status !== 'adiado') return alerta
    const prioridade = calcularPrioridadeAlerta(alerta.due_date)
    if (!prioridade) return alerta
    return { ...alerta, prioridade }
  })
}

export function calcularResumoDeLista(alertas: AlertaComunicacao[]): ResumoAlertasComunicacao {
  const visiveis = alertas.filter((a) => alertaEstaVisivel(a))
  return {
    vencidos: visiveis.filter((a) => a.prioridade === 'vencido' && a.status === 'pendente').length,
    hoje: visiveis.filter((a) => a.prioridade === 'hoje' && a.status === 'pendente').length,
    proximos: visiveis.filter(
      (a) => a.prioridade === 'proximos_dias' && a.status === 'pendente'
    ).length,
    pendentes: visiveis.filter((a) => a.status === 'pendente').length,
    enviados: visiveis.filter((a) => a.status === 'enviado').length,
    resolvidos: visiveis.filter((a) => a.status === 'resolvido').length,
    adiados: visiveis.filter((a) => a.status === 'adiado').length,
  }
}

function montarVarsMensagem(
  cliente: Cliente,
  moto: Moto | undefined,
  os: OrdemServico | undefined,
  nomeOficina: string,
  dataPrevista?: string
): VariaveisMensagem {
  return {
    nome_cliente: cliente.nome,
    moto: moto ? `${moto.marca} ${moto.modelo}`.trim() : 'Não informado',
    placa: moto?.placa?.trim() || 'Não informada',
    status_os: os ? getLabelStatusOS(os.status) : 'Não informado',
    nome_oficina: nomeOficina,
    numero_os: os ? String(os.numero) : 'Não informada',
    valor_os: os ? formatarMoeda(calcularTotalGeralDeCampos(os)) : undefined,
    data_garantia: os?.data_vencimento_garantia,
    data_prevista: dataPrevista,
  }
}

function tipoMensagemParaAlerta(
  tipo: TipoAlertaComunicacao,
  os?: OrdemServico
): TipoMensagem {
  switch (tipo) {
    case 'retorno_retirada':
      return 'moto_pronta_retirada'
    case 'previsao_entrega':
      return os ? sugerirTipoMensagem(os.status, os.status_orcamento) : 'moto_em_servico'
    case 'revisao':
      return 'lembrete_revisao'
    case 'agendamento':
      return 'lembrete_revisao'
    default:
      return 'lembrete_revisao'
  }
}

function montarMensagemAlerta(
  tipo: TipoAlertaComunicacao,
  cliente: Cliente,
  moto: Moto | undefined,
  os: OrdemServico | undefined,
  nomeOficina: string,
  dueDate: string,
  motivo: string
): { message_text: string; tipo_mensagem: TipoMensagem } {
  const tipo_mensagem = tipoMensagemParaAlerta(tipo, os)
  if (tipo === 'agendamento') {
    const texto = `Olá ${cliente.nome}! Lembrete da ${nomeOficina}: você tem agendamento previsto para ${dueDate}. ${motivo}. Podemos confirmar?`
    return { message_text: texto, tipo_mensagem }
  }
  const vars = montarVarsMensagem(cliente, moto, os, nomeOficina, dueDate)
  return { message_text: montarMensagem(tipo_mensagem, vars), tipo_mensagem }
}

function clientePorId(clientes: Cliente[], id: string): Cliente | undefined {
  return clientes.find((c) => c.id === id)
}

function motoPorId(motos: Moto[], id?: string): Moto | undefined {
  if (!id) return undefined
  return motos.find((m) => m.id === id)
}

function criarAlertaBase(
  officeId: string,
  localId: string,
  input: Omit<AlertaComunicacao, 'id' | 'office_id' | 'local_id' | 'created_at' | 'updated_at'>
): AlertaComunicacao {
  const agora = new Date().toISOString()
  return {
    id: gerarId(),
    office_id: officeId,
    local_id: localId,
    created_at: agora,
    updated_at: agora,
    ...input,
  }
}

async function salvarOuAtualizarAlerta(
  officeId: string,
  alerta: AlertaComunicacao
): Promise<AlertaComunicacao> {
  return persistirAlertaComunicacao(officeId, alerta)
}

/** Gera alertas automáticos a partir de OS, agendamentos e lembretes. */
export async function sincronizarAlertasAutomaticos(
  officeId: string,
  dados: DadosParaAlertas
): Promise<AlertaComunicacao[]> {
  const hoje = getDataLocalHoje()
  const lembretes = lembretesService.listarLembretes(officeId, hoje)
  const existentes = listarAlertasLocal(officeId)
  const porLocalId = new Map(existentes.map((a) => [a.local_id, a]))

  function registrarSeNovo(
    localId: string,
    partial: Omit<
      AlertaComunicacao,
      'id' | 'office_id' | 'local_id' | 'created_at' | 'updated_at' | 'status' | 'prioridade'
    > & { due_date: string }
  ): void {
    const prioridade = calcularPrioridadeAlerta(partial.due_date, hoje)
    if (!prioridade) return

    const existente = porLocalId.get(localId)
    if (existente) {
      if (existente.status === 'resolvido' || existente.status === 'enviado') return
      if (existente.status === 'adiado' && existente.adiado_ate) {
        if (compararDatasLocais(existente.adiado_ate, hoje) > 0) return
      }
      const atualizado: AlertaComunicacao = {
        ...existente,
        prioridade,
        due_date: partial.due_date,
        motivo: partial.motivo,
        message_text: partial.message_text,
        tipo_mensagem: partial.tipo_mensagem,
        telefone: partial.telefone ?? existente.telefone,
        moto_descricao: partial.moto_descricao ?? existente.moto_descricao,
        placa: partial.placa ?? existente.placa,
        updated_at: new Date().toISOString(),
        status:
          existente.status === 'adiado' && existente.adiado_ate
            ? compararDatasLocais(existente.adiado_ate, hoje) > 0
              ? 'adiado'
              : 'pendente'
            : existente.status === 'adiado'
              ? 'pendente'
              : existente.status,
        adiado_ate:
          existente.status === 'adiado' && existente.adiado_ate
            ? compararDatasLocais(existente.adiado_ate, hoje) > 0
              ? existente.adiado_ate
              : undefined
            : existente.adiado_ate,
      }
      porLocalId.set(localId, atualizado)
      void persistirAlertaComunicacao(officeId, atualizado)
      return
    }

    const novo = criarAlertaBase(officeId, localId, {
      ...partial,
      status: 'pendente',
      prioridade,
    })
    porLocalId.set(localId, novo)
    void persistirAlertaComunicacao(officeId, novo)
  }

  for (const os of dados.ordens) {
    if (!os.data_previsao) continue
    if (os.status === 'entregue' || os.status === 'cancelada') continue

    const prioridade = calcularPrioridadeAlerta(os.data_previsao, hoje)
    if (!prioridade) continue

    const cliente = clientePorId(dados.clientes, os.cliente_id)
    if (!cliente) continue
    const moto = motoPorId(dados.motos, os.moto_id)

    const tipo: TipoAlertaComunicacao =
      os.status === 'finalizada' ? 'retorno_retirada' : 'previsao_entrega'
    const motivo =
      tipo === 'retorno_retirada'
        ? 'Moto pronta — cliente deve retirar na data prevista'
        : 'Previsão de entrega da ordem de serviço'
    const localId = `os-${os.id}-${tipo}`
    const { message_text, tipo_mensagem } = montarMensagemAlerta(
      tipo,
      cliente,
      moto,
      os,
      dados.nomeOficina,
      os.data_previsao,
      motivo
    )

    registrarSeNovo(localId, {
      cliente_id: cliente.id,
      cliente_nome: cliente.nome,
      telefone: cliente.telefone,
      moto_id: moto?.id,
      moto_descricao: moto ? `${moto.marca} ${moto.modelo}` : undefined,
      placa: moto?.placa,
      ordem_servico_id: os.id,
      ordem_servico_numero: os.numero,
      tipo,
      motivo,
      due_date: os.data_previsao,
      message_text,
      tipo_mensagem,
    })
  }

  for (const ag of dados.agendamentos) {
    if (ag.status !== 'agendado' && ag.status !== 'confirmado') continue
    const prioridade = calcularPrioridadeAlerta(ag.data, hoje)
    if (!prioridade) continue

    const cliente = clientePorId(dados.clientes, ag.cliente_id)
    if (!cliente) continue
    const moto = motoPorId(dados.motos, ag.moto_id)
    const os = ag.ordem_servico_id
      ? dados.ordens.find((o) => o.id === ag.ordem_servico_id)
      : undefined
    const motivo = `Agendamento: ${ag.servico} às ${ag.horario}`
    const localId = `ag-${ag.id}-agendamento`
    const { message_text, tipo_mensagem } = montarMensagemAlerta(
      'agendamento',
      cliente,
      moto,
      os,
      dados.nomeOficina,
      ag.data,
      motivo
    )

    registrarSeNovo(localId, {
      cliente_id: cliente.id,
      cliente_nome: cliente.nome,
      telefone: cliente.telefone,
      moto_id: moto?.id,
      moto_descricao: moto ? `${moto.marca} ${moto.modelo}` : undefined,
      placa: moto?.placa,
      ordem_servico_id: os?.id,
      ordem_servico_numero: os?.numero,
      agendamento_id: ag.id,
      tipo: 'agendamento',
      motivo,
      due_date: ag.data,
      message_text,
      tipo_mensagem,
    })
  }

  for (const lem of lembretes) {
    if (lem.status_fixo === 'concluido' || lem.status_fixo === 'cancelado') continue
    if (lem.status === 'concluido' || lem.status === 'cancelado') continue

    const prioridade = calcularPrioridadeAlerta(lem.data_prevista, hoje)
    if (!prioridade) continue

    const cliente = clientePorId(dados.clientes, lem.cliente_id)
    if (!cliente) continue
    const moto = motoPorId(dados.motos, lem.moto_id)
    const os = lem.ordem_servico_id
      ? dados.ordens.find((o) => o.id === lem.ordem_servico_id)
      : undefined
    const motivo = `Revisão / retorno: ${lem.servico}`
    const localId = `lem-${lem.id}-revisao`
    const { message_text, tipo_mensagem } = montarMensagemAlerta(
      'revisao',
      cliente,
      moto,
      os,
      dados.nomeOficina,
      lem.data_prevista,
      motivo
    )

    registrarSeNovo(localId, {
      cliente_id: cliente.id,
      cliente_nome: cliente.nome,
      telefone: cliente.telefone,
      moto_id: moto?.id,
      moto_descricao: moto ? `${moto.marca} ${moto.modelo}` : undefined,
      placa: moto?.placa,
      ordem_servico_id: os?.id,
      ordem_servico_numero: os?.numero ?? lem.ordem_servico_numero,
      lembrete_id: lem.id,
      tipo: 'revisao',
      motivo,
      due_date: lem.data_prevista,
      message_text,
      tipo_mensagem,
    })
  }

  for (const msg of listarMensagensAgendadas(officeId, new Date())) {
    if (msg.status !== 'pendente') continue

    const prioridade = calcularPrioridadeMensagemAgendada(msg.agendado_para, hoje)
    if (!prioridade) continue

    const dueDate = dataLocalDeAgendamento(msg.agendado_para)
    const localId = `msg-ag-${msg.id}`
    const labelTipo = getLabelTipoMensagemOficina(msg.tipo_mensagem, undefined, dados.tipoOficina)
    const motivo = `Mensagem agendada: ${labelTipo}`

    registrarSeNovo(localId, {
      cliente_id: msg.cliente_id,
      cliente_nome: msg.cliente_nome,
      telefone: msg.telefone,
      moto_id: msg.moto_id,
      moto_descricao: msg.veiculo_descricao,
      placa: msg.placa,
      ordem_servico_id: msg.ordem_servico_id,
      ordem_servico_numero: msg.ordem_servico_numero,
      mensagem_agendada_id: msg.id,
      tipo: 'mensagem_agendada',
      motivo,
      due_date: dueDate,
      message_text: msg.mensagem,
      tipo_mensagem: msg.tipo_mensagem,
    })
  }

  // Remove alertas de mensagens que não existem mais ou foram concluídas
  for (const [localId, alerta] of porLocalId) {
    if (alerta.tipo !== 'mensagem_agendada' || !alerta.mensagem_agendada_id) continue
    const msg = listarMensagensAgendadas(officeId).find((m) => m.id === alerta.mensagem_agendada_id)
    if (!msg || msg.status !== 'pendente') {
      if (alerta.status === 'pendente' || alerta.status === 'adiado') {
        const resolvido: AlertaComunicacao = {
          ...alerta,
          status: msg?.status === 'enviada' ? 'enviado' : 'resolvido',
          updated_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
        }
        porLocalId.set(localId, resolvido)
        void persistirAlertaComunicacao(officeId, resolvido)
      }
    }
  }

  const mesclados = [...porLocalId.values()]
  salvarAlertasOfficeLocal(officeId, mesclados)
  return mesclados
}

export function listarAlertasComunicacao(officeId: string): AlertaComunicacao[] {
  return normalizarAlertasAposCarga(
    listarAlertasLocal(officeId).filter((a) => alertaEstaVisivel(a))
  )
}

export function calcularResumoAlertas(officeId: string): ResumoAlertasComunicacao {
  return calcularResumoDeLista(listarAlertasComunicacao(officeId))
}

export function filtrarAlertas(
  alertas: AlertaComunicacao[],
  filtro: FiltroAlertasComunicacao
): AlertaComunicacao[] {
  switch (filtro) {
    case 'pendentes':
      return alertas.filter((a) => a.status === 'pendente')
    case 'vencidos':
      return alertas.filter((a) => a.prioridade === 'vencido' && a.status === 'pendente')
    case 'hoje':
      return alertas.filter((a) => a.prioridade === 'hoje' && a.status === 'pendente')
    case 'proximos':
      return alertas.filter((a) => a.prioridade === 'proximos_dias' && a.status === 'pendente')
    case 'enviados':
      return alertas.filter((a) => a.status === 'enviado')
    case 'resolvidos':
      return alertas.filter((a) => a.status === 'resolvido')
    case 'adiados':
      return alertas.filter((a) => a.status === 'adiado')
    case 'todos':
    default:
      return alertas
  }
}

export function obterAlertaPorId(officeId: string, id: string): AlertaComunicacao | undefined {
  return listarAlertasLocal(officeId).find((a) => a.id === id)
}

export async function atualizarMensagemAlerta(
  officeId: string,
  id: string,
  message_text: string
): Promise<AlertaComunicacao | undefined> {
  const alerta = obterAlertaPorId(officeId, id)
  if (!alerta) return undefined
  return salvarOuAtualizarAlerta(officeId, {
    ...alerta,
    message_text,
    updated_at: new Date().toISOString(),
  })
}

export async function marcarAlertaEnviado(
  officeId: string,
  id: string
): Promise<AlertaComunicacao | undefined> {
  const alerta = obterAlertaPorId(officeId, id)
  if (!alerta) return undefined
  const agora = new Date().toISOString()
  return salvarOuAtualizarAlerta(officeId, {
    ...alerta,
    status: 'enviado',
    updated_at: agora,
    resolved_at: agora,
  })
}

export async function marcarAlertaResolvido(
  officeId: string,
  id: string
): Promise<AlertaComunicacao | undefined> {
  const alerta = obterAlertaPorId(officeId, id)
  if (!alerta) return undefined
  const agora = new Date().toISOString()
  return salvarOuAtualizarAlerta(officeId, {
    ...alerta,
    status: 'resolvido',
    updated_at: agora,
    resolved_at: agora,
  })
}

export async function adiarAlerta(
  officeId: string,
  id: string,
  adiadoAte: string
): Promise<AlertaComunicacao | undefined> {
  const alerta = obterAlertaPorId(officeId, id)
  if (!alerta) return undefined
  return salvarOuAtualizarAlerta(officeId, {
    ...alerta,
    status: 'pendente',
    due_date: adiadoAte,
    adiado_ate: adiadoAte,
    resolved_at: undefined,
    updated_at: new Date().toISOString(),
  })
}

export async function resolverAlertaMensagemAgendada(
  officeId: string,
  mensagemId: string,
  status: 'enviado' | 'resolvido' = 'resolvido'
): Promise<void> {
  const localId = `msg-ag-${mensagemId}`
  const alerta = obterAlertaPorLocalId(officeId, localId)
  if (!alerta) return
  if (alerta.status === 'enviado' || alerta.status === 'resolvido') return
  const agora = new Date().toISOString()
  await salvarOuAtualizarAlerta(officeId, {
    ...alerta,
    status,
    updated_at: agora,
    resolved_at: agora,
  })
}

export { obterAlertaPorLocalId }
