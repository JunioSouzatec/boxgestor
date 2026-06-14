import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Timestamped } from '@/types/base'
import { oficinaComLogoPreservada, urlLogoValida } from '@/lib/oficina-logo'

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
 * - Logo: nunca apaga com vazio; prioriza Supabase se válida, senão local.
 * - Com fonteVerdadeRemota: Supabase manda nos campos de empresa (F5 confiável).
 * - Sem fonteVerdadeRemota: se local foi editado depois do remoto, preserva campos locais.
 */
export function mesclarConfiguracaoOficina(
  remota: ConfiguracaoOficina,
  local: ConfiguracaoOficina,
  opcoes?: { fonteVerdadeRemota?: boolean }
): ConfiguracaoOficina {
  const merged = oficinaComLogoPreservada(remota, local)

  const logoRemota = urlLogoValida(remota.logo_url)
  const logoLocal = urlLogoValida(local.logo_url)

  const comLogo: ConfiguracaoOficina = {
    ...merged,
    logo_url: logoRemota ?? logoLocal ?? local.logo_url ?? remota.logo_url,
    logo_storage_path: local.logo_storage_path ?? remota.logo_storage_path,
  }

  if (opcoes?.fonteVerdadeRemota) {
    return comLogo
  }

  const tsLocal = timestampOf(local as ConfigComTimestamp)
  const tsRemota = timestampOf(remota as ConfigComTimestamp)

  if (tsLocal && tsLocal > tsRemota) {
    for (const campo of CAMPOS_EMPRESA) {
      const valor = local[campo as keyof ConfiguracaoOficina]
      if (valor !== undefined && valor !== null && valor !== '') {
        Object.assign(comLogo, { [campo]: valor })
      }
    }
    comLogo.updated_at = local.updated_at
  }

  return comLogo
}
