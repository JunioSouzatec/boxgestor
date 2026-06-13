import type { OrdemServico } from '@/types/ordem-servico'

/** Data ISO (YYYY-MM-DD) de uma OS, com fallback para registros antigos incompletos */
export function obterDataRegistroOS(os: OrdemServico): string {
  const bruta = os.atualizado_em ?? os.criado_em ?? os.created_at ?? ''
  return bruta ? bruta.slice(0, 10) : '—'
}

export function compararHorarios(a?: string, b?: string): number {
  return (a ?? '').localeCompare(b ?? '')
}

export function lancamentoNoMes(data: string | undefined, mesPrefixo: string): boolean {
  return !!data?.startsWith(mesPrefixo)
}

export function textoBuscaSeguro(valor?: string): string {
  return (valor ?? '').toLowerCase()
}
