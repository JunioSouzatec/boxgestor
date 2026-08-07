/**
 * F4B — persistência de rascunhos fiscais (Supabase).
 * Sem emissão, XML, DANFE, número ou chave.
 */
import { getSupabaseClient, isSupabaseConfigured, getCraftPersistenceMode } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { aguardarSessaoAuthSupabase } from '@/lib/supabase-session-ready'
import { obterDadosFiscaisOficina } from '@/types/fiscal'
import {
  montarPayloadFiscalDraftDePreparacao,
  type FiscalDraft,
  type FiscalDraftOriginType,
  type FiscalDraftStatus,
} from '@/types/fiscal-draft'
import type { ItemProdutoPreparacao, ItemServicoPreparacao, PendenciaFiscalItem, PreparacaoNotaFiscal } from '@/types/fiscal-preparacao'
import type { ConfiguracaoOficina } from '@/types/oficina'

function tabelaInexistente(mensagem: string): boolean {
  const msg = mensagem.toLowerCase()
  return (
    msg.includes('does not exist') ||
    msg.includes('relation') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
  )
}

export function fiscalDraftDisponivel(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

async function resolverOfficeUuid(officeIdLocal: string): Promise<string | null> {
  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  return contexto?.officeUuid ?? null
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function rowParaDraft(row: Record<string, unknown>): FiscalDraft {
  return {
    id: String(row.id),
    office_id: String(row.office_id),
    local_id: row.local_id != null ? String(row.local_id) : undefined,
    origin_type: row.origin_type as FiscalDraftOriginType,
    origin_id: String(row.origin_id),
    origin_label: row.origin_label != null ? String(row.origin_label) : undefined,
    document_type_suggested:
      row.document_type_suggested != null ? String(row.document_type_suggested) : undefined,
    status: (row.status as FiscalDraftStatus) || 'draft',
    customer_id: row.customer_id != null ? String(row.customer_id) : null,
    customer_snapshot: asRecord(row.customer_snapshot),
    issuer_snapshot: asRecord(row.issuer_snapshot),
    items_snapshot: asArray<ItemProdutoPreparacao>(row.items_snapshot),
    services_snapshot: asArray<ItemServicoPreparacao>(row.services_snapshot),
    payment_snapshot: asRecord(row.payment_snapshot),
    issues_snapshot: asArray<PendenciaFiscalItem>(row.issues_snapshot),
    totals_snapshot: asRecord(row.totals_snapshot),
    notes: row.notes != null ? String(row.notes) : null,
    metadata: asRecord(row.metadata),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at != null ? String(row.deleted_at) : null,
  }
}

export async function listarRascunhosFiscais(
  officeIdLocal: string,
  opts?: { limite?: number }
): Promise<FiscalDraft[]> {
  if (!fiscalDraftDisponivel()) return []
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return []

  try {
    await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
    const { data, error } = await supabase
      .from('fiscal_drafts')
      .select('*')
      .eq('office_id', officeUuid)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(opts?.limite ?? 80)

    if (error) {
      if (tabelaInexistente(error.message)) return []
      throw error
    }
    return (data ?? []).map((r) => rowParaDraft(r as Record<string, unknown>))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (tabelaInexistente(msg)) return []
    throw e
  }
}

export async function obterRascunhoFiscalPorOrigem(
  officeIdLocal: string,
  originType: FiscalDraftOriginType,
  originId: string
): Promise<FiscalDraft | null> {
  if (!fiscalDraftDisponivel()) return null
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) return null

  try {
    await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
    const { data, error } = await supabase
      .from('fiscal_drafts')
      .select('*')
      .eq('office_id', officeUuid)
      .eq('origin_type', originType)
      .eq('origin_id', originId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      if (tabelaInexistente(error.message)) return null
      throw error
    }
    return data ? rowParaDraft(data as Record<string, unknown>) : null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (tabelaInexistente(msg)) return null
    throw e
  }
}

/**
 * Upsert por (office_id, origin_type, origin_id) ativo.
 * Atualiza snapshots se já existir rascunho.
 */
export async function salvarRascunhoFiscal(params: {
  officeIdLocal: string
  preparacao: PreparacaoNotaFiscal
  configuracao?: ConfiguracaoOficina | null
  notes?: string
}): Promise<FiscalDraft> {
  if (!fiscalDraftDisponivel()) {
    throw new Error('Persistência Supabase indisponível para rascunho fiscal.')
  }
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Cliente Supabase indisponível.')
  const officeUuid = await resolverOfficeUuid(params.officeIdLocal)
  if (!officeUuid) throw new Error('Oficina não vinculada ao Supabase.')

  await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })

  const oficina = obterDadosFiscaisOficina(params.configuracao)
  const payload = montarPayloadFiscalDraftDePreparacao(params.preparacao, {
    notes: params.notes,
    issuerSnapshot: {
      cnpj: oficina.cnpj ?? null,
      razao_social: oficina.razao_social ?? null,
      nome_fantasia: oficina.nome_fantasia ?? null,
      regime_tributario: oficina.regime_tributario ?? null,
      cidade: oficina.endereco?.cidade ?? null,
      uf: oficina.endereco?.uf ?? null,
      oficina_ok: params.preparacao.oficina_ok,
    },
  })

  const existente = await obterRascunhoFiscalPorOrigem(
    params.officeIdLocal,
    payload.origin_type,
    payload.origin_id
  )

  if (existente) {
    const { data, error } = await supabase
      .from('fiscal_drafts')
      .update({
        origin_label: payload.origin_label,
        document_type_suggested: payload.document_type_suggested,
        status: payload.status,
        customer_id: payload.customer_id,
        customer_snapshot: payload.customer_snapshot,
        issuer_snapshot: payload.issuer_snapshot,
        items_snapshot: payload.items_snapshot,
        services_snapshot: payload.services_snapshot,
        payment_snapshot: payload.payment_snapshot,
        issues_snapshot: payload.issues_snapshot,
        totals_snapshot: payload.totals_snapshot,
        notes: payload.notes,
        metadata: { ...existente.metadata, ...payload.metadata },
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', existente.id)
      .eq('office_id', officeUuid)
      .select('*')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Não foi possível atualizar o rascunho fiscal.')
    return rowParaDraft(data as Record<string, unknown>)
  }

  const { data, error } = await supabase
    .from('fiscal_drafts')
    .insert({
      office_id: officeUuid,
      local_id: payload.local_id ?? null,
      origin_type: payload.origin_type,
      origin_id: payload.origin_id,
      origin_label: payload.origin_label,
      document_type_suggested: payload.document_type_suggested,
      status: payload.status,
      customer_id: payload.customer_id,
      customer_snapshot: payload.customer_snapshot,
      issuer_snapshot: payload.issuer_snapshot,
      items_snapshot: payload.items_snapshot,
      services_snapshot: payload.services_snapshot,
      payment_snapshot: payload.payment_snapshot,
      issues_snapshot: payload.issues_snapshot,
      totals_snapshot: payload.totals_snapshot,
      notes: payload.notes,
      metadata: payload.metadata,
    } as never)
    .select('*')
    .maybeSingle()

  if (error) {
    if (tabelaInexistente(error.message)) {
      throw new Error(
        'Tabela fiscal_drafts ainda não existe no Supabase. Aplique a migration F4B antes de salvar rascunhos.'
      )
    }
    throw error
  }
  if (!data) throw new Error('Não foi possível salvar o rascunho fiscal.')
  return rowParaDraft(data as Record<string, unknown>)
}

export async function excluirRascunhoFiscal(
  officeIdLocal: string,
  draftId: string
): Promise<void> {
  if (!fiscalDraftDisponivel()) {
    throw new Error('Persistência Supabase indisponível.')
  }
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Cliente Supabase indisponível.')
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) throw new Error('Oficina não vinculada ao Supabase.')

  await aguardarSessaoAuthSupabase({ tentativas: 6, silencioso: true })
  const agora = new Date().toISOString()
  const { error } = await supabase
    .from('fiscal_drafts')
    .update({ deleted_at: agora, updated_at: agora } as never)
    .eq('id', draftId)
    .eq('office_id', officeUuid)
    .is('deleted_at', null)

  if (error) throw error
}

