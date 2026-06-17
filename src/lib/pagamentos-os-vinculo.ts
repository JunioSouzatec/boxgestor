import { extrairNumeroOsDaDescricaoPagamento } from '@/services/supabase-sync/payment-os-resolver'
import { isPagamentoOsAtivo } from '@/services/pagamentos/payment-active.helpers'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'

export type OsVinculoPagamento = Pick<OrdemServico, 'id' | 'numero'> &
  Partial<Pick<OrdemServico, 'office_id' | 'oficina_id'>>

export interface PagamentoSemVinculoExatoOs {
  lancamento: LancamentoFinanceiro
  motivo: string
  os_possivel_numero?: number
  os_possivel_id?: string
}

/** Pagamento vinculado exclusivamente à OS informada (sem fallback por cliente/moto/data). */
export function pagamentoPertenceOsEstrito(
  os: OsVinculoPagamento,
  lancamento: LancamentoFinanceiro
): boolean {
  if (!isPagamentoOsAtivo(lancamento)) return false

  const osId = os.id?.trim()
  const vinculoId = lancamento.ordem_servico_id?.trim()
  if (!osId || !vinculoId || vinculoId !== osId) return false

  const osOffice = (os.office_id ?? os.oficina_id)?.trim()
  const lOffice = (lancamento.office_id ?? lancamento.oficina_id)?.trim()
  if (osOffice && lOffice && lOffice !== osOffice) return false

  const numeroDescricao = extrairNumeroOsDaDescricaoPagamento(lancamento.descricao)
  if (numeroDescricao != null && numeroDescricao !== os.numero) return false

  return true
}

export function listarPagamentosOsEstrito(
  os: OsVinculoPagamento,
  lancamentos: LancamentoFinanceiro[]
): LancamentoFinanceiro[] {
  return lancamentos
    .filter((l) => pagamentoPertenceOsEstrito(os, l))
    .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id))
}

/** Pagamentos de OS com vínculo ausente, inconsistente ou apontando para outra OS. */
export function diagnosticarPagamentosSemVinculoExatoOs(
  dados: CraftDatabase
): PagamentoSemVinculoExatoOs[] {
  const ordensPorId = new Map(dados.ordens_servico.map((o) => [o.id, o]))
  const itens: PagamentoSemVinculoExatoOs[] = []

  for (const l of dados.lancamentos) {
    if (l.tipo !== 'receita' || !l.pago || l.cancelado || l.sync_arquivado) continue

    const vinculoId = l.ordem_servico_id?.trim()
    const numeroDescricao = extrairNumeroOsDaDescricaoPagamento(l.descricao)

    if (!vinculoId) {
      itens.push({
        lancamento: l,
        motivo: 'Pagamento sem ordem_servico_id (vínculo ausente)',
        os_possivel_numero: numeroDescricao ?? undefined,
      })
      continue
    }

    const osVinculada = ordensPorId.get(vinculoId)
    if (!osVinculada) {
      itens.push({
        lancamento: l,
        motivo: 'ordem_servico_id não corresponde a nenhuma OS desta oficina',
        os_possivel_numero: numeroDescricao ?? undefined,
      })
      continue
    }

    if (numeroDescricao != null && numeroDescricao !== osVinculada.numero) {
      const osPorNumero = dados.ordens_servico.find((o) => o.numero === numeroDescricao)
      itens.push({
        lancamento: l,
        motivo: `Descrição indica OS #${numeroDescricao}, mas o vínculo aponta para OS #${osVinculada.numero}`,
        os_possivel_numero: numeroDescricao,
        os_possivel_id: osPorNumero?.id,
      })
      continue
    }

    const osOffice = (osVinculada.office_id ?? osVinculada.oficina_id)?.trim()
    const lOffice = (l.office_id ?? l.oficina_id)?.trim()
    if (osOffice && lOffice && lOffice !== osOffice) {
      itens.push({
        lancamento: l,
        motivo: 'Pagamento de outra oficina com vínculo incorreto à OS',
        os_possivel_numero: osVinculada.numero,
        os_possivel_id: osVinculada.id,
      })
    }
  }

  return itens
}

export function logPagamentosDocumentoDev(
  tipo: 'os' | 'recibo',
  os: OsVinculoPagamento,
  pagamentos: LancamentoFinanceiro[]
): void {
  if (!import.meta.env.DEV) return

  const pagos = pagamentos.filter((p) => p.pago)
  const totalSomado = pagos.reduce((acc, p) => acc + p.valor, 0)

  console.info(`[Craft PDF ${tipo}] Pagamentos vinculados à OS`, {
    os_numero: os.numero,
    os_id: os.id,
    pagamento_ids: pagos.map((p) => p.id),
    total_somado: totalSomado,
  })
}
