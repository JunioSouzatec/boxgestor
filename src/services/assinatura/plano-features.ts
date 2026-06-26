import type { ModuloCraft } from '@/services/auth/permissions'
import {
  MODULOS_OPERACIONAIS_EQUIPE,
  podeAcessarModulo,
  podeAcessarModuloUsuario,
  resolverModuloDaRota,
} from '@/services/auth/permissions'
import type { AuthUser, PapelUsuario } from '@/types/auth'
import type { PermissoesContext } from '@/services/auth/permissions'
import {
  ehPlanoTrial,
  getLimitesEfetivosAssinatura,
  getLimitesPlano,
  getMaxUsuariosPlano,
  normalizarPlanoTier,
  planoAtendeMinimo,
  planoTemRecurso,
  testePremiumAtivo,
  testePremiumExpirado,
  type AssinaturaOffice,
  type LimitesPlano,
  type PlanoTier,
  type PlanoTierArmazenado,
  type RecursoPlano,
} from '@/types/plano'

const MODULO_PLANO_MINIMO: Partial<Record<ModuloCraft, PlanoTier>> = {
  financeiro: 'essential',
  fornecedores: 'professional',
  agenda: 'professional',
  catalogo_servicos: 'professional',
  lembretes: 'professional',
  comunicacao: 'premium',
  portal_cliente: 'premium',
}

/** Módulos liberados para visualização após fim do Teste Premium. */
const MODULOS_POS_TESTE: ModuloCraft[] = [
  'dashboard',
  'clientes',
  'motos',
  'ordens_servico',
  'planos',
  'configuracoes',
  'financeiro',
  'estoque',
  'relatorios',
]

/** Recursos mínimos para consulta após fim do teste (sem criar PDF/pagamentos). */
const RECURSOS_VISUALIZACAO_POS_TESTE: RecursoPlano[] = ['estoque', 'financeiro_basico']

const ROTAS_ORDEM: { rota: string; modulo: ModuloCraft }[] = [
  { rota: '/', modulo: 'dashboard' },
  { rota: '/ordens-servico', modulo: 'ordens_servico' },
  { rota: '/catalogo-servicos', modulo: 'catalogo_servicos' },
  { rota: '/clientes', modulo: 'clientes' },
  { rota: '/motos', modulo: 'motos' },
  { rota: '/agenda', modulo: 'agenda' },
  { rota: '/financeiro', modulo: 'financeiro' },
  { rota: '/estoque', modulo: 'estoque' },
  { rota: '/fornecedores', modulo: 'fornecedores' },
  { rota: '/usuarios', modulo: 'usuarios' },
  { rota: '/planos', modulo: 'planos' },
  { rota: '/relatorios', modulo: 'relatorios' },
  { rota: '/comunicacao', modulo: 'comunicacao' },
  { rota: '/lembretes', modulo: 'lembretes' },
  { rota: '/portal-cliente', modulo: 'portal_cliente' },
  { rota: '/configuracoes', modulo: 'configuracoes' },
]

export function planoPermiteModulo(plano: PlanoTierArmazenado, modulo: ModuloCraft): boolean {
  const tier = normalizarPlanoTier(plano)
  const minimo = MODULO_PLANO_MINIMO[modulo]
  if (!minimo) return true
  return planoAtendeMinimo(tier, minimo)
}

export function planoPermiteModuloComAssinatura(
  assinatura: AssinaturaOffice,
  modulo: ModuloCraft
): boolean {
  if (testePremiumAtivo(assinatura)) return true
  if (testePremiumExpirado(assinatura)) {
    return MODULOS_POS_TESTE.includes(modulo)
  }
  return planoPermiteModulo(assinatura.plano, modulo)
}

/** Equipe operacional não perde menu por tier do plano; dono segue regra comercial. */
export function planoPermiteModuloParaEquipe(
  assinatura: AssinaturaOffice,
  modulo: ModuloCraft,
  papel: PapelUsuario
): boolean {
  if (papel !== 'dono' && MODULOS_OPERACIONAIS_EQUIPE.includes(modulo)) {
    return true
  }
  return planoPermiteModuloComAssinatura(assinatura, modulo)
}

