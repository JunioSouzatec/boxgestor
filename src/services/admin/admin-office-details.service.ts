import { getSupabaseClient } from '@/lib/supabase'
import {
  ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS,
  AdminRpcTimeoutError,
  executarComTimeoutAdmin,
  logErroAdmin,
  MENSAGEM_ERRO_DETALHES_OFICINA,
  permitirFallbackLocalAdmin,
} from '@/lib/admin-env'
import { getLabelPlano, normalizarPlanoTier } from '@/types/plano'
import { carregarTipoOficinaAdmin } from '@/services/admin/admin-tipo-oficina.service'
import type { TipoOficina } from '@/types/tipo-oficina'
import { formatarMoeda } from '@/lib/utils'
import {
  normalizarNomeCliente,
  normalizarTelefoneCliente,
} from '@/services/clientes/deduplicate-clientes.service'

export interface AdminOfficeUsuario {
  id: string
  nome: string
  email: string
  papel: string
  ativo: boolean
  criado_em?: string
}

export interface AdminOfficeResumoItem {
  id: string
  titulo: string
  subtitulo?: string
  valor?: string
  data?: string
}

export interface AdminOfficeDetalhes {
  office_id: string
  nome: string
  nome_fantasia?: string
  telefone?: string
  email?: string
  endereco?: string
  cidade?: string
  estado?: string
  plano_label: string
  trial_inicio?: string
  trial_fim?: string
  criado_em?: string
  arquivada: boolean
  arquivada_em?: string
  responsavel_nome?: string
  responsavel_email?: string
  tipo_oficina?: TipoOficina
  usuarios: AdminOfficeUsuario[]
  totais: {
    clientes: number
    motos: number
    ordens: number
    pagamentos: number
    receita_paga: number
    pecas: number
  }
  amostra_clientes: AdminOfficeResumoItem[]
  amostra_motos: AdminOfficeResumoItem[]
  amostra_ordens: AdminOfficeResumoItem[]
  amostra_pagamentos: AdminOfficeResumoItem[]
  amostra_estoque: AdminOfficeResumoItem[]
}

const LIMITE_AMOSTRA = 15

export interface ClienteDuplicadoAdmin {
  chave: string
  clientes: AdminOfficeResumoItem[]
}

function deduplicarResumoPorId(items: AdminOfficeResumoItem[]): AdminOfficeResumoItem[] {
  const mapa = new Map<string, AdminOfficeResumoItem>()
  for (const item of items) {
    if (!mapa.has(item.id)) mapa.set(item.id, item)
  }
  return [...mapa.values()]
}

/** Detecta possíveis duplicados reais (mesmo telefone/nome) na amostra do Admin. */
export function detectarClientesDuplicadosAdmin(
  clientes: AdminOfficeResumoItem[]
): ClienteDuplicadoAdmin[] {
  const grupos = new Map<string, AdminOfficeResumoItem[]>()
  for (const c of clientes) {
    const tel = normalizarTelefoneCliente(c.subtitulo ?? '')
    const nome = normalizarNomeCliente(c.titulo)
    const chave = tel.length >= 8 ? `tel:${tel}|nome:${nome}` : `id:${c.id}`
    const lista = grupos.get(chave) ?? []
    lista.push(c)
    grupos.set(chave, lista)
  }
  return [...grupos.entries()]
    .filter(([, lista]) => lista.length > 1)
    .map(([chave, clientesGrupo]) => ({ chave, clientes: clientesGrupo }))
}

const PAPEL_LABEL: Record<string, string> = {
  owner: 'Dono',
  admin: 'Administrador',
  mecanico: 'Mecânico',
  recepcionista: 'Recepção',
}

function labelPapel(papel: string): string {
  return PAPEL_LABEL[papel] ?? papel
}

function rpcIndisponivel(mensagem: string): boolean {
  return /admin_get_office_details|function.*does not exist|Could not find the function/i.test(
    mensagem
  )
}

