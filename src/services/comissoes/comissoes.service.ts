import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'
import type {
  ComissoesConfigOficina,
  CriterioOsComissao,
  DetalheOsComissao,
  PerfilComissaoFuncionario,
  ResumoComissaoMensalFuncionario,
  TipoComissaoFuncionario,
} from '@/types/comissoes'
import { COMISSOES_CONFIG_PADRAO } from '@/types/comissoes'

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
  const responsavel = os.responsavel?.trim()
  if (!responsavel) return false

  const respNorm = normalizarNome(responsavel)
  const nomeNorm = normalizarNome(perfil.nome)
  if (respNorm === nomeNorm) return true

  return false
}

export function calcularComissaoOs(
  maoObra: number,
  perfil: Pick<
    PerfilComissaoFuncionario,
    'comissao_ativa' | 'tipo_comissao' | 'percentual_comissao' | 'valor_fixo_por_os'
  >
): number {
  if (!perfil.comissao_ativa || perfil.tipo_comissao === 'sem_comissao') return 0

  if (perfil.tipo_comissao === 'percentual_mao_obra') {
    const pct = Math.max(0, Math.min(100, perfil.percentual_comissao ?? 0))
    return Math.round(maoObra * (pct / 100) * 100) / 100
  }

  if (perfil.tipo_comissao === 'valor_fixo_os') {
    return Math.max(0, perfil.valor_fixo_por_os ?? 0)
  }

  return 0
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
    .map((os) => {
      const maoObra = os.valor_mao_obra ?? 0
      return {
        os_id: os.id,
        numero: os.numero,
        data_referencia: dataReferenciaOsComissao(os),
        mao_obra: maoObra,
        comissao: calcularComissaoOs(maoObra, perfil),
      }
    })
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
    total_comissao: totalComissao,
    total_estimado_pagar: salario + totalComissao,
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
    case 'valor_fixo_os':
      return 'Valor fixo por OS'
  }
}