/** Reabre o rascunho salvo como preparação visual (somente leitura/validação). */
export function preparacaoDeRascunhoFiscal(draft: FiscalDraft): PreparacaoNotaFiscal {
  const origem = draft.origin_type === 'counter_sale' ? 'venda_balcao' : 'ordem_servico'
  const statusPrep =
    draft.status === 'ready_to_prepare'
      ? 'pronta_para_preparar'
      : draft.status === 'with_issues'
        ? 'com_pendencias'
        : 'nao_preparada'

  const tipo =
    (draft.document_type_suggested as PreparacaoNotaFiscal['tipo_sugerido']) || 'nfc_e_nf_e'
  const tipoLabel =
    typeof draft.totals_snapshot.tipo_sugerido_label === 'string'
      ? String(draft.totals_snapshot.tipo_sugerido_label)
      : tipo

  return {
    origem,
    origem_id: draft.origin_id,
    origem_label: draft.origin_label || draft.origin_id,
    cliente_nome:
      typeof draft.customer_snapshot.nome === 'string'
        ? String(draft.customer_snapshot.nome)
        : undefined,
    cliente_id: draft.customer_id ?? undefined,
    consumidor_nao_identificado: Boolean(draft.customer_snapshot.consumidor_nao_identificado),
    data:
      typeof draft.payment_snapshot.data === 'string'
        ? String(draft.payment_snapshot.data)
        : draft.updated_at,
    valor_total: Number(draft.payment_snapshot.valor_total ?? draft.totals_snapshot.valor_total) || 0,
    status_financeiro_label:
      typeof draft.payment_snapshot.status_financeiro_label === 'string'
        ? String(draft.payment_snapshot.status_financeiro_label)
        : '—',
    pagamento_pendente: Boolean(draft.payment_snapshot.pagamento_pendente),
    forma_pagamento:
      typeof draft.payment_snapshot.forma_pagamento === 'string'
        ? String(draft.payment_snapshot.forma_pagamento)
        : undefined,
    desconto: Number(draft.payment_snapshot.desconto ?? 0) || 0,
    tipo_sugerido: tipo,
    tipo_sugerido_label: tipoLabel,
    status: statusPrep,
    status_label:
      typeof draft.totals_snapshot.status_label === 'string'
        ? String(draft.totals_snapshot.status_label)
        : statusPrep,
    produtos: draft.items_snapshot,
    servicos: draft.services_snapshot,
    pendencias: draft.issues_snapshot,
    avisos: Array.isArray(draft.metadata.avisos)
      ? (draft.metadata.avisos as string[])
      : [
          'Rascunho fiscal salvo. Esta ação ainda não emite nota.',
          'Confirme os dados fiscais com o contador antes de emitir.',
        ],
    oficina_ok: Boolean(draft.metadata.oficina_ok ?? draft.issuer_snapshot.oficina_ok),
    cliente_ok: Boolean(draft.customer_snapshot.cliente_ok),
    produtos_ok: Boolean(draft.metadata.produtos_ok),
    servicos_ok: Boolean(draft.metadata.servicos_ok),
  }
}
