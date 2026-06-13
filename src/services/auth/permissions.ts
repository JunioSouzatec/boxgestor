import type { AuthUser, PapelUsuario } from '@/types/auth'

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

const PERMISSOES_POR_MODULO: Record<ModuloCraft, PapelUsuario[]> = {
  dashboard: ['dono', 'gerente'],
  clientes: ['dono', 'gerente', 'recepcao'],
  motos: ['dono', 'gerente', 'mecanico', 'recepcao'],
  ordens_servico: ['dono', 'gerente', 'mecanico', 'recepcao'],
  financeiro: ['dono', 'gerente'],
  estoque: ['dono', 'gerente'],
  agenda: ['dono', 'gerente', 'mecanico', 'recepcao'],
  configuracoes: ['dono', 'gerente'],
  usuarios: ['dono', 'gerente'],
  planos: ['dono'],
  relatorios: ['dono', 'gerente'],
  comunicacao: ['dono', 'gerente', 'recepcao'],
  lembretes: ['dono', 'gerente', 'recepcao'],
  portal_cliente: ['dono', 'gerente', 'recepcao', 'mecanico'],
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
}

const ORDEM_ROTAS: { rota: string; modulo: ModuloCraft }[] = [
  { rota: '/', modulo: 'dashboard' },
  { rota: '/ordens-servico', modulo: 'ordens_servico' },
  { rota: '/clientes', modulo: 'clientes' },
  { rota: '/motos', modulo: 'motos' },
  { rota: '/agenda', modulo: 'agenda' },
  { rota: '/financeiro', modulo: 'financeiro' },
  { rota: '/estoque', modulo: 'estoque' },
  { rota: '/usuarios', modulo: 'usuarios' },
  { rota: '/planos', modulo: 'planos' },
  { rota: '/relatorios', modulo: 'relatorios' },
  { rota: '/comunicacao', modulo: 'comunicacao' },
  { rota: '/lembretes', modulo: 'lembretes' },
  { rota: '/portal-cliente', modulo: 'portal_cliente' },
  { rota: '/configuracoes', modulo: 'configuracoes' },
]

export function resolverModuloDaRota(pathname: string): ModuloCraft | undefined {
  if (pathname === '/portal-cliente' || pathname.startsWith('/portal-cliente/')) {
    return 'portal_cliente'
  }
  return ROTA_MODULO[pathname]
}

export function podeAcessarModulo(papel: PapelUsuario, modulo: ModuloCraft): boolean {
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

/** Primeira rota acessível quando o usuário não tem dashboard */
export function getRotaInicial(papel: PapelUsuario): string {
  for (const { rota, modulo } of ORDEM_ROTAS) {
    if (podeAcessarModulo(papel, modulo)) return rota
  }
  return '/ordens-servico'
}

/** Papéis que o usuário logado pode atribuir ao criar/editar */
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

export function podeRestaurarDados(papel: PapelUsuario): boolean {
  return papel === 'dono'
}

export function podeGerenciarUsuario(
  papel: PapelUsuario,
  acao: 'criar' | 'editar' | 'excluir' | 'ativar',
  alvo?: AuthUser
): boolean {
  if (!podeAcessarModulo(papel, 'usuarios')) return false

  if (papel === 'dono') return true

  if (papel === 'gerente') {
    if (alvo?.papel === 'dono') return false
    if (acao === 'criar') return true
    return alvo !== undefined
  }

  return false
}