type PermissoesMenuContext = PermissoesContext

/** Verificação unificada para Sidebar / menu mobile — permissão + plano. */
export function podeExibirModuloMenu(
  user: AuthUser,
  assinatura: AssinaturaOffice,
  modulo: ModuloCraft,
  config?: PermissoesMenuContext
): boolean {
  if (!user.papel) return modulo === 'dashboard'
  if (!podeAcessarModuloUsuario(user, modulo, config)) return false
  if (modulo === 'financeiro') {
    return temRecursoComAssinatura(assinatura, 'financeiro_basico')
  }
  return planoPermiteModuloParaEquipe(assinatura, modulo, user.papel)
}

export function podeAcessarModuloComPlano(
  papel: PapelUsuario,
  plano: PlanoTierArmazenado,
  modulo: ModuloCraft
): boolean {
  return podeAcessarModulo(papel, modulo) && planoPermiteModulo(plano, modulo)
}

export function podeAcessarModuloComAssinatura(
  papel: PapelUsuario,
  assinatura: AssinaturaOffice,
  modulo: ModuloCraft
): boolean {
  return podeAcessarModulo(papel, modulo) && planoPermiteModuloComAssinatura(assinatura, modulo)
}

export function podeAcessarRotaComPlano(
  papel: PapelUsuario,
  plano: PlanoTierArmazenado,
  pathname: string
): boolean {
  const modulo = resolverModuloDaRota(pathname)
  if (!modulo) return true
  return podeAcessarModuloComPlano(papel, plano, modulo)
}

export function getRotaInicialComPlano(papel: PapelUsuario, plano: PlanoTierArmazenado): string {
  for (const { rota, modulo } of ROTAS_ORDEM) {
    if (podeAcessarModuloComPlano(papel, plano, modulo)) return rota
  }
  return '/ordens-servico'
}

export function getRotaInicialComAssinatura(
  papel: PapelUsuario,
  assinatura: AssinaturaOffice
): string {
  for (const { rota, modulo } of ROTAS_ORDEM) {
    if (podeAcessarModuloComAssinatura(papel, assinatura, modulo)) return rota
  }
  return '/planos'
}

export function temRecurso(plano: PlanoTierArmazenado, recurso: RecursoPlano): boolean {
  return planoTemRecurso(plano, recurso)
}

export function temRecursoComAssinatura(
  assinatura: AssinaturaOffice,
  recurso: RecursoPlano
): boolean {
  if (testePremiumAtivo(assinatura)) return true
  if (testePremiumExpirado(assinatura)) {
    return RECURSOS_VISUALIZACAO_POS_TESTE.includes(recurso)
  }
  return planoTemRecurso(assinatura.plano, recurso)
}

export function podeEscreverNoPlano(assinatura: AssinaturaOffice): boolean {
  return !testePremiumExpirado(assinatura)
}

export interface UsoPlano {
  clientes: number
  motos: number
  os_mes: number
  /** Total de OS — usado no limite do Teste Premium (100 no período). */
  os_total: number
  usuarios: number
}

export function calcularUsoPlano(dados: {
  clientes: number
  motos: number
  osMes: number
  osTotal?: number
  usuarios?: number
}): UsoPlano {
  return {
    clientes: dados.clientes,
    motos: dados.motos,
    os_mes: dados.osMes,
    os_total: dados.osTotal ?? dados.osMes,
    usuarios: dados.usuarios ?? 1,
  }
}

export type TipoLimite = keyof LimitesPlano

function valorUsoParaLimite(tipo: TipoLimite, uso: UsoPlano, plano: PlanoTierArmazenado): number {
  if (ehPlanoTrial(plano) && tipo === 'os_mes') {
    return uso.os_total
  }
  return uso[tipo]
}

function limiteNumerico(limites: LimitesPlano, tipo: TipoLimite): number | null {
  return limites[tipo]
}

