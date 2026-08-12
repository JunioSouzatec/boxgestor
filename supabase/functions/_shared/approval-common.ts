/**
 * Utilitários compartilhados — Edge Functions de aprovação de orçamento (A2.1).
 * Deploy: NÃO nesta fase. Somente preparação de arquivos.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function parseSupabaseKeyEnv(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed === 'string' && parsed.trim()) return parsed.trim()
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      if (typeof obj.default === 'string' && obj.default.trim()) return obj.default.trim()
      for (const value of Object.values(obj)) {
        if (typeof value === 'string' && value.trim()) return value.trim()
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function getSupabaseUrl(): string | null {
  return Deno.env.get('SUPABASE_URL')?.trim() || null
}

export function getServiceRoleKey(): string | null {
  return (
    parseSupabaseKeyEnv(Deno.env.get('SUPABASE_SECRET_KEYS')) ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
    null
  )
}

export function getAnonKey(): string | null {
  return (
    parseSupabaseKeyEnv(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')) ||
    Deno.env.get('SUPABASE_ANON_KEY')?.trim() ||
    null
  )
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}

export function adminClient(): SupabaseClient {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) {
    throw new Error('SUPABASE_URL / service role key não configurados na Edge Function.')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function userClient(authHeader: string): SupabaseClient {
  const url = getSupabaseUrl()
  const anon = getAnonKey()
  if (!url || !anon) {
    throw new Error('SUPABASE_URL / anon key não configurados na Edge Function.')
  }
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Token bruto: 32 bytes aleatórios em hex (64 chars). */
export function gerarTokenBruto(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 hex do token bruto — único valor persistido. */
export async function hashToken(tokenBruto: string): Promise<string> {
  const data = new TextEncoder().encode(tokenBruto)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuidFormato(id: string): boolean {
  return UUID_REGEX.test(id.trim())
}

/**
 * Mesmo algoritmo do app (`src/lib/local-id-uuid.ts` / SyncIdMap):
 * namespace craft-oficina-sync-v1 + id local → UUID determinístico.
 */
export async function localIdParaUuid(localId: string): Promise<string> {
  const payload = `craft-oficina-sync-v1:${localId.trim()}`
  const data = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export type ServiceOrderRowLite = {
  id: string
  office_id: string
  number: number
  budget_status?: string | null
  parts_used?: unknown
}

/**
 * Resolve service_orders.id (UUID real) a partir do id do front/local.
 * Ordem: UUID direto → UUID determinístico do id local → craft_meta.local_id → número da OS.
 * Sempre restringe por office_id.
 */
export async function resolverServiceOrderDaOficina(
  admin: SupabaseClient,
  officeId: string,
  identificador: string
): Promise<ServiceOrderRowLite | null> {
  const raw = identificador.trim()
  if (!raw) return null

  const selectCols = 'id, office_id, number, budget_status, parts_used'

  async function porId(id: string): Promise<ServiceOrderRowLite | null> {
    const { data } = await admin
      .from('service_orders')
      .select(selectCols)
      .eq('id', id)
      .eq('office_id', officeId)
      .maybeSingle()
    return (data as ServiceOrderRowLite | null) ?? null
  }

  if (isUuidFormato(raw)) {
    const byUuid = await porId(raw)
    if (byUuid) return byUuid
  }

  // Id local craft → UUID determinístico usado no sync
  const uuidDeterministico = await localIdParaUuid(raw)
  const byDeterministico = await porId(uuidDeterministico)
  if (byDeterministico) return byDeterministico

  // craft_meta.local_id (campo real no parts_used do mapper)
  const { data: byLocalMeta } = await admin
    .from('service_orders')
    .select(selectCols)
    .eq('office_id', officeId)
    .filter('parts_used->craft_meta->>local_id', 'eq', raw)
    .limit(1)
    .maybeSingle()
  if (byLocalMeta) return byLocalMeta as ServiceOrderRowLite

  // Número da OS (apenas dígitos)
  if (/^\d+$/.test(raw)) {
    const numero = Number(raw)
    if (Number.isFinite(numero) && numero > 0) {
      const { data: byNumber } = await admin
        .from('service_orders')
        .select(selectCols)
        .eq('office_id', officeId)
        .eq('number', Math.floor(numero))
        .limit(1)
        .maybeSingle()
      if (byNumber) return byNumber as ServiceOrderRowLite
    }
  }

  return null
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Atualiza craft_meta da OS sem token/token_hash/URL. Não altera status operacional. */
export function mesclarAprovacaoClienteNoPartsUsed(
  partsUsed: unknown,
  patch: {
    link_id: string
    gerado_em: string
    expira_em: string
    gerado_por?: string | null
    gerado_por_id?: string | null
    historicoTitulo: string
    historicoDetalhe?: string
  }
): Record<string, unknown> {
  const base = asRecord(partsUsed) || { pecas: [], craft_meta: {} }
  const craftMeta = asRecord(base.craft_meta) || {}
  const aprovacao = asRecord(craftMeta.aprovacao_cliente) || {}
  const eventos = Array.isArray(aprovacao.eventos) ? [...aprovacao.eventos] : []
  eventos.push({
    id: crypto.randomUUID(),
    tipo: 'link_gerado',
    em: patch.gerado_em,
    por_nome: patch.gerado_por || undefined,
    por_id: patch.gerado_por_id || undefined,
    canal: 'link_publico',
  })

  craftMeta.aprovacao_cliente = {
    ...aprovacao,
    link_publico: true,
    status: 'aguardando_cliente',
    link_id: patch.link_id,
    gerado_em: patch.gerado_em,
    expira_em: patch.expira_em,
    gerado_por: patch.gerado_por || null,
    gerado_por_id: patch.gerado_por_id || null,
    // Nunca token / token_hash / URL com token
    eventos: eventos.slice(-30),
  }

  const historico = Array.isArray(craftMeta.historico_eventos)
    ? [...craftMeta.historico_eventos]
    : []
  historico.push({
    id: crypto.randomUUID(),
    tipo: 'link_aprovacao_gerado',
    titulo: patch.historicoTitulo,
    data_hora: patch.gerado_em,
    usuario_id: patch.gerado_por_id || undefined,
    usuario_nome: patch.gerado_por || undefined,
    detalhe: patch.historicoDetalhe,
  })
  craftMeta.historico_eventos = historico
  base.craft_meta = craftMeta
  if (!Array.isArray(base.pecas)) base.pecas = []
  return base
}

export type ApprovalLinkStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked'

/** Payload sanitizado — nunca inclui custo/lucro/comissão/caixa/PIN/fiscal/estoque. */
export interface PublicQuotePayload {
  office: { nome: string; logo_url?: string | null }
  quote: {
    number: number
    customer_name: string
    vehicle_label: string
    plate?: string | null
    services: Array<{ name: string; labor_value: number }>
    parts: Array<{ name: string; quantity: number; unit_price: number; subtotal: number }>
    discount: number
    total: number
    notes?: string | null
    valid_until?: string | null
  }
  link: {
    status: ApprovalLinkStatus
    expires_at: string
  }
  notice: string
}

export function montarPayloadSanitizado(input: {
  officeName: string
  officeLogo?: string | null
  osNumber: number
  customerName: string
  vehicleLabel: string
  plate?: string | null
  services: Array<{ name: string; labor_value: number }>
  parts: Array<{ name: string; quantity: number; unit_price: number }>
  discount: number
  total: number
  notes?: string | null
  validUntil?: string | null
  status: ApprovalLinkStatus
  expiresAt: string
}): PublicQuotePayload {
  return {
    office: {
      nome: input.officeName,
      logo_url: input.officeLogo ?? null,
    },
    quote: {
      number: input.osNumber,
      customer_name: input.customerName,
      vehicle_label: input.vehicleLabel,
      plate: input.plate ?? null,
      services: input.services.map((s) => ({
        name: s.name,
        labor_value: Number(s.labor_value) || 0,
      })),
      parts: input.parts.map((p) => {
        const qty = Number(p.quantity) || 0
        const unit = Number(p.unit_price) || 0
        return {
          name: p.name,
          quantity: qty,
          unit_price: unit,
          subtotal: Math.round(qty * unit * 100) / 100,
        }
      }),
      discount: Number(input.discount) || 0,
      total: Number(input.total) || 0,
      notes: input.notes ?? null,
      valid_until: input.validUntil ?? null,
    },
    link: {
      status: input.status,
      expires_at: input.expiresAt,
    },
    notice: 'A aprovação não representa pagamento.',
  }
}
