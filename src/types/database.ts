import type { Agendamento } from '@/types/agendamento'
import type { ModeloChecklist } from '@/types/checklist-modelo'
import type { Cliente } from '@/types/cliente'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { Moto } from '@/types/moto'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { OrdemServico } from '@/types/ordem-servico'
import type { Fornecedor } from '@/types/fornecedor'
import type { MovimentacaoEstoque } from '@/types/movimentacao-estoque'
import type { Peca } from '@/types/peca'
import type { ServicoCatalogo } from '@/types/servico-catalogo'

export interface CraftDatabase {
  clientes: Cliente[]
  motos: Moto[]
  ordens_servico: OrdemServico[]
  pecas: Peca[]
  fornecedores: Fornecedor[]
  movimentacoes_estoque: MovimentacaoEstoque[]
  lancamentos: LancamentoFinanceiro[]
  agendamentos: Agendamento[]
  modelos_checklist: ModeloChecklist[]
  servicos_catalogo: ServicoCatalogo[]
  configuracao: ConfiguracaoOficina
  proximo_numero_os: number
}
