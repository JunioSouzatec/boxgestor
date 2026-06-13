import type { ChaveItemChecklist } from '@/types/enums'

export interface ItemChecklistEntrada {
  chave: ChaveItemChecklist
  ok: boolean
  observacao?: string
}

export interface ChecklistEntrada {
  itens: ItemChecklistEntrada[]
  observacoes_gerais?: string
}
