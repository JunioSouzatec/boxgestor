import { getSupabaseClient } from '@/lib/supabase'
import { getLabelPlano, normalizarPlanoTier } from '@/types/plano'
import { formatarMoeda } from '@/lib/utils'

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
  telefone?: string
  email?: string
  endereco?: string
  plano_label: string
  trial_inicio?: string
  trial_fim?: string
  criado_em?: string
  arquivada: boolean
  arquivada_em?: string
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
}

const LIMITE_AMOSTRA = 15

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

export async function carregarDetalhesOficinaAdmin(
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
    created_at: string
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
      papel: String((p as { role?: string }).role ?? '—'),
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
    amostra_clientes: ((clientesRes.data ?? []) as { id: string; name: string; phone: string; created_at: string }[]).map(
      (c) => ({
        id: c.id,
        titulo: c.name,
        subtitulo: c.phone,
        data: c.created_at?.slice(0, 10),
      })
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
  }
}
