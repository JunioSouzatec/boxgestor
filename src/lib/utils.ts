import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

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
  return new Intl.DateTimeFormat('pt-BR').format(new Date(data + 'T12:00:00'))
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
  compararDatasLocais,
  diasEntreDatasLocais,
  getMesLocalAtual,
  parseDataLocal,
  dataLocalEhHoje,
  dataLocalEhVencida,
  dataLocalEhFutura,
} from '@/lib/data-local'
