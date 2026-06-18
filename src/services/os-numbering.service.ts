import { getCraftPersistenceMode, getSupabaseClient } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import type { CraftDatabase } from '@/types/database'
import type { OrdemServico } from '@/types/ordem-servico'
import { getDataLocalHoje } from '@/lib/data-local'

export interface GrupoOsNumeroDuplicado {
  numero: number
  ordens: OrdemServico[]
}

export interface AuditoriaNumeracaoOs {
  totalOs: number
  maiorNumero: number
  proximoNumeroPrevisto: number
  duplicados: GrupoOsNumeroDuplicado[]
  numerosFaltando: number[]
  apenasLocal: OrdemServico[]
  apenasSupabase: number[]
}

export function obterMaiorNumeroOs(ordens: OrdemServico[]): number {
  return ordens.reduce((max, o) => Math.max(max, o.numero ?? 0), 0)
}

export function numeroOsJaExiste(
  ordens: OrdemServico[],
  numero: number,
  excluirId?: string
): boolean {
  return ordens.some((o) => o.numero === numero && o.id !== excluirId)
}

/** Calcula o próximo número com base nas OS existentes e no contador persistido. */
export function calcularProximoNumeroOs(
  dados: Pick<CraftDatabase, 'ordens_servico' | 'proximo_numero_os'>
): number {
  const maiorNumero = obterMaiorNumeroOs(dados.ordens_servico)
  const contador = dados.proximo_numero_os ?? 1
  return Math.max(contador, maiorNumero + 1)
}

/** Garante que proximo_numero_os nunca fique atrás do maior número real. */
export function sincronizarProximoNumeroOsNoDatabase(db: CraftDatabase): CraftDatabase {
  const proximo = calcularProximoNumeroOs(db)
  if (proximo <= (db.proximo_numero_os ?? 1)) return db
  if (import.meta.env.DEV) {
    console.info('[Craft OS] proximo_numero_os ajustado', {
      anterior: db.proximo_numero_os,
      novo: proximo,
      maior_os: obterMaiorNumeroOs(db.ordens_servico),
    })
  }
  return { ...db, proximo_numero_os: proximo }
}

/** Próximo número disponível, evitando colisão com OS já existentes. */
export function resolverProximoNumeroOsDisponivel(
  dados: CraftDatabase,
  excluirId?: string
): number {
  const db = sincronizarProximoNumeroOsNoDatabase(dados)
  let numero = calcularProximoNumeroOs(db)
  while (numeroOsJaExiste(db.ordens_servico, numero, excluirId)) {
    if (import.meta.env.DEV) {
      console.warn('[Craft OS] Número de OS já em uso — buscando próximo disponível', { numero })
    }
    numero += 1
  }
  return numero
}

export async function consultarMaiorNumeroOsSupabase(officeUuid: string): Promise<number | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('service_orders')
    .select('number')
    .eq('office_id', officeUuid)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle<{ number: number }>()

  if (error) {
    console.warn('[Craft OS] Falha ao consultar maior número no Supabase', error.message)
    return null
  }
  if (!data) return 0
  return Number(data.number) || 0
}

export async function consultarProximoNumeroSettingsSupabase(
  officeUuid: string
): Promise<number | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('settings')
    .select('next_service_order_num')
    .eq('office_id', officeUuid)
    .maybeSingle<{ next_service_order_num: number }>()

  if (error) return null
  return data?.next_service_order_num ?? null
}

/** Supabase-first: maior número remoto + contador + OS locais. */
export async function resolverProximoNumeroOsOnline(
  officeLocalId: string,
  dados: CraftDatabase
): Promise<{ numero: number; fonte: 'local' | 'supabase' }> {
  const local = resolverProximoNumeroOsDisponivel(dados)

  if (getCraftPersistenceMode() !== 'supabase') {
    return { numero: local, fonte: 'local' }
  }

  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) {
    return { numero: local, fonte: 'local' }
  }

  const [maiorRemoto, settingsNum] = await Promise.all([
    consultarMaiorNumeroOsSupabase(contexto.officeUuid),
    consultarProximoNumeroSettingsSupabase(contexto.officeUuid),
  ])

  let candidato = local
  if (maiorRemoto != null) candidato = Math.max(candidato, maiorRemoto + 1)
  if (settingsNum != null) candidato = Math.max(candidato, settingsNum)

  while (numeroOsJaExiste(dados.ordens_servico, candidato)) {
    candidato += 1
  }

  if (import.meta.env.DEV && candidato !== local) {
    console.info('[Craft OS] Número reservado via Supabase', {
      local,
      candidato,
      maior_remoto: maiorRemoto,
      settings: settingsNum,
    })
  }

  return { numero: candidato, fonte: 'supabase' }
}

export function detectarNumerosOsDuplicados(ordens: OrdemServico[]): GrupoOsNumeroDuplicado[] {
  const porNumero = new Map<number, OrdemServico[]>()
  for (const os of ordens) {
    const lista = porNumero.get(os.numero) ?? []
    lista.push(os)
    porNumero.set(os.numero, lista)
  }
  return [...porNumero.entries()]
    .filter(([, lista]) => lista.length > 1)
    .map(([numero, lista]) => ({ numero, ordens: lista }))
    .sort((a, b) => a.numero - b.numero)
}

export function detectarNumerosOsFaltando(ordens: OrdemServico[]): number[] {
  if (ordens.length === 0) return []
  const numeros = new Set(ordens.map((o) => o.numero))
  const min = Math.min(...ordens.map((o) => o.numero))
  const max = Math.max(...ordens.map((o) => o.numero))
  const faltando: number[] = []
  for (let n = min; n <= max; n++) {
    if (!numeros.has(n)) faltando.push(n)
  }
  return faltando
}

export function auditarNumeracaoOs(
  dados: CraftDatabase,
  idsSupabaseConhecidos?: Set<string>
): AuditoriaNumeracaoOs {
  const ordens = dados.ordens_servico
  const maiorNumero = obterMaiorNumeroOs(ordens)
  const proximoNumeroPrevisto = calcularProximoNumeroOs(dados)
  const duplicados = detectarNumerosOsDuplicados(ordens)

  const apenasLocal = idsSupabaseConhecidos
    ? ordens.filter((o) => !idsSupabaseConhecidos.has(o.id))
    : []

  return {
    totalOs: ordens.length,
    maiorNumero,
    proximoNumeroPrevisto,
    duplicados,
    numerosFaltando: detectarNumerosOsFaltando(ordens),
    apenasLocal,
    apenasSupabase: [],
  }
}

export function repararRenumerarOs(
  db: CraftDatabase,
  osId: string,
  novoNumero: number
): CraftDatabase {
  const agora = getDataLocalHoje()
  const ordens = db.ordens_servico.map((o) =>
    o.id === osId
      ? {
          ...o,
          numero: novoNumero,
          atualizado_em: agora,
          sync_pendente: true,
        }
      : o
  )
  const nextDb: CraftDatabase = {
    ...db,
    ordens_servico: ordens,
    proximo_numero_os: Math.max(db.proximo_numero_os, novoNumero + 1),
  }
  return sincronizarProximoNumeroOsNoDatabase(nextDb)
}

export function renumerarOsParaProximoDisponivel(
  db: CraftDatabase,
  osId: string
): { db: CraftDatabase; novoNumero: number } | null {
  const os = db.ordens_servico.find((o) => o.id === osId)
  if (!os) return null
  const novoNumero = resolverProximoNumeroOsDisponivel(db, osId)
  return {
    db: repararRenumerarOs(db, osId, novoNumero),
    novoNumero,
  }
}
