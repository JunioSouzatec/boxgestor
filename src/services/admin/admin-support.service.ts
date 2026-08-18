/**
 * Admin Suporte — Raio-X da oficina (somente leitura).
 * Não altera dados. Não expõe craft_meta bruto nem tokens.
 */
import { getSupabaseClient } from '@/lib/supabase'
import {
  AdminRpcTimeoutError,
  executarComTimeoutAdmin,
  logErroAdmin,
} from '@/lib/admin-env'
import {
  carregarDetalhesOficinaAdmin,
  carregarOrdensOficinaAdmin,
  type AdminOfficeDetalhes,
  type AdminOfficeResumoItem,
  type AdminOfficeUsuario,
} from '@/services/admin/admin-office-details.service'
import { carregarTipoOficinaAdmin } from '@/services/admin/admin-tipo-oficina.service'
import { carregarModuloFiscalAdicionalAdmin } from '@/services/admin/admin-fiscal-addon.service'
import type { OficinaRegistro } from '@/services/assinatura/office-registry.service'
import type { TipoOficina } from '@/types/tipo-oficina'

const TIMEOUT_MS = 25_000

export interface AdminSupportPaymentRow {
  payment_id: string
  payment_date?: string | null
  payment_created_at?: string | null
  amount: number
  payment_method?: string | null
  status: string
  notes?: string | null
  service_order_id?: string | null
  service_order_number?: number | null
  service_order_status?: string | null
  customer_name?: string | null
  vehicle_name?: string | null
  vehicle_plate?: string | null
  received_by_user_id?: string | null
  received_by_name?: string | null
  authorized_by_name?: string | null
  cash_session_id?: string | null
  cash_session_status?: string | null
  cash_movement_id?: string | null
  cash_movement_type?: string | null
  financial_transaction_id?: string | null
  financial_transaction_status?: string | null
  is_canceled: boolean
  canceled_at?: string | null
  canceled_by?: string | null
  is_refund_or_reversal: boolean
  origem_texto: string
}

export interface AdminSupportRaioX {
  oficina: OficinaRegistro
  detalhes: AdminOfficeDetalhes
  tipo_oficina?: TipoOficina
  fiscal_adicional: boolean
  usuarios: AdminOfficeUsuario[]
  ordens: AdminOfficeResumoItem[]
  pagamentos: AdminSupportPaymentRow[]
  estoque_amostra: AdminOfficeResumoItem[]
  erro_pagamentos?: string | null
  caixa?: AdminSupportCashOverview | null
  erro_caixa?: string | null
  estoque?: AdminSupportInventoryOverview | null
  erro_estoque?: string | null
  portal?: AdminSupportApprovalsOverview | null
  erro_portal?: string | null
}

export interface AdminSupportCashSessionResumo {
  session_id: string
  status?: string | null
  opened_at?: string | null
  closed_at?: string | null
  opened_by_name?: string | null
  closed_by_name?: string | null
  opening_balance?: number | null
  entradas?: number | null
  saidas?: number | null
  expected_balance?: number | null
  closing_balance_informed?: number | null
  difference?: number | null
  aberto_ha_horas?: number | null
}

export interface AdminSupportCashMovement {
  movement_id: string
  created_at?: string | null
  movement_type?: string | null
  tipo_fluxo?: string | null
  amount: number
  payment_method?: string | null
  descricao?: string | null
  origem_texto: string
  cash_session_id?: string | null
  service_order_number?: number | null
  customer_name?: string | null
  vehicle_name?: string | null
  vehicle_plate?: string | null
  created_by_name?: string | null
}

export interface AdminSupportCashOverview {
  tem_caixa_aberto: boolean
  sessao_aberta: AdminSupportCashSessionResumo | null
  ultimo_fechado: AdminSupportCashSessionResumo | null
  movimentos: AdminSupportCashMovement[]
  alertas: {
    pagamentos_sem_movimento_caixa: number
    movimentos_sem_sessao: number
    caixa_aberto_ha_mais_de_24h: boolean
    ultimo_fechado_com_divergencia: boolean
  }
}

