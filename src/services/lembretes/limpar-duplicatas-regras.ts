import type { LembreteCliente, RegraLembrete } from '@/types/lembrete'
import {
  chaveSemanticaRegraLembrete,
  filtrarRegrasLembreteAtivas,
  marcarRegraLembreteExcluida,
  timestampRegraLembrete,
} from '@/services/lembretes/regra-lembrete-identidade'

export const CRITERIO_CANONICA_DUPLICATAS = `
Critério canônico (determinístico, só sobre cópias ativas — sem deleted_at):
1. Se duas ou mais cópias do grupo forem referenciadas por lembretes.regra_id,
   NÃO limpar: há dúvida sobre qual linha deve permanecer para os históricos.
2. Se exatamente uma cópia for referenciada, ela é a canônica.
3. Se nenhuma for referenciada, permanece a mais recente por updated_at/created_at
   (mesmo recorte já usado na identidade). Empate de timestamp: menor id.
Não altera lembretes, históricos nem regra_id. Não faz hard delete.
`.trim()

export type MotivoLimpezaDuplicatas =
  | 'nao_encontrada'
  | 'sem_duplicatas'
  | 'ambigua'

export interface EscolhaCanonicaDuplicatas {
  canonica: RegraLembrete | null
  ambiguo: boolean
  motivo?: MotivoLimpezaDuplicatas
  mensagem?: string
  criterio?: 'unica_referenciada' | 'mais_recente' | 'id_estavel'
}

export interface ResultadoLimpezaDuplicatasRegras {
  ok: boolean
  regras: RegraLembrete[]
  canonicaId?: string
  arquivadas: string[]
  totalGrupo: number
  motivo?: MotivoLimpezaDuplicatas
  mensagem?: string
}

export type ResultadoLimpezaDuplicatasUi = ResultadoLimpezaDuplicatasRegras & {
  sincronizado: boolean
}

export interface InfoDuplicatasRegraVisivel {
  regraId: string
  nome: string
  totalAtivas: number
  ambiguo: boolean
}

export function coletarIdsRegraReferenciados(
  lembretes: readonly Pick<LembreteCliente, 'regra_id'>[]
): Set<string> {
  const ids = new Set<string>()
  for (const lembrete of lembretes) {
    if (lembrete.regra_id) ids.add(lembrete.regra_id)
  }
  return ids
}

export function agruparRegrasAtivasEquivalentes(
  regras: readonly RegraLembrete[]
): Map<string, RegraLembrete[]> {
  const grupos = new Map<string, RegraLembrete[]>()
  for (const regra of filtrarRegrasLembreteAtivas([...regras])) {
    const chave = chaveSemanticaRegraLembrete(regra)
    const grupo = grupos.get(chave)
    if (grupo) grupo.push(regra)
    else grupos.set(chave, [regra])
  }
  return grupos
}

function escolherMaisRecenteDeterministica(grupo: RegraLembrete[]): {
  canonica: RegraLembrete
  criterio: 'mais_recente' | 'id_estavel'
} {
  return grupo.reduce<{ canonica: RegraLembrete; criterio: 'mais_recente' | 'id_estavel' }>(
    (acc, atual) => {
      const tsAcc = timestampRegraLembrete(acc.canonica)
      const tsAtual = timestampRegraLembrete(atual)
      if (tsAtual > tsAcc) return { canonica: atual, criterio: 'mais_recente' }
      if (tsAtual < tsAcc) return acc
      const canonica = atual.id < acc.canonica.id ? atual : acc.canonica
      return { canonica, criterio: 'id_estavel' }
    },
    { canonica: grupo[0], criterio: 'mais_recente' }
  )
}

/**
 * Escolhe a cópia canônica do grupo semântico.
 * Em dúvida (mais de uma referenciada), não escolhe.
 */
