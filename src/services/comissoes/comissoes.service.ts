import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'
import type {
  ComissaoRegraSnapshotOS,
  ComissoesConfigOficina,
  CriterioOsComissao,
  DetalheOsComissao,
  PerfilComissaoFuncionario,
  ResumoComissaoMensalFuncionario,
  TipoComissaoFuncionario,
} from '@/types/comissoes'
import { COMISSOES_CONFIG_PADRAO, tipoUsaMaoObra, tipoUsaPecas } from '@/types/comissoes'

const STATUS_OS_ELEGIVEIS = new Set(['finalizada', 'entregue'])

function normalizarNome(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function dataReferenciaOsComissao(os: OrdemServico): string {
  return (
    os.data_saida?.slice(0, 10) ??
    os.atualizado_em?.slice(0, 10) ??
    os.criado_em?.slice(0, 10) ??
    ''
  )
}

export function osElegivelParaComissao(
  os: OrdemServico,
  lancamentos: LancamentoFinanceiro[],
  criterio: CriterioOsComissao = COMISSOES_CONFIG_PADRAO.criterio_os
): boolean {
  if (os.status === 'cancelada') return false

  const entregue = STATUS_OS_ELEGIVEIS.has(os.status)
  const resumo = calcularResumoFinanceiroOS(os, lancamentos)
  const pago = resumo.statusFinanceiroEfetivo === 'pago'

  switch (criterio) {
    case 'entregue_finalizada':
      return entregue
    case 'pagamento_recebido':
      return pago
    case 'entregue_ou_pago':
    default:
      return entregue || pago
  }
}

export function osPertenceFuncionario(
  os: OrdemServico,
  perfil: Pick<PerfilComissaoFuncionario, 'nome' | 'usuario_id'>
): boolean {
  const idOs = os.responsavel_id?.trim()
  const idPerfil = perfil.usuario_id?.trim()
  if (idOs && idPerfil && idOs === idPerfil) return true

  const responsavel = os.responsavel?.trim()
  if (!responsavel) return false

  // Fallback para OS antigas só com nome
  return normalizarNome(responsavel) === normalizarNome(perfil.nome)
}

function clampPercentual(valor?: number): number {
  return Math.max(0, Math.min(100, valor ?? 0))
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100
}

/** Regra mínima de comissão — aceita um perfil ou uma regra congelada (snapshot). */
export interface RegraComissao {
  comissao_ativa: boolean
  tipo_comissao: TipoComissaoFuncionario
  percentual_comissao?: number
  percentual_comissao_pecas?: number
  valor_fixo_por_os?: number
}

/**
 * Calcula a comissão a partir das bases (MO/peças) e de uma regra.
 * Retorna também a base considerada (útil para exibir no relatório).
 */
export function calcularComissaoBase(
  bases: { maoObra: number; pecas: number },
  regra: RegraComissao
): { valor: number; base: number } {
  if (!regra.comissao_ativa || regra.tipo_comissao === 'sem_comissao') {
    return { valor: 0, base: 0 }
  }

  const mo = Math.max(0, bases.maoObra ?? 0)
  const pecas = Math.max(0, bases.pecas ?? 0)
  const pctMo = clampPercentual(regra.percentual_comissao)
  const pctPecas = clampPercentual(regra.percentual_comissao_pecas)

  switch (regra.tipo_comissao) {
    case 'percentual_mao_obra':
      return { valor: arredondar2(mo * (pctMo / 100)), base: mo }
    case 'percentual_pecas':
      return { valor: arredondar2(pecas * (pctPecas / 100)), base: pecas }
    case 'percentual_mao_obra_pecas':
      return {
        valor: arredondar2(mo * (pctMo / 100) + pecas * (pctPecas / 100)),
        base: mo + pecas,
      }
    case 'valor_fixo_os':
      return { valor: Math.max(0, regra.valor_fixo_por_os ?? 0), base: 0 }
    default:
      return { valor: 0, base: 0 }
  }
}

/**
 * @deprecated Use calcularComissaoBase. Mantido por compatibilidade (só mão de obra).
 */
export function calcularComissaoOs(
  maoObra: number,
  perfil: Pick<
    PerfilComissaoFuncionario,
    'comissao_ativa' | 'tipo_comissao' | 'percentual_comissao' | 'percentual_comissao_pecas' | 'valor_fixo_por_os'
  >
): number {
  return calcularComissaoBase({ maoObra, pecas: 0 }, perfil).valor
}

function snapshotPertenceAoPerfil(
  snapshot: ComissaoRegraSnapshotOS,
  perfil: Pick<PerfilComissaoFuncionario, 'id' | 'nome' | 'usuario_id'>
): boolean {
  if (snapshot.perfil_id && snapshot.perfil_id === perfil.id) return true
  const idSnap = snapshot.responsavel_id?.trim()
  const idPerfil = perfil.usuario_id?.trim()
  if (idSnap && idPerfil && idSnap === idPerfil) return true
  const nomeSnap = snapshot.responsavel_nome?.trim()
  if (nomeSnap && normalizarNome(nomeSnap) === normalizarNome(perfil.nome)) return true
  return false
}

function percentualPrincipalSnapshot(snapshot: ComissaoRegraSnapshotOS): number | undefined {
  if (tipoUsaMaoObra(snapshot.tipo_comissao)) return snapshot.percentual_mao_obra
  if (tipoUsaPecas(snapshot.tipo_comissao)) return snapshot.percentual_pecas
  return undefined
}

function percentualPrincipalPerfil(perfil: PerfilComissaoFuncionario): number | undefined {
  if (tipoUsaMaoObra(perfil.tipo_comissao)) return perfil.percentual_comissao
  if (tipoUsaPecas(perfil.tipo_comissao)) return perfil.percentual_comissao_pecas
  return undefined
}

/**
 * Detalhe de comissão de UMA os para o perfil.
 * Prefere o snapshot congelado na OS (histórico imutável); sem snapshot, usa o perfil vigente.
 */
function detalheComissaoDaOs(
  os: OrdemServico,
  perfil: PerfilComissaoFuncionario
): DetalheOsComissao {
  const snapshot = os.comissao_snapshot
  if (snapshot && snapshotPertenceAoPerfil(snapshot, perfil)) {
    return {
      os_id: os.id,
      numero: os.numero,
      data_referencia: dataReferenciaOsComissao(os),
      mao_obra: snapshot.valor_mao_obra,
      pecas: snapshot.valor_pecas,
      base: snapshot.valor_base,
      comissao: snapshot.valor_comissao,
      tipo_comissao: snapshot.tipo_comissao,
      percentual_aplicado: percentualPrincipalSnapshot(snapshot),
      usou_snapshot: true,
    }
  }

  const maoObra = os.valor_mao_obra ?? 0
  const pecas = os.valor_pecas ?? 0
  const { valor, base } = calcularComissaoBase({ maoObra, pecas }, perfil)
  return {
    os_id: os.id,
    numero: os.numero,
    data_referencia: dataReferenciaOsComissao(os),
    mao_obra: maoObra,
    pecas,
    base,
    comissao: valor,
    tipo_comissao: perfil.tipo_comissao,
    percentual_aplicado: percentualPrincipalPerfil(perfil),
    usou_snapshot: false,
  }
}

export function listarOsComissaoFuncionario(
  perfil: PerfilComissaoFuncionario,
  ordens: OrdemServico[],
  lancamentos: LancamentoFinanceiro[],
  mesReferencia: string,
  config: ComissoesConfigOficina
): DetalheOsComissao[] {
  return ordens
    .filter((os) => dataReferenciaOsComissao(os).startsWith(mesReferencia))
    .filter((os) => osElegivelParaComissao(os, lancamentos, config.criterio_os))
    .filter((os) => osPertenceFuncionario(os, perfil))
    .map((os) => detalheComissaoDaOs(os, perfil))
    .sort((a, b) => b.data_referencia.localeCompare(a.data_referencia))
}

export function calcularResumoComissaoMensal(
  perfil: PerfilComissaoFuncionario,
  ordens: OrdemServico[],
  lancamentos: LancamentoFinanceiro[],
  mesReferencia: string,
  config: ComissoesConfigOficina
): ResumoComissaoMensalFuncionario {
  const detalhes = listarOsComissaoFuncionario(perfil, ordens, lancamentos, mesReferencia, config)
  const totalMaoObra = detalhes.reduce((acc, d) => acc + d.mao_obra, 0)
  const totalPecas = detalhes.reduce((acc, d) => acc + d.pecas, 0)
  const totalComissao = detalhes.reduce((acc, d) => acc + d.comissao, 0)
  const salario = Math.max(0, perfil.salario_fixo_mensal ?? 0)

  return {
    perfil_id: perfil.id,
    usuario_id: perfil.usuario_id,
    nome: perfil.nome,
    cargo: perfil.cargo,
    salario_fixo: salario,
    quantidade_os: detalhes.length,
    total_mao_obra: totalMaoObra,
    total_pecas: totalPecas,
    total_comissao: totalComissao,
    total_estimado_pagar: salario + totalComissao,
    // Preparado para o financeiro futuro — nenhum pagamento é registrado nesta etapa.
    status_pagamento: 'pendente',
  }
}

export function calcularRelatorioComissoesMes(
  perfis: PerfilComissaoFuncionario[],
  ordens: OrdemServico[],
  lancamentos: LancamentoFinanceiro[],
  mesReferencia: string,
  config: ComissoesConfigOficina
): ResumoComissaoMensalFuncionario[] {
  return perfis
    .map((p) => calcularResumoComissaoMensal(p, ordens, lancamentos, mesReferencia, config))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function labelTipoComissao(tipo: TipoComissaoFuncionario): string {
  switch (tipo) {
    case 'sem_comissao':
      return 'Sem comissão'
    case 'percentual_mao_obra':
      return '% sobre mão de obra'
    case 'percentual_pecas':
      return '% sobre peças'
    case 'percentual_mao_obra_pecas':
      return '% sobre mão de obra + peças'
    case 'valor_fixo_os':
      return 'Valor fixo por OS'
    default:
      return 'Sem comissão'
  }
}
