import { isUuidFormato } from '@/lib/local-id-uuid'
import { getSupabaseClient, getCraftPersistenceMode } from '@/lib/supabase'
import { isModoAuthSupabaseAtivo } from '@/lib/craft-auth'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
import type { AssinaturaOffice, PlanoTier } from '@/types/plano'
import {
  calcularTrialFimAPartirDe,
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
  const fim =
    plano === 'trial'
      ? row.trial_ends_at
        ? new Date(row.trial_ends_at).toISOString()
        : inicio
          ? calcularTrialFimAPartirDe(inicio)
          : undefined
      : undefined

  return {
    office_id: row.id,
    plano,
    updated_at: row.updated_at ?? new Date().toISOString(),
    trial_inicio_em: inicio,
    trial_fim_em: fim,
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

  return assinaturaService.aplicarAssinaturaRemota(officeUuid, assinatura)
}

export async function adminDefinirPlanoSupabase(
  officeUuid: string,
  plano: PlanoTier
): Promise<AssinaturaOffice | null> {
  if (!isUuidFormato(officeUuid)) return null
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase.rpc('admin_set_office_plan', {
    p_office_id: officeUuid,
    p_plan_tier: plano,
  } as never)

  if (error) throw new Error(error.message)

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

  const { data, error } = await supabase.rpc('admin_extend_office_trial', {
    p_office_id: officeUuid,
    p_days: dias,
  } as never)

  if (error) throw new Error(error.message)

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

  const { data, error } = await supabase.rpc('admin_end_office_trial', {
    p_office_id: officeUuid,
  } as never)

  if (error) throw new Error(error.message)

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

  const { data, error } = await supabase.rpc('admin_restart_office_trial', {
    p_office_id: officeUuid,
  } as never)

  if (error) throw new Error(error.message)

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
