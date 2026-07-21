import { gerarId } from '@/lib/utils'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import type { EventoHistoricoOS } from '@/types/os-historico'
import type { OrdemServico } from '@/types/ordem-servico'

export interface UsuarioHistoricoOS {
  id?: string
  nome?: string
}

export function obterNomeCriadorOS(os: Pick<OrdemServico, 'criado_por_nome' | 'responsavel'>): string | undefined {
  return os.criado_por_nome?.trim() || os.responsavel?.trim() || undefined
}

export function rotuloCriadorOS(os: Pick<OrdemServico, 'modo_documento' | 'criado_por_nome' | 'responsavel'>): string {
  const nome = obterNomeCriadorOS(os)
  if (!nome) return '—'
  return ehDocumentoOrcamento(os) ? `Orçamento aberto por ${nome}` : `Aberta por ${nome}`
}

function normalizarDataHoraEventoHistorico(dataHora: unknown): string {
  if (typeof dataHora === 'string' && dataHora.trim()) return dataHora.trim()
  return new Date().toISOString()
}

function normalizarEventoHistorico(evento: EventoHistoricoOS): EventoHistoricoOS {
  return {
    ...evento,
    id: evento.id?.trim() || gerarId(),
    titulo: evento.titulo?.trim() || 'Evento da OS',
    data_hora: normalizarDataHoraEventoHistorico(evento.data_hora),
  }
}

export function criarEventoHistoricoOS(
  evento: Omit<EventoHistoricoOS, 'id' | 'data_hora'> & { data_hora?: string }
): EventoHistoricoOS {
  return normalizarEventoHistorico({
    id: gerarId(),
    ...evento,
    data_hora: normalizarDataHoraEventoHistorico(evento.data_hora),
  })
}

export function criarEventoCriacaoOS(
  os: Pick<OrdemServico, 'modo_documento' | 'numero'>,
  usuario?: UsuarioHistoricoOS
): EventoHistoricoOS {
  const nome = usuario?.nome?.trim() || 'Usuário'
  const titulo = ehDocumentoOrcamento(os)
    ? `Orçamento #${os.numero} criado por ${nome}`
    : `OS #${os.numero} criada por ${nome}`
  return criarEventoHistoricoOS({
    tipo: 'criacao',
    titulo,
    usuario_id: usuario?.id,
    usuario_nome: nome,
  })
}

export function criarEventoAlteracaoValorOS(input: {
  campo: string
  valorAnterior: number
  valorNovo: number
  usuario?: UsuarioHistoricoOS
  autorizadoPin?: boolean
  detalhe?: string
}): EventoHistoricoOS {
  const nome = input.usuario?.nome?.trim() || 'Usuário'
  const titulo = input.autorizadoPin
    ? `${nome} alterou ${input.campo} (autorizado via PIN)`
    : `${nome} alterou ${input.campo}`
  return criarEventoHistoricoOS({
    tipo: 'alteracao_valor',
    titulo,
    usuario_id: input.usuario?.id,
    usuario_nome: nome,
    autorizado_pin: input.autorizadoPin,
    campo: input.campo,
    valor_anterior: input.valorAnterior,
    valor_novo: input.valorNovo,
    detalhe: input.detalhe,
  })
}

export function criarEventoRegistroPagamentoOS(input: {
  valor: number
  usuario?: UsuarioHistoricoOS
  autorizadoPin?: boolean
  formaPagamento?: string
}): EventoHistoricoOS {
  const nome = input.usuario?.nome?.trim() || 'Usuário'
  const valorFmt = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(input.valor)
  const titulo = input.autorizadoPin
    ? `Pagamento de ${valorFmt} registrado por ${nome} com autorização`
    : `Pagamento de ${valorFmt} registrado por ${nome}`
  return criarEventoHistoricoOS({
    tipo: 'registro_pagamento',
    titulo,
    usuario_id: input.usuario?.id,
    usuario_nome: nome,
    autorizado_pin: input.autorizadoPin,
    valor_novo: input.valor,
    detalhe: input.formaPagamento?.trim() || undefined,
  })
}

