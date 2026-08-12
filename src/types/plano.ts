/** Planos comerciais oficiais do BoxGestor */
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
  // Recursos avançados (RC2) — preparados para fases futuras, exclusivos do plano premium
  | 'caixa_avancado'
  | 'fechamento_financeiro'
  | 'comissao_folha'
  | 'comissao_status'
  | 'os_bloqueio_saldo'
  | 'credito_cliente'
  | 'marca_avancada'
  | 'auditoria_avancada'

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
  /**
   * Módulo Fiscal adicional pago (settings.metadata.modulo_fiscal_adicional_ativo).
   * Não incluso automaticamente em nenhum plano.
   */
  modulo_fiscal_adicional_ativo?: boolean
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

/** Duração do teste grátis para novos cadastros. */
export const TRIAL_DIAS = 15

/**
 * Inferência legada quando trial_fim_em / trial_ends_at não existe.
 * Mantém oficinas antigas (criadas com 7 dias) sem recalcular para 15.
 */
export const TRIAL_DIAS_LEGADO = 7

/** @deprecated Preferir TRIAL_DIAS / TRIAL_DIAS_LEGADO. */
export const TRIAL_DIAS_FUTURO = 15

/** Preço mensal do Módulo Fiscal adicional (por oficina). */
export const PRECO_MODULO_FISCAL_MENSAL = 97

export const PRECO_MODULO_FISCAL_LABEL = 'R$ 97,00/mês'

export const AVISO_CUSTOS_EXTERNOS_FISCAL =
  'Custos externos não inclusos: certificado digital, contador, provedor fiscal, custo por nota e impostos.'

export const MSG_FISCAL_ADICIONAL_BLOQUEADO =
  'Módulo Fiscal disponível como adicional por R$ 97/mês.'

/** Preço mensal por usuário adicional, conforme o plano. */
export const PRECO_USUARIO_EXTRA_POR_PLANO: Record<PlanoTier, number> = {
  trial: 0,
  essential: 20,
  professional: 60,
  premium: 150,
}

/** @deprecated Use getPrecoUsuarioExtraMensal(plano). Mantido para compatibilidade. */
export const PRECO_USUARIO_EXTRA_MENSAL = PRECO_USUARIO_EXTRA_POR_PLANO.essential

/** @deprecated Use getPrecoUsuarioExtraLabel(plano). */
export const PRECO_USUARIO_EXTRA_LABEL = 'R$ 20,00/mês'

/** Limite base de usuários por plano (sem extras contratados). */
export const MAX_USUARIOS_POR_PLANO: Record<PlanoTier, number> = {
  trial: 3,
  essential: 1,
  professional: 3,
  premium: 6,
}

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

export function getPrecoUsuarioExtraMensal(plano: PlanoTierArmazenado | string): number {
  return PRECO_USUARIO_EXTRA_POR_PLANO[normalizarPlanoTier(plano)]
}

export function getPrecoUsuarioExtraLabel(plano: PlanoTierArmazenado | string): string {
  const valor = getPrecoUsuarioExtraMensal(plano)
  if (valor <= 0) return '—'
  return `R$ ${valor.toFixed(2).replace('.', ',')}/mês`
}

export function linhaUsuarioExtraPlano(plano: PlanoTierArmazenado | string): string {
  return `Usuário extra: ${getPrecoUsuarioExtraLabel(plano)} por usuário adicional`
}

export function normalizarModuloFiscalAdicionalAtivo(valor: unknown): boolean {
  return valor === true || valor === 'true' || valor === 1 || valor === '1'
}

