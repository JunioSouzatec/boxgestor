import { calcularRelatorioComissoesMes } from '@/services/comissoes/comissoes.service'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'
import type { ComissoesConfigOficina, PerfilComissaoFuncionario } from '@/types/comissoes'
import { obterComissoesConfig } from '@/types/comissoes'

export type CategoriaDespesaFuncionario = 'salarios_funcionarios' | 'comissoes_funcionarios'

export interface DespesaPrevistaFuncionario {
  id: string
  perfil_id: string
  nome: string
  categoria: CategoriaDespesaFuncionario
  descricao: string
  valor: number
  /** Despesas de salário/comissão são previstas até o dono registrar pagamento manual. */
  pago: false
}

export interface ResumoDespesasFuncionariosMes {
  salarios: DespesaPrevistaFuncionario[]
  comissoes: DespesaPrevistaFuncionario[]
  totalSalarios: number
  totalComissoes: number
  total: number
}

export function calcularDespesasPrevistasFuncionariosMes(
  perfis: PerfilComissaoFuncionario[],
  ordens: OrdemServico[],
  lancamentos: LancamentoFinanceiro[],
  mesReferencia: string,
  config?: ComissoesConfigOficina | null
): ResumoDespesasFuncionariosMes {
  const cfg = config ?? obterComissoesConfig(null)
  const relatorio = calcularRelatorioComissoesMes(perfis, ordens, lancamentos, mesReferencia, cfg)

  const salarios: DespesaPrevistaFuncionario[] = []
  const comissoes: DespesaPrevistaFuncionario[] = []

  for (const linha of relatorio) {
    if (linha.salario_fixo > 0) {
      salarios.push({
        id: `prev-salario-${linha.perfil_id}-${mesReferencia}`,
        perfil_id: linha.perfil_id,
        nome: linha.nome,
        categoria: 'salarios_funcionarios',
        descricao: `Salário fixo — ${linha.nome}`,
        valor: linha.salario_fixo,
        pago: false,
      })
    }
    if (linha.total_comissao > 0) {
      comissoes.push({
        id: `prev-comissao-${linha.perfil_id}-${mesReferencia}`,
        perfil_id: linha.perfil_id,
        nome: linha.nome,
        categoria: 'comissoes_funcionarios',
        descricao: `Comissão estimada — ${linha.nome}`,
        valor: linha.total_comissao,
        pago: false,
      })
    }
  }

  const totalSalarios = salarios.reduce((acc, d) => acc + d.valor, 0)
  const totalComissoes = comissoes.reduce((acc, d) => acc + d.valor, 0)

  return {
    salarios,
    comissoes,
    totalSalarios,
    totalComissoes,
    total: totalSalarios + totalComissoes,
  }
}
