import { obterNomeExibidoOficina } from '@/lib/oficina-atual'
import type { AuthUser } from '@/types/auth'
import type { ConfiguracaoOficina } from '@/types/oficina'

const DOMINIO_INTERNO = 'boxgestor.local'

const CODIGO_ACESSO_MIN = 3
const CODIGO_ACESSO_MAX = 30

/** Normaliza login interno: minúsculas, sem espaços. */
export function normalizarLoginInterno(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '')
}

/**
 * Normaliza o código de acesso da oficina (editável, independente do nome).
 * Minúsculas, sem acento, espaços→hífen, só [a-z0-9-], sem hífen nas pontas.
 */
export function normalizarCodigoAcessoOficina(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CODIGO_ACESSO_MAX)
}

/** Valida código já normalizado. Retorna mensagem de erro ou null. */
export function validarCodigoAcessoOficina(valor: string): string | null {
  const codigo = normalizarCodigoAcessoOficina(valor)
  if (!codigo) return 'Informe o código de acesso da oficina.'
  if (codigo.length < CODIGO_ACESSO_MIN) {
    return `O código deve ter pelo menos ${CODIGO_ACESSO_MIN} caracteres.`
  }
  if (codigo.length > CODIGO_ACESSO_MAX) {
    return `O código deve ter no máximo ${CODIGO_ACESSO_MAX} caracteres.`
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(codigo)) {
    return 'Use apenas letras minúsculas, números e hífen (sem espaços nem caracteres especiais).'
  }
  return null
}

/** Slug estável da oficina para e-mail técnico interno (fallback quando ainda não há código salvo). */
export function gerarSlugOficinaInterno(officeId: string, nomeOficina?: string): string {
  const base = normalizarCodigoAcessoOficina(nomeOficina ?? '').slice(0, 32)

  if (base.length >= CODIGO_ACESSO_MIN) return base
  return officeId.replace(/-/g, '').slice(0, 12).toLowerCase() || 'oficina'
}

export type FonteCodigoAcessoOficina = 'config' | 'profiles' | 'nome_exibido'

export interface CodigoAcessoOficinaResolvido {
  codigo: string
  fonte: FonteCodigoAcessoOficina
}

/** Extrai slug do e-mail técnico: user@texugo-motos.boxgestor.local → texugo-motos */
export function extrairSlugDeEmailInterno(email: string): string | null {
  const e = email.trim().toLowerCase()
  if (!e.endsWith(`.${DOMINIO_INTERNO}`)) return null
  const local = e.slice(0, -(`.${DOMINIO_INTERNO}`).length)
  const at = local.lastIndexOf('@')
  if (at < 0) return null
  const slug = local.slice(at + 1).trim()
  return slug.length >= CODIGO_ACESSO_MIN ? slug : null
}

type UsuarioCodigoAcesso = Pick<
  AuthUser,
  'office_id' | 'office_slug' | 'email' | 'interno' | 'updated_at' | 'created_at'
>

function slugDoUsuario(u: UsuarioCodigoAcesso): string | null {
  const doCampo = u.office_slug?.trim().toLowerCase()
  if (doCampo) return doCampo
  if (u.interno || ehEmailInternoBoxGestor(u.email)) {
    return extrairSlugDeEmailInterno(u.email)
  }
  return null
}

/**
 * Resolve o código de acesso oficial da oficina.
 * Fonte oficial: config.office_slug (editável, independente do nome).
 * Fallback: profiles → slug do nome exibido (só se ainda não houver código salvo).
 */
export function resolverCodigoAcessoOficina(params: {
  officeId: string
  config: Pick<ConfiguracaoOficina, 'nome' | 'nome_fantasia' | 'aparencia' | 'office_slug'>
  usuarios?: UsuarioCodigoAcesso[]
}): CodigoAcessoOficinaResolvido {
  const officeId = params.officeId.trim()
  const configSlug = normalizarCodigoAcessoOficina(params.config.office_slug ?? '')
  if (configSlug.length >= CODIGO_ACESSO_MIN) {
    const daOficina = (params.usuarios ?? []).filter(
      (u) => !u.office_id?.trim() || u.office_id.trim() === officeId
    )
    const divergentes = new Set<string>()
    for (const u of daOficina) {
      const s = slugDoUsuario(u)
      if (s && s !== configSlug) divergentes.add(s)
    }
    if (divergentes.size > 0) {
      console.warn(
        '[BoxGestor] Divergência: config.office_slug oficial difere de profiles.office_slug',
        { officeId, oficial: configSlug, profiles: [...divergentes] }
      )
    }
    return { codigo: configSlug, fonte: 'config' }
  }

  const daOficina = (params.usuarios ?? []).filter(
    (u) => !u.office_id?.trim() || u.office_id.trim() === officeId
  )
  const slugsPerfis = daOficina
    .map((u) => slugDoUsuario(u))
    .filter((s): s is string => Boolean(s))

  if (slugsPerfis.length > 0) {
    const contagem = new Map<string, number>()
    for (const s of slugsPerfis) contagem.set(s, (contagem.get(s) ?? 0) + 1)
    const ordenados = [...contagem.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )
    if (ordenados.length > 1) {
      console.warn(
        '[BoxGestor] Códigos de acesso divergentes em profiles (sem config.office_slug)',
        { officeId, slugs: ordenados }
      )
    }
    return { codigo: ordenados[0][0], fonte: 'profiles' }
  }

  return {
    codigo: gerarSlugOficinaInterno(officeId, obterNomeExibidoOficina(params.config)),
    fonte: 'nome_exibido',
  }
}

/** Atalho: só o código (string) para as telas. */
export function obterCodigoAcessoOficina(
  officeId: string,
  config: Pick<ConfiguracaoOficina, 'nome' | 'nome_fantasia' | 'aparencia' | 'office_slug'>,
  usuarios?: UsuarioCodigoAcesso[]
): string {
  return resolverCodigoAcessoOficina({ officeId, config, usuarios }).codigo
}

export function gerarEmailInterno(login: string, officeSlug: string): string {
  const user = normalizarLoginInterno(login)
  const slug = normalizarCodigoAcessoOficina(officeSlug)
  return `${user}@${slug}.${DOMINIO_INTERNO}`
}

export function ehEmailInternoBoxGestor(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`.${DOMINIO_INTERNO}`)
}

export function extrairLoginDeEmailInterno(email: string): string | null {
  if (!ehEmailInternoBoxGestor(email)) return null
  const partes = email.trim().toLowerCase().split('@')
  return partes[0] || null
}

export function identificadorPareceEmail(valor: string): boolean {
  return valor.includes('@')
}

export function validarLoginInterno(login: string): string | null {
  const norm = normalizarLoginInterno(login)
  if (norm.length < 3) return 'O usuário deve ter pelo menos 3 caracteres.'
  if (norm.length > 32) return 'O usuário deve ter no máximo 32 caracteres.'
  return null
}

export function validarSenhaInterna(senha: string): string | null {
  if (senha.length < 6) return 'A senha deve ter pelo menos 6 caracteres.'
  return null
}
