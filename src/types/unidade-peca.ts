export type UnidadePecaOS =
  | 'unidade'
  | 'litro'
  | 'ml'
  | 'par'
  | 'jogo'
  | 'metro'
  | 'pacote'
  | 'caixa'
  | 'kit'
  | 'grama'
  | 'kg'
  | 'outro'

export const UNIDADES_PECA_OS: { value: UnidadePecaOS; label: string }[] = [
  { value: 'unidade', label: 'Unidade' },
  { value: 'litro', label: 'Litro' },
  { value: 'ml', label: 'Mililitro (ml)' },
  { value: 'par', label: 'Par' },
  { value: 'jogo', label: 'Jogo' },
  { value: 'metro', label: 'Metro' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'caixa', label: 'Caixa' },
  { value: 'kit', label: 'Kit' },
  { value: 'grama', label: 'Grama' },
  { value: 'kg', label: 'Quilograma (kg)' },
  { value: 'outro', label: 'Outro' },
]

const UNIDADES_VALIDAS = new Set<string>(UNIDADES_PECA_OS.map((u) => u.value))

export function normalizarUnidadePeca(unidade?: string | null): UnidadePecaOS {
  if (!unidade || typeof unidade !== 'string') return 'unidade'
  const v = unidade.trim().toLowerCase()
  if (UNIDADES_VALIDAS.has(v)) return v as UnidadePecaOS
  if (v === 'l' || v === 'lt' || v === 'litros') return 'litro'
  if (v === 'un' || v === 'und' || v === 'unidades') return 'unidade'
  if (v === 'm' || v === 'metros') return 'metro'
  return 'unidade'
}

export function inferirUnidadePorCategoria(categoria?: string | null): UnidadePecaOS {
  switch (categoria) {
    case 'oleo':
    case 'arrefecimento':
      return 'litro'
    default:
      return 'unidade'
  }
}

export function unidadePermiteDecimal(unidade?: UnidadePecaOS | string): boolean {
  const u = normalizarUnidadePeca(unidade)
  return ['litro', 'ml', 'metro', 'kg', 'grama'].includes(u)
}

export function getLabelUnidadePeca(unidade?: UnidadePecaOS | string): string {
  const norm = normalizarUnidadePeca(unidade)
  return UNIDADES_PECA_OS.find((u) => u.value === norm)?.label ?? 'Unidade'
}

export interface ResultadoParseQuantidade {
  valor: number | null
  erro?: string
}

export function parseQuantidadeDecimal(value: string | number, permitirVazio = false): number {
  const r = parseQuantidadeDecimalComValidacao(value, permitirVazio)
  return r.valor ?? 1
}

export function parseQuantidadeDecimalComValidacao(
  value: string | number,
  permitirVazio = false
): ResultadoParseQuantidade {
  if (typeof value === 'number') {
    if (Number.isNaN(value) || value <= 0) {
      return { valor: null, erro: 'Quantidade deve ser maior que zero.' }
    }
    return { valor: Math.round(value * 1000) / 1000 }
  }

  const normalized = String(value ?? '').replace(',', '.').trim()
  if (!normalized) {
    if (permitirVazio) return { valor: null, erro: 'Informe a quantidade utilizada.' }
    return { valor: null, erro: 'Informe a quantidade utilizada.' }
  }

  const n = parseFloat(normalized)
  if (Number.isNaN(n)) {
    return { valor: null, erro: 'Quantidade inválida.' }
  }
  if (n <= 0) {
    return { valor: null, erro: 'Quantidade deve ser maior que zero.' }
  }
  return { valor: Math.round(n * 1000) / 1000 }
}

export function formatQuantidadeComUnidade(
  quantidade: number,
  unidade?: UnidadePecaOS | string
): string {
  const u = normalizarUnidadePeca(unidade)
  const qtd =
    Number.isInteger(quantidade)
      ? String(quantidade)
      : quantidade.toLocaleString('pt-BR', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        })

  switch (u) {
    case 'unidade':
      return `${qtd} unidade${quantidade !== 1 ? 's' : ''}`
    case 'litro':
      return `${qtd} litro${quantidade !== 1 ? 's' : ''}`
    case 'ml':
      return `${qtd} ml`
    case 'par':
      return `${qtd} par${quantidade !== 1 ? 'es' : ''}`
    case 'jogo':
      return `${qtd} jogo${quantidade !== 1 ? 's' : ''}`
    case 'metro':
      return `${qtd} metro${quantidade !== 1 ? 's' : ''}`
    case 'pacote':
      return `${qtd} pacote${quantidade !== 1 ? 's' : ''}`
    case 'caixa':
      return `${qtd} caixa${quantidade !== 1 ? 's' : ''}`
    case 'kit':
      return `${qtd} kit${quantidade !== 1 ? 's' : ''}`
    case 'grama':
      return `${qtd} g`
    case 'kg':
      return `${qtd} kg`
    case 'outro':
      return qtd
    default:
      return `${qtd} ${getLabelUnidadePeca(u).toLowerCase()}`
  }
}
