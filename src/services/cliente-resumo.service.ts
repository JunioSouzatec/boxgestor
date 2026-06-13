import type { LancamentoFinanceiro, Moto, OrdemServico } from '@/types'
import type { LembreteComStatus } from '@/types/lembrete'
import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
import { obterDataFinalizacaoOS } from '@/services/os-listagem.service'
import { formatarData } from '@/lib/utils'

export interface ResumoClienteOficina {
  totalOs: number
  totalGasto: number
  valorPendente: number
  ultimoAtendimento?: string
  ultimoAtendimentoLabel?: string
  proximoLembrete?: string
  proximoLembreteLabel?: string
}

export function montarResumoCliente(
  clienteId: string,
  ordens: OrdemServico[],
  lancamentos: LancamentoFinanceiro[],
  lembretes: LembreteComStatus[] = []
): ResumoClienteOficina {
  const osCliente = ordens.filter((o) => o.cliente_id === clienteId)
  let totalGasto = 0
  let valorPendente = 0

  for (const os of osCliente) {
    const resumo = calcularResumoFinanceiroOS(os, lancamentos)
    totalGasto += resumo.valorPago
    valorPendente += resumo.valorPendente
  }

  const datasAtendimento = osCliente
    .map((os) => obterDataFinalizacaoOS(os) ?? os.criado_em?.slice(0, 10))
    .filter(Boolean) as string[]

  const ultimoAtendimento = datasAtendimento.sort((a, b) => b.localeCompare(a))[0]

  const lembretesCliente = lembretes
    .filter((l) => l.cliente_id === clienteId && l.status !== 'contatado' && l.status !== 'cancelado')
    .sort((a, b) => (a.data_prevista ?? '').localeCompare(b.data_prevista ?? ''))

  const proximo = lembretesCliente[0]

  return {
    totalOs: osCliente.length,
    totalGasto,
    valorPendente,
    ultimoAtendimento,
    ultimoAtendimentoLabel: ultimoAtendimento ? formatarData(ultimoAtendimento) : undefined,
    proximoLembrete: proximo?.data_prevista,
    proximoLembreteLabel: proximo
      ? `${formatarData(proximo.data_prevista)} — ${proximo.servico}`
      : undefined,
  }
}

export function listarOsDoCliente(
  clienteId: string,
  ordens: OrdemServico[],
  motos: Moto[]
): Array<{ os: OrdemServico; moto?: Moto }> {
  return ordens
    .filter((o) => o.cliente_id === clienteId)
    .sort((a, b) => b.numero - a.numero)
    .map((os) => ({
      os,
      moto: motos.find((m) => m.id === os.moto_id),
    }))
}
