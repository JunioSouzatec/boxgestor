/**
 * Persistência local da idempotency_key de consulta por placa.
 * Não chama rede, não gera retry e não guarda tokens nem dados de veículo.
 *
 * Tentativas in_flight/uncertain NÃO são descartadas por TTL da reserva (3 min).
 * O backend não devolve ao browser informação suficiente para expirar com segurança.
 */

import { ehPlacaBrasileiraValida, normalizarPlaca } from '@/lib/placa-normalizar'

export const HOMOLOG_SUPABASE_HOST = 'cqnktgouczyrxkkeusio.supabase.co'
export const PLATE_LOOKUP_IDEMPOTENCY_BUCKET = 'bg:plate-lookup:idemp:v1'
export const MAX_TENTATIVAS_POR_IDENTIDADE = 40

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/

export type StatusTentativaConsultaPlaca = 'in_flight' | 'uncertain'

export type IdentidadeConsultaPlaca = {
  projectHost: string
  userId: string
  officeId: string
}

export type RegistroTentativaConsultaPlaca = {
  idempotencyKey: string
  createdAt: number
  status: StatusTentativaConsultaPlaca
  placaNorm: string
}

export type PlateLookupStorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type PlateLookupIdempotencyDeps = {
  storage?: PlateLookupStorageLike | null
  agora?: () => number
  gerarChave?: () => string
}

export type DecisaoPersistenciaTentativa = 'manter' | 'encerrar' | 'desconhecida'

type RegistroInterno = RegistroTentativaConsultaPlaca & IdentidadeConsultaPlaca

type BucketPersistido = {
  v: 1
  items: Record<string, unknown>
}

const memoria = new Map<string, RegistroInterno>()
let hidratado = false

function agoraMs(deps?: PlateLookupIdempotencyDeps): number {
  return deps?.agora?.() ?? Date.now()
}

function gerarChavePadrao(deps?: PlateLookupIdempotencyDeps): string {
  return deps?.gerarChave?.() ?? crypto.randomUUID()
}

function texto(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizarHostProjetoConsulta(raw: string): string {
  const valor = raw.trim()
  if (!valor) return ''
  try {
    const url = valor.includes('://') ? new URL(valor) : new URL(`https://${valor}`)
    if (url.username || url.password) return ''
    return url.hostname.toLowerCase()
  } catch {
    return valor.toLowerCase()
  }
}

export function ehIdentidadeConsultaPlacaValida(
  identidade: IdentidadeConsultaPlaca | null | undefined
): identidade is IdentidadeConsultaPlaca {
  if (!identidade) return false
  const projectHost = normalizarHostProjetoConsulta(identidade.projectHost)
  const userId = texto(identidade.userId).toLowerCase()
  const officeId = texto(identidade.officeId).toLowerCase()
  return (
    projectHost === HOMOLOG_SUPABASE_HOST &&
    UUID_RE.test(userId) &&
    UUID_RE.test(officeId)
  )
}

function identidadeNormalizada(
  identidade: IdentidadeConsultaPlaca
): IdentidadeConsultaPlaca | null {
  if (!ehIdentidadeConsultaPlacaValida(identidade)) return null
  return {
    projectHost: HOMOLOG_SUPABASE_HOST,
    userId: texto(identidade.userId).toLowerCase(),
    officeId: texto(identidade.officeId).toLowerCase(),
  }
}

function chaveRegistro(id: IdentidadeConsultaPlaca, placaNorm: string): string {
  return `${id.projectHost}|${id.officeId}|${id.userId}|${placaNorm}`
}

function prefixoIdentidade(id: IdentidadeConsultaPlaca): string {
  return `${id.projectHost}|${id.officeId}|${id.userId}|`
}

export function decisaoPersistenciaPorCodigo(code: string): DecisaoPersistenciaTentativa {
  switch (code) {
    case 'PLATE_LOOKUP_FINALIZE_PENDING':
    case 'PLATE_LOOKUP_NETWORK_ERROR':
    case 'PLATE_LOOKUP_UNKNOWN':
      return 'manter'
    case 'PLATE_LOOKUP_SIMULATED_OK':
    case 'PLATE_LOOKUP_SIMULATED_NOT_FOUND':
    case 'PLATE_LOOKUP_SIMULATED_TIMEOUT':
    case 'PLATE_LOOKUP_SIMULATED_ERROR':
    case 'RESERVATION_EXPIRED':
    case 'IDEMPOTENCY_REPLAY_BLOCKED':
    case 'IDEMPOTENCY_PLATE_MISMATCH':
    case 'TRIAL_QUOTA_EXCEEDED':
    case 'PLATE_LOOKUP_UNAUTHENTICATED':
    case 'PLATE_LOOKUP_PROJECT_BLOCKED':
    case 'PLATE_LOOKUP_DISABLED':
    case 'PLATE_LOOKUP_REAL_MODE_BLOCKED':
    case 'PLATE_INVALID':
    case 'IDEMPOTENCY_INVALID':
      return 'encerrar'
    default:
      return 'desconhecida'
  }
}

function registroPublico(reg: RegistroInterno): RegistroTentativaConsultaPlaca {
  return {
    idempotencyKey: reg.idempotencyKey,
    createdAt: reg.createdAt,
    status: reg.status,
    placaNorm: reg.placaNorm,
  }
}

function asRegistroInterno(raw: unknown): RegistroInterno | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const identidade = identidadeNormalizada({
    projectHost: texto(rec.projectHost),
    userId: texto(rec.userId),
    officeId: texto(rec.officeId),
  })
  const placaNorm = texto(rec.placaNorm)
  const idempotencyKey = texto(rec.idempotencyKey)
  const status = texto(rec.status)
  const createdAt =
    typeof rec.createdAt === 'number' && Number.isFinite(rec.createdAt) ? rec.createdAt : NaN
  if (
    !identidade ||
    !ehPlacaBrasileiraValida(placaNorm) ||
    normalizarPlaca(placaNorm) !== placaNorm ||
    !IDEMPOTENCY_KEY_RE.test(idempotencyKey) ||
    (status !== 'in_flight' && status !== 'uncertain') ||
    !Number.isFinite(createdAt)
  ) {
    return null
  }
  if (
    'dados' in rec ||
    'resultado' in rec ||
    'jwt' in rec ||
    'access_token' in rec ||
    'refresh_token' in rec ||
    'service_role' in rec
  ) {
    return null
  }
  return {
    ...identidade,
    placaNorm,
    idempotencyKey,
    createdAt,
    status,
  }
}

