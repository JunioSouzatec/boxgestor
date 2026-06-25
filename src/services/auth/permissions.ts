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
  financeiro: ['dono'],
  estoque: ['dono', 'gerente', 'mecanico'],
  fornecedores: ['dono', 'gerente'],
  agenda: ['dono', 'gerente', 'recepcao'],
  configuracoes: ['dono'],
  usuarios: ['dono'],
  planos: ['dono'],
  relatorios: ['dono'],
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
    case 'gerente':
      return {
        faturamentoLucro: false,
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
  return papel === 'dono'
}

function ehDonoOuAdminSistema(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  return ehAdminSistema(user) || user.papel === 'dono'
}

/** Financeiro completo (salários, lucro, despesas internas, etc.) — dono ou Admin Sistema */
export function podeVerFinanceiroCompleto(user: AuthUser | null | undefined): boolean {
  return ehDonoOuAdminSistema(user)
}

/** Reservado para liberação futura pelo dono (pagamentos de OS, recebimentos do dia, etc.) */
export function podeVerFinanceiroOperacional(_user: AuthUser | null | undefined): boolean {
  return false
}

export function podeVerSalariosEComissoes(user: AuthUser | null | undefined): boolean {
  return ehDonoOuAdminSistema(user)
}

export function podeVerLucroReal(user: AuthUser | null | undefined): boolean {
  return ehDonoOuAdminSistema(user)
}

export function podeVerDespesasInternas(user: AuthUser | null | undefined): boolean {
  return ehDonoOuAdminSistema(user)
}

export function podeVerRelatoriosFinanceiros(user: AuthUser | null | undefined): boolean {
  return ehDonoOuAdminSistema(user)
}

export function podeAlterarPlanoOuTipoOficina(user: AuthUser | null | undefined): boolean {
  return ehDonoOuAdminSistema(user)
}

export function podeGerenciarUsuariosExtras(user: AuthUser | null | undefined): boolean {
  return ehDonoOuAdminSistema(user)
}

export function podeLimparDadosOficina(user: AuthUser | null | undefined): boolean {
  return ehDonoOuAdminSistema(user)
}

/** Impede desativar o único dono ativo restante da oficina */
export function ehUltimoDonoAtivo(usuario: AuthUser, todos: AuthUser[]): boolean {
  if (usuario.papel !== 'dono' || !usuario.ativo) return false
  return !todos.some((u) => u.id !== usuario.id && u.papel === 'dono' && u.ativo)
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

/** Salário/comissão — dono ou Admin Sistema */
export function podeGerenciarComissoesFuncionarios(user: AuthUser | null | undefined): boolean {
  return podeVerSalariosEComissoes(user)
}

/** Mecânico vê apenas a própria comissão quando a oficina permite */
export function podeVerMinhaComissao(
  user: AuthUser | null | undefined,
  config?: ComissoesConfigOficina | null
): boolean {
  if (!user || user.papel !== 'mecanico') return false
  return obterComissoesConfig({ comissoes_config: config ?? undefined }).mecanico_ve_propria_comissao
}

/** Acesso à rota /financeiro — financeiro completo ou visão limitada do mecânico */
export function podeAcessarRotaFinanceiro(
  user: AuthUser | null | undefined,
  config?: ComissoesConfigOficina | null
): boolean {
  if (!user) return false
  if (ehAdminSistema(user)) return true
  if (podeVerFinanceiroCompleto(user)) return true
  if (podeVerFinanceiroOperacional(user)) return true
  return podeVerMinhaComissao(user, config)
}
