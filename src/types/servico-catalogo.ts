import type { TenantEntity } from '@/types/base'
import type { CategoriaPeca } from '@/types/peca'
import type { UnidadePecaOS } from '@/types/unidade-peca'

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
  id: string
  /** Descrição genérica — ex.: "Óleo de motor", "Filtro de óleo" */
  descricao: string
  quantidade: number
  unidade?: UnidadePecaOS
  /** Filtra peças do estoque na OS por categoria */
  categoria_peca?: CategoriaPeca
  /** Peça do estoque usada só como referência no catálogo (opcional) */
  peca_referencia_id?: string
  /** @deprecated legado — migrado para descricao + peca_referencia_id */
  peca_id?: string
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
  /** Peças sugeridas — modelo editável na OS, não vinculadas automaticamente */
  pecas_sugeridas?: PecaSugeridaOSItem[]
}

export interface PecaSugeridaOSItem {
  id: string
  descricao: string
  quantidade: number
  unidade?: UnidadePecaOS
  categoria_peca?: CategoriaPeca
  peca_referencia_id?: string
}
