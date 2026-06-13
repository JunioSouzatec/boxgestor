import { addDays, format, parseISO } from 'date-fns'
import type { ChecklistEntrada } from '@/types/checklist'
import type { ChaveItemChecklist } from '@/types/enums'
import type { ItemChecklistEntrada } from '@/types/checklist'
import type { Garantia, OrdemServico, RegistroQuilometragem } from '@/types/ordem-servico'
import type { StatusOS } from '@/types/enums'
import { calcularValorTotalOS, ITENS_CHECKLIST_ENTRADA } from '@/types/labels'
import { OFFICE_ID } from '@/types/base'
import { gerarId } from '@/lib/utils'
import { stampCreate, stampUpdate } from '@/services/migration.service'

export function criarChecklistVazio(): ChecklistEntrada {
  return {
    itens: ITENS_CHECKLIST_ENTRADA.map(({ chave }) => ({ chave, ok: false })),
    observacoes_gerais: '',
  }
}

export function normalizarChecklist(checklist?: ChecklistEntrada): ChecklistEntrada {
  if (!checklist?.itens?.length) return criarChecklistVazio()
  const mapa = new Map(checklist.itens.map((i) => [i.chave, i]))
  return {
    observacoes_gerais: checklist.observacoes_gerais ?? '',
    itens: ITENS_CHECKLIST_ENTRADA.map(({ chave }) => {
      const existente = mapa.get(chave)
      return existente ?? { chave, ok: false }
    }),
  }
}

export function atualizarItemChecklist(
  checklist: ChecklistEntrada,
  chave: ChaveItemChecklist,
  atualizacao: Partial<ItemChecklistEntrada>
): ChecklistEntrada {
  return {
    ...checklist,
    itens: checklist.itens.map((item) =>
      item.chave === chave ? { ...item, ...atualizacao } : item
    ),
  }
}

export function calcularVencimentoGarantia(dataBase: string, dias: number): string {
  return format(addDays(parseISO(dataBase + 'T12:00:00'), dias), 'yyyy-MM-dd')
}

export function garantiaAtiva(os: OrdemServico, hoje?: string): boolean {
  const referencia = hoje ?? new Date().toISOString().slice(0, 10)
  if (!os.data_vencimento_garantia) return false
  if (!['finalizada', 'entregue'].includes(os.status)) return false
  return os.data_vencimento_garantia >= referencia
}

export function statusPermiteGarantia(status: StatusOS): boolean {
  return status === 'finalizada' || status === 'entregue'
}

export function normalizarOS(os: OrdemServico): OrdemServico {
  return { ...os, checklist_entrada: normalizarChecklist(os.checklist_entrada) }
}

export function obterGarantiaAtivaMoto(
  motoId: string,
  ordens: OrdemServico[],
  hoje?: string
): OrdemServico | null {
  return (
    ordens
      .filter((o) => o.moto_id === motoId && garantiaAtiva(o, hoje))
      .sort((a, b) =>
        (b.data_vencimento_garantia ?? '').localeCompare(a.data_vencimento_garantia ?? '')
      )[0] ?? null
  )
}

export function obterHistoricoMoto(motoId: string, ordens: OrdemServico[]): OrdemServico[] {
  return ordens
    .filter((o) => o.moto_id === motoId)
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em) || b.numero - a.numero)
}

export function extrairGarantias(ordens: OrdemServico[], hoje?: string): Garantia[] {
  return ordens
    .filter((os) => os.dias_garantia && os.data_vencimento_garantia)
    .map((os) => ({
      id: `gar-${os.id}`,
      ordem_servico_id: os.id,
      moto_id: os.moto_id,
      cliente_id: os.cliente_id,
      office_id: os.office_id ?? os.oficina_id,
      dias_garantia: os.dias_garantia!,
      data_inicio: os.atualizado_em,
      data_vencimento: os.data_vencimento_garantia!,
      ativa: garantiaAtiva(os, hoje),
    }))
}

export function extrairRegistrosQuilometragem(ordens: OrdemServico[]): RegistroQuilometragem[] {
  return ordens
    .filter((os) => os.quilometragem_entrada !== undefined || os.quilometragem_saida !== undefined)
    .map((os) => ({
      id: `km-${os.id}`,
      ordem_servico_id: os.id,
      moto_id: os.moto_id,
      office_id: os.office_id ?? os.oficina_id,
      quilometragem_entrada: os.quilometragem_entrada,
      quilometragem_saida: os.quilometragem_saida,
      data: os.criado_em,
    }))
}

export function buildNovaOrdemServico(
  input: Omit<
    OrdemServico,
    'id' | 'oficina_id' | 'office_id' | 'numero' | 'valor_total' | 'criado_em' | 'atualizado_em' | 'created_at' | 'updated_at'
  >,
  numero: number,
  officeId: string = OFFICE_ID
): OrdemServico {
  const hoje = new Date().toISOString().slice(0, 10)
  return stampCreate(
    normalizarOS({
      ...input,
      id: gerarId(),
      oficina_id: officeId,
      office_id: officeId,
      numero,
      valor_total: calcularValorTotalOS(input.valor_pecas, input.valor_mao_obra, input.desconto),
      criado_em: hoje,
      atualizado_em: hoje,
    }),
    officeId
  )
}

export function mergeOrdemServico(
  existente: OrdemServico,
  patch: Partial<OrdemServico>
): OrdemServico {
  const merged = stampUpdate({
    ...existente,
    ...patch,
    atualizado_em: new Date().toISOString().slice(0, 10),
  })
  merged.valor_total = calcularValorTotalOS(
    merged.valor_pecas,
    merged.valor_mao_obra,
    merged.desconto
  )
  return normalizarOS(merged)
}

export function deveAtualizarKmMoto(os: OrdemServico): boolean {
  return (
    os.quilometragem_saida !== undefined &&
    ['finalizada', 'entregue'].includes(os.status)
  )
}
