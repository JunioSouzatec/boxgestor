import type {
  CategoriaChecklist,
  QualidadeResposta,
  TipoRespostaChecklist,
} from '@/types/checklist-modelo'
import type { ChaveItemChecklist } from '@/types/enums'

/** Resposta de um item na OS — snapshot independente do modelo */
export interface RespostaItemChecklist {
  item_id: string
  nome: string
  categoria: CategoriaChecklist
  tipo_resposta: TipoRespostaChecklist
  obrigatorio: boolean
  ordem: number
  valor_ok?: boolean
  valor_qualidade?: QualidadeResposta
  valor_texto?: string
  valor_numero?: number
  observacao?: string
  /** Item adicionado somente nesta OS */
  extra?: boolean
}

export interface ChecklistEntrada {
  modelo_id: string
  modelo_nome: string
  itens: RespostaItemChecklist[]
  observacoes_gerais?: string
}

/** Formato legado — migrado automaticamente ao carregar dados */
export interface ItemChecklistEntradaLegado {
  chave: ChaveItemChecklist
  ok: boolean
  observacao?: string
}

export interface ChecklistEntradaLegado {
  itens: ItemChecklistEntradaLegado[]
  observacoes_gerais?: string
}