export const PLANOS_CATALOGO: PlanoCatalogo[] = [
  {
    id: 'trial',
    nome: 'Teste grátis',
    descricao: 'Teste grátis por 15 dias com o sistema completo',
    publico_alvo: 'Conheça o BoxGestor antes de assinar',
    preco_mensal: 0,
    preco_label: 'R$ 0,00',
    duracao_label: '15 dias',
    recursos: [
      'Teste grátis por 15 dias',
      'Dashboard completo',
      'Clientes, veículos e ordens de serviço',
      'Orçamentos e aprovação por link',
      'Estoque, financeiro, PDF e recibo',
      'Pátio e Central do Dia',
      'Até 3 usuários durante o teste',
      '100 ordens de serviço · 200 clientes · 200 veículos',
      'Módulo Fiscal disponível como adicional (não incluso)',
    ],
    limites: { clientes: 200, motos: 200, os_mes: 100, usuarios: MAX_USUARIOS_POR_PLANO.trial },
  },
  {
    id: 'essential',
    nome: 'Essencial',
    descricao: 'Organize atendimento, clientes, veículos, agenda, OS e orçamento',
    publico_alvo: 'Oficina pequena — dono sozinho ou equipe pequena',
    preco_mensal: 127,
    preco_label: 'R$ 127,00/mês',
    recursos: [
      '1 usuário incluso',
      linhaUsuarioExtraPlano('essential'),
      'Até 80 ordens de serviço por mês',
      'Até 300 clientes',
      'Até 300 veículos',
      'OS, orçamentos e aprovação por link',
      'Agendamento',
      'Estoque básico',
      'Financeiro básico',
      'Comunicação manual',
      'Pátio visual simples',
      'Central do Dia simples',
      'Relatórios básicos',
      'Módulo Fiscal disponível como adicional',
    ],
    limites: {
      clientes: 300,
      motos: 300,
      os_mes: 80,
      usuarios: MAX_USUARIOS_POR_PLANO.essential,
    },
  },
  {
    id: 'professional',
    nome: 'Profissional',
    descricao: 'Controle a operação completa da oficina',
    publico_alvo: 'Oficina média com movimento, equipe e peças',
    preco_mensal: 247,
    preco_label: 'R$ 247,00/mês',
    destaque: true,
    recursos: [
      '3 usuários inclusos',
      linhaUsuarioExtraPlano('professional'),
      'Tudo do Essencial',
      'OS, clientes e veículos ilimitados',
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
      'Módulo Fiscal disponível como adicional',
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
    descricao: 'Gestão avançada, mais equipe e prioridade',
    publico_alvo: 'Oficina maior com volume e gestão avançada',
    preco_mensal: 397,
    preco_label: 'R$ 397,00/mês',
    recursos: [
      '6 usuários inclusos',
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
      'Módulo Fiscal disponível como adicional',
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
  agenda: 'essential',
  comunicacao: 'essential',
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
  comissao_folha: 'professional',
  comissao_status: 'professional',
  portal_cliente: 'premium',
  historico_avancado_moto: 'premium',
  relatorios_completos: 'premium',
  clientes_vip: 'premium',
  caixa_avancado: 'premium',
  fechamento_financeiro: 'premium',
  os_bloqueio_saldo: 'premium',
  credito_cliente: 'premium',
  marca_avancada: 'premium',
  auditoria_avancada: 'premium',
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

/** Teste grátis ainda dentro do prazo (recursos liberados, exceto fiscal adicional). */
export function testePremiumAtivo(assinatura: AssinaturaOffice): boolean {
  return ehPlanoTrial(assinatura.plano) && !trialExpirado(assinatura)
}

/** Teste grátis encerrado — dados preservados, escrita bloqueada. */
export function testePremiumExpirado(assinatura: AssinaturaOffice): boolean {
  return ehPlanoTrial(assinatura.plano) && trialExpirado(assinatura)
}

export function getLabelPlanoBadge(plano: PlanoTierArmazenado | string, assinatura?: AssinaturaOffice): string {
  if (assinatura && testePremiumAtivo(assinatura)) {
    const dias = diasRestantesTrial(assinatura)
    if (dias !== null && dias > 0) {
      return `Teste grátis — ${dias} dia${dias === 1 ? '' : 's'} restante${dias === 1 ? '' : 's'}`
    }
    return 'Teste grátis'
  }
  if (assinatura && testePremiumExpirado(assinatura)) {
    return 'Teste grátis encerrado'
  }
  return getLabelPlano(plano)
}

export function getPlanoCatalogo(plano: PlanoTierArmazenado | string): PlanoCatalogo | undefined {
  return PLANOS_CATALOGO.find((p) => p.id === normalizarPlanoTier(plano))
}

export function obterTrialFimEm(assinatura: AssinaturaOffice): string {
  if (assinatura.trial_fim_em) return assinatura.trial_fim_em
  const inicio = new Date(assinatura.trial_inicio_em ?? assinatura.updated_at)
  // Sem fim salvo: oficinas antigas usam 7 dias (não recalcular para 15).
  inicio.setDate(inicio.getDate() + TRIAL_DIAS_LEGADO)
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

export function moduloFiscalAdicionalAtivoNaAssinatura(assinatura: AssinaturaOffice): boolean {
  return normalizarModuloFiscalAdicionalAtivo(assinatura.modulo_fiscal_adicional_ativo)
}
