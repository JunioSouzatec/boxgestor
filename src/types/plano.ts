/** Planos comerciais oficiais do Craft Oficina */
export type PlanoTier = 'trial' | 'essential' | 'professional' | 'premium'

/** Valores legados ainda presentes em localStorage / Supabase antigo */
export type PlanoTierLegado = 'free' | 'profissional'

export type PlanoTierArmazenado = PlanoTier | PlanoTierLegado

export type RecursoPlano =
  | 'financeiro_basico'
  | 'financeiro_completo'
  | 'relatorios_avancados'
  | 'relatorios_completos'
  | 'estoque'
  | 'estoque_completo'
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
  | 'personalizacao_marca'
  | 'clientes_vip'

/** null = ilimitado */
export interface LimitesPlano {
  clientes: number | null
  motos: number | null
  os_mes: number | null
  usuarios: number | null
}

export interface AssinaturaOffice {
  office_id: string
  plano: PlanoTierArmazenado
  updated_at: string
  /** Início do teste grátis (ISO). Preenchido ao ativar plano trial. */
  trial_inicio_em?: string
  /** Fim do teste grátis (ISO). Preferencial para cálculo de dias restantes e extensões. */
  trial_fim_em?: string
  /** Usuários extras contratados manualmente pelo Admin Sistema (settings.metadata). */
  extra_users_count?: number
}

export interface PlanoCatalogo {
  id: PlanoTier
  nome: string
  descricao: string
  publico_alvo?: string
  preco_mensal: number
  preco_label: string
  duracao_label?: string
  destaque?: boolean
  recursos: string[]
  limites?: LimitesPlano
}

export const TRIAL_DIAS = 7

/** Preço mensal por usuário adicional (cobrança manual pelo Admin). */
export const PRECO_USUARIO_EXTRA_MENSAL = 39

export const PRECO_USUARIO_EXTRA_LABEL = 'R$ 39,00/mês'

/** Limite base de usuários por plano (sem extras contratados). */
export const MAX_USUARIOS_POR_PLANO: Record<PlanoTier, number> = {
  trial: 3,
  essential: 1,
  professional: 3,
  premium: 6,
}

/** Reservado para configuração futura (ex.: campanhas promocionais). */
export const TRIAL_DIAS_FUTURO = 14

export const ORDEM_PLANO: Record<PlanoTier, number> = {
  trial: 0,
  essential: 1,
  professional: 2,
  premium: 3,
}

/** Normaliza planos legados para a tabela oficial. */
export function normalizarPlanoTier(plano: PlanoTierArmazenado | string): PlanoTier {
  switch (plano) {
    case 'free':
      return 'trial'
    case 'profissional':
      return 'professional'
    case 'trial':
    case 'essential':
    case 'professional':
    case 'premium':
      return plano
    default:
      return 'trial'
  }
}

