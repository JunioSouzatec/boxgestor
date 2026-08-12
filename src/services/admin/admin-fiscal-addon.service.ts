/**
 * Admin: Módulo Fiscal adicional (settings.metadata.modulo_fiscal_adicional_ativo).
 * Mesmo padrão de extra_users — sem migration (metadata JSON).
 */
import { getSupabaseClient } from '@/lib/supabase'
import { ehAdminSistema } from '@/lib/craft-admin'
import {
  ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS,
  executarComTimeoutAdmin,
  logErroAdmin,
} from '@/lib/admin-env'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
import type { SettingsRow } from '@/services/supabase-sync/reverse-mappers'
import { normalizarModuloFiscalAdicionalAtivo } from '@/types/plano'
import type { AuthUser } from '@/types/auth'

export interface ResultadoAtualizarFiscalAddon {
  ok: boolean
  mensagem: string
  modulo_fiscal_adicional_ativo?: boolean
  criou_settings?: boolean
}

const SETTINGS_PADRAO = {
  dark_theme: true,
  notifications: true,
  low_stock_alert: true,
  next_service_order_num: 1001,
} as const

function montarMetadataFiscalAddon(
  existente: Record<string, unknown>,
  ativo: boolean,
  email?: string
): Record<string, unknown> {
  return {
    ...existente,
    modulo_fiscal_adicional_ativo: ativo === true,
    modulo_fiscal_adicional_atualizado_em: new Date().toISOString(),
    modulo_fiscal_adicional_atualizado_por: email?.trim() || 'admin',
  }
}

export async function carregarModuloFiscalAdicionalAdmin(
  officeUuid: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const { data } = await supabase
    .from('settings')
    .select('metadata')
    .eq('office_id', officeUuid.trim())
    .maybeSingle()

  const metadata = ((data as { metadata?: Record<string, unknown> } | null)?.metadata ??
    {}) as Record<string, unknown>
  return normalizarModuloFiscalAdicionalAtivo(metadata.modulo_fiscal_adicional_ativo)
}

export async function atualizarModuloFiscalAdicionalAdmin(
  officeId: string,
  ativo: boolean,
  usuario?: AuthUser | null
): Promise<ResultadoAtualizarFiscalAddon> {
  if (!ehAdminSistema(usuario)) {
    return { ok: false, mensagem: 'Apenas Admin Sistema pode ativar o Módulo Fiscal.' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    assinaturaService.definirModuloFiscalAdicionalAtivo(officeId, ativo)
    return {
      ok: true,
      mensagem: ativo
        ? 'Módulo Fiscal ativado (local).'
        : 'Módulo Fiscal desativado (local).',
      modulo_fiscal_adicional_ativo: ativo,
    }
  }

  const agora = new Date().toISOString()
  const loadResult = await executarComTimeoutAdmin(
    'settings_fiscal_addon_load',
    async () =>
      supabase
        .from('settings')
        .select('id, metadata, dark_theme, notifications, low_stock_alert, next_service_order_num')
        .eq('office_id', officeId)
        .maybeSingle(),
    ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS
  )

  if (loadResult.error) {
    logErroAdmin('settings_fiscal_addon_load', loadResult.error)
    return {
      ok: false,
      mensagem: `Não foi possível carregar settings: ${loadResult.error.message}`,
    }
  }

  const existente = loadResult.data as SettingsRow | null
  const metadataExistente = (existente?.metadata ?? {}) as Record<string, unknown>
  const metadataAtualizado = montarMetadataFiscalAddon(
    metadataExistente,
    ativo,
    usuario?.email
  )
  const criouSettings = !existente?.id

  const payload = {
    office_id: officeId,
    dark_theme: existente?.dark_theme ?? SETTINGS_PADRAO.dark_theme,
    notifications: existente?.notifications ?? SETTINGS_PADRAO.notifications,
    low_stock_alert: existente?.low_stock_alert ?? SETTINGS_PADRAO.low_stock_alert,
    next_service_order_num:
      existente?.next_service_order_num ?? SETTINGS_PADRAO.next_service_order_num,
    metadata: metadataAtualizado,
    updated_at: agora,
    ...(criouSettings ? { created_at: agora } : {}),
  }

  const saveResult = await executarComTimeoutAdmin(
    'settings_fiscal_addon_upsert',
    async () =>
      supabase
        .from('settings')
        .upsert(payload as never, { onConflict: 'office_id' })
        .select('id')
        .maybeSingle(),
    ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS
  )

  if (saveResult.error) {
    logErroAdmin('settings_fiscal_addon_upsert', saveResult.error)
    return {
      ok: false,
      mensagem: `Não foi possível salvar Módulo Fiscal: ${saveResult.error.message}`,
    }
  }

  assinaturaService.definirModuloFiscalAdicionalAtivo(officeId, ativo)

  return {
    ok: true,
    mensagem: ativo
      ? criouSettings
        ? 'Módulo Fiscal ativado. Configurações criadas automaticamente.'
        : 'Módulo Fiscal ativado.'
      : 'Módulo Fiscal desativado.',
    modulo_fiscal_adicional_ativo: ativo,
    criou_settings: criouSettings,
  }
}
