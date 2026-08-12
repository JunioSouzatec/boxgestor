import type { TermosOficina } from '@/lib/termos-oficina'
import type { PlanoCatalogo } from '@/types/plano'
import {
  AVISO_CUSTOS_EXTERNOS_FISCAL,
  MAX_USUARIOS_POR_PLANO,
  PRECO_MODULO_FISCAL_LABEL,
  linhaUsuarioExtraPlano,
} from '@/types/plano'

export const NOTA_SOLICITACAO_USUARIOS_EXTRAS =
  'Cliente solicitou usuários adicionais além do limite do plano.'

export const NOTA_SOLICITACAO_MODULO_FISCAL =
  'Cliente solicitou o Módulo Fiscal adicional.'

export const LINHA_MODULO_FISCAL_ADICIONAL = `Módulo Fiscal adicional: ${PRECO_MODULO_FISCAL_LABEL} por oficina`

/** Aplica termos da oficina (motos vs veículos) e linhas comerciais. */
export function aplicarTermosPlanoCatalogo(
  plano: PlanoCatalogo,
  termos: TermosOficina
): PlanoCatalogo {
  const veiculosLower = termos.veiculos.toLowerCase()
  const clientesVeiculosOs = `Clientes, ${veiculosLower} e ordens de serviço`
  const clientesEVeiculosIlimitados = `Clientes e ${veiculosLower} ilimitados`
  const ateVeiculos = `Até 300 ${veiculosLower}`

  switch (plano.id) {
    case 'trial':
      return {
        ...plano,
        descricao: 'Teste grátis por 15 dias com o sistema completo',
        recursos: [
          'Teste grátis por 15 dias',
          'Dashboard completo',
          clientesVeiculosOs,
          'Orçamentos e aprovação por link',
          'Estoque, financeiro, PDF e recibo',
          'Pátio e Central do Dia',
          'Até 3 usuários durante o teste',
          `100 ordens de serviço · 200 clientes · 200 ${veiculosLower}`,
          LINHA_MODULO_FISCAL_ADICIONAL,
          AVISO_CUSTOS_EXTERNOS_FISCAL,
        ],
      }

    case 'essential':
      return {
        ...plano,
        descricao: `Organize atendimento, clientes, ${veiculosLower}, agenda, OS e orçamento`,
        recursos: [
          '1 usuário incluso',
          linhaUsuarioExtraPlano('essential'),
          'Até 80 ordens de serviço por mês',
          'Até 300 clientes',
          ateVeiculos,
          'OS, orçamentos e aprovação por link',
          'Agendamento',
          'Estoque básico',
          'Financeiro básico',
          'Comunicação manual',
          'Pátio visual simples',
          'Central do Dia simples',
          'Relatórios básicos',
          LINHA_MODULO_FISCAL_ADICIONAL,
          AVISO_CUSTOS_EXTERNOS_FISCAL,
        ],
      }

    case 'professional':
      return {
        ...plano,
        descricao: 'Controle a operação completa da oficina',
        recursos: [
          `Até ${MAX_USUARIOS_POR_PLANO.professional} usuários inclusos`,
          linhaUsuarioExtraPlano('professional'),
          'Tudo do Essencial',
          'OS ilimitadas',
          clientesEVeiculosIlimitados,
          'Caixa completo',
          'Venda balcão',
          'Comissão',
          'Controle de equipe e permissões',
          'Relatórios melhores',
          'Comunicação mais completa',
          'Pátio visual completo',
          'Central do Dia completa',
          'Aprovação de orçamento por link completa',
          'Histórico mais detalhado',
          LINHA_MODULO_FISCAL_ADICIONAL,
          AVISO_CUSTOS_EXTERNOS_FISCAL,
        ],
      }

    case 'premium':
      return {
        ...plano,
        recursos: [
          `Até ${MAX_USUARIOS_POR_PLANO.premium} usuários inclusos`,
          linhaUsuarioExtraPlano('premium'),
          'Tudo do Profissional',
          'Relatórios avançados e completos',
          'Recursos avançados e automações',
          'Gestão e permissões mais completas',
          'Portal do cliente',
          'Clientes VIP',
          'Personalização avançada',
          'Prioridade em melhorias e suporte',
          'Recursos premium futuros',
          LINHA_MODULO_FISCAL_ADICIONAL,
          AVISO_CUSTOS_EXTERNOS_FISCAL,
        ],
      }

    default:
      return plano
  }
}

export function ehSolicitacaoUsuariosExtras(note?: string): boolean {
  return note?.trim() === NOTA_SOLICITACAO_USUARIOS_EXTRAS
}

export function ehSolicitacaoModuloFiscal(note?: string): boolean {
  return note?.trim() === NOTA_SOLICITACAO_MODULO_FISCAL
}
