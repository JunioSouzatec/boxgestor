import type { TenantEntity } from '@/types/base'

export type CategoriaServicoCatalogo =
  | 'revisao'
  | 'motor'
  | 'eletrica'
  | 'freios'
  | 'suspensao'
  | 'transmissao'
  | 'pneus'
  | 'oleo_filtros'
  | 'diagnostico'
  | 'outros'

export const CATEGORIAS_SERVICO_CATALOGO: {
  value: CategoriaServicoCatalogo
  label: string
}[] = [
  { value: 'revisao', label: 'Revisão' },
  { value: 'motor', label: 'Motor' },
  { value: 'eletrica', label: 'Elétrica' },
  { value: 'freios', label: 'Freios' },
  { value: 'suspensao', label: 'Suspensão' },
  { value: 'transmissao', label: 'Transmissão' },
  { value: 'pneus', label: 'Pneus' },
  { value: 'oleo_filtros', label: 'Óleo e filtros' },
  { value: 'diagnostico', label: 'Diagnóstico' },
  { value: 'outros', label: 'Outros' },
]

export function getLabelCategoriaServicoCatalogo(categoria: CategoriaServicoCatalogo | string): string {
  return CATEGORIAS_SERVICO_CATALOGO.find((c) => c.value === categoria)?.label ?? categoria
}

export interface PecaSugeridaServico {
  peca_id: string
  quantidade: number
}

export interface LembreteServicoCatalogo {
  regra_id?: string
  prazo_dias?: number
  prazo_meses?: number
  km_retorno?: number
  mensagem_padrao?: string
  ativo?: boolean
}

export interface ServicoCatalogo extends TenantEntity {
  nome: string
  categoria: CategoriaServicoCatalogo
  descricao?: string
  valor_mao_obra: number
  tempo_estimado_minutos?: number
  garantia_dias?: number
  observacoes_internas?: string
  ativo: boolean
  pecas_sugeridas: PecaSugeridaServico[]
  lembrete?: LembreteServicoCatalogo
  created_at?: string
  updated_at?: string
}

export type ServicoCatalogoInput = Omit<
  ServicoCatalogo,
  'id' | 'oficina_id' | 'office_id' | 'created_at' | 'updated_at'
>

export interface ServicoOSItem {
  id: string
  servico_catalogo_id?: string
  nome: string
  descricao?: string
  valor_mao_obra: number
  tempo_estimado_minutos?: number
  garantia_dias?: number
  observacoes?: string
  /** Peças sugeridas pelo catálogo — referência, não vinculadas automaticamente */
  pecas_sugeridas?: { peca_id: string; nome: string; quantidade: number; valor_unitario: number }[]
}
