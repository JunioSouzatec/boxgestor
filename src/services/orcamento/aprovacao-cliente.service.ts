/**
 * Aprovação de Orçamento A1 — prévia interna + registro manual.
 * Não cria link público. Não altera estoque/caixa/financeiro/StatusOS.
 */

import { formatarMoeda, gerarId } from '@/lib/utils'
import { formatarLinhaPecaPdf } from '@/lib/peca-documento-format'
import {
  obterStatusOrcamentoEfetivo,
  patchAprovarOrcamento,
  patchMarcarOrcamentoEnviado,
  patchRecusarOrcamento,
} from '@/lib/orcamento-fluxo'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { obterLogoOficinaDocumento } from '@/lib/oficina-logo'
import {
  anexarEventosHistoricoOS,
  criarEventoHistoricoOS,
  mesclarHistoricoEventos,
  type UsuarioHistoricoOS,
} from '@/services/os-historico.service'
import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
import type {
  AprovacaoClienteMeta,
  CanalAprovacaoCliente,
  EventoAprovacaoCliente,
  StatusAprovacaoClienteUi,
} from '@/types/aprovacao-orcamento'
import type { Cliente, Moto, Oficina, OrdemServico } from '@/types'

export interface PreviaClienteOrcamento {
  oficinaNome: string
  oficinaLogoUrl?: string
  numero: number
  clienteNome: string
  veiculo: string
  placa?: string
  observacoes?: string
  validade?: string
  servicos: Array<{ nome: string; valorLabel: string }>
  pecas: Array<{ linha: string; subtotalLabel: string }>
  descontoLabel: string
  totalLabel: string
  aviso: string
}

export function obterAprovacaoClienteMeta(
  os: Pick<OrdemServico, 'aprovacao_cliente'>
): AprovacaoClienteMeta {
  const raw = os.aprovacao_cliente
  if (!raw || typeof raw !== 'object') {
    return { link_publico: 'bloqueado_a1' }
  }
  return {
    link_publico: 'bloqueado_a1',
    canal_ultimo: raw.canal_ultimo,
    enviado_em: raw.enviado_em,
    enviado_por_id: raw.enviado_por_id,
    enviado_por_nome: raw.enviado_por_nome,
    respondido_em: raw.respondido_em,
    cliente_nome: raw.cliente_nome,
    cliente_observacao: raw.cliente_observacao,
    motivo_recusa: raw.motivo_recusa,
    registrado_por_id: raw.registrado_por_id,
    registrado_por_nome: raw.registrado_por_nome,
    eventos: Array.isArray(raw.eventos) ? raw.eventos : [],
  }
}

export function statusAprovacaoClienteUi(
  os: Pick<OrdemServico, 'modo_documento' | 'status_orcamento' | 'aprovacao_cliente'>
): StatusAprovacaoClienteUi {
  if (!ehDocumentoOrcamento(os)) return 'nao_enviada'
  const st = obterStatusOrcamentoEfetivo(os)
  if (st === 'convertido') return 'convertido'
  if (st === 'aprovado') return 'aprovado'
  if (st === 'recusado') return 'recusado'
  const meta = obterAprovacaoClienteMeta(os)
  if (st === 'enviado' || st === 'aguardando_aprovacao' || meta.enviado_em) {
    return meta.enviado_em || st === 'enviado' ? 'enviada' : 'aguardando'
  }
  return 'nao_enviada'
}

export function labelStatusAprovacaoCliente(status: StatusAprovacaoClienteUi): string {
  switch (status) {
    case 'enviada':
      return 'Enviado ao cliente'
    case 'aguardando':
      return 'Aguardando cliente'
    case 'aprovado':
      return 'Aprovado'
    case 'recusado':
      return 'Recusado'
    case 'convertido':
      return 'Convertido em OS'
    default:
      return 'Não enviada'
  }
}

function pushEventoMeta(
  meta: AprovacaoClienteMeta,
  evento: Omit<EventoAprovacaoCliente, 'id'> & { id?: string }
): AprovacaoClienteMeta {
  const item: EventoAprovacaoCliente = {
    id: evento.id?.trim() || gerarId(),
    tipo: evento.tipo,
    em: evento.em,
    por_id: evento.por_id,
    por_nome: evento.por_nome,
    cliente_nome: evento.cliente_nome,
    observacao: evento.observacao,
    canal: evento.canal,
  }
  return {
    ...meta,
    eventos: [...(meta.eventos ?? []), item].slice(-30),
  }
}

