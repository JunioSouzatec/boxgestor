import {
  indiceFksTecnicasDoSelect,
  repararFksTecnicasAgendaPorMesmoId,
  refsTecnicasConfirmadasParaCanon,
  type AgendaFksTecnicasRemotas,
  type AgendaRefsTecnicasConfirmadas,
} from '@/services/agenda/agenda-fk-canonico'
import { mesclarAgendamentos } from '@/services/agenda/agenda-merge'
import { logAgendaOrigem } from '@/services/agenda/agenda-origem-log'
import type { Agendamento } from '@/types'

export type OperacaoAgendaPush = 'create' | 'update' | 'delete'

export type AgendaPushEtapa =
  | 'ok'
  | 'offline'
  | 'sync_desabilitado'
  | 'select_falhou'
  | 'mapper_falhou'
  | 'upsert_falhou'
  | 'upsert_parcial'
  | 'excecao'

export interface AgendaFkId {
  appointmentId: string
  clienteIdEntrada?: string
  customerId: string
  customerIdFinal?: string
  motoIdEntrada?: string
  motorcycleId: string
  motorcycleIdFinal?: string
  serviceOrderId?: string | null
}

export function montarAgendaFkId(
  ag: { id: string; cliente_id?: string; moto_id?: string; ordem_servico_id?: string },
  row: {
    id?: unknown
    customer_id?: unknown
    motorcycle_id?: unknown
    service_order_id?: unknown
  }
): AgendaFkId {
  const customerFinal = String(row.customer_id ?? '')
  const motorcycleFinal = String(row.motorcycle_id ?? '')
  const osRaw = row.service_order_id
  const serviceOrderId =
    osRaw == null || String(osRaw).trim() === '' ? null : String(osRaw)
  return {
    appointmentId: String(row.id ?? ag.id),
    clienteIdEntrada: ag.cliente_id,
    customerId: customerFinal,
    customerIdFinal: customerFinal,
    motoIdEntrada: ag.moto_id,
    motorcycleId: motorcycleFinal,
    motorcycleIdFinal: motorcycleFinal,
    serviceOrderId,
  }
}

export interface AgendaPushResult {
  ok: boolean
  etapa: AgendaPushEtapa
  motivo?: string
  tentativaId: string
  enviados?: number
  erros?: number
  trailing?: boolean
  supabaseCode?: string
  supabaseMessage?: string
  supabaseDetails?: string
  supabaseHint?: string
  loteIds?: string[]
  loteTamanho?: number
  fkIds?: AgendaFkId[]
}

export interface ResultadoSelectAgenda {
  ok: boolean
  dados: Agendamento[] | null
  erros: { mensagem?: string; codigo?: string }[]
  fksTecnicasPorId?: Record<string, AgendaFksTecnicasRemotas>
}

export interface ErroAgendaRemoto {
  mensagem?: string
  codigo?: string
  details?: string
  hint?: string
}

export interface ResultadoUpsertAgenda {
  ok: boolean
  enviados: number
  erros: ErroAgendaRemoto[]
  loteIds?: string[]
  loteTamanho?: number
  fkIds?: AgendaFkId[]
}

export interface ExecutarPushAgendamentosInput {
  officeId: string
  habilitado: boolean
  online: boolean
  locais: Agendamento[]
  carregarRemoto: () => Promise<ResultadoSelectAgenda>
  persistir: (agendamentos: Agendamento[]) => Promise<ResultadoUpsertAgenda>
  salvarLocal?: (mesclados: Agendamento[]) => void
  contarFila: () => number
  enfileirar: (motivo: string) => void
  marcarSincronizados: (agendamentos: Agendamento[]) => void
  canonicalizarRefsLocais?: (refs: AgendaRefsTecnicasConfirmadas[]) => void
  tentativaId?: string
  trailing?: boolean
}

