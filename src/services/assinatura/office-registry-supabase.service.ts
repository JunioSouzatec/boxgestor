import { getSupabaseClient } from '@/lib/supabase'
import {
  ADMIN_LIST_OFFICES_TIMEOUT_MS,
  executarComTimeoutAdmin,
  logErroAdmin,
} from '@/lib/admin-env'
import {
  aguardarSessaoAuthSupabase,
  logDebugAuthAdminStatus,
} from '@/lib/supabase-session-ready'
import type { OficinaRegistro } from '@/services/assinatura/office-registry.service'
import type { AssinaturaOffice, PlanoTier } from '@/types/plano'
import {
  calcularTrialFimAPartirDe,
  diasRestantesTrial,
  normalizarPlanoTier,
  testePremiumAtivo,
  testePremiumExpirado,
} from '@/types/plano'

interface AdminOfficeRow {
  office_id: string
  office_name: string
  phone: string | null
  plan_tier: string
  trial_started_at: string | null
  trial_ends_at: string | null
  created_at: string | null
  owner_name: string | null
  owner_email: string | null
  archived_at?: string | null
}

function montarAssinatura(row: AdminOfficeRow): AssinaturaOffice {
  const plano = normalizarPlanoTier(row.plan_tier)
  const inicio = row.trial_started_at
    ? new Date(row.trial_started_at).toISOString()
    : undefined
  const fim =
    plano === 'trial'
      ? row.trial_ends_at
        ? new Date(row.trial_ends_at).toISOString()
        : inicio
          ? calcularTrialFimAPartirDe(inicio)
          : undefined
      : undefined

  return {
    office_id: row.office_id,
    plano,
    updated_at: row.created_at ?? new Date().toISOString(),
    trial_inicio_em: inicio,
    trial_fim_em: fim,
  }
}

function resolverStatus(assinatura: AssinaturaOffice): OficinaRegistro['status'] {
  if (testePremiumExpirado(assinatura)) return 'teste_expirado'
  if (testePremiumAtivo(assinatura)) return 'teste'
  return 'ativa'
}

function mapRowParaRegistro(row: AdminOfficeRow, arquivada = false): OficinaRegistro {
  const assinatura = montarAssinatura(row)
  const plano = normalizarPlanoTier(row.plan_tier) as PlanoTier

  return {
    office_id: row.office_id,
    nome: row.office_name?.trim() || 'Oficina',
    plano,
    assinatura,
    status: resolverStatus(assinatura),
    telefone: row.phone ?? undefined,
    dono_nome: row.owner_name ?? undefined,
    dono_email: row.owner_email ?? undefined,
    criado_em: row.created_at ?? undefined,
    dias_restantes_teste: diasRestantesTrial(assinatura),
    trial_inicio_em: assinatura.trial_inicio_em,
    trial_fim_em: assinatura.trial_fim_em,
    arquivada,
    arquivada_em: row.archived_at ?? undefined,
  }
}

/** Lista oficinas reais via RPC admin_list_offices (somente Admin Sistema autenticado). */
export async function listarOficinasSupabaseAdmin(): Promise<OficinaRegistro[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const sessao = await aguardarSessaoAuthSupabase({ tentativas: 10, intervaloMs: 200 })
  if (!sessao) {
    await logDebugAuthAdminStatus()
    throw new Error('Sessão Supabase não pronta. Faça login novamente.')
  }

  const { data, error } = await executarComTimeoutAdmin(
    'admin_list_offices',
    async () => supabase.rpc('admin_list_offices'),
    ADMIN_LIST_OFFICES_TIMEOUT_MS
  )

  if (error) {
    logErroAdmin('admin_list_offices', error)
    await logDebugAuthAdminStatus()
    if (/acesso negado|apenas administrador/i.test(error.message)) {
      throw new Error(
        'Acesso negado: is_system_admin() não reconheceu seu e-mail. Confira system_admin_emails e o e-mail do JWT (veja [Admin BoxGestor][diag]).'
      )
    }
    throw new Error(error.message)
  }

  const rows = (data ?? []) as AdminOfficeRow[]
  return rows.map((r) => mapRowParaRegistro(r, false))
}

/** Lista oficinas arquivadas via RPC admin_list_archived_offices. */
export async function listarOficinasArquivadasSupabaseAdmin(): Promise<OficinaRegistro[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const sessao = await aguardarSessaoAuthSupabase({ tentativas: 8, intervaloMs: 200 })
  if (!sessao) {
    throw new Error('Sessão Supabase não pronta.')
  }

  const { data, error } = await executarComTimeoutAdmin(
    'admin_list_archived_offices',
    async () => supabase.rpc('admin_list_archived_offices'),
    ADMIN_LIST_OFFICES_TIMEOUT_MS
  )

  if (error) {
    logErroAdmin('admin_list_archived_offices', error)
    await logDebugAuthAdminStatus()
    throw new Error(error.message)
  }

  const rows = (data ?? []) as AdminOfficeRow[]
  return rows.map((r) => mapRowParaRegistro(r, true))
}