export interface AdminSupportInventoryItemCritico {
  item_id: string
  name: string
  code?: string | null
  quantity: number
  minimum_stock: number
  sale_price?: number | null
  cost?: number | null
  status: string
  active?: boolean
  deleted?: boolean
}

export interface AdminSupportInventoryMovement {
  movement_id: string
  created_at?: string | null
  movement_date?: string | null
  movement_type?: string | null
  quantity: number
  item_name?: string | null
  item_code?: string | null
  origem_texto: string
  service_order_number?: number | null
  user_name?: string | null
  reason?: string | null
}

export interface AdminSupportInventoryOverview {
  resumo: {
    total_itens: number
    total_ativos: number
    estoque_baixo: number
    zerados: number
    inativos_ou_deletados: number
    valor_estimado_venda: number
  }
  itens_criticos: AdminSupportInventoryItemCritico[]
  movimentos: AdminSupportInventoryMovement[]
}

export interface AdminSupportApprovalLink {
  approval_link_id: string
  created_at?: string | null
  expires_at?: string | null
  respondido_em?: string | null
  sent_at?: string | null
  status: string
  tipo_resposta?: string | null
  orcamento_numero?: number | null
  orcamento_status?: string | null
  total?: number | null
  customer_name?: string | null
  vehicle_name?: string | null
  vehicle_plate?: string | null
  converted_os_number?: number | null
  convertido: boolean
  response_name?: string | null
  response_note_preview?: string | null
}

export interface AdminSupportApprovalsOverview {
  resumo: {
    total: number
    pendentes: number
    aprovados: number
    aprovados_parcialmente: number
    recusados: number
    expirados: number
    revogados: number
    convertidos: number
  }
  links: AdminSupportApprovalLink[]
  alertas: {
    pendentes_expirados: number
    aprovados_sem_conversao: number
    aprovados_parciais: number
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}

function asBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 't' || v === 1
}

function mapPaymentRow(raw: unknown): AdminSupportPaymentRow | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = asString(r.payment_id) ?? asString(r.id)
  if (!id) return null
  const amount = asNumber(r.amount) ?? 0
  return {
    payment_id: id,
    payment_date: asString(r.payment_date),
    payment_created_at: asString(r.payment_created_at),
    amount,
    payment_method: asString(r.payment_method) ?? asString(r.forma),
    status: asString(r.status) ?? 'pago',
    notes: asString(r.notes),
    service_order_id: asString(r.service_order_id),
    service_order_number: asNumber(r.service_order_number) ?? null,
    service_order_status: asString(r.service_order_status),
    customer_name: asString(r.customer_name),
    vehicle_name: asString(r.vehicle_name),
    vehicle_plate: asString(r.vehicle_plate),
    received_by_user_id: asString(r.received_by_user_id),
    received_by_name: asString(r.received_by_name),
    authorized_by_name: asString(r.authorized_by_name),
    cash_session_id: asString(r.cash_session_id),
    cash_session_status: asString(r.cash_session_status),
    cash_movement_id: asString(r.cash_movement_id),
    cash_movement_type: asString(r.cash_movement_type),
    financial_transaction_id: asString(r.financial_transaction_id),
    financial_transaction_status: asString(r.financial_transaction_status),
    is_canceled: asBool(r.is_canceled),
    canceled_at: asString(r.canceled_at),
    canceled_by: asString(r.canceled_by),
    is_refund_or_reversal: asBool(r.is_refund_or_reversal),
    origem_texto: asString(r.origem_texto) ?? 'Origem não identificada',
  }
}

export async function listarPagamentosSuporteOficina(
  officeId: string,
  limit = 100,
  offset = 0
): Promise<AdminSupportPaymentRow[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase não configurado.')

  const id = officeId.trim()
  try {
    const { data, error } = await executarComTimeoutAdmin(
      'admin_support_list_office_payments',
      async () =>
        supabase.rpc('admin_support_list_office_payments', {
          p_office_id: id,
          p_limit: limit,
          p_offset: offset,
        } as never),
      TIMEOUT_MS
    )
    if (error) {
      logErroAdmin('admin_support_list_office_payments', error)
      throw new Error(error.message || 'Falha ao carregar pagamentos de suporte.')
    }
    const rows = Array.isArray(data) ? data : []
    return rows.map(mapPaymentRow).filter((r): r is AdminSupportPaymentRow => r != null)
  } catch (e) {
    if (e instanceof AdminRpcTimeoutError) throw e
    throw e
  }
}

