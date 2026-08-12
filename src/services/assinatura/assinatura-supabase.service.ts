import { isUuidFormato } from '@/lib/local-id-uuid'
import { getSupabaseClient, getCraftPersistenceMode } from '@/lib/supabase'
import { isModoAuthSupabaseAtivo } from '@/lib/craft-auth'
import { executarComTimeoutAdmin, logErroAdmin } from '@/lib/admin-env'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
import type { AssinaturaOffice, PlanoTier } from '@/types/plano'
import {
  normalizarExtraUsersCount,
  normalizarModuloFiscalAdicionalAtivo,
  normalizarPlanoTier,
} from '@/types/plano'

function deveSincronizarPlanoRemoto(officeId: string): boolean {
  if (!isUuidFormato(officeId)) return false
  if (!getSupabaseClient()) return false
  return isModoAuthSupabaseAtivo() || getCraftPersistenceMode() === 'supabase'
}

function mapOfficeRowParaAssinatura(row: {
  id: string
  plan_tier: string
  trial_started_at: string | null
  trial_ends_at: string | null
  updated_at: string | null
}): AssinaturaOffice {
  const plano = normalizarPlanoTier(row.plan_tier)
  const inicio = row.trial_started_at
    ? new Date(row.trial_started_at).toISOString()
    : undefined
  // Não inventa trial_ends_at a partir de TRIAL_DIAS — evita alterar oficinas antigas
  // e preserva o fim local (15 dias) gravado no cadastro quando o remoto ainda é null.
  const fim =
    plano === 'trial' && row.trial_ends_at
      ? new Date(row.trial_ends_at).toISOString()
      : undefined

  return {
    office_id: row.id,
    plano,
    updated_at: row.updated_at ?? new Date().toISOString(),
    trial_inicio_em: inicio,
    trial_fim_em: fim,
  }
}

async function carregarMetadataComercialRemoto(officeUuid: string): Promise<{
  extra_users_count: number
  modulo_fiscal_adicional_ativo: boolean
}> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { extra_users_count: 0, modulo_fiscal_adicional_ativo: false }
  }

  let extraUsersCount = 0
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'admin_get_office_extra_users_count',
    { p_office_id: officeUuid } as never
  )

  if (!rpcError && (typeof rpcData === 'number' || typeof rpcData === 'string')) {
    extraUsersCount = normalizarExtraUsersCount(rpcData)
  }

  const { data } = await supabase
    .from('settings')
    .select('metadata')
    .eq('office_id', officeUuid)
    .maybeSingle()

  const metadata = ((data as { metadata?: Record<string, unknown> } | null)?.metadata ??
    {}) as Record<string, unknown>

  if (rpcError || (typeof rpcData !== 'number' && typeof rpcData !== 'string')) {
    extraUsersCount = normalizarExtraUsersCount(metadata.extra_users_count)
  }

  return {
    extra_users_count: extraUsersCount,
    modulo_fiscal_adicional_ativo: normalizarModuloFiscalAdicionalAtivo(
      metadata.modulo_fiscal_adicional_ativo
    ),
  }
}

/** Carrega plano/trial da oficina no Supabase e atualiza cache local (UI). */
export async function sincronizarAssinaturaDoSupabase(
  officeUuid: string
): Promise<AssinaturaOffice | null> {
  if (!deveSincronizarPlanoRemoto(officeUuid)) return null

  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('offices')
    .select('id, plan_tier, trial_started_at, trial_ends_at, updated_at')
    .eq('id', officeUuid)
    .maybeSingle()

  if (error || !data) return null

  const assinatura = mapOfficeRowParaAssinatura(data as {
    id: string
    plan_tier: string
    trial_started_at: string | null
    trial_ends_at: string | null
    updated_at: string | null
  })

  const comercial = await carregarMetadataComercialRemoto(officeUuid)

  return assinaturaService.aplicarAssinaturaRemota(officeUuid, {
    ...assinatura,
    extra_users_count: comercial.extra_users_count,
    modulo_fiscal_adicional_ativo: comercial.modulo_fiscal_adicional_ativo,
  })
}

export async function adminDefinirPlanoSupabase(
  officeUuid: string,
  plano: PlanoTier
): Promise<AssinaturaOffice | null> {
  if (!isUuidFormato(officeUuid)) return null
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await executarComTimeoutAdmin('admin_set_office_plan', async () =>
    supabase.rpc('admin_set_office_plan', {
      p_office_id: officeUuid,
      p_plan_tier: plano,
    } as never)
  )

  if (error) {
    logErroAdmin('admin_set_office_plan', error)
    throw new Error(error.message)
  }

  const row = data as {
    id: string
    plan_tier: string
    trial_started_at: string | null
    trial_ends_at: string | null
    updated_at: string | null
  }

  const assinatura = mapOfficeRowParaAssinatura(row)
  return assinaturaService.aplicarAssinaturaRemota(officeUuid, assinatura)
}

export async function adminEstenderTrialSupabase(
  officeUuid: string,
  dias = 7
): Promise<AssinaturaOffice | null> {
  if (!isUuidFormato(officeUuid)) return null
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await executarComTimeoutAdmin('admin_extend_office_trial', async () =>
    supabase.rpc('admin_extend_office_trial', {
      p_office_id: officeUuid,
      p_days: dias,
    } as never)
  )

  if (error) {
    logErroAdmin('admin_extend_office_trial', error)
    throw new Error(error.message)
  }

  const row = data as {
    id: string
    plan_tier: string
    trial_started_at: string | null
    trial_ends_at: string | null
    updated_at: string | null
  }

  const assinatura = mapOfficeRowParaAssinatura(row)
  return assinaturaService.aplicarAssinaturaRemota(officeUuid, assinatura)
}

export async function adminEncerrarTrialSupabase(
  officeUuid: string
): Promise<AssinaturaOffice | null> {
  if (!isUuidFormato(officeUuid)) return null
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await executarComTimeoutAdmin('admin_end_office_trial', async () =>
    supabase.rpc('admin_end_office_trial', {
      p_office_id: officeUuid,
    } as never)
  )

  if (error) {
    logErroAdmin('admin_end_office_trial', error)
    throw new Error(error.message)
  }

  const row = data as {
    id: string
    plan_tier: string
    trial_started_at: string | null
    trial_ends_at: string | null
    updated_at: string | null
  }

  const assinatura = mapOfficeRowParaAssinatura(row)
  return assinaturaService.aplicarAssinaturaRemota(officeUuid, assinatura)
}

export async function adminReiniciarTrialSupabase(
  officeUuid: string
): Promise<AssinaturaOffice | null> {
  if (!isUuidFormato(officeUuid)) return null
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await executarComTimeoutAdmin('admin_restart_office_trial', async () =>
    supabase.rpc('admin_restart_office_trial', {
      p_office_id: officeUuid,
    } as never)
  )

  if (error) {
    logErroAdmin('admin_restart_office_trial', error)
    throw new Error(error.message)
  }

  const row = data as {
    id: string
    plan_tier: string
    trial_started_at: string | null
    trial_ends_at: string | null
    updated_at: string | null
  }

  const assinatura = mapOfficeRowParaAssinatura(row)
  return assinaturaService.aplicarAssinaturaRemota(officeUuid, assinatura)
}