interface RpcAdminOfficeDetailsPayload {
  office?: {
    office_id?: string
    nome?: string
    nome_fantasia?: string | null
    telefone?: string | null
    email?: string | null
    endereco?: string | null
    cidade?: string | null
    estado?: string | null
    plan_tier?: string
    trial_inicio?: string | null
    trial_fim?: string | null
    criado_em?: string
    arquivada_em?: string | null
    responsavel_nome?: string | null
    responsavel_email?: string | null
  }
  usuarios?: Array<{
    id: string
    nome?: string
    email?: string
    papel?: string
    ativo?: boolean
    criado_em?: string
  }>
  totais?: {
    clientes?: number
    motos?: number
    ordens?: number
    pagamentos?: number
    receita_paga?: number
    pecas?: number
  }
  clientes?: Array<{ id: string; nome: string; telefone?: string; criado_em?: string }>
  motos?: Array<{
    id: string
    marca?: string
    modelo?: string
    placa?: string
    cliente_nome?: string
    criado_em?: string
  }>
  ordens?: Array<{
    id: string
    numero?: number
    status?: string
    total?: number
    cliente_nome?: string
    moto_label?: string
    moto_placa?: string
    criado_em?: string
  }>
  pagamentos?: Array<{
    id: string
    valor?: number
    forma?: string
    data?: string
  }>
  estoque?: Array<{
    id: string
    nome?: string
    quantidade?: number
    estoque_minimo?: number
    valor?: number
  }>
}

function mapearRespostaRpc(payload: RpcAdminOfficeDetailsPayload): AdminOfficeDetalhes {
  const office = payload.office ?? {}
  const totais = payload.totais ?? {}

  return {
    office_id: office.office_id ?? '',
    nome: office.nome ?? '—',
    nome_fantasia: office.nome_fantasia ?? undefined,
    telefone: office.telefone ?? undefined,
    email: office.email ?? undefined,
    endereco: office.endereco ?? undefined,
    cidade: office.cidade ?? undefined,
    estado: office.estado ?? undefined,
    plano_label: getLabelPlano(normalizarPlanoTier(office.plan_tier ?? 'trial')),
    trial_inicio: office.trial_inicio ?? undefined,
    trial_fim: office.trial_fim ?? undefined,
    criado_em: office.criado_em,
    arquivada: Boolean(office.arquivada_em),
    arquivada_em: office.arquivada_em ?? undefined,
    responsavel_nome: office.responsavel_nome ?? undefined,
    responsavel_email: office.responsavel_email ?? undefined,
    usuarios: (payload.usuarios ?? []).map((u) => ({
      id: u.id,
      nome: u.nome ?? '—',
      email: u.email ?? '—',
      papel: labelPapel(String(u.papel ?? '—')),
      ativo: u.ativo !== false,
      criado_em: u.criado_em,
    })),
    totais: {
      clientes: totais.clientes ?? 0,
      motos: totais.motos ?? 0,
      ordens: totais.ordens ?? 0,
      pagamentos: totais.pagamentos ?? 0,
      receita_paga: Number(totais.receita_paga ?? 0),
      pecas: totais.pecas ?? 0,
    },
    amostra_clientes: deduplicarResumoPorId(
      (payload.clientes ?? []).map((c) => ({
        id: c.id,
        titulo: c.nome,
        subtitulo: c.telefone,
        data: c.criado_em?.slice(0, 10),
      }))
    ),
    amostra_motos: (payload.motos ?? []).map((m) => ({
      id: m.id,
      titulo: `${m.marca ?? ''} ${m.modelo ?? ''}`.trim() || '—',
      subtitulo: [m.cliente_nome, m.placa].filter(Boolean).join(' · '),
      data: m.criado_em?.slice(0, 10),
    })),
    amostra_ordens: (payload.ordens ?? []).map((o) => ({
      id: o.id,
      titulo: `OS #${o.numero ?? '—'}`,
      subtitulo: [o.cliente_nome, o.moto_label, o.status].filter(Boolean).join(' · '),
      valor: formatarMoeda(Number(o.total ?? 0)),
      data: o.criado_em?.slice(0, 10),
    })),
    amostra_pagamentos: (payload.pagamentos ?? []).map((p) => ({
      id: p.id,
      titulo: formatarMoeda(Number(p.valor ?? 0)),
      subtitulo: p.forma,
      data: typeof p.data === 'string' ? p.data.slice(0, 10) : undefined,
    })),
    amostra_estoque: (payload.estoque ?? []).map((i) => ({
      id: i.id,
      titulo: i.nome ?? '—',
      subtitulo: `Qtd: ${i.quantidade ?? 0} · Mín: ${i.estoque_minimo ?? 0}`,
      valor: formatarMoeda(Number(i.valor ?? 0)),
    })),
  }
}