function mapCashSession(raw: unknown): AdminSupportCashSessionResumo | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = asString(r.session_id)
  if (!id) return null
  return {
    session_id: id,
    status: asString(r.status),
    opened_at: asString(r.opened_at),
    closed_at: asString(r.closed_at),
    opened_by_name: asString(r.opened_by_name),
    closed_by_name: asString(r.closed_by_name),
    opening_balance: asNumber(r.opening_balance),
    entradas: asNumber(r.entradas),
    saidas: asNumber(r.saidas),
    expected_balance: asNumber(r.expected_balance),
    closing_balance_informed: asNumber(r.closing_balance_informed),
    difference: asNumber(r.difference),
    aberto_ha_horas: asNumber(r.aberto_ha_horas),
  }
}

function mapCashMovement(raw: unknown): AdminSupportCashMovement | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = asString(r.movement_id)
  if (!id) return null
  return {
    movement_id: id,
    created_at: asString(r.created_at),
    movement_type: asString(r.movement_type),
    tipo_fluxo: asString(r.tipo_fluxo),
    amount: asNumber(r.amount) ?? 0,
    payment_method: asString(r.payment_method),
    descricao: asString(r.descricao),
    origem_texto: asString(r.origem_texto) ?? 'Origem não identificada',
    cash_session_id: asString(r.cash_session_id),
    service_order_number: asNumber(r.service_order_number),
    customer_name: asString(r.customer_name),
    vehicle_name: asString(r.vehicle_name),
    vehicle_plate: asString(r.vehicle_plate),
    created_by_name: asString(r.created_by_name),
  }
}

export async function carregarCaixaSuporteOficina(
  officeId: string,
  limit = 50
): Promise<AdminSupportCashOverview> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await executarComTimeoutAdmin(
    'admin_support_get_office_cash_overview',
    async () =>
      supabase.rpc('admin_support_get_office_cash_overview', {
        p_office_id: officeId.trim(),
        p_limit: limit,
      } as never),
    TIMEOUT_MS
  )
  if (error) {
    logErroAdmin('admin_support_get_office_cash_overview', error)
    throw new Error(error.message || 'Falha ao carregar caixa de suporte.')
  }
  const payload = asRecord(data) ?? {}
  const alertas = asRecord(payload.alertas) ?? {}
  const movimentos = Array.isArray(payload.movimentos) ? payload.movimentos : []
  return {
    tem_caixa_aberto: asBool(payload.tem_caixa_aberto),
    sessao_aberta: mapCashSession(payload.sessao_aberta),
    ultimo_fechado: mapCashSession(payload.ultimo_fechado),
    movimentos: movimentos
      .map(mapCashMovement)
      .filter((m): m is AdminSupportCashMovement => m != null),
    alertas: {
      pagamentos_sem_movimento_caixa: asNumber(alertas.pagamentos_sem_movimento_caixa) ?? 0,
      movimentos_sem_sessao: asNumber(alertas.movimentos_sem_sessao) ?? 0,
      caixa_aberto_ha_mais_de_24h: asBool(alertas.caixa_aberto_ha_mais_de_24h),
      ultimo_fechado_com_divergencia: asBool(alertas.ultimo_fechado_com_divergencia),
    },
  }
}

function mapInventoryCritico(raw: unknown): AdminSupportInventoryItemCritico | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = asString(r.item_id)
  const name = asString(r.name)
  if (!id || !name) return null
  return {
    item_id: id,
    name,
    code: asString(r.code),
    quantity: asNumber(r.quantity) ?? 0,
    minimum_stock: asNumber(r.minimum_stock) ?? 0,
    sale_price: asNumber(r.sale_price),
    cost: asNumber(r.cost),
    status: asString(r.status) ?? 'normal',
    active: r.active == null ? undefined : asBool(r.active),
    deleted: r.deleted == null ? undefined : asBool(r.deleted),
  }
}