function storageEfetivo(
  deps?: PlateLookupIdempotencyDeps
): PlateLookupStorageLike | null {
  if (deps && 'storage' in deps) return deps.storage ?? null
  try {
    if (typeof sessionStorage === 'undefined') return null
    const probe = '__bg_plate_lookup_idemp_probe__'
    sessionStorage.setItem(probe, '1')
    sessionStorage.removeItem(probe)
    return sessionStorage
  } catch {
    return null
  }
}

function lerBucket(storage: PlateLookupStorageLike | null): Record<string, RegistroInterno> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(PLATE_LOOKUP_IDEMPOTENCY_BUCKET)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const items = (parsed as BucketPersistido).items
    if (!items || typeof items !== 'object' || Array.isArray(items)) return {}
    const limpos: Record<string, RegistroInterno> = {}
    for (const [chave, valor] of Object.entries(items)) {
      const registro = asRegistroInterno(valor)
      if (!registro) continue
      if (chave !== chaveRegistro(registro, registro.placaNorm)) continue
      limpos[chave] = registro
    }
    return limpos
  } catch {
    return {}
  }
}

function gravarBucket(
  storage: PlateLookupStorageLike | null,
  items: Record<string, RegistroInterno>
): void {
  if (!storage) return
  const persistido: BucketPersistido = { v: 1, items }
  try {
    storage.setItem(PLATE_LOOKUP_IDEMPOTENCY_BUCKET, JSON.stringify(persistido))
  } catch {
    /* quota / storage bloqueado — memória segue isolada */
  }
}

function hidratarSePreciso(deps?: PlateLookupIdempotencyDeps): void {
  if (hidratado) return
  hidratado = true
  const lidos = lerBucket(storageEfetivo(deps))
  memoria.clear()
  for (const [chave, registro] of Object.entries(lidos)) {
    memoria.set(chave, registro)
  }
}

function persistirTudo(deps?: PlateLookupIdempotencyDeps): void {
  const items: Record<string, RegistroInterno> = {}
  for (const [chave, registro] of memoria.entries()) {
    items[chave] = registro
  }
  gravarBucket(storageEfetivo(deps), items)
}

function contarDaIdentidade(id: IdentidadeConsultaPlaca): number {
  const prefixo = prefixoIdentidade(id)
  let n = 0
  for (const chave of memoria.keys()) {
    if (chave.startsWith(prefixo)) n += 1
  }
  return n
}

