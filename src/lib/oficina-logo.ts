import { localCraftRepository } from '@/services/repository/local.repository'
import type { ConfiguracaoOficina, Oficina } from '@/types/oficina'

type OficinaComLogo = Pick<Oficina, 'logo_url' | 'logo_storage_path' | 'nome'> & {
  office_id?: string
  oficina_id?: string
  id?: string
}

function urlLogoValida(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined
  const t = url.trim()
  if (
    t.startsWith('data:image/') ||
    t.startsWith('http://') ||
    t.startsWith('https://') ||
    t.startsWith('blob:')
  ) {
    return t
  }
  return undefined
}

/**
 * Resolve URL da logo para documentos (PDF/recibo/visualização).
 * Prioriza base64/localStorage; futuro: logo_storage_path (Supabase Storage).
 */
export function obterLogoOficinaDocumento(
  oficina: OficinaComLogo,
  fallbackLocal?: OficinaComLogo
): string | undefined {
  for (const url of [oficina.logo_url, fallbackLocal?.logo_url]) {
    const valida = urlLogoValida(url)
    if (valida) return valida
  }

  const officeId = oficina.office_id ?? oficina.oficina_id ?? oficina.id
  if (officeId) {
    try {
      const local = localCraftRepository.carregar(officeId)
      const valida = urlLogoValida(local.configuracao.logo_url)
      if (valida) return valida
    } catch {
      /* backup local indisponível */
    }
  }

  return undefined
}

export function oficinaComLogoPreservada(
  remota: ConfiguracaoOficina,
  local: ConfiguracaoOficina
): ConfiguracaoOficina {
  const coresRemotas = remota.aparencia?.cores ?? {}
  const coresLocais = local.aparencia?.cores ?? {}

  return {
    ...remota,
    logo_url: local.logo_url ?? remota.logo_url,
    logo_storage_path: local.logo_storage_path ?? remota.logo_storage_path,
    aparencia: {
      ...remota.aparencia,
      ...local.aparencia,
      nome_exibido: local.aparencia?.nome_exibido ?? remota.aparencia?.nome_exibido,
      cores: {
        ...coresRemotas,
        ...coresLocais,
      },
    },
  }
}
