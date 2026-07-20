import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatarDataBrasil } from '@/lib/data-local'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}

export function formatarData(data: string): string {
  return formatarDataBrasil(data)
}

export function formatarTelefone(telefone: string): string {
  const numeros = telefone.replace(/\D/g, '')
  if (numeros.length === 11) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
  }
  if (numeros.length === 10) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`
  }
  return telefone
}

export function gerarId(): string {
  return crypto.randomUUID()
}

export {
  getDataLocalHoje,
  formatarDataLocalYYYYMMDD,
  formatarDataBrasil,
  extrairDataBrasilYYYYMMDD,
  formatarInstantParaDataBrasil,
  compararDatasLocais,
  diasEntreDatasLocais,
  getMesLocalAtual,
  parseDataLocal,
  dataLocalEhHoje,
  dataLocalEhVencida,
  dataLocalEhFutura,
  FUSO_BRASIL,
} from '@/lib/data-local'
