import type { ModuloCraft } from '@/services/auth/permissions'
import { podeAcessarModulo, resolverModuloDaRota } from '@/services/auth/permissions'
import type { PapelUsuario } from '@/types/auth'
import type { PlanoTier, RecursoPlano, LimitesPlano } from '@/types/plano'
import { getLimitesPlano, planoAtendeMinimo, planoTemRecurso } from '@/types/plano'

const MODULO_PLANO_MINIMO: Partial<Record<ModuloCraft, PlanoTier>> = {
  financeiro: 'profissional',
  estoque: 'profissional',
  fornecedores: 'profissional',
  agenda: 'profissional',
  usuarios: 'premium',
  catalogo_servicos: 'profissional',
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

export function planoPermiteModulo(plano: PlanoTier, modulo: ModuloCraft): boolean {
  const minimo = MODULO_PLANO_MINIMO[modulo]
  if (!minimo) return true
  return planoAtendeMinimo(plano, minimo)
}

export function podeAcessarModuloComPlano(
  papel: PapelUsuario,
  plano: PlanoTier,
  modulo: ModuloCraft
): boolean {
  return podeAcessarModulo(papel, modulo) && planoPermiteModulo(plano, modulo)
}

export function podeAcessarRotaComPlano(
  papel: PapelUsuario,
  plano: PlanoTier,
  pathname: string
): boolean {
  const modulo = resolverModuloDaRota(pathname)
  if (!modulo) return true
  return podeAcessarModuloComPlano(papel, plano, modulo)
}

export function getRotaInicialComPlano(papel: PapelUsuario, plano: PlanoTier): string {
  for (const { rota, modulo } of ROTAS_ORDEM) {
    if (podeAcessarModuloComPlano(papel, plano, modulo)) return rota
  }
  return '/ordens-servico'
}

export function temRecurso(plano: PlanoTier, recurso: RecursoPlano): boolean {
  return planoTemRecurso(plano, recurso)
}

export interface UsoPlano {
  clientes: number
  motos: number
  os_mes: number
}

export function calcularUsoPlano(dados: {
  clientes: number
  motos: number
  osMes: number
}): UsoPlano {
  return {
    clientes: dados.clientes,
    motos: dados.motos,
    os_mes: dados.osMes,
  }
}

export type TipoLimite = keyof LimitesPlano

export function limiteAtingido(
  plano: PlanoTier,
  tipo: TipoLimite,
  uso: UsoPlano
): boolean {
  const limites = getLimitesPlano(plano)
  if (!limites) return false
  return uso[tipo] >= limites[tipo]
}

export function proximoDoLimite(
  plano: PlanoTier,
  tipo: TipoLimite,
  uso: UsoPlano,
  threshold = 0.8
): boolean {
  const limites = getLimitesPlano(plano)
  if (!limites) return false
  return uso[tipo] / limites[tipo] >= threshold && uso[tipo] < limites[tipo]
}

export function mensagemLimite(tipo: TipoLimite, limites: LimitesPlano): string {
  const labels: Record<TipoLimite, string> = {
    clientes: 'clientes',
    motos: 'motos',
    os_mes: 'ordens de serviço este mês',
  }
  return `Limite do plano Free: ${limites[tipo]} ${labels[tipo]}.`
}
