import type { TenantTimestampedEntity } from '@/types/base'

export type CategoriaChecklist =
  | 'documentacao'
  | 'acessorios'
  | 'iluminacao'
  | 'parte_eletrica'
  | 'freios'
  | 'pneus'
  | 'motor'
  | 'carenagem'
  | 'lataria'
  | 'seguranca'
  | 'outros'

export type TipoRespostaChecklist =
  | 'ok_nao_ok'
  | 'sim_nao'
  | 'bom_regular_ruim'
  | 'texto_livre'
  | 'numero'
  | 'foto_obrigatoria'

export type QualidadeResposta = 'bom' | 'regular' | 'ruim'

export interface ItemModeloChecklist {
  id: string
  nome: string
  categoria: CategoriaChecklist
  tipo_resposta: TipoRespostaChecklist
  obrigatorio: boolean
  ordem: number
  observacao_padrao?: string
}

export interface ModeloChecklist extends TenantTimestampedEntity {
  nome: string
  descricao?: string
  ativo: boolean
  padrao: boolean
  itens: ItemModeloChecklist[]
  criado_em: string
}

export type ModeloChecklistInput = Omit<
  ModeloChecklist,
  'id' | 'oficina_id' | 'office_id' | 'criado_em' | 'created_at' | 'updated_at'
>

export const MODELO_CHECKLIST_PADRAO_ID = 'modelo-checklist-padrao'

/** Modelo de fábrica para oficinas mistas (não é o padrão ativo). */
export const MODELO_CHECKLIST_PADRAO_MOTOS_ID = 'modelo-checklist-padrao-motos'
