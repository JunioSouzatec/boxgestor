import type { TermosOficina } from '@/lib/termos-oficina'
import type { PlanoCatalogo } from '@/types/plano'
import {
  MAX_USUARIOS_POR_PLANO,
  PRECO_USUARIO_EXTRA_LABEL,
} from '@/types/plano'

export const LINHA_USUARIO_EXTRA_PLANO = `Usuário extra: ${PRECO_USUARIO_EXTRA_LABEL} por usuário adicional`

export const NOTA_SOLICITACAO_USUARIOS_EXTRAS =
  'Cliente solicitou usuários adicionais além do limite do plano.'

/** Aplica termos da oficina (motos vs veículos) e linhas comerciais de usuário extra. */
export function aplicarTermosPlanoCatalogo(
  plano: PlanoCatalogo,
  termos: TermosOficina
): PlanoCatalogo {
  const veiculosLower = termos.veiculos.toLowerCase()
  const clientesVeiculosOs = `Clientes, ${veiculosLower} e ordens de serviço`
  const veiculosIlimitados = `${termos.veiculos} ilimitados`
  const clientesEVeiculosIlimitados = `Clientes e ${veiculosLower} ilimitados`

  switch (plano.id) {
    case 'trial':
      return {
        ...plano,
        recursos: [
          'Dashboard completo',
          clientesVeiculosOs,
          'Catálogo de serviços',
          'Estoque completo e baixa automática de peças',
          'Financeiro, relatórios, PDF e recibo',
          'Logo, cores e personalização',
          'Usuários, permissões e portal do cliente',
          'Lembretes, garantias, comunicação e clientes VIP',
          'Até 3 usuários durante o teste',
          `100 ordens de serviço · 200 clientes · 200 ${veiculosLower}`,
        ],
      }

    case 'essential':
      return {
        ...plano,
        descricao: `Organize clientes, ${veiculosLower} e ordens de serviço`,
        recursos: [
          '1 usuário incluído',
          LINHA_USUARIO_EXTRA_PLANO,
          'Até 100 ordens de serviço por mês',
          'Clientes ilimitados',
          veiculosIlimitados,
          'OS completa com serviços e mão de obra',
          'PDF e recibo',
          'Dashboard simples',
          'Financeiro básico',
          'Estoque básico',
          'Logo da oficina',
        ],
      }

    case 'professional':
      return {
        ...plano,
        descricao: `Para quem usa o sistema todos os dias`,
        recursos: [
          `Até ${MAX_USUARIOS_POR_PLANO.professional} usuários incluídos`,
          LINHA_USUARIO_EXTRA_PLANO,
          'Ordens de serviço ilimitadas',
          clientesEVeiculosIlimitados,
          'Estoque completo e baixa automática de peças',
          'Pagamentos e financeiro completo',
          'Dashboard e relatórios principais',
          'Logo e cores da oficina',
          'Garantias e lembretes básicos',
          'Permissões por cargo',
        ],
      }

    case 'premium':
      return {
        ...plano,
        recursos: [
          `Até ${MAX_USUARIOS_POR_PLANO.premium} usuários incluídos`,
          LINHA_USUARIO_EXTRA_PLANO,
          'Todos os recursos do Profissional',
          'Portal do cliente',
          'Permissões avançadas por cargo',
          'Relatórios completos',
          'Clientes VIP',
          'Garantias completas',
          'Lembretes avançados',
          'Comunicação com cliente',
          'Histórico completo',
          'Suporte prioritário',
          'Personalização completa',
        ],
      }

    default:
      return plano
  }
}

export function ehSolicitacaoUsuariosExtras(note?: string): boolean {
  return note?.trim() === NOTA_SOLICITACAO_USUARIOS_EXTRAS
}
