import type { RegraLembrete, RegraLembreteInput } from '@/types/lembrete'

type RegraParaIdentidade = Pick<
  RegraLembreteInput,
  | 'nome_regra'
  | 'servico_relacionado'
  | 'categoria'
  | 'prazo_dias'
  | 'prazo_meses'
  | 'km_retorno'
  | 'mensagem_padrao'
>

export interface TombstoneRemotoRegra {
  id: string
  local_id?: string | null
  deleted_at?: string | null
}

function normalizarTextoIdentidade(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR')
}

/** Identidade funcional da regra; não inclui UUID, estado ativo nem observações internas. */
export function chaveSemanticaRegraLembrete(regra: RegraParaIdentidade): string {
  return JSON.stringify([
    normalizarTextoIdentidade(regra.nome_regra),
    normalizarTextoIdentidade(regra.servico_relacionado),
    normalizarTextoIdentidade(regra.categoria),
    Math.max(0, Number(regra.prazo_dias) || 0),
    Math.max(0, Number(regra.prazo_meses) || 0),
    regra.km_retorno == null ? null : Math.max(0, Number(regra.km_retorno) || 0),
    normalizarTextoIdentidade(regra.mensagem_padrao),
  ])
}

export function regrasLembreteSaoEquivalentes(
  a: RegraParaIdentidade,
  b: RegraParaIdentidade
): boolean {
  return chaveSemanticaRegraLembrete(a) === chaveSemanticaRegraLembrete(b)
}

export function regraLembreteFoiExcluida(
  regra: Pick<RegraLembrete, 'deleted_at'> | null | undefined
): boolean {
  return Boolean(regra?.deleted_at)
}

export function filtrarRegrasLembreteAtivas(regras: RegraLembrete[]): RegraLembrete[] {
  return regras.filter((regra) => !regraLembreteFoiExcluida(regra))
}

export function encontrarRegraLembreteEquivalente(
  regras: RegraLembrete[],
  candidata: RegraParaIdentidade,
  ignorarId?: string
): RegraLembrete | undefined {
  return filtrarRegrasLembreteAtivas(regras).find(
    (regra) => regra.id !== ignorarId && regrasLembreteSaoEquivalentes(regra, candidata)
  )
}

export function timestampRegraLembrete(
  regra: Pick<RegraLembrete, 'updated_at' | 'created_at' | 'deleted_at'>
): string {
  return regra.deleted_at || regra.updated_at || regra.created_at || ''
}

function timestampRegra(regra: Pick<RegraLembrete, 'updated_at' | 'created_at' | 'deleted_at'>): string {
  return timestampRegraLembrete(regra)
}

function regraMaisRecente(a: RegraLembrete, b: RegraLembrete): RegraLembrete {
  return timestampRegra(b) > timestampRegra(a) ? b : a
}

export function marcarRegraLembreteExcluida(regra: RegraLembrete, agora: string): RegraLembrete {
  if (regra.deleted_at) return regra
  return { ...regra, deleted_at: agora, updated_at: agora }
}

/**
 * Tombstone sempre vence cópia ativa antiga. Ausência de um lado não apaga o outro.
 * Não restaura regra com deleted_at a partir de cache ativo velho.
 */
export function resolverRegraLembreteComTombstone(a: RegraLembrete, b: RegraLembrete): RegraLembrete {
  const delA = regraLembreteFoiExcluida(a)
  const delB = regraLembreteFoiExcluida(b)
  if (delA && !delB) return a
  if (delB && !delA) return b
  return regraMaisRecente(a, b)
}

export function deveSemearRegrasPadrao(regras: RegraLembrete[]): boolean {
  return regras.length === 0
}

/**
 * Oculta somente duplicatas ativas exatas e sem risco de perder duas regras já referenciadas.
 * Tombstones nunca são descartados aqui.
 */
