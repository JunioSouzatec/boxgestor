import type { AuthUser, PapelUsuario } from '@/types/auth'
import { ehAdminSistema } from '@/lib/craft-admin'
import type { ComissoesConfigOficina } from '@/types/comissoes'
import { obterComissoesConfig } from '@/types/comissoes'

export type ModuloCraft =
  | 'dashboard'
  | 'clientes'
  | 'motos'
  | 'ordens_servico'
  | 'financeiro'
  | 'estoque'
  | 'agenda'
  | 'configuracoes'
  | 'usuarios'
  | 'planos'
  | 'relatorios'
  | 'comunicacao'
  | 'lembretes'
  | 'portal_cliente'
  | 'catalogo_servicos'
  | 'fornecedores'
  | 'admin_craft'

const PERMISSOES_POR_MODULO: Record<ModuloCraft, PapelUsuario[]> = {
  dashboard: ['dono', 'gerente', 'recepcao', 'mecanico'],
  clientes: ['dono', 'gerente', 'recepcao'],
  motos: ['dono', 'gerente', 'recepcao'],
  ordens_servico: ['dono', 'gerente', 'mecanico', 'recepcao'],
  financeiro: ['dono', 'gerente'],
  estoque: ['dono', 'gerente', 'mecanico'],
  fornecedores: ['dono', 'gerente'],
  agenda: ['dono', 'gerente', 'recepcao'],
  configuracoes: ['dono', 'gerente'],
  usuarios: ['dono'],
  planos: ['dono'],
  relatorios: ['dono', 'gerente'],
  comunicacao: ['dono', 'gerente', 'recepcao'],
  lembretes: ['dono', 'gerente', 'recepcao'],
  portal_cliente: ['dono', 'gerente', 'recepcao'],
  catalogo_servicos: ['dono', 'gerente', 'recepcao', 'mecanico'],
  admin_craft: [],
}

const ROTA_MODULO: Record<string, ModuloCraft> = {
  '/': 'dashboard',
  '/clientes': 'clientes',
  '/motos': 'motos',
  '/ordens-servico': 'ordens_servico',
  '/financeiro': 'financeiro',
  '/estoque': 'estoque',
  '/agenda': 'agenda',
  '/configuracoes': 'configuracoes',
  '/usuarios': 'usuarios',
  '/planos': 'planos',
  '/relatorios': 'relatorios',
  '/comunicacao': 'comunicacao',
  '/lembretes': 'lembretes',
  '/portal-cliente': 'portal_cliente',
  '/catalogo-servicos': 'catalogo_servicos',
  '/fornecedores': 'fornecedores',
  '/admin-craft': 'admin_craft',
}