async function carregarDetalhesViaRpc(officeUuid: string): Promise<AdminOfficeDetalhes> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase não configurado.')

  const { data, error } = await executarComTimeoutAdmin(
    'admin_get_office_details',
    async () =>
      supabase.rpc('admin_get_office_details', {
        p_office_id: officeUuid,
      } as never),
    ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS
  )

  if (error) {
    logErroAdmin('admin_get_office_details', error)
    if (rpcIndisponivel(error.message) && permitirFallbackLocalAdmin()) {
      console.warn(
        '[Admin BoxGestor] RPC admin_get_office_details não encontrada. Execute docs/supabase-admin-office-details.sql'
      )
      return carregarDetalhesOficinaAdminDireto(officeUuid)
    }
    throw error
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Resposta vazia do servidor.')
  }

  return mapearRespostaRpc(data as RpcAdminOfficeDetailsPayload)
}

const OFFICE_SELECT_BASE =
  'id, name, phone, email, address, plan_tier, trial_started_at, trial_ends_at, created_at'

async function carregarOfficeAdmin(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  officeUuid: string
) {
  const comArquivo = await supabase
    .from('offices')
    .select(`${OFFICE_SELECT_BASE}, archived_at`)
    .eq('id', officeUuid)
    .maybeSingle()

  if (!comArquivo.error) {
    return { office: comArquivo.data, suportaArquivo: true as const }
  }

  if (!/archived_at/i.test(comArquivo.error.message)) {
    throw new Error(comArquivo.error.message)
  }

  const semArquivo = await supabase
    .from('offices')
    .select(OFFICE_SELECT_BASE)
    .eq('id', officeUuid)
    .maybeSingle()

  if (semArquivo.error) throw new Error(semArquivo.error.message)
  return { office: semArquivo.data, suportaArquivo: false as const }
}

