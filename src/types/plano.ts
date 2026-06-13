/** Planos comerciais do Craft SaaS */
export type PlanoTier = 'free' | 'profissional' | 'premium'

export type RecursoPlano =
  | 'financeiro_completo'
  | 'relatorios_avancados'
  | 'estoque'
  | 'agenda'
  | 'pdf_os'
  | 'multiusuarios'
  | 'permissoes'
  | 'historico_avancado_moto'
  | 'fotos_antes_depois'
  | 'alertas'
  | 'garantia'
  | 'comunicacao'
  | 'lembretes'
  | 'portal_cliente'
  | 'checklist_personalizado'
  | 'catalogo_servicos'

export interface LimitesPlano {
  clientes: number
  motos: number
  os_mes: number
}

export interface AssinaturaOffice {
  office_id: string
  plano: PlanoTier
  updated_at: string
}

export interface PlanoCatalogo {
  id: PlanoTier
  nome: string
  descricao: string
  preco_mensal: number
  preco_label: string
  destaque?: boolean
  recursos: string[]
  limites?: LimitesPlano
}

export const ORDEM_PLANO: Record<PlanoTier, number> = {
  free: 0,
  profissional: 1,
  premium: 2,
}

export const PLANOS_CATALOGO: PlanoCatalogo[] = [
  {
    id: 'free',
    nome: 'Free',
    descricao: 'Ideal para começar e testar o Craft',
    preco_mensal: 0,
    preco_label: 'Grátis',
    recursos: [
      'Até 30 clientes',
      'Até 30 motos',
      'Até 50 OS por mês',
      'Ordens de serviço básicas',
      'Checklist de entrada',
    ],
    limites: { clientes: 30, motos: 30, os_mes: 50 },
  },
  {
    id: 'profissional',
    nome: 'Profissional',
    descricao: 'Para oficinas em crescimento',
    preco_mensal: 97,
    preco_label: 'R$ 97/mês',
    destaque: true,
    recursos: [
      'Clientes ilimitados',
      'Motos ilimitadas',
      'OS ilimitadas',
      'Financeiro completo',
      'Estoque',
      'Agenda',
      'Relatórios avançados',
      'PDF da OS',
      'Comunicação WhatsApp',
      'Lembretes de retorno',
      'Portal do Cliente',
      'Checklists personalizados',
      'Catálogo de serviços',
    ],
  },
  {
    id: 'premium',
    nome: 'Premium',
    descricao: 'Gestão completa com equipe e recursos avançados',
    preco_mensal: 197,
    preco_label: 'R$ 197/mês',
    recursos: [
      'Tudo do Profissional',
      'Multiusuários',
      'Permissões por cargo',
      'Histórico avançado da moto',
      'Fotos antes/depois',
      'Alertas inteligentes',
      'Garantia',
      'Suporte prioritário',
    ],
  },
]

const RECURSOS_POR_PLANO: Record<PlanoTier, Set<RecursoPlano>> = {
  free: new Set(),
  profissional: new Set([
    'financeiro_completo',
    'relatorios_avancados',
    'estoque',
    'agenda',
    'pdf_os',
    'comunicacao',
    'lembretes',
    'portal_cliente',
    'checklist_personalizado',
    'catalogo_servicos',
  ]),
  premium: new Set([
    'financeiro_completo',
    'relatorios_avancados',
    'estoque',
    'agenda',
    'pdf_os',
    'comunicacao',
    'lembretes',
    'portal_cliente',
    'checklist_personalizado',
    'catalogo_servicos',
    'multiusuarios',
    'permissoes',
    'historico_avancado_moto',
    'fotos_antes_depois',
    'alertas',
    'garantia',
  ]),
}

export function getLabelPlano(plano: PlanoTier): string {
  return PLANOS_CATALOGO.find((p) => p.id === plano)?.nome ?? plano
}

export function planoTemRecurso(plano: PlanoTier, recurso: RecursoPlano): boolean {
  return RECURSOS_POR_PLANO[plano].has(recurso)
}

export function getLimitesPlano(plano: PlanoTier): LimitesPlano | null {
  const catalogo = PLANOS_CATALOGO.find((p) => p.id === plano)
  return catalogo?.limites ?? null
}

export function planoAtendeMinimo(atual: PlanoTier, minimo: PlanoTier): boolean {
  return ORDEM_PLANO[atual] >= ORDEM_PLANO[minimo]
}