export function criarEventoAlteracaoStatusOS(input: {
  statusAnteriorLabel: string
  statusNovoLabel: string
  usuario?: UsuarioHistoricoOS
}): EventoHistoricoOS {
  const nome = input.usuario?.nome?.trim() || 'Usuário'
  return criarEventoHistoricoOS({
    tipo: 'alteracao_status',
    titulo: `Status alterado para ${input.statusNovoLabel}`,
    usuario_id: input.usuario?.id,
    usuario_nome: nome,
    detalhe: `De ${input.statusAnteriorLabel} para ${input.statusNovoLabel}`,
  })
}

export function responsavelOSMudou(
  anterior: Pick<OrdemServico, 'responsavel_id' | 'responsavel'> | null | undefined,
  atual: Pick<OrdemServico, 'responsavel_id' | 'responsavel'>
): boolean {
  const idAntes = anterior?.responsavel_id?.trim() || ''
  const idDepois = atual.responsavel_id?.trim() || ''
  const nomeAntes = anterior?.responsavel?.trim() || ''
  const nomeDepois = atual.responsavel?.trim() || ''
  return idAntes !== idDepois || nomeAntes !== nomeDepois
}

export function criarEventoAtribuicaoResponsavelOS(input: {
  responsavelAnterior?: string
  responsavelNovo?: string
  usuario?: UsuarioHistoricoOS
}): EventoHistoricoOS {
  const nomeAtor = input.usuario?.nome?.trim() || 'Usuário'
  const novo = input.responsavelNovo?.trim()
  const anterior = input.responsavelAnterior?.trim()
  let titulo: string
  let detalhe: string | undefined
  if (novo && anterior) {
    titulo = `Responsável alterado para ${novo}`
    detalhe = `Antes: ${anterior}`
  } else if (novo) {
    titulo = `Responsável definido: ${novo}`
  } else if (anterior) {
    titulo = 'Responsável removido da OS'
    detalhe = `Antes: ${anterior}`
  } else {
    titulo = 'Responsável da OS atualizado'
  }
  return criarEventoHistoricoOS({
    tipo: 'atribuicao_responsavel',
    titulo,
    usuario_id: input.usuario?.id,
    usuario_nome: nomeAtor,
    detalhe,
  })
}

export function anexarEventosHistoricoOS(
  os: OrdemServico,
  eventos: EventoHistoricoOS[]
): Pick<OrdemServico, 'historico_eventos'> {
  if (eventos.length === 0) return {}
  return {
    historico_eventos: [...(os.historico_eventos ?? []), ...eventos],
  }
}

export function mesclarHistoricoEventos(
  existente: EventoHistoricoOS[] | undefined,
  novos: EventoHistoricoOS[] | undefined
): EventoHistoricoOS[] | undefined {
  if (!novos?.length) return existente
  return deduplicarHistoricoEventos([...(existente ?? []), ...novos])
}

function fingerprintEventoHistorico(evento: EventoHistoricoOS): string {
  const dataHora = normalizarDataHoraEventoHistorico(evento.data_hora)
  return [
    evento.tipo,
    evento.campo ?? '',
    evento.valor_anterior ?? '',
    evento.valor_novo ?? '',
    evento.usuario_id ?? evento.usuario_nome ?? '',
    dataHora.slice(0, 16),
    evento.titulo,
  ].join('|')
}

export function deduplicarHistoricoEventos(
  eventos: EventoHistoricoOS[] | undefined
): EventoHistoricoOS[] {
  if (!eventos?.length) return []
  const idsVistos = new Set<string>()
  const fingerprintsVistos = new Set<string>()
  const resultado: EventoHistoricoOS[] = []

  for (const eventoBruto of eventos) {
    const evento = normalizarEventoHistorico(eventoBruto)
    if (evento.id) {
      if (idsVistos.has(evento.id)) continue
      idsVistos.add(evento.id)
    }
    const fingerprint = fingerprintEventoHistorico(evento)
    if (fingerprintsVistos.has(fingerprint)) continue
    fingerprintsVistos.add(fingerprint)
    resultado.push(evento)
  }

  return resultado
}
