import type { ConfiguracaoOficina } from '@/types/oficina'
import { normalizarComissoesConfig } from '@/types/comissoes'

export interface PermissoesGerente {
  ver_financeiro_operacional: boolean
  ver_financeiro_completo: boolean
  ver_salarios_comissoes: boolean
  ver_relatorios_operacionais: boolean
  registrar_pagamentos: boolean
  gerenciar_estoque: boolean
  gerenciar_agenda_lembretes: boolean
}

export interface PermissoesRecepcao {
  criar_clientes: boolean
  criar_veiculos: boolean
  criar_os: boolean
  registrar_pagamentos: boolean
  ver_agenda_lembretes: boolean
  ver_relatorios_operacionais: boolean
}

export interface PermissoesMecanico {
  ver_todas_os: boolean
  ver_apenas_os_atribuidas: boolean
  alterar_status_os: boolean
  preencher_checklist: boolean
  adicionar_observacoes: boolean
  informar_pecas_servicos: boolean
  ver_propria_comissao: boolean
}

export interface PermissoesEquipeConfig {
  gerente: PermissoesGerente
  recepcao: PermissoesRecepcao
  mecanico: PermissoesMecanico
}

export const PERMISSOES_EQUIPE_PADRAO: PermissoesEquipeConfig = {
  gerente: {
    ver_financeiro_operacional: false,
    ver_financeiro_completo: false,
    ver_salarios_comissoes: false,
    ver_relatorios_operacionais: true,
    registrar_pagamentos: true,
    gerenciar_estoque: true,
    gerenciar_agenda_lembretes: true,
  },
  recepcao: {
    criar_clientes: true,
    criar_veiculos: true,
    criar_os: true,
    registrar_pagamentos: false,
    ver_agenda_lembretes: true,
    ver_relatorios_operacionais: false,
  },
  mecanico: {
    ver_todas_os: false,
    ver_apenas_os_atribuidas: true,
    alterar_status_os: true,
    preencher_checklist: true,
    adicionar_observacoes: true,
    informar_pecas_servicos: true,
    ver_propria_comissao: false,
  },
}

function normalizarGerente(raw?: Partial<PermissoesGerente>): PermissoesGerente {
  return {
    ver_financeiro_operacional: raw?.ver_financeiro_operacional === true,
    ver_financeiro_completo: raw?.ver_financeiro_completo === true,
    ver_salarios_comissoes: raw?.ver_salarios_comissoes === true,
    ver_relatorios_operacionais: raw?.ver_relatorios_operacionais !== false,
    registrar_pagamentos: raw?.registrar_pagamentos !== false,
    gerenciar_estoque: raw?.gerenciar_estoque !== false,
    gerenciar_agenda_lembretes: raw?.gerenciar_agenda_lembretes !== false,
  }
}

function normalizarRecepcao(raw?: Partial<PermissoesRecepcao>): PermissoesRecepcao {
  return {
    criar_clientes: raw?.criar_clientes !== false,
    criar_veiculos: raw?.criar_veiculos !== false,
    criar_os: raw?.criar_os !== false,
    registrar_pagamentos: raw?.registrar_pagamentos === true,
    ver_agenda_lembretes: raw?.ver_agenda_lembretes !== false,
    ver_relatorios_operacionais: raw?.ver_relatorios_operacionais === true,
  }
}

function normalizarMecanico(raw?: Partial<PermissoesMecanico>): PermissoesMecanico {
  const verTodas = raw?.ver_todas_os === true
  return {
    ver_todas_os: verTodas,
    ver_apenas_os_atribuidas: verTodas ? false : raw?.ver_apenas_os_atribuidas !== false,
    alterar_status_os: raw?.alterar_status_os !== false,
    preencher_checklist: raw?.preencher_checklist !== false,
    adicionar_observacoes: raw?.adicionar_observacoes !== false,
    informar_pecas_servicos: raw?.informar_pecas_servicos === true,
    ver_propria_comissao: raw?.ver_propria_comissao === true,
  }
}