function mapInventoryMovement(raw: unknown): AdminSupportInventoryMovement | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = asString(r.movement_id)
  if (!id) return null
  return {
    movement_id: id,
    created_at: asString(r.created_at),
    movement_date: asString(r.movement_date),
    movement_type: asString(r.movement_type),
    quantity: asNumber(r.quantity) ?? 0,
    item_name: asString(r.item_name),
    item_code: asString(r.item_code),
    origem_texto: asString(r.origem_texto) ?? 'Origem não identificada',
    service_order_number: asNumber(r.service_order_number),
    user_name: asString(r.user_name),
    reason: asString(r.reason),
  }
}

export async function carregarEstoqueSuporteOficina(
  officeId: string,
  limit = 50
): Promise<AdminSupportInventoryOverview> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await executarComTimeoutAdmin(
    'admin_support_get_office_inventory_overview',
    async () =>
      supabase.rpc('admin_support_get_office_inventory_overview', {
        p_office_id: officeId.trim(),
        p_limit: limit,
      } as never),
    TIMEOUT_MS
  )
  if (error) {
    logErroAdmin('admin_support_get_office_inventory_overview', error)
    throw new Error(error.message || 'Falha ao carregar estoque de suporte.')
  }
  const payload = asRecord(data) ?? {}
  const resumo = asRecord(payload.resumo) ?? {}
  const criticos = Array.isArray(payload.itens_criticos) ? payload.itens_criticos : []
  const movimentos = Array.isArray(payload.movimentos) ? payload.movimentos : []
  return {
    resumo: {
      total_itens: asNumber(resumo.total_itens) ?? 0,
      total_ativos: asNumber(resumo.total_ativos) ?? 0,
      estoque_baixo: asNumber(resumo.estoque_baixo) ?? 0,
      zerados: asNumber(resumo.zerados) ?? 0,
      inativos_ou_deletados: asNumber(resumo.inativos_ou_deletados) ?? 0,
      valor_estimado_venda: asNumber(resumo.valor_estimado_venda) ?? 0,
    },
    itens_criticos: criticos
      .map(mapInventoryCritico)
      .filter((i): i is AdminSupportInventoryItemCritico => i != null),
    movimentos: movimentos
      .map(mapInventoryMovement)
      .filter((m): m is AdminSupportInventoryMovement => m != null),
  }
}

function mapApprovalLink(raw: unknown): AdminSupportApprovalLink | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = asString(r.approval_link_id)
  if (!id) return null
  return {
    approval_link_id: id,
    created_at: asString(r.created_at),
    expires_at: asString(r.expires_at),
    respondido_em: asString(r.respondido_em),
    sent_at: asString(r.sent_at),
    status: asString(r.status) ?? 'pendente',
    tipo_resposta: asString(r.tipo_resposta),
    orcamento_numero: asNumber(r.orcamento_numero),
    orcamento_status: asString(r.orcamento_status),
    total: asNumber(r.total),
    customer_name: asString(r.customer_name),
    vehicle_name: asString(r.vehicle_name),
    vehicle_plate: asString(r.vehicle_plate),
    converted_os_number: asNumber(r.converted_os_number),
    convertido: asBool(r.convertido),
    response_name: asString(r.response_name),
    response_note_preview: asString(r.response_note_preview),
  }
}

