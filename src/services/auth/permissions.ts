import type { AuthUser, PapelUsuario } from '@/types/auth'
import { ehAdminSistema } from '@/lib/craft-admin'
import type { ComissoesConfigOficina } from '@/types/comissoes'
import { obterComissoesConfig } from '@/types/comissoes'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { OrdemServico } from '@/types/ordem-servico'
import {
  obterPermissoesEquipe,
  type PermissoesEquipeConfig,
} from '@/types/permissoes-equipe'

/** Enquanto false, gerente não vê salários/comissões reais mesmo com permissão ligada (RLS). */
export const GERENTE_SALARIOS_SUPABASE_HABILITADO = false

export type ModuloCraft =
  | 'dashboard'
  | 'clientes'
  | 'motos'
  | 'ordens_servico'
  | 'financeiro'
  | 'estoque'
  | 'agenda'
  | 'configuracoes'
  | 'permissoes_equipe'
  | 'usuarios'
  | 'planos'
  | 'relatorios'
  | 'comunicacao'
  | 'lembretes'
  | 'portal_cliente'
  | 'catalogo_servicos'
  | 'fornecedores'
  | 'admin_craft'

export type PermissoesContext = ConfiguracaoOficina | null | undefined

const ROTA_MODULO: Record<string, ModuloCraft> = {
  '/': 'dashboard',
  '/clientes': 'clientes',
  '/motos': 'motos',
  '/ordens-servico': 'ordens_servico',
  '/financeiro': 'financeiro',
  '/estoque': 'estoque',
  '/agenda': 'agenda',
  '/configuracoes': 'configuracoes',
  '/configuracoes/permissoes': 'permissoes_equipe',
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

function ehDonoOuAdminSistema(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  return ehAdminSistema(user) || user.papel === 'dono'
}

function permissoesDe(_user: AuthUser | null | undefined, config?: PermissoesContext): PermissoesEquipeConfig {
  return obterPermissoesEquipe(config)
}

function papelDe(userOrPapel: AuthUser | PapelUsuario | null | undefined): PapelUsuario | null {
  if (!userOrPapel) return null
  return typeof userOrPapel === 'string' ? userOrPapel : userOrPapel.papel
}

function userDe(userOrPapel: AuthUser | PapelUsuario | null | undefined): AuthUser | null {
  if (!userOrPapel || typeof userOrPapel === 'string') return null
  return userOrPapel
}

function normalizarNomeResponsavel(nome: string): string {
  return nome.trim().toLowerCase()
}

export function resolverModuloDaRota(pathname: string): ModuloCraft | undefined {
  if (pathname === '/configuracoes/permissoes') return 'permissoes_equipe'
  if (pathname === '/portal-cliente' || pathname.startsWith('/portal-cliente/')) {
    return 'portal_cliente'
  }
  if (pathname === '/admin-craft' || pathname.startsWith('/admin-craft/')) {
    return 'admin_craft'
  }
  return ROTA_MODULO[pathname]
}

export function podeAlterarPermissoesEquipe(user: AuthUser | null | undefined): boolean {
  return ehDonoOuAdminSistema(user)
}

export function podeAcessarModuloUsuario(
  user: AuthUser,
  modulo: ModuloCraft,
  config?: PermissoesContext
): boolean {
  if (modulo === 'admin_craft') return ehAdminSistema(user)
  if (modulo === 'permissoes_equipe') return podeAlterarPermissoesEquipe(user)
  if (ehDonoOuAdminSistema(user)) return true

  const perm = permissoesDe(user, config)
  const { papel } = user

  switch (modulo) {
    case 'dashboard':
      return true
    case 'clientes':
      if (papel === 'gerente') return true
      if (papel === 'recepcao') return perm.recepcao.criar_clientes
      return false
    case 'motos':
      if (papel === 'gerente') return true
      if (papel === 'recepcao') return perm.recepcao.criar_veiculos
      return false
    case 'ordens_servico':
      if (papel === 'gerente') return true
      if (papel === 'recepcao') return perm.recepcao.criar_os
      if (papel === 'mecanico') {
        return perm.mecanico.ver_todas_os || perm.mecanico.ver_apenas_os_atribuidas
      }
      return false
    case 'financeiro':
      return podeAcessarRotaFinanceiro(user, config)
    case 'relatorios':
      return podeVerRelatoriosOperacionais(user, config) || podeVerRelatoriosFinanceiros(user, config)
    case 'estoque':
      if (papel === 'gerente') return perm.gerente.gerenciar_estoque
      if (papel === 'mecanico') return podeConsultarEstoque(user, config)
      return false
    case 'fornecedores':
      if (papel === 'gerente') return perm.gerente.gerenciar_estoque
      return false
    case 'agenda':
    case 'lembretes':
      if (papel === 'gerente') return perm.gerente.gerenciar_agenda_lembretes
      if (papel === 'recepcao') return perm.recepcao.ver_agenda_lembretes
      return false
    case 'comunicacao':
    case 'portal_cliente':
      return papel === 'gerente' || papel === 'recepcao'
    case 'catalogo_servicos':
      return ['gerente', 'recepcao', 'mecanico'].includes(papel)
    case 'configuracoes':
    case 'usuarios':
    case 'planos':
      return false
    default:
      return false
  }
}

/** @deprecated Use podeAcessarModuloUsuario com AuthUser */
export function podeAcessarModulo(papel: PapelUsuario, modulo: ModuloCraft): boolean {
  if (modulo === 'admin_craft') return false
  const fakeUser = { papel } as AuthUser
  return podeAcessarModuloUsuario(fakeUser, modulo)
}

export function podeAcessarRota(
  user: AuthUser,
  pathname: string,
  config?: PermissoesContext
): boolean {
  const modulo = resolverModuloDaRota(pathname)
  if (!modulo) return true
  if (pathname === '/configuracoes' && !ehDonoOuAdminSistema(user)) {
    return false
  }
  return podeAcessarModuloUsuario(user, modulo, config)
}

export function modulosPermitidos(user: AuthUser, config?: PermissoesContext): ModuloCraft[] {
  return (Object.keys(ROTA_MODULO) as ModuloCraft[]).filter((m) =>
    podeAcessarModuloUsuario(user, m, config)
  )
}

export function getRotaInicial(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): string {
  const user =
    typeof userOrPapel === 'string'
      ? ({ papel: userOrPapel } as AuthUser)
      : userOrPapel
  for (const { rota, modulo } of ORDEM_ROTAS) {
    if (podeAcessarModuloUsuario(user, modulo, config)) return rota
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

export function podeAlterarPlanoManualmente(user: AuthUser | null | undefined): boolean {
  return ehAdminSistema(user)
}

export function podeRestaurarDados(user: AuthUser | null | undefined): boolean {
  return ehAdminSistema(user)
}

export function podeGerenciarModelosChecklist(
  userOrPapel: AuthUser | PapelUsuario
): boolean {
  const user = userDe(userOrPapel)
  const papel = papelDe(userOrPapel)
  if (ehDonoOuAdminSistema(user)) return true
  if (papel === 'gerente') return true
  return false
}

export function visibilidadeDashboard(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): VisibilidadeDashboard {
  const user = userDe(userOrPapel)
  const papel = papelDe(userOrPapel) ?? 'recepcao'
  const perm = permissoesDe(user, config)

  if (ehDonoOuAdminSistema(user)) {
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
  }

  switch (papel) {
    case 'gerente':
      return {
        faturamentoLucro: podeVerLucroReal(user, config),
        pagamentosPendentes: perm.gerente.registrar_pagamentos,
        clientesMotosTotais: true,
        estoqueCompleto: perm.gerente.gerenciar_estoque,
        agendaHoje: perm.gerente.gerenciar_agenda_lembretes,
        topClientes: true,
        portalLembretes: true,
        alertas: true,
        topServicosPecas: true,
      }
    case 'recepcao':
      return {
        faturamentoLucro: false,
        pagamentosPendentes: perm.recepcao.registrar_pagamentos,
        clientesMotosTotais: true,
        estoqueCompleto: false,
        agendaHoje: perm.recepcao.ver_agenda_lembretes,
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
    default:
      return visibilidadeDashboard('recepcao', config)
  }
}

export function podeVerFinanceiroCompleto(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  if (user.papel === 'gerente') {
    return permissoesDe(user, config).gerente.ver_financeiro_completo
  }
  return false
}

export function podeVerFinanceiroOperacional(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  if (user.papel === 'gerente') {
    return permissoesDe(user, config).gerente.ver_financeiro_operacional
  }
  return false
}

export function podeVerSalariosEComissoes(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  if (user.papel === 'gerente' && permissoesDe(user, config).gerente.ver_salarios_comissoes) {
    return GERENTE_SALARIOS_SUPABASE_HABILITADO
  }
  return false
}

export function podeVerLucroReal(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  return podeVerFinanceiroCompleto(user, config)
}

export function podeVerDespesasInternas(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  return podeVerSalariosEComissoes(user, config)
}

export function podeVerRelatoriosFinanceiros(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  return podeVerFinanceiroCompleto(user, config)
}

export function podeVerRelatoriosOperacionais(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  const perm = permissoesDe(user, config)
  if (user.papel === 'gerente') return perm.gerente.ver_relatorios_operacionais
  if (user.papel === 'recepcao') return perm.recepcao.ver_relatorios_operacionais
  return false
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

export function ehUltimoDonoAtivo(usuario: AuthUser, todos: AuthUser[]): boolean {
  if (usuario.papel !== 'dono' || !usuario.ativo) return false
  return !todos.some((u) => u.id !== usuario.id && u.papel === 'dono' && u.ativo)
}

export function podeVerLucroDashboard(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): boolean {
  const user = userDe(userOrPapel)
  if (user) return podeVerLucroReal(user, config)
  return userOrPapel === 'dono'
}

export function podeVerValoresFinanceirosOS(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): boolean {
  const user = userDe(userOrPapel)
  const papel = papelDe(userOrPapel)
  if (user && ehDonoOuAdminSistema(user)) return true
  if (papel === 'dono') return true
  if (user?.papel === 'gerente') {
    const perm = permissoesDe(user, config).gerente
    return (
      perm.ver_financeiro_operacional ||
      perm.ver_financeiro_completo ||
      perm.registrar_pagamentos
    )
  }
  if (user?.papel === 'recepcao') {
    return permissoesDe(user, config).recepcao.registrar_pagamentos
  }
  return false
}

export function podeRegistrarPagamentoOS(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): boolean {
  const user = userDe(userOrPapel)
  const papel = papelDe(userOrPapel)
  if (user && ehDonoOuAdminSistema(user)) return true
  if (papel === 'dono') return true
  if (user?.papel === 'gerente') return permissoesDe(user, config).gerente.registrar_pagamentos
  if (user?.papel === 'recepcao') return permissoesDe(user, config).recepcao.registrar_pagamentos
  return false
}

/** Alias sem sufixo OS */
export function podeRegistrarPagamento(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): boolean {
  return podeRegistrarPagamentoOS(userOrPapel, config)
}

export function podeEditarPagamentoOS(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): boolean {
  return podeRegistrarPagamentoOS(userOrPapel, config)
}

export function podeExcluirPagamentoOS(
  userOrPapel: AuthUser | PapelUsuario,
  _config?: PermissoesContext
): boolean {
  const user = userDe(userOrPapel)
  const papel = papelDe(userOrPapel)
  if (user && ehDonoOuAdminSistema(user)) return true
  return papel === 'dono' || papel === 'gerente'
}

export function podeGerenciarCatalogoServicos(
  userOrPapel: AuthUser | PapelUsuario
): boolean {
  const user = userDe(userOrPapel)
  const papel = papelDe(userOrPapel)
  if (ehDonoOuAdminSistema(user)) return true
  return papel === 'dono' || papel === 'gerente'
}

export function podeUsarCatalogoServicosNaOS(
  userOrPapel: AuthUser | PapelUsuario
): boolean {
  const papel = papelDe(userOrPapel)
  return ['dono', 'gerente', 'recepcao', 'mecanico'].includes(papel ?? '')
}

export function podeEditarValorPadraoCatalogoServicos(
  userOrPapel: AuthUser | PapelUsuario
): boolean {
  const papel = papelDe(userOrPapel)
  return papel === 'dono' || papel === 'gerente'
}

export function podeEditarValoresLinhaOS(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): boolean {
  return podeVerValoresFinanceirosOS(userOrPapel, config)
}

export function podeAjustarTotalMaoObraManualOS(
  userOrPapel: AuthUser | PapelUsuario
): boolean {
  const user = userDe(userOrPapel)
  const papel = papelDe(userOrPapel)
  if (ehDonoOuAdminSistema(user)) return true
  return papel === 'dono' || papel === 'gerente'
}

export function podeGerenciarLinhasOS(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): boolean {
  const user = userDe(userOrPapel)
  const papel = papelDe(userOrPapel)
  if (ehDonoOuAdminSistema(user)) return true
  if (papel === 'dono' || papel === 'gerente' || papel === 'recepcao') return true
  if (user?.papel === 'mecanico') {
    return permissoesDe(user, config).mecanico.informar_pecas_servicos
  }
  return false
}

export function podeAlterarStatusOS(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): boolean {
  const user = userDe(userOrPapel)
  const papel = papelDe(userOrPapel)
  if (ehDonoOuAdminSistema(user)) return true
  if (papel === 'dono' || papel === 'gerente' || papel === 'recepcao') return true
  if (user?.papel === 'mecanico') {
    return permissoesDe(user, config).mecanico.alterar_status_os
  }
  return false
}

export function podeGerenciarEstoque(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): boolean {
  const user = userDe(userOrPapel)
  const papel = papelDe(userOrPapel)
  if (ehDonoOuAdminSistema(user)) return true
  if (papel === 'dono') return true
  if (user?.papel === 'gerente') return permissoesDe(user, config).gerente.gerenciar_estoque
  return false
}

export function podeConsultarEstoque(
  userOrPapel: AuthUser | PapelUsuario,
  config?: PermissoesContext
): boolean {
  if (podeGerenciarEstoque(userOrPapel, config)) return true
  const papel = papelDe(userOrPapel)
  return papel === 'mecanico'
}

export function podeEditarPrecosEstoque(userOrPapel: AuthUser | PapelUsuario): boolean {
  const papel = papelDe(userOrPapel)
  return papel === 'dono' || papel === 'gerente'
}

export function podeGerenciarAgendaLembretes(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  if (user.papel === 'gerente') return permissoesDe(user, config).gerente.gerenciar_agenda_lembretes
  if (user.papel === 'recepcao') return permissoesDe(user, config).recepcao.ver_agenda_lembretes
  return false
}

export function podeCriarCliente(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  if (user.papel === 'gerente') return true
  if (user.papel === 'recepcao') return permissoesDe(user, config).recepcao.criar_clientes
  return false
}

export function podeCriarVeiculo(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  if (user.papel === 'gerente') return true
  if (user.papel === 'recepcao') return permissoesDe(user, config).recepcao.criar_veiculos
  return false
}

export function podeCriarOS(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  if (user.papel === 'gerente') return true
  if (user.papel === 'recepcao') return permissoesDe(user, config).recepcao.criar_os
  return false
}

export function podeVerTodasOS(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  if (user.papel === 'gerente' || user.papel === 'recepcao') return true
  if (user.papel === 'mecanico') return permissoesDe(user, config).mecanico.ver_todas_os
  return false
}

export function podeVerApenasOSAtribuidas(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return false
  if (user.papel !== 'mecanico') return false
  const perm = permissoesDe(user, config).mecanico
  return !perm.ver_todas_os && perm.ver_apenas_os_atribuidas
}

export function osVisivelParaUsuario(
  os: OrdemServico,
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (podeVerTodasOS(user, config)) return true
  if (podeVerApenasOSAtribuidas(user, config)) {
    const resp = os.responsavel?.trim()
    if (!resp) return false
    return normalizarNomeResponsavel(resp) === normalizarNomeResponsavel(user.nome)
  }
  return false
}

export function filtrarOrdensPorPermissaoUsuario(
  ordens: OrdemServico[],
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): OrdemServico[] {
  if (!user) return []
  if (podeVerTodasOS(user, config)) return ordens
  if (podeVerApenasOSAtribuidas(user, config)) {
    return ordens.filter((os) => osVisivelParaUsuario(os, user, config))
  }
  if (user.papel === 'mecanico') return []
  return ordens
}

export function podePreencherChecklist(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  if (['dono', 'gerente', 'recepcao'].includes(user.papel)) return true
  if (user.papel === 'mecanico') return permissoesDe(user, config).mecanico.preencher_checklist
  return false
}

export function podeAdicionarObservacaoOS(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  if (['dono', 'gerente', 'recepcao'].includes(user.papel)) return true
  if (user.papel === 'mecanico') return permissoesDe(user, config).mecanico.adicionar_observacoes
  return false
}

export function podeInformarPecasServicos(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (ehDonoOuAdminSistema(user)) return true
  if (['dono', 'gerente', 'recepcao'].includes(user.papel)) return true
  if (user.papel === 'mecanico') return permissoesDe(user, config).mecanico.informar_pecas_servicos
  return false
}

export function podeGerenciarUsuario(
  papel: PapelUsuario,
  _acao: 'criar' | 'editar' | 'excluir' | 'ativar',
  _alvo?: AuthUser
): boolean {
  return papel === 'dono'
}

export function podeGerenciarComissoesFuncionarios(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  return podeVerSalariosEComissoes(user, config)
}

export function podeVerMinhaComissao(
  user: AuthUser | null | undefined,
  config?: ComissoesConfigOficina | PermissoesContext | null
): boolean {
  if (!user || user.papel !== 'mecanico') return false
  if (config && typeof config === 'object' && 'permissions' in config) {
    return obterPermissoesEquipe(config as ConfiguracaoOficina).mecanico.ver_propria_comissao
  }
  if (config && typeof config === 'object' && 'gerente' in config && 'recepcao' in config) {
    return (config as unknown as import('@/types/permissoes-equipe').PermissoesEquipeConfig)
      .mecanico.ver_propria_comissao
  }
  return obterComissoesConfig({
    comissoes_config: config as ComissoesConfigOficina | undefined,
  }).mecanico_ve_propria_comissao
}

export function podeAcessarRotaFinanceiro(
  user: AuthUser | null | undefined,
  config?: PermissoesContext | ComissoesConfigOficina | null
): boolean {
  if (!user) return false
  if (ehAdminSistema(user)) return true

  const ctx =
    config && ('permissions' in config || 'comissoes_config' in config)
      ? (config as PermissoesContext)
      : undefined

  if (podeVerFinanceiroCompleto(user, ctx)) return true
  if (podeVerFinanceiroOperacional(user, ctx)) return true
  return podeVerMinhaComissao(user, ctx ?? config)
}

export function modoFinanceiroOperacionalApenas(
  user: AuthUser | null | undefined,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  return (
    podeVerFinanceiroOperacional(user, config) &&
    !podeVerFinanceiroCompleto(user, config) &&
    !podeVerMinhaComissao(user, config)
  )
}
