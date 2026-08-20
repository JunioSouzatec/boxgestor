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

export function asRecord(v: unknown): Record<string, unknown> | null {
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

/** Item público com chave estável para seleção parcial (sem ids internos). */
export type PublicQuoteServiceItem = {
  item_key: string
  name: string
  labor_value: number
}

export type PublicQuotePartItem = {
  item_key: string
  name: string
  quantity: number
  unit_price: number
  subtotal: number
}

/** Foto pública no portal — sem storage_path / bucket / token. */
export type PublicQuotePhotoItem = {
  id: string
  signed_url: string
  caption?: string | null
  type?: string | null
  created_at?: string | null
  sort_order?: number | null
}

/** Modo do portal público (só valores seguros; sem metadata bruto). */
export type PortalPublicMode = 'approval' | 'service_tracking'

/**
 * Resolve portal_mode a partir de metadata do link + contexto da OS.
 * Links antigos sem metadata: orçamento → approval; OS/convertido → service_tracking.
 */
export function resolverPortalModePublico(input: {
  linkMetadata?: Record<string, unknown> | null
  converted?: boolean
  modoDocumento?: string | null
  budgetStatus?: string | null
}): PortalPublicMode {
  const meta = input.linkMetadata || {}
  const raw =
    (typeof meta.portal_mode === 'string' && meta.portal_mode.trim()) ||
    (typeof meta.link_purpose === 'string' && meta.link_purpose.trim()) ||
    ''
  const normalizado = raw.toLowerCase()
  if (
    normalizado === 'service_tracking' ||
    normalizado === 'photos' ||
    normalizado === 'tracking' ||
    normalizado === 'acompanhamento'
  ) {
    return 'service_tracking'
  }
  if (normalizado === 'approval' || normalizado === 'orcamento' || normalizado === 'quote') {
    return 'approval'
  }
  if (input.converted) return 'service_tracking'
  const modo = (input.modoDocumento || '').toLowerCase()
  if (modo === 'os' || modo === 'ordem' || modo === 'ordem_servico') {
    return 'service_tracking'
  }
  if (modo === 'orcamento') {
    return 'approval'
  }
  const budget = (input.budgetStatus || '').toLowerCase()
  if (budget === 'convertido') return 'service_tracking'
  // Sem metadata e sem modo: se budget_status típico de orçamento, approval; senão tracking seguro
  if (
    budget === 'pendente' ||
    budget === 'aguardando' ||
    budget === 'aguardando_aprovacao' ||
    budget === 'enviado'
  ) {
    return 'approval'
  }
  // Documento operacional (OS) costuma ter budget_status null
  if (!budget || budget === 'null') return 'service_tracking'
  return 'approval'
}

/** Payload sanitizado — nunca inclui custo/lucro/comissão/caixa/PIN/fiscal/estoque. */
export interface PublicQuotePayload {
  office: {
    nome: string
    logo_url?: string | null
    telefone?: string | null
    whatsapp?: string | null
  }
  quote: {
    number: number
    customer_name: string
    vehicle_label: string
    plate?: string | null
    services: PublicQuoteServiceItem[]
    parts: PublicQuotePartItem[]
    discount: number
    total: number
    notes?: string | null
    valid_until?: string | null
    converted?: boolean
    converted_os_number?: number | null
    converted_at?: string | null
    generated_os_status?: string | null
    generated_os_expected_delivery_date?: string | null
  }
  conversion?: {
    converted: boolean
    os_number?: number | null
    converted_at?: string | null
    generated_os_status?: string | null
    generated_os_expected_delivery_date?: string | null
  }
  link: {
    status: ApprovalLinkStatus
    expires_at: string
  }
  /** approval = orçamento; service_tracking = acompanhamento/fotos sem aprovação. */
  portal_mode?: PortalPublicMode
  /** A4.1 — acompanhamento sanitizado (somente service_tracking). */
  tracking?: PublicServiceTracking
  notice: string
  /** Fotos liberadas no portal (opt-in). Sem storage_path. */
  photos?: PublicQuotePhotoItem[]
}

/** Etapa do progresso público (sem histórico interno). */
export type PublicTrackingStep = {
  etapa: string
  titulo: string
  descricao?: string
  concluida: boolean
  atual: boolean
}

/** Bloco de acompanhamento — sem craft_meta/historico bruto. */
export type PublicServiceTracking = {
  status_publico: string
  status_codigo: string
  etapa_atual: string
  descricao?: string
  previsao_entrega?: string | null
  atualizado_em?: string | null
  progresso: PublicTrackingStep[]
  avisos: string[]
}

export type OsItemCatalogo = {
  item_key: string
  tipo: 'service' | 'part'
  descricao: string
  quantidade: number
  valor_unitario: number
  subtotal: number
}

/** Extrai itens reais da OS com item_key (service-N / part-N). */
export function catalogarItensOsParaAprovacao(partsUsed: unknown): OsItemCatalogo[] {
  const base = asRecord(partsUsed) || {}
  const craftMeta = asRecord(base.craft_meta) || {}
  const pecasRaw = Array.isArray(base.pecas) ? base.pecas : []
  const servicosRaw = Array.isArray(craftMeta.servicos_itens) ? craftMeta.servicos_itens : []

  const services: OsItemCatalogo[] = (servicosRaw as unknown[]).map((s, i) => {
    const r = asRecord(s) || {}
    const valor = Number(r.valor_mao_obra ?? r.labor_value ?? 0) || 0
    return {
      item_key: `service-${i}`,
      tipo: 'service',
      descricao: String(r.nome || r.name || 'Serviço'),
      quantidade: 1,
      valor_unitario: valor,
      subtotal: Math.round(valor * 100) / 100,
    }
  })

  const parts: OsItemCatalogo[] = (pecasRaw as unknown[]).map((p, i) => {
    const r = asRecord(p) || {}
    const qty = Number(r.quantidade ?? r.quantity ?? 0) || 0
    const unit = Number(r.valor_unitario ?? r.unit_price ?? 0) || 0
    return {
      item_key: `part-${i}`,
      tipo: 'part',
      descricao: String(r.nome || r.name || 'Peça'),
      quantidade: qty,
      valor_unitario: unit,
      subtotal: Math.round(qty * unit * 100) / 100,
    }
  })

  return [...services, ...parts]
}

/** Telefone público da oficina — só dígitos úteis; sem log. */
export function sanitizarTelefonePublicoOficina(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  return raw.trim() || null
}

export function rotuloStatusOsPublico(status?: string | null): string | null {
  if (!status) return null
  const map: Record<string, string> = {
    recebida: 'Recebida',
    em_diagnostico: 'Em diagnóstico',
    aguardando_aprovacao: 'Aguardando aprovação',
    aguardando_peca: 'Aguardando peça',
    em_servico: 'Em serviço',
    pronto_para_retirada: 'Pronto para retirada',
    finalizada: 'Finalizada',
    entregue: 'Entregue',
    cancelada: 'Cancelada',
  }
  return map[status] ?? null
}

/** Palavra do veículo para textos públicos (Edge — sem importar front). */
function palavraVeiculoPortal(tipoOficina?: string | null): {
  palavra: string
  artigo: string
  capitalizado: string
} {
  const t = (tipoOficina || '').toLowerCase().trim()
  if (t === 'motos' || t === 'moto') {
    return { palavra: 'moto', artigo: 'a', capitalizado: 'Moto' }
  }
  if (t === 'carros' || t === 'carro') {
    return { palavra: 'carro', artigo: 'o', capitalizado: 'Carro' }
  }
  return { palavra: 'veículo', artigo: 'o', capitalizado: 'Veículo' }
}

/**
 * Status amigável para o cliente (A4.1).
 * Desconhecido → "Em acompanhamento".
 */
export function rotuloStatusClientePortal(
  statusCodigo?: string | null,
  tipoOficina?: string | null
): string {
  const codigo = (statusCodigo || '').trim().toLowerCase()
  const v = palavraVeiculoPortal(tipoOficina)
  switch (codigo) {
    case 'recebida':
      return `${v.capitalizado} recebid${v.artigo === 'a' ? 'a' : 'o'}`
    case 'em_diagnostico':
      return 'Em diagnóstico'
    case 'aguardando_aprovacao':
      return 'Aguardando sua aprovação'
    case 'aguardando_peca':
      return 'Aguardando peça'
    case 'em_servico':
      return 'Serviço em andamento'
    case 'pronto_para_retirada':
      return 'Pronto para retirada'
    case 'finalizada':
      return 'Serviço finalizado'
    case 'entregue':
      return `${v.capitalizado} entregue`
    case 'cancelada':
      return 'Atendimento cancelado'
    default:
      return 'Em acompanhamento'
  }
}

function descricaoStatusClientePortal(
  statusCodigo: string,
  tipoOficina?: string | null
): string {
  const v = palavraVeiculoPortal(tipoOficina)
  switch (statusCodigo) {
    case 'recebida':
      return `Recebemos ${v.artigo} ${v.palavra} e vamos iniciar a avaliação.`
    case 'em_diagnostico':
      return 'A oficina está avaliando o que precisa ser feito.'
    case 'aguardando_aprovacao':
      return 'O orçamento está pronto e aguarda sua confirmação.'
    case 'aguardando_peca':
      return 'O serviço depende de peça para continuar.'
    case 'em_servico':
      return 'A oficina está executando o serviço.'
    case 'pronto_para_retirada':
      return `${v.capitalizado} está pronto(a) para retirada.`
    case 'finalizada':
      return 'O serviço foi concluído. Combine a retirada com a oficina.'
    case 'entregue':
      return `${v.capitalizado} já foi entregue.`
    case 'cancelada':
      return 'Este atendimento foi cancelado.'
    default:
      return 'Acompanhe o andamento pelo portal. Em dúvida, fale com a oficina.'
  }
}

/**
 * Progresso por etapas derivado só do status atual (sem historico_eventos).
 */
export function montarProgressoAcompanhamentoPublico(
  statusCodigo?: string | null,
  tipoOficina?: string | null
): { progresso: PublicTrackingStep[]; etapa_atual: string } {
  const v = palavraVeiculoPortal(tipoOficina)
  const codigo = (statusCodigo || '').trim().toLowerCase()

  const base: Array<{ etapa: string; titulo: string; descricao?: string }> = [
    {
      etapa: 'recebido',
      titulo: `${v.capitalizado} recebid${v.artigo === 'a' ? 'a' : 'o'}`,
      descricao: 'Entrada na oficina',
    },
    {
      etapa: 'diagnostico',
      titulo: 'Diagnóstico / avaliação',
      descricao: 'Análise do serviço necessário',
    },
    {
      etapa: 'autorizado',
      titulo: 'Serviço autorizado',
      descricao: 'Orçamento aprovado ou serviço liberado',
    },
    {
      etapa: 'andamento',
      titulo: 'Serviço em andamento',
      descricao: 'Execução / aguardando peça',
    },
    {
      etapa: 'pronto',
      titulo: 'Pronto para retirada',
      descricao: 'Serviço concluído',
    },
    {
      etapa: 'entregue',
      titulo: 'Entregue',
      descricao: `${v.capitalizado} devolvido(a)`,
    },
  ]

  /** Índice da etapa atual (0–5). -1 = cancelada/desconhecido sem progresso forte. */
  let atualIdx = 0
  switch (codigo) {
    case 'recebida':
      atualIdx = 0
      break
    case 'em_diagnostico':
      atualIdx = 1
      break
    case 'aguardando_aprovacao':
      atualIdx = 2
      break
    case 'aguardando_peca':
    case 'em_servico':
      atualIdx = 3
      break
    case 'pronto_para_retirada':
    case 'finalizada':
      atualIdx = 4
      break
    case 'entregue':
      atualIdx = 5
      break
    case 'cancelada':
      atualIdx = -1
      break
    default:
      atualIdx = 0
      break
  }

  const progresso: PublicTrackingStep[] = base.map((step, i) => {
    if (atualIdx < 0) {
      return { ...step, concluida: false, atual: false }
    }
    if (codigo === 'entregue') {
      return { ...step, concluida: true, atual: i === 5 }
    }
    return {
      ...step,
      concluida: i < atualIdx,
      atual: i === atualIdx,
    }
  })

  const etapa_atual =
    atualIdx >= 0 ? base[atualIdx]?.etapa ?? 'recebido' : 'cancelada'

  return { progresso, etapa_atual }
}

/** Monta bloco tracking sanitizado para service_tracking. */
export function montarTrackingPublico(input: {
  statusCodigo?: string | null
  tipoOficina?: string | null
  previsaoEntrega?: string | null
  atualizadoEm?: string | null
}): PublicServiceTracking {
  const codigo = (input.statusCodigo || '').trim().toLowerCase() || 'desconhecido'
  const status_publico = rotuloStatusClientePortal(codigo, input.tipoOficina)
  const { progresso, etapa_atual } = montarProgressoAcompanhamentoPublico(
    codigo,
    input.tipoOficina
  )
  const avisos: string[] = [
    'As informações são atualizadas pela oficina conforme o andamento do serviço.',
  ]
  if (codigo === 'cancelada') {
    avisos.unshift('Este atendimento foi cancelado. Fale com a oficina se precisar de detalhes.')
  }
  if (codigo === 'aguardando_aprovacao') {
    avisos.unshift('Há um orçamento aguardando sua aprovação. Fale com a oficina se precisar responder.')
  }

  return {
    status_publico,
    status_codigo: codigo === 'desconhecido' ? 'desconhecido' : codigo,
    etapa_atual,
    descricao: descricaoStatusClientePortal(
      codigo === 'desconhecido' ? '' : codigo,
      input.tipoOficina
    ),
    previsao_entrega: input.previsaoEntrega?.trim() || null,
    atualizado_em: input.atualizadoEm?.trim() || null,
    progresso,
    avisos,
  }
}

/**
 * Última atualização do serviço para o portal (A4.1 UX).
 * NÃO usa created_at/updated_at do approval_link.
 * Evita timestamps de geração de link (que atualizam OS.updated_at via parts_used).
 * Usa só datas internas; não expõe historico_eventos/craft_meta.
 */
export function resolverAtualizadoEmServicoPublico(input: {
  osUpdatedAt?: string | null
  osCreatedAt?: string | null
  partsUsed?: unknown
  fotosPortal?: Array<{ created_at?: string | null }>
}): string | null {
  const candidatos: number[] = []

  const base = asRecord(input.partsUsed) || {}
  const craftMeta = asRecord(base.craft_meta) || {}
  const historico = Array.isArray(craftMeta.historico_eventos)
    ? craftMeta.historico_eventos
    : []

  for (const ev of historico) {
    const r = asRecord(ev)
    if (!r) continue
    const titulo = String(r.titulo ?? '')
    const tipo = String(r.tipo ?? '')
    const detalhe = String(r.detalhe ?? '')
    if (
      /link (de )?acompanhamento|link seguro|link do portal|approval.?link|token/i.test(
        `${titulo} ${detalhe} ${tipo}`
      )
    ) {
      continue
    }
    if (
      tipo === 'aprovacao_link' ||
      tipo === 'approval_link' ||
      /portal gerado|link gerado/i.test(titulo)
    ) {
      continue
    }
    const rawData = r.data ?? r.created_at ?? r.em ?? r.timestamp
    const ts = Date.parse(String(rawData ?? ''))
    if (!Number.isNaN(ts)) candidatos.push(ts)
  }

  for (const foto of input.fotosPortal ?? []) {
    const ts = Date.parse(String(foto?.created_at ?? ''))
    if (!Number.isNaN(ts)) candidatos.push(ts)
  }

  if (candidatos.length > 0) {
    return new Date(Math.max(...candidatos)).toISOString()
  }

  // Sem eventos relevantes: preferir created_at da OS (não o updated_at poluído por geração de link).
  const created = Date.parse(String(input.osCreatedAt ?? ''))
  if (!Number.isNaN(created)) return String(input.osCreatedAt).trim()

  const updated = Date.parse(String(input.osUpdatedAt ?? ''))
  if (!Number.isNaN(updated)) return String(input.osUpdatedAt).trim()

  return null
}

export function montarPayloadSanitizado(input: {
  officeName: string
  officeLogo?: string | null
  officePhone?: string | null
  officeWhatsapp?: string | null
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
  converted?: boolean
  convertedOsNumber?: number | null
  convertedAt?: string | null
  generatedOsStatus?: string | null
  generatedOsExpectedDeliveryDate?: string | null
  portalMode?: PortalPublicMode
  tracking?: PublicServiceTracking | null
}): PublicQuotePayload {
  const converted = Boolean(
    input.converted ||
      (input.convertedOsNumber != null && Number(input.convertedOsNumber) > 0)
  )
  const convertedOsNumber =
    input.convertedOsNumber != null && Number(input.convertedOsNumber) > 0
      ? Number(input.convertedOsNumber)
      : null
  const statusLabel = rotuloStatusOsPublico(input.generatedOsStatus)
  const portalMode = input.portalMode ?? 'approval'

  return {
    office: {
      nome: input.officeName,
      logo_url: input.officeLogo ?? null,
      telefone: sanitizarTelefonePublicoOficina(input.officePhone),
      whatsapp: sanitizarTelefonePublicoOficina(input.officeWhatsapp),
    },
    quote: {
      number: input.osNumber,
      customer_name: input.customerName,
      vehicle_label: input.vehicleLabel,
      plate: input.plate ?? null,
      services: input.services.map((s, i) => ({
        item_key: `service-${i}`,
        name: s.name,
        labor_value: Number(s.labor_value) || 0,
      })),
      parts: input.parts.map((p, i) => {
        const qty = Number(p.quantity) || 0
        const unit = Number(p.unit_price) || 0
        return {
          item_key: `part-${i}`,
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
      converted,
      converted_os_number: convertedOsNumber,
      converted_at: input.convertedAt ?? null,
      generated_os_status: statusLabel,
      generated_os_expected_delivery_date: input.generatedOsExpectedDeliveryDate ?? null,
    },
    conversion: {
      converted,
      os_number: convertedOsNumber,
      converted_at: input.convertedAt ?? null,
      generated_os_status: statusLabel,
      generated_os_expected_delivery_date: input.generatedOsExpectedDeliveryDate ?? null,
    },
    link: {
      status: input.status,
      expires_at: input.expiresAt,
    },
    portal_mode: portalMode,
    ...(portalMode === 'service_tracking' && input.tracking
      ? { tracking: input.tracking }
      : {}),
    notice:
      portalMode === 'service_tracking'
        ? 'As informações são atualizadas pela oficina conforme o andamento do serviço.'
        : 'A aprovação não representa pagamento.',
  }
}
