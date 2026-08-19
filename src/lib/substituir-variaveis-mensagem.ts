import type { VariaveisMensagem } from '@/types/comunicacao'

/** Normaliza chave de placeholder: trim, minúsculas, sem acentos. */
function normalizarChavePlaceholder(chave: string): string {
  return chave
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

type ResolverPlaceholder = (vars: VariaveisMensagem) => string

/** Único mapa de aliases — chaves normalizadas (sem acento, minúsculas). */
const RESOLVERS_PLACEHOLDER: Record<string, ResolverPlaceholder> = {
  nome_cliente: (v) => v.nome_cliente,
  cliente: (v) => v.nome_cliente,
  moto: (v) => v.moto,
  veiculo: (v) => v.moto,
  modelo: (v) => v.moto,
  nome_veiculo: (v) => v.moto,
  placa: (v) => v.placa,
  referencia_veiculo: (v) => v.referencia_veiculo ?? '',
  referencia_veiculo_destaque: (v) => v.referencia_veiculo_destaque ?? '',
  status_os: (v) => v.status_os,
  status: (v) => v.status_os,
  nome_oficina: (v) => v.nome_oficina,
  oficina: (v) => v.nome_oficina,
  numero_os: (v) => v.numero_os,
  os: (v) => v.numero_os,
  valor_os: (v) => v.valor_os ?? 'Não informado',
  data_garantia: (v) => v.data_garantia ?? 'Não informada',
  data_entrega: (v) => v.data_entrega ?? 'Não informada',
  data_prevista: (v) => v.data_prevista ?? 'Não informada',
}

/** Remove lacunas feias quando moto/placa vieram vazios em templates antigos. */
function limparLacunasVeiculo(texto: string): string {
  return texto
    .replace(/\s*Não informad[oa]\b/gi, '')
    .replace(/\(\s*placa\s*\*?\s*\*?\)/gi, '')
    .replace(/\(\s*placa\s+\)/gi, '')
    .replace(/\*\s*\*/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\s+([.,;!?])/g, '$1')
}

/**
 * Única função de substituição de placeholders para Comunicação.
 * Usada em preview, salvar, copiar, WhatsApp, alertas e mensagens prontas.
 */
export function substituirVariaveisMensagem(texto: string, vars: VariaveisMensagem): string {
  if (!texto) return ''

  const substituido = texto.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, chaveRaw: string) => {
    const chave = normalizarChavePlaceholder(chaveRaw)
    const resolver = RESOLVERS_PLACEHOLDER[chave]
    if (resolver) return resolver(vars)
    return ''
  })

  return limparLacunasVeiculo(substituido)
}
