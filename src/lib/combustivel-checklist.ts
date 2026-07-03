import type { RespostaItemChecklist } from '@/types/checklist'

export const OPCOES_COMBUSTIVEL = [
  { value: 'vazio', label: 'Vazio' },
  { value: '1/4', label: '1/4' },
  { value: '1/2', label: '1/2' },
  { value: '3/4', label: '3/4' },
  { value: 'cheio', label: 'Cheio' },
] as const

export type ValorCombustivel = (typeof OPCOES_COMBUSTIVEL)[number]['value']

const LABEL_POR_VALOR: Record<ValorCombustivel, string> = {
  vazio: 'Vazio',
  '1/4': '1/4',
  '1/2': '1/2',
  '3/4': '3/4',
  cheio: 'Cheio',
}

export function ehItemCombustivelChecklist(item: Pick<RespostaItemChecklist, 'item_id' | 'nome'>): boolean {
  const nome = item.nome.trim().toLowerCase()
  return (
    item.item_id === 'item-combustivel' ||
    item.item_id === 'item-v-combustivel' ||
    nome === 'combustível' ||
    nome === 'combustivel'
  )
}

export function extrairValorCombustivel(item: RespostaItemChecklist): ValorCombustivel | '' {
  const texto = (item.valor_texto ?? item.observacao ?? '').trim().toLowerCase()
  if (!texto) {
    if (item.valor_ok === true) return 'cheio'
    if (item.valor_ok === false) return 'vazio'
    return ''
  }
  if (texto === 'cheio' || texto === 'full' || texto === 'tanque cheio') return 'cheio'
  if (texto === 'vazio' || texto === 'reserva' || texto === 'zero') return 'vazio'
  if (texto.includes('1/4') || texto.includes('¼')) return '1/4'
  if (texto.includes('1/2') || texto.includes('½') || texto.includes('meio')) return '1/2'
  if (texto.includes('3/4') || texto.includes('¾')) return '3/4'
  return ''
}

export function formatarCombustivelChecklist(item: RespostaItemChecklist): string {
  const valor = extrairValorCombustivel(item)
  if (valor) return LABEL_POR_VALOR[valor]
  const obs = item.observacao?.trim()
  if (obs) return obs
  if (item.valor_ok === true) return 'Cheio'
  if (item.valor_ok === false) return 'Vazio'
  return '—'
}

export function patchCombustivelChecklist(valor: ValorCombustivel): Partial<RespostaItemChecklist> {
  return {
    valor_texto: valor,
    valor_ok: valor === 'cheio' ? true : valor === 'vazio' ? false : undefined,
    observacao: undefined,
  }
}