export function montarPreviaClienteOrcamento(input: {
  os: OrdemServico
  cliente?: Cliente | null
  moto?: Moto | null
  oficina?: Oficina | null
}): PreviaClienteOrcamento {
  const { os, cliente, moto, oficina } = input
  // Sem lançamentos: prévia do cliente não deve expor financeiro interno/pagamentos.
  const resumo = calcularResumoFinanceiroOS(os, [])
  const veiculo = moto
    ? [moto.marca, moto.modelo, moto.ano].filter(Boolean).join(' ')
    : 'Veículo'
  const servicos =
    os.servicos_itens?.length
      ? os.servicos_itens.map((s) => ({
          nome: s.nome,
          valorLabel: formatarMoeda(s.valor_mao_obra),
        }))
      : os.servicos_executados?.trim()
        ? [
            {
              nome: os.servicos_executados.trim(),
              valorLabel: formatarMoeda(os.valor_mao_obra),
            },
          ]
        : []

  const pecas = (os.pecas_utilizadas ?? []).map((p) => {
    const fmt = formatarLinhaPecaPdf({
      nome: p.nome,
      quantidade: p.quantidade,
      unidade: p.unidade,
      valor_unitario: p.valor_unitario,
      codigo: p.codigo,
    })
    return {
      linha: fmt.linha,
      subtotalLabel: formatarMoeda(fmt.subtotal),
    }
  })

  return {
    oficinaNome: oficina?.nome?.trim() || 'Oficina',
    oficinaLogoUrl: oficina ? obterLogoOficinaDocumento(oficina) : undefined,
    numero: os.numero,
    clienteNome: cliente?.nome?.trim() || 'Cliente',
    veiculo,
    placa: moto?.placa?.trim() || undefined,
    observacoes: os.observacoes_orcamento?.trim() || undefined,
    validade: os.data_previsao || undefined,
    servicos,
    pecas,
    descontoLabel: formatarMoeda(resumo.totalDescontos),
    totalLabel: formatarMoeda(resumo.totalGeral),
    aviso: 'A aprovação do orçamento autoriza a execução dos serviços. Não é pagamento.',
  }
}

/** Texto pronto para colar no WhatsApp — sem link público nesta fase. */
export function montarTextoMensagemAprovacaoOrcamento(input: {
  clienteNome: string
  veiculo: string
  numero: number
}): string {
  const nome = input.clienteNome.trim() || 'cliente'
  const veiculo = input.veiculo.trim() || 'seu veículo'
  return (
    `Olá, ${nome}. Segue o orçamento #${input.numero} do seu veículo ${veiculo}. ` +
    `Confira os serviços, peças e o total. ` +
    `Quando puder, responda aprovando ou pedindo ajustes. ` +
    `(Link público de aprovação ainda não está disponível nesta versão.)`
  )
}

export function montarPatchMarcarEnviadoCliente(
  os: OrdemServico,
  usuario?: UsuarioHistoricoOS,
  canal: CanalAprovacaoCliente = 'whatsapp_texto'
): Partial<OrdemServico> | null {
  if (!ehDocumentoOrcamento(os)) return null
  if (obterStatusOrcamentoEfetivo(os) === 'convertido') return null

  const agora = new Date().toISOString()
  const nome = usuario?.nome?.trim() || 'Usuário'
  let meta = obterAprovacaoClienteMeta(os)
  meta = {
    ...meta,
    link_publico: 'bloqueado_a1',
    canal_ultimo: canal,
    enviado_em: meta.enviado_em || agora,
    enviado_por_id: usuario?.id,
    enviado_por_nome: nome,
  }
  meta = pushEventoMeta(meta, {
    tipo: 'enviado',
    em: agora,
    por_id: usuario?.id,
    por_nome: nome,
    canal,
  })

  const statusPatch = patchMarcarOrcamentoEnviado(os) ?? {}
  const evento = criarEventoHistoricoOS({
    tipo: 'envio_orcamento_cliente',
    titulo: `Orçamento marcado como enviado ao cliente`,
    usuario_id: usuario?.id,
    usuario_nome: nome,
    detalhe: `Canal: ${canal}. Link público ainda bloqueado (A1).`,
  })

  return {
    ...statusPatch,
    aprovacao_cliente: meta,
    ...anexarEventosHistoricoOS(os, [evento]),
  }
}