export function escolherRegraCanonicaDuplicatas(
  grupoAtivo: readonly RegraLembrete[],
  idsReferenciados: ReadonlySet<string>
): EscolhaCanonicaDuplicatas {
  if (grupoAtivo.length === 0) {
    return {
      canonica: null,
      ambiguo: false,
      motivo: 'sem_duplicatas',
      mensagem: 'Não há cópias ativas neste grupo.',
    }
  }
  if (grupoAtivo.length === 1) {
    return { canonica: grupoAtivo[0], ambiguo: false, criterio: 'mais_recente' }
  }

  const referenciadas = grupoAtivo.filter((regra) => idsReferenciados.has(regra.id))
  if (referenciadas.length > 1) {
    return {
      canonica: null,
      ambiguo: true,
      motivo: 'ambigua',
      mensagem:
        'Não foi possível escolher automaticamente a cópia que deve permanecer, porque há lembretes apontando para mais de uma regra equivalente. Nenhuma cópia foi arquivada.',
    }
  }
  if (referenciadas.length === 1) {
    return { canonica: referenciadas[0], ambiguo: false, criterio: 'unica_referenciada' }
  }

  const escolha = escolherMaisRecenteDeterministica([...grupoAtivo])
  return { canonica: escolha.canonica, ambiguo: false, criterio: escolha.criterio }
}

export function montarInfoDuplicatasVisiveis(
  visiveis: readonly RegraLembrete[],
  todas: readonly RegraLembrete[],
  idsReferenciados: ReadonlySet<string>
): InfoDuplicatasRegraVisivel[] {
  const grupos = agruparRegrasAtivasEquivalentes(todas)
  const infos: InfoDuplicatasRegraVisivel[] = []
  for (const visivel of visiveis) {
    const grupo = grupos.get(chaveSemanticaRegraLembrete(visivel)) ?? []
    if (grupo.length <= 1) continue
    const escolha = escolherRegraCanonicaDuplicatas(grupo, idsReferenciados)
    infos.push({
      regraId: visivel.id,
      nome: visivel.nome_regra,
      totalAtivas: grupo.length,
      ambiguo: escolha.ambiguo,
    })
  }
  return infos
}

export function mensagemConfirmacaoLimpezaDuplicatas(_nome: string, totalAtivas: number): string {
  const arquivar = Math.max(0, totalAtivas - 1)
  return (
    `Esta regra possui ${totalAtivas} cópias antigas.\n` +
    `1 será mantida ativa e ${arquivar} serão arquivadas.\n` +
    'Lembretes e históricos existentes serão preservados.'
  )
}

/**
 * Arquiva (deleted_at) todas as ativas equivalentes, exceto a canônica.
 * Só toca o grupo da regra pedida. Não altera históricos.
 */
export function aplicarLimpezaDuplicatasRegras(
  regras: RegraLembrete[],
  regraId: string,
  idsReferenciados: ReadonlySet<string>,
  agora: string
): ResultadoLimpezaDuplicatasRegras {
  const ancora = regras.find((regra) => regra.id === regraId)
  if (!ancora) {
    return {
      ok: false,
      regras,
      arquivadas: [],
      totalGrupo: 0,
      motivo: 'nao_encontrada',
      mensagem: 'Regra não encontrada para limpar duplicadas.',
    }
  }

  const chave = chaveSemanticaRegraLembrete(ancora)
  const grupo = filtrarRegrasLembreteAtivas(regras).filter(
    (regra) => chaveSemanticaRegraLembrete(regra) === chave
  )
  if (grupo.length <= 1) {
    return {
      ok: false,
      regras,
      arquivadas: [],
      totalGrupo: grupo.length,
      motivo: 'sem_duplicatas',
      mensagem: 'Esta regra não possui cópias ativas equivalentes.',
    }
  }

  const escolha = escolherRegraCanonicaDuplicatas(grupo, idsReferenciados)
  if (escolha.ambiguo || !escolha.canonica) {
    return {
      ok: false,
      regras,
      arquivadas: [],
      totalGrupo: grupo.length,
      motivo: 'ambigua',
      mensagem: escolha.mensagem,
    }
  }

  const idsArquivar = new Set(
    grupo.filter((regra) => regra.id !== escolha.canonica!.id).map((regra) => regra.id)
  )
  const proximas = regras.map((regra) =>
    idsArquivar.has(regra.id) ? marcarRegraLembreteExcluida(regra, agora) : regra
  )

  return {
    ok: true,
    regras: proximas,
    canonicaId: escolha.canonica.id,
    arquivadas: [...idsArquivar],
    totalGrupo: grupo.length,
  }
}
