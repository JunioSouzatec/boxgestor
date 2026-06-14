import { addDays, format, parseISO } from 'date-fns'
import { gerarId } from '@/lib/utils'
import type { ChecklistEntrada, ChecklistEntradaLegado } from '@/types/checklist'
import type { ModeloChecklist } from '@/types/checklist-modelo'
import type { Garantia, OrdemServico, RegistroQuilometragem, AjusteMaoObraOS } from '@/types/ordem-servico'
import type { Peca } from '@/types/peca'
import type { StatusOS } from '@/types/enums'
import { calcularValorTotalOS } from '@/types/labels'
import { normalizarPecasUtilizadasOS } from '@/services/os-pecas.service'
import { normalizarServicosItensOS } from '@/services/servico-catalogo.service'
import { normalizarDatasOS } from '@/services/os-datas.service'
import {
  criarChecklistFromModelo,
  normalizarChecklistEntrada,
  atualizarRespostaChecklist,
} from '@/services/checklist-modelo.service'
import { OFFICE_ID } from '@/types/base'
import { stampCreate, stampUpdate } from '@/services/migration.service'

export {
  aplicarModeloAoChecklist,
  adicionarItemExtraChecklist,
  atualizarRespostaChecklist,
  criarChecklistFromModelo,
  normalizarChecklistEntrada as normalizarChecklist,
  obterModeloPadrao,
  getModeloChecklistPadrao,
  garantirChecklistPadrao,
  migrarOrdensAntigasParaChecklistPadrao,
  removerItemExtraChecklist,
} from '@/services/checklist-modelo.service'

export function criarChecklistVazio(
  modelos?: ModeloChecklist[],
  officeId: string = OFFICE_ID
): ChecklistEntrada {
  return criarChecklistFromModelo(undefined, modelos, officeId)
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

function normalizarAjusteMaoObra(
  ajuste: AjusteMaoObraOS | undefined
): AjusteMaoObraOS | undefined {
  if (!ajuste?.ativo) return undefined
  return {
    ativo: true,
    motivo_tipo: ajuste.motivo_tipo ?? 'outro',
    motivo_texto: ajuste.motivo_texto?.trim() ?? '',
  }
}

export function normalizarOS(
  os: OrdemServico,
  modelos: ModeloChecklist[],
  officeId: string = OFFICE_ID,
  pecas: Peca[] = []
): OrdemServico {
  const valor_total = calcularValorTotalOS(
    os.valor_pecas ?? 0,
    os.valor_mao_obra ?? 0,
    os.desconto ?? 0,
    os.valor_adicional ?? 0
  )

  return {
    ...os,
    ...normalizarDatasOS(os),
    valor_total,
    servicos_itens: normalizarServicosItensOS(os.servicos_itens, pecas),
    pecas_utilizadas: normalizarPecasUtilizadasOS(os.pecas_utilizadas),
    valor_adicional: os.valor_adicional ?? 0,
    estoque_baixado: os.estoque_baixado ?? false,
    checklist_entrada: normalizarChecklistEntrada(
      os.checklist_entrada as ChecklistEntrada | ChecklistEntradaLegado | undefined,
      modelos,
      officeId
    ),
    ajuste_mao_obra: normalizarAjusteMaoObra(os.ajuste_mao_obra),
  }
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
  modelos: ModeloChecklist[],
  officeId: string = OFFICE_ID
): OrdemServico {
  const hoje = new Date().toISOString().slice(0, 10)
  return stampCreate(
      normalizarOS(
      {
        ...input,
        id: gerarId(),
        oficina_id: officeId,
        office_id: officeId,
        numero,
        valor_total: calcularValorTotalOS(
          input.valor_pecas,
          input.valor_mao_obra,
          input.desconto,
          input.valor_adicional ?? 0
        ),
        criado_em: hoje,
        atualizado_em: hoje,
      },
      modelos,
      officeId
    ),
    officeId
  )
}

export function mergeOrdemServico(
  existente: OrdemServico,
  patch: Partial<OrdemServico>,
  modelos: ModeloChecklist[]
): OrdemServico {
  const merged = stampUpdate({
    ...existente,
    ...patch,
    atualizado_em: new Date().toISOString().slice(0, 10),
  })
  merged.valor_total = calcularValorTotalOS(
    merged.valor_pecas,
    merged.valor_mao_obra,
    merged.desconto,
    merged.valor_adicional ?? 0
  )
  return normalizarOS(merged, modelos, existente.office_id ?? existente.oficina_id ?? OFFICE_ID)
}

export function deveAtualizarKmMoto(os: OrdemServico): boolean {
  return (
    os.quilometragem_saida !== undefined &&
    ['finalizada', 'entregue'].includes(os.status)
  )
}

/** @deprecated use atualizarRespostaChecklist */
export function atualizarItemChecklist(
  checklist: ChecklistEntrada,
  itemId: string,
  atualizacao: Parameters<typeof atualizarRespostaChecklist>[2]
): ChecklistEntrada {
  return atualizarRespostaChecklist(checklist, itemId, atualizacao)
}
