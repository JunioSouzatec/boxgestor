import { obterLogoOficinaDocumento } from '@/lib/oficina-logo'
import type { ConfiguracaoOficina } from '@/types/oficina'

/** Dados da oficina logada — fonte única para nome e logo nas telas */
export interface OficinaAtual {
  id: string
  name: string
  tradeName?: string
  displayName: string
  logoUrl?: string
}

const FALLBACK_NOME = 'Oficina'

/** Nome para exibição: fantasia → razão → fallback */
export function obterNomeExibidoOficina(
  config: Pick<ConfiguracaoOficina, 'nome' | 'nome_fantasia' | 'aparencia'>
): string {
  const personalizado = config.aparencia?.nome_exibido?.trim()
  if (personalizado) return personalizado

  const fantasia = config.nome_fantasia?.trim()
  if (fantasia) return fantasia

  const nome = config.nome?.trim()
  if (nome) return nome

  return FALLBACK_NOME
}

export function obterLogoUrlOficina(config: ConfiguracaoOficina): string | undefined {
  return obterLogoOficinaDocumento(config)
}

export function obterInicialMarcaOficina(nome?: string): string {
  const limpo = nome?.trim()
  if (!limpo) return 'O'
  return limpo.charAt(0).toUpperCase()
}

export function extrairOficinaAtual(config: ConfiguracaoOficina): OficinaAtual {
  const id = config.office_id ?? config.oficina_id ?? config.id ?? ''
  const name = config.nome?.trim() || FALLBACK_NOME
  const tradeName = config.nome_fantasia?.trim() || undefined

  return {
    id,
    name,
    tradeName,
    displayName: obterNomeExibidoOficina(config),
    logoUrl: obterLogoUrlOficina(config),
  }
}

/** Título da barra superior conforme a rota */
export function resolverTituloPaginaApp(
  pathname: string,
  titulosConhecidos: Record<string, string>,
  config: Pick<ConfiguracaoOficina, 'nome' | 'nome_fantasia' | 'aparencia'>
): string {
  if (pathname.startsWith('/portal-cliente/')) return 'Central do Cliente'
  if (/^\/clientes\/[^/]+$/.test(pathname)) return 'Detalhes do Cliente'

  const titulo = titulosConhecidos[pathname]
  if (titulo) return titulo

  return obterNomeExibidoOficina(config)
}