async function carregarDetalhesOficinaAdminDireto(
  officeUuid: string
): Promise<AdminOfficeDetalhes> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase não configurado.')

  const [
    officePack,
    profilesRes,
    clientesRes,
    motosRes,
    ordensRes,
    pagamentosRes,
    pecasRes,
    estoqueRes,
  ] = await Promise.all([
    carregarOfficeAdmin(supabase, officeUuid),
    supabase
      .from('profiles')
      .select('id, full_name, email, role, active, created_at')
      .eq('office_id', officeUuid)
      .order('created_at'),
    supabase
      .from('customers')
      .select('id, name, phone, created_at', { count: 'exact' })
      .eq('office_id', officeUuid)
      .order('created_at', { ascending: false })
      .limit(LIMITE_AMOSTRA),
    supabase
      .from('motorcycles')
      .select('id, brand, model, plate, created_at', { count: 'exact' })
      .eq('office_id', officeUuid)
      .order('created_at', { ascending: false })
      .limit(LIMITE_AMOSTRA),
    supabase
      .from('service_orders')
      .select('id, number, status, total_value, created_at', { count: 'exact' })
      .eq('office_id', officeUuid)
      .order('number', { ascending: false })
      .limit(LIMITE_AMOSTRA),
    supabase
      .from('service_order_payments')
      .select('id, amount, payment_method, payment_date, created_at', { count: 'exact' })
      .eq('office_id', officeUuid)
      .order('payment_date', { ascending: false })
      .limit(LIMITE_AMOSTRA),
    supabase
      .from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('office_id', officeUuid),
    supabase
      .from('inventory_items')
      .select('id, name, quantity, minimum_stock, sale_price')
      .eq('office_id', officeUuid)
      .order('name')
      .limit(LIMITE_AMOSTRA),
  ])

  const { office: officeData, suportaArquivo } = officePack
  if (!officeData) throw new Error('Oficina não encontrada.')

  const office = officeData as {
    id: string
    name: string
    phone: string | null
    email: string | null
    address: string | null
    plan_tier: string
    trial_started_at: string | null
    trial_ends_at: string | null
    created_at: string
    archived_at?: string | null
  }

  const pagamentos = (pagamentosRes.data ?? []) as {
    id: string
    amount: number
    payment_method: string
    payment_date: string
  }[]

  const receitaPaga = pagamentos.reduce((acc, p) => acc + Number(p.amount), 0)

  return {
    office_id: office.id,
    nome: office.name,
    telefone: office.phone ?? undefined,
    email: office.email ?? undefined,
    endereco: office.address ?? undefined,
    plano_label: getLabelPlano(normalizarPlanoTier(office.plan_tier)),
    trial_inicio: office.trial_started_at ?? undefined,
    trial_fim: office.trial_ends_at ?? undefined,
    criado_em: office.created_at,
    arquivada: suportaArquivo ? Boolean(office.archived_at) : false,
    arquivada_em: suportaArquivo ? (office.archived_at ?? undefined) : undefined,
    usuarios: ((profilesRes.data ?? []) as AdminOfficeUsuario[]).map((p) => ({
      id: p.id,
      nome: (p as { full_name?: string }).full_name ?? '—',
      email: p.email ?? '—',
      papel: labelPapel(String((p as { role?: string }).role ?? '—')),
      ativo: (p as { active?: boolean }).active !== false,
      criado_em: (p as { created_at?: string }).created_at,
    })),
    totais: {
      clientes: clientesRes.count ?? 0,
      motos: motosRes.count ?? 0,
      ordens: ordensRes.count ?? 0,
      pagamentos: pagamentosRes.count ?? 0,
      receita_paga: receitaPaga,
      pecas: pecasRes.count ?? 0,
    },
    amostra_clientes: deduplicarResumoPorId(
      ((clientesRes.data ?? []) as { id: string; name: string; phone: string; created_at: string }[]).map(
        (c) => ({
          id: c.id,
          titulo: c.name,
          subtitulo: c.phone,
          data: c.created_at?.slice(0, 10),
        })
      )
    ),
    amostra_motos: ((motosRes.data ?? []) as { id: string; brand: string; model: string; plate: string; created_at: string }[]).map(
      (m) => ({
        id: m.id,
        titulo: `${m.brand} ${m.model}`,
        subtitulo: m.plate,
        data: m.created_at?.slice(0, 10),
      })
    ),
    amostra_ordens: ((ordensRes.data ?? []) as { id: string; number: number; status: string; total_value: number; created_at: string }[]).map(
      (o) => ({
        id: o.id,
        titulo: `OS #${o.number}`,
        subtitulo: o.status,
        valor: formatarMoeda(Number(o.total_value)),
        data: o.created_at?.slice(0, 10),
      })
    ),
    amostra_pagamentos: pagamentos.map((p) => ({
      id: p.id,
      titulo: formatarMoeda(Number(p.amount)),
      subtitulo: p.payment_method,
      data: p.payment_date,
    })),
    amostra_estoque: ((estoqueRes.data ?? []) as { id: string; name: string; quantity: number; minimum_stock: number; sale_price: number }[]).map(
      (i) => ({
        id: i.id,
        titulo: i.name,
        subtitulo: `Qtd: ${i.quantity} · Mín: ${i.minimum_stock}`,
        valor: formatarMoeda(Number(i.sale_price)),
      })
    ),
  }
}

export async function carregarDetalhesOficinaAdmin(
  officeUuid: string
): Promise<AdminOfficeDetalhes> {
  try {
    const detalhes = await carregarDetalhesViaRpc(officeUuid)
    const tipo_oficina = await carregarTipoOficinaAdmin(officeUuid)
    return { ...detalhes, tipo_oficina }
  } catch (err) {
    if (err instanceof AdminRpcTimeoutError) {
      throw new Error(MENSAGEM_ERRO_DETALHES_OFICINA)
    }
    throw err
  }
}