export async function carregarPortalSuporteOficina(
  officeId: string,
  limit = 50,
  offset = 0
): Promise<AdminSupportApprovalsOverview> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await executarComTimeoutAdmin(
    'admin_support_list_office_approval_links',
    async () =>
      supabase.rpc('admin_support_list_office_approval_links', {
        p_office_id: officeId.trim(),
        p_limit: limit,
        p_offset: offset,
      } as never),
    TIMEOUT_MS
  )
  if (error) {
    logErroAdmin('admin_support_list_office_approval_links', error)
    throw new Error(error.message || 'Falha ao carregar portal/aprovações de suporte.')
  }
  const payload = asRecord(data) ?? {}
  const resumo = asRecord(payload.resumo) ?? {}
  const alertas = asRecord(payload.alertas) ?? {}
  const links = Array.isArray(payload.links) ? payload.links : []
  return {
    resumo: {
      total: asNumber(resumo.total) ?? 0,
      pendentes: asNumber(resumo.pendentes) ?? 0,
      aprovados: asNumber(resumo.aprovados) ?? 0,
      aprovados_parcialmente: asNumber(resumo.aprovados_parcialmente) ?? 0,
      recusados: asNumber(resumo.recusados) ?? 0,
      expirados: asNumber(resumo.expirados) ?? 0,
      revogados: asNumber(resumo.revogados) ?? 0,
      convertidos: asNumber(resumo.convertidos) ?? 0,
    },
    links: links.map(mapApprovalLink).filter((l): l is AdminSupportApprovalLink => l != null),
    alertas: {
      pendentes_expirados: asNumber(alertas.pendentes_expirados) ?? 0,
      aprovados_sem_conversao: asNumber(alertas.aprovados_sem_conversao) ?? 0,
      aprovados_parciais: asNumber(alertas.aprovados_parciais) ?? 0,
    },
  }
}

function resultadoOuErro<T>(
  promise: Promise<T>
): Promise<{ ok: true; data: T } | { ok: false; erro: string }> {
  return promise.then(
    (data) => ({ ok: true as const, data }),
    (err: unknown) => ({
      ok: false as const,
      erro: err instanceof Error ? err.message : 'Falha ao carregar dados de suporte.',
    })
  )
}

export async function carregarRaioXOficinaAdmin(
  oficina: OficinaRegistro
): Promise<AdminSupportRaioX> {
  const detalhes = await carregarDetalhesOficinaAdmin(oficina.office_id)

  const [tipo, fiscal, ordens, pagamentosResult, caixaResult, estoqueResult, portalResult] =
    await Promise.all([
      carregarTipoOficinaAdmin(oficina.office_id).catch(() => detalhes.tipo_oficina),
      carregarModuloFiscalAdicionalAdmin(oficina.office_id).catch(
        () => detalhes.modulo_fiscal_adicional_ativo
      ),
      carregarOrdensOficinaAdmin(oficina.office_id).catch(() => detalhes.amostra_ordens),
      listarPagamentosSuporteOficina(oficina.office_id).then(
        (rows) => ({ ok: true as const, rows }),
        (err: unknown) => ({
          ok: false as const,
          rows: [] as AdminSupportPaymentRow[],
          erro: err instanceof Error ? err.message : 'Falha ao carregar pagamentos.',
        })
      ),
      resultadoOuErro(carregarCaixaSuporteOficina(oficina.office_id)),
      resultadoOuErro(carregarEstoqueSuporteOficina(oficina.office_id)),
      resultadoOuErro(carregarPortalSuporteOficina(oficina.office_id)),
    ])

  return {
    oficina,
    detalhes: {
      ...detalhes,
      tipo_oficina: tipo ?? detalhes.tipo_oficina,
      modulo_fiscal_adicional_ativo: Boolean(fiscal),
    },
    tipo_oficina: tipo ?? detalhes.tipo_oficina,
    fiscal_adicional: Boolean(fiscal),
    usuarios: detalhes.usuarios,
    ordens: ordens.length ? ordens : detalhes.amostra_ordens,
    pagamentos: pagamentosResult.rows,
    estoque_amostra: detalhes.amostra_estoque,
    erro_pagamentos: pagamentosResult.ok ? null : pagamentosResult.erro,
    caixa: caixaResult.ok ? caixaResult.data : null,
    erro_caixa: caixaResult.ok ? null : caixaResult.erro,
    estoque: estoqueResult.ok ? estoqueResult.data : null,
    erro_estoque: estoqueResult.ok ? null : estoqueResult.erro,
    portal: portalResult.ok ? portalResult.data : null,
    erro_portal: portalResult.ok ? null : portalResult.erro,
  }
}