export function limiteAtingido(
  plano: PlanoTierArmazenado,
  tipo: TipoLimite,
  uso: UsoPlano
): boolean {
  const limites = getLimitesPlano(plano)
  if (!limites) return false
  const max = limiteNumerico(limites, tipo)
  if (max === null) return false
  return valorUsoParaLimite(tipo, uso, plano) >= max
}

export function limiteAtingidoComAssinatura(
  assinatura: AssinaturaOffice,
  tipo: TipoLimite,
  uso: UsoPlano
): boolean {
  if (testePremiumExpirado(assinatura)) return true
  const limites = getLimitesEfetivosAssinatura(assinatura)
  if (!limites) return false
  const max = limiteNumerico(limites, tipo)
  if (max === null) return false
  return valorUsoParaLimite(tipo, uso, assinatura.plano) >= max
}

export function proximoDoLimite(
  plano: PlanoTierArmazenado,
  tipo: TipoLimite,
  uso: UsoPlano,
  threshold = 0.8
): boolean {
  const limites = getLimitesPlano(plano)
  if (!limites) return false
  const max = limiteNumerico(limites, tipo)
  if (max === null) return false
  const valor = valorUsoParaLimite(tipo, uso, plano)
  return valor / max >= threshold && valor < max
}

export function proximoDoLimiteComAssinatura(
  assinatura: AssinaturaOffice,
  tipo: TipoLimite,
  uso: UsoPlano,
  threshold = 0.8
): boolean {
  if (testePremiumExpirado(assinatura)) return false
  const limites = getLimitesEfetivosAssinatura(assinatura)
  if (!limites) return false
  const max = limiteNumerico(limites, tipo)
  if (max === null) return false
  const valor = valorUsoParaLimite(tipo, uso, assinatura.plano)
  return valor / max >= threshold && valor < max
}

export function mensagemLimite(tipo?: TipoLimite): string {
  if (tipo === 'usuarios') {
    return 'Limite de usuários atingido para o seu plano. Para adicionar mais usuários, solicite usuário extra ao suporte.'
  }
  return 'Limite do plano atingido. Atualize seu plano para continuar.'
}

export function mensagemOficinaAcimaLimiteUsuariosAdmin(): string {
  return 'Esta oficina está acima do limite do plano.'
}

export function oficinaAcimaLimiteUsuarios(
  assinatura: AssinaturaOffice,
  usuariosAtivos: number
): boolean {
  const limites = getLimitesEfetivosAssinatura(assinatura)
  const max = limites?.usuarios
  if (max === null || max === undefined) return false
  return usuariosAtivos > max
}

export function resumoLimitesUsuariosOficina(
  plano: PlanoTierArmazenado | string,
  extraUsersCount = 0,
  usuariosAtivos = 0
): {
  maxBase: number
  extras: number
  limiteTotal: number
  usuariosAtivos: number
  acimaDoLimite: boolean
} {
  const maxBase = getMaxUsuariosPlano(plano)
  const extras = Math.max(0, Math.floor(extraUsersCount))
  const limiteTotal = maxBase + extras
  return {
    maxBase,
    extras,
    limiteTotal,
    usuariosAtivos,
    acimaDoLimite: usuariosAtivos > limiteTotal,
  }
}

export function mensagemTesteExpirado(): string {
  return 'Seu teste terminou. Escolha um plano para continuar.'
}

export function mensagemRecursoSuperior(): string {
  return 'Este recurso está disponível em um plano superior.'
}

/** @deprecated Use mensagemRecursoSuperior */
export function mensagemRecursoPremium(): string {
  return mensagemRecursoSuperior()
}

export function mensagemSemPermissao(): string {
  return 'Você não tem permissão para acessar esta área.'
}

export function podeAdicionarUsuario(
  assinatura: AssinaturaOffice,
  uso: UsoPlano
): boolean {
  if (!podeEscreverNoPlano(assinatura)) return false
  return !limiteAtingidoComAssinatura(assinatura, 'usuarios', uso)
}

/** @deprecated Use podeAdicionarUsuario com assinatura */
export function podeAdicionarUsuarioPlano(plano: PlanoTierArmazenado, uso: UsoPlano): boolean {
  return !limiteAtingido(plano, 'usuarios', uso)
}
