/**
 * RC2 Comissão Fase B2 — sincroniza itens por OS para a tela do dono.
 * Não altera OS, pagamento OS, estoque nem o fluxo antigo de payments.
 */
import {
  comissaoItensDisponivel,
  gerarOuAtualizarItemComissaoDaOs,
  listarItensComissaoOficina,
} from '@/services/comissoes/comissao-itens.service'
import { listarOsComissaoFuncionario } from '@/services/comissoes/comissoes.service'
import type { ComissoesConfigOficina, PerfilComissaoFuncionario } from '@/types/comissoes'
import type { ComissaoItem, SaldoComissaoFuncionario } from '@/types/comissao-itens'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'

export interface SincronizarItensComissaoResultado {
  ok: boolean
  geradosOuAtualizados: number
  ignorados: number
  erros: string[]
  itens: ComissaoItem[]
}

export async function sincronizarItensComissaoPeriodo(params: {
  officeIdLocal: string
  perfis: PerfilComissaoFuncionario[]
  ordens: OrdemServico[]
  lancamentos: LancamentoFinanceiro[]
  config: ComissoesConfigOficina
  competenceMonth: string
  clientePorId: Map<string, string>
  veiculoLabelPorId: Map<string, string>
}): Promise<SincronizarItensComissaoResultado> {
  if (!comissaoItensDisponivel()) {
    return {
      ok: false,
      geradosOuAtualizados: 0,
      ignorados: 0,
      erros: ['Controle por OS disponível apenas com sincronização online (Supabase).'],
      itens: [],
    }
  }

  let geradosOuAtualizados = 0
  let ignorados = 0
  const erros: string[] = []

  const ativos = params.perfis.filter(
    (p) => p.comissao_ativa && p.tipo_comissao !== 'sem_comissao'
  )

  for (const perfil of ativos) {
    const detalhes = listarOsComissaoFuncionario(
      perfil,
      params.ordens,
      params.lancamentos,
      params.competenceMonth,
      params.config
    )

    for (const d of detalhes) {
      const os = params.ordens.find((o) => o.id === d.os_id)
      if (!os) {
        ignorados += 1
        continue
      }
      const resultado = await gerarOuAtualizarItemComissaoDaOs({
        officeIdLocal: params.officeIdLocal,
        perfil,
        os,
        lancamentos: params.lancamentos,
        config: params.config,
        customerName: params.clientePorId.get(os.cliente_id),
        vehicleLabel: os.moto_id ? params.veiculoLabelPorId.get(os.moto_id) : undefined,
      })
      if (!resultado.ok) {
        erros.push(`${perfil.nome} OS #${os.numero}: ${resultado.erro ?? 'erro'}`)
        continue
      }
      if (resultado.skipped) ignorados += 1
      else geradosOuAtualizados += 1
    }
  }

  const itens = await listarItensComissaoOficina(params.officeIdLocal, {
    competenceMonth: params.competenceMonth,
  })

  return {
    ok: erros.length === 0,
    geradosOuAtualizados,
    ignorados,
    erros,
    itens,
  }
}

export function montarSaldosPorFuncionario(
  perfis: PerfilComissaoFuncionario[],
  itens: ComissaoItem[],
  competenceMonth: string
): Map<string, SaldoComissaoFuncionario> {
  const map = new Map<string, SaldoComissaoFuncionario>()

  for (const perfil of perfis) {
    const doFunc = itens.filter(
      (i) =>
        i.employee_id === perfil.id &&
        i.competence_month === competenceMonth &&
        i.status !== 'cancelado' &&
        !i.adjustment_of_item_id
    )
    const totalGerado = arred2(doFunc.reduce((a, i) => a + i.commission_amount, 0))
    const totalPago = arred2(doFunc.reduce((a, i) => a + i.paid_amount, 0))
    const saldo = arred2(doFunc.reduce((a, i) => a + i.open_amount, 0))
    map.set(perfil.id, {
      employee_id: perfil.id,
      employee_name: perfil.nome,
      competence_month: competenceMonth,
      total_gerado: totalGerado,
      total_pago: totalPago,
      saldo_em_aberto: saldo,
      qtd_itens_abertos: doFunc.filter((i) => i.open_amount > 0.009).length,
      qtd_itens_pagos: doFunc.filter((i) => i.status === 'pago').length,
      qtd_itens_parciais: doFunc.filter((i) => i.status === 'parcial').length,
    })
  }

  return map
}

function arred2(n: number): number {
  return Math.round(n * 100) / 100
}

export type StatusLinhaContaCorrente =
  | 'sem_comissao'
  | 'em_aberto'
  | 'parcial'
  | 'pago'

export function statusLinhaContaCorrente(
  perfil: PerfilComissaoFuncionario,
  saldo?: SaldoComissaoFuncionario
): StatusLinhaContaCorrente {
  if (!perfil.comissao_ativa || perfil.tipo_comissao === 'sem_comissao') return 'sem_comissao'
  if (!saldo || saldo.total_gerado <= 0.009) return 'sem_comissao'
  if (saldo.saldo_em_aberto <= 0.009) return 'pago'
  if (saldo.total_pago > 0.009) return 'parcial'
  return 'em_aberto'
}

export function labelStatusLinhaContaCorrente(status: StatusLinhaContaCorrente): string {
  switch (status) {
    case 'pago':
      return 'Pago'
    case 'parcial':
      return 'Parcial'
    case 'em_aberto':
      return 'Em aberto'
    default:
      return 'Sem comissão'
  }
}
