import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Timestamped } from '@/types/base'
import { oficinaComLogoPreservada } from '@/lib/oficina-logo'
import { logSyncConfigDev } from '@/services/comunicacao/comunicacao-sync-debug'

type ConfigComTimestamp = ConfiguracaoOficina & Timestamped

const CAMPOS_EMPRESA: (keyof ConfiguracaoOficina)[] = [
  'nome',
  'nome_fantasia',
  'endereco',
  'bairro',
  'cidade',
  'estado',
  'cep',
  'telefone',
  'whatsapp',
  'cnpj',
  'email',
  'preferencias',
  'aparencia',
]

function timestampOf(config: ConfigComTimestamp): string {
  return config.updated_at ?? config.atualizado_em ?? config.created_at ?? config.criado_em ?? ''
}

/**
 * Mescla configuração remota (Supabase) com local.
 * - Com fonteVerdadeRemota: Supabase manda em tudo (F5 / sync confiável).
 * - Sem fonteVerdadeRemota: merge de logo + campos locais mais recentes.
 */
export function mesclarConfiguracaoOficina(
  remota: ConfiguracaoOficina,
  local: ConfiguracaoOficina,
  opcoes?: { fonteVerdadeRemota?: boolean }
): ConfiguracaoOficina {
  if (opcoes?.fonteVerdadeRemota) {
    const resultado: ConfiguracaoOficina = {
      ...remota,
      id: local.id,
      office_id: local.office_id ?? remota.office_id,
      oficina_id: local.oficina_id ?? remota.oficina_id,
    }
    logSyncConfigDev({
      origem: 'supabase',
      updatedAtRemoto: timestampOf(remota as ConfigComTimestamp),
      updatedAtLocal: timestampOf(local as ConfigComTimestamp),
      temLogo: Boolean(resultado.logo_url),
      temAparencia: Boolean(resultado.aparencia),
    })
    return resultado
  }

  const merged = oficinaComLogoPreservada(remota, local, { prioridadeRemota: false })

  const comLogo: ConfiguracaoOficina = {
    ...merged,
    logo_storage_path: merged.logo_storage_path,
  }

  const tsLocal = timestampOf(local as ConfigComTimestamp)
  const tsRemota = timestampOf(remota as ConfigComTimestamp)

  if (tsLocal && tsLocal > tsRemota) {
    for (const campo of CAMPOS_EMPRESA) {
      const valor = local[campo as keyof ConfiguracaoOficina]
      // String vazia é limpeza intencional — não ignorar (evita ressuscitar valor remoto).
      if (valor !== undefined && valor !== null) {
        Object.assign(comLogo, { [campo]: valor })
      }
    }
    comLogo.updated_at = local.updated_at
  }

  logSyncConfigDev({
    origem: 'merge',
    updatedAtRemoto: tsRemota,
    updatedAtLocal: tsLocal,
    temLogo: Boolean(comLogo.logo_url),
    temAparencia: Boolean(comLogo.aparencia),
  })

  return comLogo
}