const ORDEM_ROTAS: { rota: string; modulo: ModuloCraft }[] = [
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

export interface VisibilidadeDashboard {
  faturamentoLucro: boolean
  pagamentosPendentes: boolean
  clientesMotosTotais: boolean
  estoqueCompleto: boolean
  agendaHoje: boolean
  topClientes: boolean
  portalLembretes: boolean
  alertas: boolean
  topServicosPecas: boolean
}

export function visibilidadeDashboard(papel: PapelUsuario): VisibilidadeDashboard {
  switch (papel) {
    case 'dono':
    case 'gerente':
      return {
        faturamentoLucro: true,
        pagamentosPendentes: true,
        clientesMotosTotais: true,
        estoqueCompleto: true,
        agendaHoje: true,
        topClientes: true,
        portalLembretes: true,
        alertas: true,
        topServicosPecas: true,
      }
    case 'recepcao':
      return {
        faturamentoLucro: false,
        pagamentosPendentes: true,
        clientesMotosTotais: true,
        estoqueCompleto: false,
        agendaHoje: true,
        topClientes: false,
        portalLembretes: false,
        alertas: false,
        topServicosPecas: false,
      }
    case 'mecanico':
      return {
        faturamentoLucro: false,
        pagamentosPendentes: false,
        clientesMotosTotais: false,
        estoqueCompleto: false,
        agendaHoje: false,
        topClientes: false,
        portalLembretes: false,
        alertas: false,
        topServicosPecas: true,
      }
  }
}

export function resolverModuloDaRota(pathname: string): ModuloCraft | undefined {
  if (pathname === '/portal-cliente' || pathname.startsWith('/portal-cliente/')) {
    return 'portal_cliente'
  }
  if (pathname === '/admin-craft' || pathname.startsWith('/admin-craft/')) {
    return 'admin_craft'
  }
  return ROTA_MODULO[pathname]
}

export function podeAcessarModuloUsuario(user: AuthUser, modulo: ModuloCraft): boolean {
  if (modulo === 'admin_craft') return ehAdminSistema(user)
  return podeAcessarModulo(user.papel, modulo)
}

export function podeAcessarAreaTecnica(user: AuthUser | null | undefined): boolean {
  return ehAdminSistema(user)
}

export function podeAcessarModulo(papel: PapelUsuario, modulo: ModuloCraft): boolean {
  if (modulo === 'admin_craft') return false
  return PERMISSOES_POR_MODULO[modulo].includes(papel)
}

export function podeAcessarRota(papel: PapelUsuario, pathname: string): boolean {
  const modulo = resolverModuloDaRota(pathname)
  if (!modulo) return true
  return podeAcessarModulo(papel, modulo)
}

export function modulosPermitidos(papel: PapelUsuario): ModuloCraft[] {
  return (Object.keys(PERMISSOES_POR_MODULO) as ModuloCraft[]).filter((m) =>
    podeAcessarModulo(papel, m)
  )
}

export function getRotaInicial(papel: PapelUsuario): string {
  for (const { rota, modulo } of ORDEM_ROTAS) {
    if (podeAcessarModulo(papel, modulo)) return rota
  }
  return '/ordens-servico'
}

export function papeisDisponiveisParaAtribuir(papel: PapelUsuario): PapelUsuario[] {
  if (papel === 'dono') return ['dono', 'gerente', 'mecanico', 'recepcao']
  if (papel === 'gerente') return ['gerente', 'mecanico', 'recepcao']
  return []
}

export function podeExcluirOficina(papel: PapelUsuario): boolean {
  return papel === 'dono'
}

export function podeAlterarPlano(papel: PapelUsuario): boolean {
  return papel === 'dono'
}

/** Troca manual de plano — apenas Administrador do Sistema (suporte). */
export function podeAlterarPlanoManualmente(user: AuthUser | null | undefined): boolean {
  return ehAdminSistema(user)
}

export function podeRestaurarDados(user: AuthUser | null | undefined): boolean {
  return ehAdminSistema(user)
}

export function podeGerenciarModelosChecklist(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente'
}

export function podeVerValoresFinanceirosOS(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente' || papel === 'recepcao'
}

export function podeVerLucroDashboard(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente'
}

export function podeRegistrarPagamentoOS(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente' || papel === 'recepcao'
}

export function podeEditarPagamentoOS(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente'
}

export function podeExcluirPagamentoOS(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente'
}

export function podeGerenciarCatalogoServicos(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente'
}

export function podeUsarCatalogoServicosNaOS(papel: PapelUsuario): boolean {
  return ['dono', 'gerente', 'recepcao', 'mecanico'].includes(papel)
}

export function podeEditarValorPadraoCatalogoServicos(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente'
}

export function podeEditarValoresLinhaOS(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente' || papel === 'recepcao'
}

export function podeAjustarTotalMaoObraManualOS(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente'
}

export function podeGerenciarLinhasOS(papel: PapelUsuario): boolean {
  return ['dono', 'gerente', 'recepcao', 'mecanico'].includes(papel)
}

export function podeAlterarStatusOS(papel: PapelUsuario): boolean {
  return ['dono', 'gerente', 'recepcao', 'mecanico'].includes(papel)
}

export function podeGerenciarEstoque(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente'
}

export function podeConsultarEstoque(papel: PapelUsuario): boolean {
  return ['dono', 'gerente', 'mecanico'].includes(papel)
}

export function podeEditarPrecosEstoque(papel: PapelUsuario): boolean {
  return papel === 'dono' || papel === 'gerente'
}

export function podeGerenciarUsuario(
  papel: PapelUsuario,
  _acao: 'criar' | 'editar' | 'excluir' | 'ativar',
  _alvo?: AuthUser
): boolean {
  if (!podeAcessarModulo(papel, 'usuarios')) return false

  if (papel === 'dono') return true

  return false
}

/** Salário/comissão — dono, gerente (admin da oficina) ou Admin Sistema */
export function podeGerenciarComissoesFuncionarios(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  if (ehAdminSistema(user)) return true
  return user.papel === 'dono' || user.papel === 'gerente'
}

/** Mecânico vê apenas a própria comissão quando a oficina permite */
export function podeVerMinhaComissao(
  user: AuthUser | null | undefined,
  config?: ComissoesConfigOficina | null
): boolean {
  if (!user || user.papel !== 'mecanico') return false
  return obterComissoesConfig({ comissoes_config: config ?? undefined }).mecanico_ve_propria_comissao
}

/** Acesso à rota /financeiro — gestão completa ou visão limitada do mecânico */
export function podeAcessarRotaFinanceiro(
  user: AuthUser | null | undefined,
  config?: ComissoesConfigOficina | null
): boolean {
  if (!user) return false
  if (ehAdminSistema(user)) return true
  if (podeAcessarModulo(user.papel, 'financeiro')) return true
  return podeVerMinhaComissao(user, config)
}
