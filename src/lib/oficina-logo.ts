import { localCraftRepository } from '@/services/repository/local.repository'
import type { ConfiguracaoOficina, Oficina } from '@/types/oficina'

type OficinaComLogo = Pick<
  Oficina,
  'logo_url' | 'logo_storage_path' | 'logo_removida_em' | 'nome'
> & {
  office_id?: string
  oficina_id?: string
  id?: string
}

export function urlLogoValida(url?: string | null): string | undefined {
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

export function logoFoiRemovida(config: Pick<OficinaComLogo, 'logo_removida_em' | 'logo_url'>): boolean {
  return Boolean(config.logo_removida_em) && !urlLogoValida(config.logo_url)
}

function resolverLogoMerge(
  remota: ConfiguracaoOficina,
  local: ConfiguracaoOficina,
  prioridadeRemota: boolean
): { logo_url?: string; logo_storage_path?: string; logo_removida_em?: string } {
  const remotaRemovida = logoFoiRemovida(remota)
  const localRemovida = logoFoiRemovida(local)
  const logoRemota = urlLogoValida(remota.logo_url)
  const logoLocal = urlLogoValida(local.logo_url)

  if (prioridadeRemota) {
    if (remotaRemovida) {
      return {
        logo_url: undefined,
        logo_storage_path: undefined,
        logo_removida_em: remota.logo_removida_em,
      }
    }
    return {
      logo_url: logoRemota,
      logo_storage_path: logoRemota ? remota.logo_storage_path : undefined,
      logo_removida_em: logoRemota ? undefined : remota.logo_removida_em,
    }
  }

  if (localRemovida) {
    return {
      logo_url: undefined,
      logo_storage_path: undefined,
      logo_removida_em: local.logo_removida_em,
    }
  }

  if (remotaRemovida && !logoLocal) {
    return {
      logo_url: undefined,
      logo_storage_path: undefined,
      logo_removida_em: remota.logo_removida_em,
    }
  }

  const logoFinal = logoRemota ?? logoLocal
  return {
    logo_url: logoFinal,
    logo_storage_path: logoFinal ? local.logo_storage_path ?? remota.logo_storage_path : undefined,
    logo_removida_em: logoFinal ? undefined : remota.logo_removida_em ?? local.logo_removida_em,
  }
}

/**
 * Resolve URL da logo para documentos (PDF/recibo/visualização).
 * Fonte oficial: configuracao.logo_url. Não restaura logo removida do cache local.
 */
export function obterLogoOficinaDocumento(
  oficina: OficinaComLogo,
  fallbackLocal?: OficinaComLogo
): string | undefined {
  if (logoFoiRemovida(oficina)) return undefined

  const direta = urlLogoValida(oficina.logo_url)
  if (direta) return direta

  if (fallbackLocal && !logoFoiRemovida(fallbackLocal)) {
    const fallback = urlLogoValida(fallbackLocal.logo_url)
    if (fallback) return fallback
  }

  return undefined
}

export function oficinaComLogoPreservada(
  remota: ConfiguracaoOficina,
  local: ConfiguracaoOficina,
  opcoes?: { prioridadeRemota?: boolean }
): ConfiguracaoOficina {
  const prioridadeRemota = opcoes?.prioridadeRemota ?? false
  const logo = resolverLogoMerge(remota, local, prioridadeRemota)

  if (prioridadeRemota) {
    return {
      ...remota,
      ...logo,
      id: local.id,
      office_id: local.office_id ?? remota.office_id,
      oficina_id: local.oficina_id ?? remota.oficina_id,
    }
  }

  const coresRemotas = remota.aparencia?.cores ?? {}
  const coresLocais = local.aparencia?.cores ?? {}

  return {
    ...remota,
    ...logo,
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

/** Limpa logo do tenant local (uso ao excluir logo). */
export function limparLogoCacheLocal(officeId: string): void {
  try {
    const db = localCraftRepository.carregar(officeId)
    localCraftRepository.salvar(officeId, {
      ...db,
      configuracao: {
        ...db.configuracao,
        logo_url: undefined,
        logo_storage_path: undefined,
        logo_removida_em: new Date().toISOString(),
      },
    })
  } catch {
    /* cache indisponível */
  }
}