export function localizarTentativaConsultaPlaca(
  identidade: IdentidadeConsultaPlaca,
  placa: string,
  deps?: PlateLookupIdempotencyDeps
): RegistroTentativaConsultaPlaca | null {
  const id = identidadeNormalizada(identidade)
  if (!id || !ehPlacaBrasileiraValida(placa)) return null
  hidratarSePreciso(deps)
  const placaNorm = normalizarPlaca(placa)
  const registro = memoria.get(chaveRegistro(id, placaNorm))
  if (!registro) return null
  if (
    registro.projectHost !== id.projectHost ||
    registro.userId !== id.userId ||
    registro.officeId !== id.officeId ||
    registro.placaNorm !== placaNorm
  ) {
    return null
  }
  return registroPublico(registro)
}

export function obterChaveTentativaConsultaPlaca(
  identidade: IdentidadeConsultaPlaca,
  placa: string,
  deps?: PlateLookupIdempotencyDeps
): string | null {
  return localizarTentativaConsultaPlaca(identidade, placa, deps)?.idempotencyKey ?? null
}

export function criarTentativaConsultaPlaca(
  identidade: IdentidadeConsultaPlaca,
  placa: string,
  deps?: PlateLookupIdempotencyDeps
): { criada: boolean; registro: RegistroTentativaConsultaPlaca } | null {
  const id = identidadeNormalizada(identidade)
  if (!id || !ehPlacaBrasileiraValida(placa)) return null
  hidratarSePreciso(deps)

  const existente = localizarTentativaConsultaPlaca(id, placa, deps)
  if (existente) {
    return { criada: false, registro: existente }
  }

  if (contarDaIdentidade(id) >= MAX_TENTATIVAS_POR_IDENTIDADE) {
    return null
  }

  const placaNorm = normalizarPlaca(placa)
  const idempotencyKey = gerarChavePadrao(deps)
  if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) return null

  const registro: RegistroInterno = {
    ...id,
    placaNorm,
    idempotencyKey,
    createdAt: agoraMs(deps),
    status: 'in_flight',
  }
  memoria.set(chaveRegistro(id, placaNorm), registro)
  persistirTudo(deps)
  return { criada: true, registro: registroPublico(registro) }
}

export function marcarTentativaConsultaIncerta(
  identidade: IdentidadeConsultaPlaca,
  placa: string,
  deps?: PlateLookupIdempotencyDeps
): RegistroTentativaConsultaPlaca | null {
  const id = identidadeNormalizada(identidade)
  if (!id || !ehPlacaBrasileiraValida(placa)) return null
  hidratarSePreciso(deps)
  const chave = chaveRegistro(id, normalizarPlaca(placa))
  const atual = memoria.get(chave)
  if (!atual) return null
  const atualizado: RegistroInterno = { ...atual, status: 'uncertain' }
  memoria.set(chave, atualizado)
  persistirTudo(deps)
  return registroPublico(atualizado)
}

export function encerrarTentativaConsultaPlaca(
  identidade: IdentidadeConsultaPlaca,
  placa: string,
  deps?: PlateLookupIdempotencyDeps
): boolean {
  const id = identidadeNormalizada(identidade)
  if (!id || !ehPlacaBrasileiraValida(placa)) return false
  hidratarSePreciso(deps)
  const chave = chaveRegistro(id, normalizarPlaca(placa))
  if (!memoria.has(chave)) return false
  memoria.delete(chave)
  persistirTudo(deps)
  return true
}

export function limparTentativasConsultaIdentidade(
  identidade: IdentidadeConsultaPlaca,
  deps?: PlateLookupIdempotencyDeps
): number {
  const id = identidadeNormalizada(identidade)
  if (!id) return 0
  hidratarSePreciso(deps)
  const prefixo = prefixoIdentidade(id)
  let removidos = 0
  for (const chave of [...memoria.keys()]) {
    if (!chave.startsWith(prefixo)) continue
    memoria.delete(chave)
    removidos += 1
  }
  persistirTudo(deps)
  return removidos
}

/**
 * Remove só registros corrompidos ou de projeto não Homolog.
 * Nunca apaga in_flight/uncertain válidos por idade ou TTL de reserva.
 */
export function aplicarLimpezaConservadora(deps?: PlateLookupIdempotencyDeps): number {
  hidratarSePreciso(deps)
  let removidos = 0
  for (const [chave, registro] of [...memoria.entries()]) {
    const valido = asRegistroInterno(registro)
    if (valido && chave === chaveRegistro(valido, valido.placaNorm)) continue
    memoria.delete(chave)
    removidos += 1
  }
  persistirTudo(deps)
  return removidos
}

/** Só para testes locais. Não usar no botão. */
export function resetarStoreConsultaPlacaParaTestes(): void {
  memoria.clear()
  hidratado = false
}