export const PLANOS_CATALOGO: PlanoCatalogo[] = [
  {
    id: 'trial',
    nome: 'Teste Premium grátis',
    descricao: 'Teste todos os recursos Premium por 7 dias',
    publico_alvo: 'Conheça o sistema completo antes de assinar',
    preco_mensal: 0,
    preco_label: 'R$ 0,00',
    duracao_label: '7 dias',
    recursos: [
      'Dashboard completo',
      'Clientes, motos e ordens de serviço',
      'Catálogo de serviços',
      'Estoque completo e baixa automática de peças',
      'Financeiro, relatórios, PDF e recibo',
      'Logo, cores e personalização',
      'Usuários, permissões e portal do cliente',
      'Lembretes, garantias, comunicação e clientes VIP',
      'Até 3 usuários durante o teste',
      '100 ordens de serviço · 200 clientes · 200 veículos',
    ],
    limites: { clientes: 200, motos: 200, os_mes: 100, usuarios: MAX_USUARIOS_POR_PLANO.trial },
  },
  {
    id: 'essential',
    nome: 'Essencial',
    descricao: 'Organize clientes, motos e ordens de serviço',
    publico_alvo: 'Oficina pequena que quer sair do caderno',
    preco_mensal: 127,
    preco_label: 'R$ 127,00/mês',
    recursos: [
      '1 usuário',
      'Até 100 ordens de serviço por mês',
      'Clientes ilimitados',
      'Veículos ilimitados',
      'OS completa com serviços e mão de obra',
      'PDF e recibo',
      'Dashboard simples',
      'Financeiro básico',
      'Estoque básico',
      'Logo da oficina',
    ],
    limites: {
      clientes: null,
      motos: null,
      os_mes: 100,
      usuarios: MAX_USUARIOS_POR_PLANO.essential,
    },
  },
  {
    id: 'professional',
    nome: 'Profissional',
    descricao: 'Para quem usa o sistema todos os dias',
    publico_alvo: 'Oficina em operação diária',
    preco_mensal: 247,
    preco_label: 'R$ 247,00/mês',
    destaque: true,
    recursos: [
      'Até 3 usuários',
      'Ordens de serviço ilimitadas',
      'Clientes e veículos ilimitados',
      'Estoque completo e baixa automática de peças',
      'Pagamentos e financeiro completo',
      'Dashboard e relatórios principais',
      'Logo e cores da oficina',
      'Garantias e lembretes básicos',
      'Permissões por cargo',
    ],
    limites: {
      clientes: null,
      motos: null,
      os_mes: null,
      usuarios: MAX_USUARIOS_POR_PLANO.professional,
    },
  },
  {
    id: 'premium',
    nome: 'Premium',
    descricao: 'Gestão completa com equipe e recursos avançados',
    publico_alvo: 'Oficina com equipe e visão estratégica',
    preco_mensal: 397,
    preco_label: 'R$ 397,00/mês',
    recursos: [
      'Até 6 usuários',
      `Usuário extra: ${PRECO_USUARIO_EXTRA_LABEL} por usuário adicional`,
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
    limites: {
      clientes: null,
      motos: null,
      os_mes: null,
      usuarios: MAX_USUARIOS_POR_PLANO.premium,
    },
  },
]

export const PLANOS_UI: PlanoCatalogo[] = PLANOS_CATALOGO

const RECURSO_TIER_MINIMO: Partial<Record<RecursoPlano, PlanoTier>> = {
  pdf_os: 'trial',
  estoque: 'trial',
  financeiro_basico: 'essential',
  personalizacao_marca: 'essential',
  financeiro_completo: 'professional',
  estoque_completo: 'professional',
  relatorios_avancados: 'professional',
  garantia: 'professional',
  lembretes: 'professional',
  permissoes: 'professional',
  multiusuarios: 'professional',
  alertas: 'professional',
  catalogo_servicos: 'professional',
  checklist_personalizado: 'professional',
  fotos_antes_depois: 'professional',
  agenda: 'professional',
  portal_cliente: 'premium',
  comunicacao: 'premium',
  historico_avancado_moto: 'premium',
  relatorios_completos: 'premium',
  clientes_vip: 'premium',
}

export function getLabelPlano(plano: PlanoTierArmazenado | string): string {
  const normalizado = normalizarPlanoTier(plano)
  return PLANOS_CATALOGO.find((p) => p.id === normalizado)?.nome ?? normalizado
}

export function planoTemRecurso(plano: PlanoTierArmazenado | string, recurso: RecursoPlano): boolean {
  const tier = normalizarPlanoTier(plano)
  const minimo = RECURSO_TIER_MINIMO[recurso]
  if (!minimo) return true
  return ORDEM_PLANO[tier] >= ORDEM_PLANO[minimo]
}

export function getLimitesPlano(plano: PlanoTierArmazenado | string): LimitesPlano | null {
  const normalizado = normalizarPlanoTier(plano)
  const item = PLANOS_CATALOGO.find((p) => p.id === normalizado)
  return item?.limites ?? null
}

export function getMaxUsuariosPlano(plano: PlanoTierArmazenado | string): number {
  return MAX_USUARIOS_POR_PLANO[normalizarPlanoTier(plano)]
}

export function normalizarExtraUsersCount(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/** Limite total = base do plano + extras contratados pelo Admin. */
export function calcularLimiteTotalUsuarios(
  plano: PlanoTierArmazenado | string,
  extraUsersCount = 0
): number {
  return getMaxUsuariosPlano(plano) + normalizarExtraUsersCount(extraUsersCount)
}

/** Limites do plano com usuários extras aplicados (demais campos inalterados). */
export function getLimitesEfetivosPlano(
  plano: PlanoTierArmazenado | string,
  extraUsersCount = 0
): LimitesPlano | null {
  const base = getLimitesPlano(plano)
  if (!base) return null
  return {
    ...base,
    usuarios: calcularLimiteTotalUsuarios(plano, extraUsersCount),
  }
}

export function getLimitesEfetivosAssinatura(assinatura: AssinaturaOffice): LimitesPlano | null {
  return getLimitesEfetivosPlano(assinatura.plano, assinatura.extra_users_count)
}

export function planoTemLimitesNumericos(plano: PlanoTierArmazenado | string): boolean {
  const limites = getLimitesPlano(plano)
  if (!limites) return false
  return Object.values(limites).some((v) => v !== null)
}

export function planoAtendeMinimo(atual: PlanoTierArmazenado | string, minimo: PlanoTier): boolean {
  return ORDEM_PLANO[normalizarPlanoTier(atual)] >= ORDEM_PLANO[minimo]
}

export function ehPlanoPremium(plano: PlanoTierArmazenado | string): boolean {
  return normalizarPlanoTier(plano) === 'premium'
}

export function ehPlanoTrial(plano: PlanoTierArmazenado | string): boolean {
  return normalizarPlanoTier(plano) === 'trial'
}

/** Teste Premium ainda dentro dos 7 dias (recursos Premium liberados). */
export function testePremiumAtivo(assinatura: AssinaturaOffice): boolean {
  return ehPlanoTrial(assinatura.plano) && !trialExpirado(assinatura)
}

/** Teste Premium encerrado — dados preservados, escrita bloqueada. */
export function testePremiumExpirado(assinatura: AssinaturaOffice): boolean {
  return ehPlanoTrial(assinatura.plano) && trialExpirado(assinatura)
}

export function getLabelPlanoBadge(plano: PlanoTierArmazenado | string, assinatura?: AssinaturaOffice): string {
  if (assinatura && testePremiumAtivo(assinatura)) {
    const dias = diasRestantesTrial(assinatura)
    if (dias !== null && dias > 0) {
      return `Teste Premium — ${dias} dia${dias === 1 ? '' : 's'} restante${dias === 1 ? '' : 's'}`
    }
    return 'Teste Premium'
  }
  if (assinatura && testePremiumExpirado(assinatura)) {
    return 'Teste Premium encerrado'
  }
  return getLabelPlano(plano)
}

export function getPlanoCatalogo(plano: PlanoTierArmazenado | string): PlanoCatalogo | undefined {
  return PLANOS_CATALOGO.find((p) => p.id === normalizarPlanoTier(plano))
}

export function obterTrialFimEm(assinatura: AssinaturaOffice): string {
  if (assinatura.trial_fim_em) return assinatura.trial_fim_em
  const inicio = new Date(assinatura.trial_inicio_em ?? assinatura.updated_at)
  inicio.setDate(inicio.getDate() + TRIAL_DIAS)
  return inicio.toISOString()
}

export function calcularTrialFimAPartirDe(inicioIso: string, dias = TRIAL_DIAS): string {
  const fim = new Date(inicioIso)
  fim.setDate(fim.getDate() + dias)
  return fim.toISOString()
}

export function diasRestantesTrial(assinatura: AssinaturaOffice): number | null {
  if (normalizarPlanoTier(assinatura.plano) !== 'trial') return null
  const fim = new Date(obterTrialFimEm(assinatura))
  const diff = Math.ceil((fim.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

export function trialExpirado(assinatura: AssinaturaOffice): boolean {
  if (normalizarPlanoTier(assinatura.plano) !== 'trial') return false
  return new Date(obterTrialFimEm(assinatura)).getTime() < Date.now()
}

export function formatarLimite(valor: number | null): string {
  return valor === null ? 'Ilimitado' : String(valor)
}
