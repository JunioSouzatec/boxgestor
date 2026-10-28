/** Consulta ViaCEP — sem API key e sem dependência extra. */

export function normalizarCep(cep: string): string {
  return cep.replace(/\D/g, '').slice(0, 8)
}

export function cepEstaCompleto(cep: string): boolean {
  return normalizarCep(cep).length === 8
}

export interface EnderecoViaCep {
  cep: string
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
  ibge: string
}

export type ResultadoCep =
  | { ok: true; endereco: EnderecoViaCep }
  | { ok: false; motivo: 'incompleto' | 'nao_encontrado' | 'rede' }

type FetchLike = (input: string) => Promise<{
  ok: boolean
  json: () => Promise<Record<string, unknown>>
}>

export async function buscarEnderecoPorCep(
  cep: string,
  fetchFn: FetchLike = fetch as FetchLike
): Promise<ResultadoCep> {
  const digits = normalizarCep(cep)
  if (digits.length !== 8) return { ok: false, motivo: 'incompleto' }

  try {
    const res = await fetchFn(`https://viacep.com.br/ws/${digits}/json/`)
    if (!res.ok) return { ok: false, motivo: 'rede' }
    const data = await res.json()
    if (data?.erro === true || data?.erro === 'true') {
      return { ok: false, motivo: 'nao_encontrado' }
    }
    return {
      ok: true,
      endereco: {
        cep: digits,
        logradouro: String(data.logradouro ?? ''),
        complemento: String(data.complemento ?? ''),
        bairro: String(data.bairro ?? ''),
        localidade: String(data.localidade ?? ''),
        uf: String(data.uf ?? ''),
        ibge: String(data.ibge ?? ''),
      },
    }
  } catch {
    return { ok: false, motivo: 'rede' }
  }
}