export function montarPatchAprovacaoManualCliente(
  os: OrdemServico,
  input: {
    clienteNome: string
    observacao?: string
    canal?: CanalAprovacaoCliente
    usuario?: UsuarioHistoricoOS
  }
): Partial<OrdemServico> | null {
  if (!ehDocumentoOrcamento(os)) return null
  const st = obterStatusOrcamentoEfetivo(os)
  if (st === 'convertido' || st === 'aprovado') return null

  const agora = new Date().toISOString()
  const nomeStaff = input.usuario?.nome?.trim() || 'Usuário'
  const clienteNome = input.clienteNome.trim() || 'Cliente'
  const canal = input.canal ?? 'manual'
  let meta = obterAprovacaoClienteMeta(os)
  meta = {
    ...meta,
    link_publico: 'bloqueado_a1',
    canal_ultimo: canal,
    respondido_em: agora,
    cliente_nome: clienteNome,
    cliente_observacao: input.observacao?.trim() || undefined,
    motivo_recusa: undefined,
    registrado_por_id: input.usuario?.id,
    registrado_por_nome: nomeStaff,
  }
  meta = pushEventoMeta(meta, {
    tipo: 'aprovado',
    em: agora,
    por_id: input.usuario?.id,
    por_nome: nomeStaff,
    cliente_nome: clienteNome,
    observacao: input.observacao?.trim() || undefined,
    canal,
  })

  const evento = criarEventoHistoricoOS({
    tipo: 'aprovacao_orcamento',
    titulo: `Orçamento aprovado (registro manual)`,
    usuario_id: input.usuario?.id,
    usuario_nome: nomeStaff,
    detalhe: [
      `Aprovador informado: ${clienteNome}`,
      `Canal: ${canal}`,
      input.observacao?.trim() ? `Obs.: ${input.observacao.trim()}` : null,
      'Status operacional da OS não foi alterado automaticamente.',
    ]
      .filter(Boolean)
      .join(' · '),
  })

  return {
    ...patchAprovarOrcamento(),
    aprovacao_cliente: meta,
    historico_eventos: mesclarHistoricoEventos(os.historico_eventos, [evento]),
  }
}

export function montarPatchRecusaManualCliente(
  os: OrdemServico,
  input: {
    motivo?: string
    clienteNome?: string
    canal?: CanalAprovacaoCliente
    usuario?: UsuarioHistoricoOS
  }
): Partial<OrdemServico> | null {
  if (!ehDocumentoOrcamento(os)) return null
  const st = obterStatusOrcamentoEfetivo(os)
  if (st === 'convertido' || st === 'recusado') return null

  const agora = new Date().toISOString()
  const nomeStaff = input.usuario?.nome?.trim() || 'Usuário'
  const canal = input.canal ?? 'manual'
  let meta = obterAprovacaoClienteMeta(os)
  meta = {
    ...meta,
    link_publico: 'bloqueado_a1',
    canal_ultimo: canal,
    respondido_em: agora,
    cliente_nome: input.clienteNome?.trim() || meta.cliente_nome,
    motivo_recusa: input.motivo?.trim() || undefined,
    cliente_observacao: undefined,
    registrado_por_id: input.usuario?.id,
    registrado_por_nome: nomeStaff,
  }
  meta = pushEventoMeta(meta, {
    tipo: 'recusado',
    em: agora,
    por_id: input.usuario?.id,
    por_nome: nomeStaff,
    cliente_nome: input.clienteNome?.trim() || undefined,
    observacao: input.motivo?.trim() || undefined,
    canal,
  })

  const evento = criarEventoHistoricoOS({
    tipo: 'recusa_orcamento',
    titulo: `Orçamento recusado (registro manual)`,
    usuario_id: input.usuario?.id,
    usuario_nome: nomeStaff,
    detalhe: [
      `Canal: ${canal}`,
      input.motivo?.trim() ? `Motivo: ${input.motivo.trim()}` : null,
      'Status operacional da OS não foi alterado automaticamente.',
    ]
      .filter(Boolean)
      .join(' · '),
  })

  return {
    ...patchRecusarOrcamento(),
    aprovacao_cliente: meta,
    historico_eventos: mesclarHistoricoEventos(os.historico_eventos, [evento]),
  }
}
