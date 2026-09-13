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

export function encontrarRegraLembreteEquivalente(
  regras: RegraLembrete[],
  candidata: RegraParaIdentidade,
  ignorarId?: string
): RegraLembrete | undefined {
  return regras.find(
    (regra) => regra.id !== ignorarId && regrasLembreteSaoEquivalentes(regra, candidata)
  )
}

function regraMaisRecente(a: RegraLembrete, b: RegraLembrete): RegraLembrete {
  return (b.updated_at ?? b.created_at ?? '') > (a.updated_at ?? a.created_at ?? '') ? b : a
}

/**
 * Oculta somente duplicatas exatas e sem risco de perder duas regras já referenciadas.
 * Não apaga regras, lembretes ou históricos persistidos.
 */
export function deduplicarRegrasLembreteSeguras(
  regras: RegraLembrete[],
  idsReferenciados: ReadonlySet<string> = new Set()
): RegraLembrete[] {
  const grupos = new Map<string, RegraLembrete[]>()
  for (const regra of regras) {
    const chave = chaveSemanticaRegraLembrete(regra)
    grupos.set(chave, [...(grupos.get(chave) ?? []), regra])
  }

  return [...grupos.values()].flatMap((grupo) => {
    if (grupo.length === 1) return grupo
    const referenciadas = grupo.filter((regra) => idsReferenciados.has(regra.id))
    if (referenciadas.length > 1) return grupo
    if (referenciadas.length === 1) return referenciadas
    return [grupo.reduce(regraMaisRecente)]
  })
}

export function mesclarRegrasLembreteSemDuplicar(
  local: RegraLembrete[],
  remoto: RegraLembrete[],
  idsReferenciados: ReadonlySet<string> = new Set()
): RegraLembrete[] {
  const porId = new Map<string, RegraLembrete>()
  for (const regra of remoto) porId.set(regra.id, regra)
  for (const regra of local) {
    const existente = porId.get(regra.id)
    porId.set(regra.id, existente ? regraMaisRecente(existente, regra) : regra)
  }
  return deduplicarRegrasLembreteSeguras([...porId.values()], idsReferenciados)
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
  agora: string
): RegraLembrete[] {
  return deduplicarRegrasLembreteSeguras(
    padroes.map((regra) => ({
      ...regra,
      id: idLocalRegraPadrao(regra),
      office_id: officeId,
      ativo: true,
      created_at: agora,
      updated_at: agora,
    }))
  )
}