export function criarTentativaIdAgenda(): string {
  return `ag${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function resultadoExcecaoAgenda(tentativaId?: string): AgendaPushResult {
  return {
    ok: false,
    etapa: 'excecao',
    motivo: 'excecao',
    tentativaId: tentativaId ?? criarTentativaIdAgenda(),
    enviados: 0,
    erros: 1,
  }
}

export function logAgendaPush(detalhe: Record<string, unknown>): void {
  console.info('[BoxGestor Agenda][push]', detalhe)
}

export function sanitizarTextoErroAgenda(
  texto?: string | null
): string | undefined {
  if (!texto?.trim()) return undefined
  const limpo = texto
    .replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, '[redacted]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[redacted]')
    .replace(/\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/gi, '[redacted]')
    .replace(/https?:\/\/[^\s]+/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
  return limpo || undefined
}

export function extrairErroSupabaseAgenda(
  erros?: ErroAgendaRemoto[]
): Pick<
  AgendaPushResult,
  'supabaseCode' | 'supabaseMessage' | 'supabaseDetails' | 'supabaseHint'
> {
  const primeiro = erros?.[0]
  if (!primeiro) return {}
  return {
    supabaseCode: primeiro.codigo || undefined,
    supabaseMessage: sanitizarTextoErroAgenda(primeiro.mensagem),
    supabaseDetails: sanitizarTextoErroAgenda(primeiro.details),
    supabaseHint: sanitizarTextoErroAgenda(primeiro.hint),
  }
}

export function resumirErroTecnico(
  erros: ErroAgendaRemoto[] | undefined
): string | undefined {
  const sanitizado = extrairErroSupabaseAgenda(erros)
  const codigo = sanitizado.supabaseCode ? `${sanitizado.supabaseCode}:` : ''
  return `${codigo}${sanitizado.supabaseMessage ?? ''}`.slice(0, 160) || undefined
}

export function inferirOperacaoAgenda(
  ag: Agendamento,
  remotoIds: Set<string>,
  selectOk = true
): OperacaoAgendaPush {
  if (ag.deleted_at) return 'delete'
  if (!selectOk) return 'update'
  return remotoIds.has(ag.id) ? 'update' : 'create'
}

function classificarFalhaPersistencia(
  resultado: ResultadoUpsertAgenda
): Extract<AgendaPushEtapa, 'mapper_falhou' | 'upsert_falhou' | 'upsert_parcial'> {
  const enviados = resultado.enviados ?? 0
  if (enviados > 0) return 'upsert_parcial'
  const mapper = (resultado.erros ?? []).some((e) => {
    const msg = `${e.codigo ?? ''} ${e.mensagem ?? ''}`.toLowerCase()
    return msg.includes('uuid válido') || msg.includes('mapear')
  })
  return mapper ? 'mapper_falhou' : 'upsert_falhou'
}

function resultadoBase(
  tentativaId: string,
  trailing: boolean | undefined,
  parcial: Partial<AgendaPushResult>
): AgendaPushResult {
  return { tentativaId, trailing: Boolean(trailing), ...parcial } as AgendaPushResult
}

export async function executarPushAgendamentos(
  input: ExecutarPushAgendamentosInput
): Promise<AgendaPushResult> {
  const {
    officeId,
    habilitado,
    online,
    locais,
    carregarRemoto,
    persistir,
    salvarLocal,
    contarFila,
    enfileirar,
    marcarSincronizados,
    canonicalizarRefsLocais,
    trailing,
  } = input
  const tentativaId = input.tentativaId ?? criarTentativaIdAgenda()
  const inicioMs = Date.now()

  const finalizar = (parcial: Partial<AgendaPushResult>): AgendaPushResult =>
    resultadoBase(tentativaId, trailing, {
      ...parcial,
      motivo: parcial.motivo,
    })

  try {
    if (!habilitado) {
      const result = finalizar({
        ok: false,
        etapa: 'sync_desabilitado',
        motivo: 'sync_desabilitado',
        enviados: 0,
        erros: 0,
      })
      logAgendaPush({
        tentativaId,
        officeId,
        etapa: 'sync_desabilitado',
        trailing: Boolean(trailing),
        quantidade_local: locais.length,
        online,
        duracao_ms: Date.now() - inicioMs,
      })
      return result
    }

    logAgendaPush({
      tentativaId,
      officeId,
      etapa: 'inicio',
      trailing: Boolean(trailing),
      online,
      quantidade_local: locais.length,
      fila_antes: contarFila(),
    })

    if (!online) {
      enfileirar('offline')
      const result = finalizar({
        ok: false,
        etapa: 'offline',
        motivo: 'offline',
        enviados: 0,
        erros: 0,
      })
      logAgendaPush({
        tentativaId,
        officeId,
        etapa: 'offline',
        trailing: Boolean(trailing),
        item_enfileirado: true,
        fila_depois: contarFila(),
        duracao_ms: Date.now() - inicioMs,
      })
      return result
    }

    logAgendaPush({
      tentativaId,
      officeId,
      etapa: 'select_inicio',
      trailing: Boolean(trailing),
    })
    const selectInicioMs = Date.now()
    const remoto = await carregarRemoto()
    const selectOk = Boolean(remoto.ok && remoto.dados)
    logAgendaPush({
      tentativaId,
      officeId,
      etapa: 'select_fim',
      trailing: Boolean(trailing),
      ok: selectOk,
      quantidade_remota: remoto.dados?.length ?? 0,
      erro: resumirErroTecnico(remoto.erros),
      duracao_ms: Date.now() - selectInicioMs,
    })

    if (!selectOk || !remoto.dados) {
      enfileirar('select_falhou')
      const result = finalizar({
        ok: false,
        etapa: 'select_falhou',
        motivo: 'select_falhou',
        enviados: 0,
        erros: remoto.erros?.length ?? 1,
      })
      logAgendaPush({
        tentativaId,
        officeId,
        etapa: 'select_falhou',
        trailing: Boolean(trailing),
        item_enfileirado: true,
        upserts: 0,
        erro: resumirErroTecnico(remoto.erros),
        fila_depois: contarFila(),
        duracao_ms: Date.now() - inicioMs,
      })
      return result
    }

    const paraEnviar = mesclarAgendamentos(locais, remoto.dados)
    salvarLocal?.(paraEnviar)
    logAgendaOrigem({
      etapa: 'push_merge_final',
      agendamentos: paraEnviar,
      source: 'merge_locais_remoto',
      tentativaId,
      trailing,
      extra: {
        pushSnapshotTemD719: locais.some((a) => a.id.startsWith('d71945fa')),
      },
    })
    logAgendaPush({
      tentativaId,
      officeId,
      etapa: 'merge',
      trailing: Boolean(trailing),
      quantidade: paraEnviar.length,
    })

    const remotoIds = new Set(remoto.dados.map((ag) => ag.id))
    logAgendaPush({
      tentativaId,
      officeId,
      etapa: 'operacoes',
      trailing: Boolean(trailing),
      operacoes: paraEnviar.map((ag) => ({
        id: ag.id,
        operacao: inferirOperacaoAgenda(ag, remotoIds, true),
      })),
    })

    const indiceFks = indiceFksTecnicasDoSelect(remoto)
    const paraPersistir = paraEnviar.map((ag) =>
      repararFksTecnicasAgendaPorMesmoId(ag, indiceFks.get(ag.id))
    )
    const reparosFk = paraPersistir.filter((ag, i) => {
      const original = paraEnviar[i]
      return (
        original != null &&
        (ag.cliente_id !== original.cliente_id ||
          ag.moto_id !== original.moto_id ||
          (ag.ordem_servico_id ?? '') !== (original.ordem_servico_id ?? ''))
      )
    }).length
    logAgendaPush({
      tentativaId,
      officeId,
      etapa: 'reparo_fk_mesmo_id',
      trailing: Boolean(trailing),
      reparos: reparosFk,
    })

    logAgendaPush({
      tentativaId,
      officeId,
      etapa: 'upsert_inicio',
      trailing: Boolean(trailing),
      esperados: paraPersistir.length,
    })
    const upsertInicioMs = Date.now()
    const resultado = await persistir(paraPersistir)
    const snapshotConfirmado =
      resultado.ok && (resultado.erros?.length ?? 0) === 0
    const mapperErros = (resultado.erros ?? []).filter((e) => {
      const msg = `${e.codigo ?? ''} ${e.mensagem ?? ''}`.toLowerCase()
      return msg.includes('uuid válido') || msg.includes('mapear')
    }).length
    logAgendaPush({
      tentativaId,
      officeId,
      etapa: 'upsert_fim',
      trailing: Boolean(trailing),
      ok: resultado.ok,
      enviados: resultado.enviados,
      esperados: paraEnviar.length,
      erros: resultado.erros?.length ?? 0,
      mapper_erros: mapperErros,
      erro: resumirErroTecnico(resultado.erros),
      duracao_ms: Date.now() - upsertInicioMs,
    })

    const erroSupabase = extrairErroSupabaseAgenda(resultado.erros)
    const loteIds = resultado.loteIds ?? paraEnviar.map((ag) => ag.id)
    const loteTamanho = resultado.loteTamanho ?? paraEnviar.length
    const fkIds = resultado.fkIds

    if (snapshotConfirmado) {
      marcarSincronizados(paraEnviar)
      const refsCanon = refsTecnicasConfirmadasParaCanon(fkIds, paraPersistir)
      if (refsCanon.length > 0 && canonicalizarRefsLocais) {
        try {
          canonicalizarRefsLocais(refsCanon)
        } catch {
          logAgendaPush({
            tentativaId,
            officeId,
            etapa: 'canon_local_falhou',
            trailing: Boolean(trailing),
          })
        }
      }
      const result = finalizar({
        ok: true,
        etapa: 'ok',
        motivo: 'ok',
        enviados: resultado.enviados,
        erros: 0,
        loteIds,
        loteTamanho,
        fkIds,
      })
      logAgendaPush({
        tentativaId,
        officeId,
        etapa: 'ok',
        trailing: Boolean(trailing),
        item_enfileirado: false,
        enviados: resultado.enviados,
        fila_depois: contarFila(),
        duracao_ms: Date.now() - inicioMs,
      })
      return result
    }

    const etapa = classificarFalhaPersistencia(resultado)
    const motivoFila = resultado.enviados > 0 ? 'upsert_parcial' : 'upsert_falhou'
    enfileirar(motivoFila)
    const result = finalizar({
      ok: false,
      etapa,
      motivo: etapa,
      enviados: resultado.enviados,
      erros: resultado.erros?.length ?? 0,
      loteIds,
      loteTamanho,
      fkIds,
      ...erroSupabase,
    })
    logAgendaPush({
      tentativaId,
      officeId,
      etapa,
      trailing: Boolean(trailing),
      item_enfileirado: true,
      enviados: resultado.enviados,
      erros: resultado.erros?.length ?? 0,
      erro: resumirErroTecnico(resultado.erros),
      supabaseCode: erroSupabase.supabaseCode,
      lote_tamanho: loteTamanho,
      lote_ids: loteIds,
      fk_ids: fkIds,
      fila_depois: contarFila(),
      duracao_ms: Date.now() - inicioMs,
    })
    return result
  } catch {
    const result = finalizar({
      ok: false,
      etapa: 'excecao',
      motivo: 'excecao',
      enviados: 0,
      erros: 1,
    })
    logAgendaPush({
      tentativaId,
      officeId,
      etapa: 'excecao',
      trailing: Boolean(trailing),
      duracao_ms: Date.now() - inicioMs,
    })
    return result
  }
}

export async function processarRetryAgendamentos(input: {
  officeId: string
  quantidadePendentes: number
  publicar: () => Promise<AgendaPushResult>
  marcarItensSincronizados: () => void
  contarFila: () => number
}): Promise<boolean> {
  logAgendaPush({
    officeId: input.officeId,
    etapa: 'retry_iniciado',
    quantidade: input.quantidadePendentes,
  })

  if (input.quantidadePendentes === 0) {
    logAgendaPush({
      officeId: input.officeId,
      etapa: 'retry_concluido',
      ok: true,
      sem_pendentes: true,
    })
    return true
  }

  const resultado = await input.publicar()
  if (resultado.ok) input.marcarItensSincronizados()

  logAgendaPush({
    officeId: input.officeId,
    etapa: 'retry_concluido',
    ok: resultado.ok,
    etapa_push: resultado.etapa,
    tentativaId: resultado.tentativaId,
    fila_depois: input.contarFila(),
  })
  return resultado.ok
}
