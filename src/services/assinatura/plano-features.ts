import type { ModuloCraft } from '@/services/auth/permissions'
import { podeAcessarModulo, resolverModuloDaRota } from '@/services/auth/permissions'
import type { PapelUsuario } from '@/types/auth'
import {
  getLimitesPlano,
  normalizarPlanoTier,
  planoAtendeMinimo,
  planoTemRecurso,
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

export function podeAcessarModuloComPlano(
  papel: PapelUsuario,
  plano: PlanoTierArmazenado,
  modulo: ModuloCraft
): boolean {
  return podeAcessarModulo(papel, modulo) && planoPermiteModulo(plano, modulo)
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

export function temRecurso(plano: PlanoTierArmazenado, recurso: RecursoPlano): boolean {
  return planoTemRecurso(plano, recurso)
}

export interface UsoPlano {
  clientes: number
  motos: number
  os_mes: number
  usuarios: number
}

export function calcularUsoPlano(dados: {
  clientes: number
  motos: number
  osMes: number
  usuarios?: number
}): UsoPlano {
  return {
    clientes: dados.clientes,
    motos: dados.motos,
    os_mes: dados.osMes,
    usuarios: dados.usuarios ?? 1,
  }
}

export type TipoLimite = keyof LimitesPlano

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
  return uso[tipo] >= max
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
  return uso[tipo] / max >= threshold && uso[tipo] < max
}

export function mensagemLimite(_tipo?: TipoLimite): string {
  return 'Limite do plano atingido. Atualize seu plano para continuar.'
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

export function podeAdicionarUsuario(plano: PlanoTierArmazenado, uso: UsoPlano): boolean {
  return !limiteAtingido(plano, 'usuarios', uso)
}
