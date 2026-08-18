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

export async function carregarRaioXOficinaAdmin(
  oficina: OficinaRegistro
): Promise<AdminSupportRaioX> {
  const detalhes = await carregarDetalhesOficinaAdmin(oficina.office_id)

  const [tipo, fiscal, ordens, pagamentosResult] = await Promise.all([
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
  }
}
