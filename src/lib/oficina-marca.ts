import { obterLogoOficinaDocumento, oficinaComLogoPreservada } from '@/lib/oficina-logo'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { AparienciaOficina, ConfiguracaoOficina, CoresMarcaOficina } from '@/types/oficina'

/** Cores padrão do Craft Oficina (espelham index.css) */
export const CORES_MARCA_PADRAO: Required<CoresMarcaOficina> = {
  cor_primaria: '#f59e0b',
  cor_secundaria: '#27272a',
  cor_destaque: '#fbbf24',
  cor_botoes: '#f59e0b',
  cor_sucesso: '#10b981',
  cor_alerta: '#f59e0b',
  cor_erro: '#ef4444',
}

export function obterCoresMarcaEfetivas(
  config: Pick<ConfiguracaoOficina, 'aparencia'>
): Required<CoresMarcaOficina> {
  const cores = config.aparencia?.cores ?? {}
  return {
    cor_primaria: cores.cor_primaria?.trim() || CORES_MARCA_PADRAO.cor_primaria,
    cor_secundaria: cores.cor_secundaria?.trim() || CORES_MARCA_PADRAO.cor_secundaria,
    cor_destaque: cores.cor_destaque?.trim() || CORES_MARCA_PADRAO.cor_destaque,
    cor_botoes: cores.cor_botoes?.trim() || CORES_MARCA_PADRAO.cor_botoes,
    cor_sucesso: cores.cor_sucesso?.trim() || CORES_MARCA_PADRAO.cor_sucesso,
    cor_alerta: cores.cor_alerta?.trim() || CORES_MARCA_PADRAO.cor_alerta,
    cor_erro: cores.cor_erro?.trim() || CORES_MARCA_PADRAO.cor_erro,
  }
}

export function obterNomeExibidoOficina(
  config: Pick<ConfiguracaoOficina, 'nome' | 'nome_fantasia' | 'aparencia'>
): string {
  const custom = config.aparencia?.nome_exibido?.trim()
  if (custom) return custom
  return config.nome_fantasia?.trim() || config.nome
}

export function obterLogoUrlOficina(config: ConfiguracaoOficina): string | undefined {
  return obterLogoOficinaDocumento(config)
}

export function criarAparienciaPadrao(): AparienciaOficina {
  return {
    cores: { ...CORES_MARCA_PADRAO },
  }
}

export function oficinaComMarcaPreservada(
  remota: ConfiguracaoOficina,
  local: ConfiguracaoOficina
): ConfiguracaoOficina {
  return oficinaComLogoPreservada(remota, local)
}

/** Carrega configuração pública (login/PWA) a partir do localStorage */
export function obterConfiguracaoPublica(officeId?: string): ConfiguracaoOficina | null {
  const candidatos = [officeId].filter(Boolean) as string[]

  try {
    const authRaw = localStorage.getItem('craft_auth_v1')
    if (authRaw) {
      const store = JSON.parse(authRaw) as { session?: { user?: { office_id?: string } } }
      const id = store.session?.user?.office_id
      if (id && !candidatos.includes(id)) candidatos.unshift(id)
    }
  } catch {
    /* ignore */
  }

  if (candidatos.length === 0) {
    candidatos.push('oficina-craft-001')
  }

  for (const id of candidatos) {
    try {
      return localCraftRepository.carregar(id).configuracao
    } catch {
      continue
    }
  }

  return null
}
