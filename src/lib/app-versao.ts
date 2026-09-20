import {
  APP_DEPLOY_BUILT_AT,
  APP_DEPLOY_VERSION,
} from '../generated/app-version'

export const REF_SUPABASE_HOMOLOG = 'cqnktgouczyrxkkeusio'
export const REF_SUPABASE_PRODUCTION = 'fgarivlagocabyumniiz'

export interface IdentidadeApp {
  versaoAmigavel: string
  buildCurto: string
  homolog: boolean
}

export function ehAmbienteHomologacao(url?: string | null): boolean {
  const valor = url ?? ''
  if (!valor || valor.includes(REF_SUPABASE_PRODUCTION)) return false
  return valor.includes(REF_SUPABASE_HOMOLOG)
}

function formatarUtc(ano: string, mes: string, dia: string, hora: string, minuto: string): string {
  return `${ano}.${mes}.${dia}-${hora}${minuto}`
}

function formatarDeIso(builtAt: string): string | null {
  const iso = builtAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (iso) return formatarUtc(iso[1], iso[2], iso[3], iso[4], iso[5])
  const d = new Date(builtAt)
  if (Number.isNaN(d.getTime())) return null
  return formatarUtc(
    String(d.getUTCFullYear()),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
    String(d.getUTCHours()).padStart(2, '0'),
    String(d.getUTCMinutes()).padStart(2, '0')
  )
}

function formatarDeVersion(version: string): string | null {
  const m = version
    .replace(/^build-/, '')
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/)
  if (!m) return null
  return formatarUtc(m[1], m[2], m[3], m[4], m[5])
}

/** Versão amigável da build que está no bundle (APP_DEPLOY_VERSION / APP_DEPLOY_BUILT_AT). */
export function versaoAppAmigavel(version: string, builtAt?: string): string {
  const doBuiltAt = builtAt?.trim() ? formatarDeIso(builtAt.trim()) : null
  if (doBuiltAt) return doBuiltAt
  const daVersion = formatarDeVersion(version)
  if (daVersion) return daVersion
  const curto = version.replace(/^build-/, '').trim()
  return curto.slice(0, 12) || '—'
}

/** Identificador curto para diferenciar Previews sucessivos. Sem deployment ID da Vercel. */
export function buildAppCurto(version: string): string {
  const s = version.trim().replace(/^build-/, '')
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}${m[6]}`
  return s.slice(0, 12) || '—'
}

export function obterIdentidadeApp(opcoes?: {
  version?: string
  builtAt?: string
  supabaseUrl?: string | null
}): IdentidadeApp {
  const version = opcoes?.version ?? APP_DEPLOY_VERSION
  const builtAt = opcoes?.builtAt ?? APP_DEPLOY_BUILT_AT
  return {
    versaoAmigavel: versaoAppAmigavel(version, builtAt),
    buildCurto: buildAppCurto(version),
    homolog: ehAmbienteHomologacao(opcoes?.supabaseUrl),
  }
}