export function deduplicarRegrasLembreteSeguras(
  regras: RegraLembrete[],
  idsReferenciados: ReadonlySet<string> = new Set()
): RegraLembrete[] {
  const tombstones = regras.filter(regraLembreteFoiExcluida)
  const ativas = filtrarRegrasLembreteAtivas(regras)
  const grupos = new Map<string, RegraLembrete[]>()
  for (const regra of ativas) {
    const chave = chaveSemanticaRegraLembrete(regra)
    grupos.set(chave, [...(grupos.get(chave) ?? []), regra])
  }

  const ativasDedup = [...grupos.values()].flatMap((grupo) => {
    if (grupo.length === 1) return grupo
    const referenciadas = grupo.filter((regra) => idsReferenciados.has(regra.id))
    if (referenciadas.length > 1) return grupo
    if (referenciadas.length === 1) return referenciadas
    return [grupo.reduce(regraMaisRecente)]
  })

  const idsMantidos = new Set(ativasDedup.map((regra) => regra.id))
  const tombstonesUnicos: RegraLembrete[] = []
  for (const tombstone of tombstones) {
    if (idsMantidos.has(tombstone.id)) continue
    idsMantidos.add(tombstone.id)
    tombstonesUnicos.push(tombstone)
  }

  return [...ativasDedup, ...tombstonesUnicos]
}

/**
 * Une local e remoto só por ID. Tombstone vence a cópia ativa do mesmo ID.
 * Não colapsa IDs semanticamente equivalentes — isso é só da listagem visual.
 */
export function mesclarRegrasLembreteSemDuplicar(
  local: RegraLembrete[],
  remoto: RegraLembrete[],
  idsReferenciados: ReadonlySet<string> = new Set()
): RegraLembrete[] {
  void idsReferenciados
  const porId = new Map<string, RegraLembrete>()
  for (const regra of [...remoto, ...local]) {
    const existente = porId.get(regra.id)
    porId.set(regra.id, existente ? resolverRegraLembreteComTombstone(existente, regra) : regra)
  }
  return [...porId.values()]
}

/** Cache antigo ativo não pode upsertar por cima de tombstone remoto. */
export function filtrarRegrasParaNaoRessuscitar(
  locais: RegraLembrete[],
  remotos: TombstoneRemotoRegra[]
): RegraLembrete[] {
  return locais.filter((local) => {
    if (regraLembreteFoiExcluida(local)) return true
    const remoto = remotos.find((row) => row.local_id === local.id || row.id === local.id)
    return !remoto?.deleted_at
  })
}

function hashIdentidade(valor: string): string {
  let hash = 2166136261
  for (let i = 0; i < valor.length; i += 1) {
    hash ^= valor.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function idLocalRegraPadrao(regra: RegraParaIdentidade): string {
  const slug = normalizarTextoIdentidade(regra.nome_regra)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `regra-padrao-${slug || 'geral'}-${hashIdentidade(chaveSemanticaRegraLembrete(regra))}`
}

export function criarRegrasPadraoSemDuplicar(
  padroes: Array<Omit<RegraLembreteInput, 'ativo'>>,
  officeId: string,
  agora: string,
  excluidas: RegraLembrete[] = []
): RegraLembrete[] {
  const chavesExcluidas = new Set(
    excluidas.filter(regraLembreteFoiExcluida).map((regra) => chaveSemanticaRegraLembrete(regra))
  )
  return deduplicarRegrasLembreteSeguras(
    padroes
      .filter((regra) => !chavesExcluidas.has(chaveSemanticaRegraLembrete(regra)))
      .map((regra) => ({
        ...regra,
        id: idLocalRegraPadrao(regra),
        office_id: officeId,
        ativo: true,
        created_at: agora,
        updated_at: agora,
      }))
  )
}

export function semearRegrasPadraoSeSeguro(
  padroes: Array<Omit<RegraLembreteInput, 'ativo'>>,
  officeId: string,
  regrasExistentes: RegraLembrete[],
  agora: string
): RegraLembrete[] {
  if (!deveSemearRegrasPadrao(regrasExistentes)) return regrasExistentes
  return criarRegrasPadraoSemDuplicar(padroes, officeId, agora, regrasExistentes)
}