export function normalizarPermissoesEquipe(
  raw?: Partial<PermissoesEquipeConfig> | null | unknown
): PermissoesEquipeConfig {
  if (!isRecord(raw)) {
    return {
      gerente: { ...PERMISSOES_EQUIPE_PADRAO.gerente },
      recepcao: { ...PERMISSOES_EQUIPE_PADRAO.recepcao },
      mecanico: { ...PERMISSOES_EQUIPE_PADRAO.mecanico },
    }
  }
  const partial = raw as Partial<PermissoesEquipeConfig>
  return {
    gerente: normalizarGerente(isRecord(partial.gerente) ? partial.gerente : undefined),
    recepcao: normalizarRecepcao(isRecord(partial.recepcao) ? partial.recepcao : undefined),
    mecanico: normalizarMecanico(isRecord(partial.mecanico) ? partial.mecanico : undefined),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extrairPermissionsSalvas(
  configuracao?: unknown
): Partial<PermissoesEquipeConfig> | undefined {
  if (!isRecord(configuracao)) return undefined

  const direto = configuracao.permissions
  if (isRecord(direto)) {
    return direto as Partial<PermissoesEquipeConfig>
  }

  const metadata = configuracao.metadata
  if (isRecord(metadata) && isRecord(metadata.permissions)) {
    return metadata.permissions as Partial<PermissoesEquipeConfig>
  }

  return undefined
}

function extrairComissoesConfig(
  configuracao?: unknown
): import('@/types/comissoes').ComissoesConfigOficina | undefined {
  if (!isRecord(configuracao)) return undefined
  const direto = configuracao.comissoes_config
  if (isRecord(direto)) {
    return direto as unknown as import('@/types/comissoes').ComissoesConfigOficina
  }
  const metadata = configuracao.metadata
  if (isRecord(metadata) && isRecord(metadata.comissoes_config)) {
    return metadata.comissoes_config as unknown as import('@/types/comissoes').ComissoesConfigOficina
  }
  return undefined
}

/**
 * Sempre retorna permissões completas com defaults seguros.
 * Nunca lança erro — tolera configuracao/permissions ausentes, parciais ou inválidas.
 */
export function getPermissoesEquipeSeguras(
  configuracao?: Pick<ConfiguracaoOficina, 'permissions' | 'comissoes_config'> | null | unknown
): PermissoesEquipeConfig {
  try {
    const salvo = extrairPermissionsSalvas(configuracao)
    const mesclado = normalizarPermissoesEquipe({
      gerente: {
        ...PERMISSOES_EQUIPE_PADRAO.gerente,
        ...(isRecord(salvo?.gerente) ? (salvo.gerente as Partial<PermissoesGerente>) : {}),
      },
      recepcao: {
        ...PERMISSOES_EQUIPE_PADRAO.recepcao,
        ...(isRecord(salvo?.recepcao) ? (salvo.recepcao as Partial<PermissoesRecepcao>) : {}),
      },
      mecanico: {
        ...PERMISSOES_EQUIPE_PADRAO.mecanico,
        ...(isRecord(salvo?.mecanico) ? (salvo.mecanico as Partial<PermissoesMecanico>) : {}),
      },
    })

    const comissoes = normalizarComissoesConfig(extrairComissoesConfig(configuracao))
    if (!salvo && comissoes.mecanico_ve_propria_comissao) {
      mesclado.mecanico.ver_propria_comissao = true
    }

    return {
      ...mesclado,
      mecanico: aplicarRegrasVisuaisMecanico(mesclado.mecanico),
    }
  } catch (err) {
    console.warn('[Craft] Falha ao ler permissões da equipe — usando padrão seguro', err)
    return {
      ...PERMISSOES_EQUIPE_PADRAO,
      gerente: { ...PERMISSOES_EQUIPE_PADRAO.gerente },
      recepcao: { ...PERMISSOES_EQUIPE_PADRAO.recepcao },
      mecanico: aplicarRegrasVisuaisMecanico({ ...PERMISSOES_EQUIPE_PADRAO.mecanico }),
    }
  }
}

/** @alias getPermissoesEquipeSeguras */
export function obterPermissoesEquipe(
  configuracao?: Pick<ConfiguracaoOficina, 'permissions' | 'comissoes_config'> | null | unknown
): PermissoesEquipeConfig {
  return getPermissoesEquipeSeguras(configuracao)
}

export function aplicarRegrasVisuaisMecanico(
  mecanico: PermissoesMecanico
): PermissoesMecanico {
  if (mecanico.ver_todas_os) {
    return { ...mecanico, ver_apenas_os_atribuidas: false }
  }
  return { ...mecanico, ver_apenas_os_atribuidas: true }
}

export function mesclarPermissoesEquipeComComissoes(
  permissions: PermissoesEquipeConfig | null | undefined,
  comissoesConfig?: import('@/types/comissoes').ComissoesConfigOficina | null
): {
  permissions: PermissoesEquipeConfig
  comissoes_config: import('@/types/comissoes').ComissoesConfigOficina
} {
  const base = normalizarPermissoesEquipe(permissions)
  const mecanico = aplicarRegrasVisuaisMecanico(base.mecanico)
  const perm = { ...base, mecanico }
  return {
    permissions: perm,
    comissoes_config: normalizarComissoesConfig({
      ...comissoesConfig,
      mecanico_ve_propria_comissao: mecanico.ver_propria_comissao,
    }),
  }
}

export const DESCRICOES_CARGO_USUARIO: Record<
  'dono' | 'gerente' | 'recepcao' | 'mecanico',
  string
> = {
  dono: 'Acesso total à oficina.',
  gerente:
    'Gerencia a operação. Permissões extras podem ser liberadas pelo dono em Configurações → Permissões da equipe.',
  recepcao:
    'Atendimento, clientes, veículos, agenda e OS. Sem financeiro sensível por padrão.',
  mecanico: 'Acesso operacional às OS. Sem financeiro por padrão.',
}
