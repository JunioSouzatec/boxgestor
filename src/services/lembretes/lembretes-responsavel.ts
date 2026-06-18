import { obterUltimaAcaoLembrete } from '@/types/lembrete'

/** Responsável por ação em lembrete (criação ou contato). */
export interface ResponsavelLembrete {
  id?: string
  nome: string
  /** Lembrete gerado automaticamente pela OS/regra — pode exibir "Sistema". */
  automatico?: boolean
}

export function responsavelSistema(): ResponsavelLembrete {
  return { nome: 'Sistema', automatico: true }
}

export function obterResponsavelLogado(input?: {
  id?: string
  nome?: string
  email?: string
} | null): ResponsavelLembrete {
  if (!input) {
    return { nome: 'Usuário' }
  }
  const nome = input.nome?.trim() || input.email?.trim() || 'Usuário'
  return { id: input.id, nome }
}

export function obterResponsavelExibicaoLembrete(lembrete: {
  criado_por_nome?: string
  automatico?: boolean
  historico?: Array<{ responsavel: string; data: string }>
}): string {
  const ultima = obterUltimaAcaoLembrete(lembrete as Parameters<typeof obterUltimaAcaoLembrete>[0])

  if (ultima?.responsavel && ultima.responsavel !== 'Sistema') {
    return ultima.responsavel
  }

  if (lembrete.criado_por_nome && lembrete.criado_por_nome !== 'Sistema') {
    return lembrete.criado_por_nome
  }

  if (lembrete.automatico) return 'Sistema'
  if (ultima?.responsavel) return ultima.responsavel
  if (lembrete.criado_por_nome) return lembrete.criado_por_nome
  return '—'
}

export function aplicarResponsavelCriacao(
  lembrete: { criado_por_id?: string; criado_por_nome?: string; automatico?: boolean },
  responsavel: ResponsavelLembrete,
  automatico: boolean
): void {
  lembrete.automatico = automatico
  if (automatico) {
    lembrete.criado_por_nome = 'Sistema'
    return
  }
  lembrete.criado_por_id = responsavel.id
  lembrete.criado_por_nome = responsavel.nome
}
