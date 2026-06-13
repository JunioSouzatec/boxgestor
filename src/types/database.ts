import type { Agendamento } from '@/types/agendamento'
import type { Cliente } from '@/types/cliente'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { Moto } from '@/types/moto'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { OrdemServico } from '@/types/ordem-servico'
import type { Peca } from '@/types/peca'

export interface CraftDatabase {
  clientes: Cliente[]
  motos: Moto[]
  ordens_servico: OrdemServico[]
  pecas: Peca[]
  lancamentos: LancamentoFinanceiro[]
  agendamentos: Agendamento[]
  configuracao: ConfiguracaoOficina
  proximo_numero_os: number
}
