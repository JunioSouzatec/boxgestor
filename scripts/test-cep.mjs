/**
 * Testes direcionados do helper de CEP (sem internet).
 * Rodar: node scripts/test-cep.mjs
 */

function normalizarCep(cep) {
  return cep.replace(/\D/g, '').slice(0, 8)
}

function cepEstaCompleto(cep) {
  return normalizarCep(cep).length === 8
}

async function buscarEnderecoPorCep(cep, fetchFn) {
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

let n = 0
function assert(cond, msg) {
  if (!cond) throw new Error(`FALHOU: ${msg}`)
  n++
}

// L. CEP válido mockado
{
  const r = await buscarEnderecoPorCep('39400000', async () => ({
    ok: true,
    json: async () => ({
      logradouro: 'Avenida Getúlio Vargas',
      bairro: 'Centro',
      localidade: 'Montes Claros',
      uf: 'MG',
      ibge: '3143302',
      complemento: '',
    }),
  }))
  assert(r.ok && r.endereco.localidade === 'Montes Claros' && r.endereco.uf === 'MG', 'L: CEP válido mockado')
}

// M. máscara normaliza para 8 dígitos
assert(normalizarCep('39400-000') === '39400000', 'M: máscara 39400-000')
assert(normalizarCep('39.400-000') === '39400000', 'M: pontuação extra')

// N. incompleto não consulta
{
  let chamado = false
  const r = await buscarEnderecoPorCep('39400', async () => {
    chamado = true
    return { ok: true, json: async () => ({}) }
  })
  assert(!chamado && r.motivo === 'incompleto', 'N: CEP incompleto não chama fetch')
  assert(!cepEstaCompleto('39400'), 'N: 5 dígitos incompleto')
}

// O. CEP inválido não apaga endereço (helper só retorna erro)
{
  const r = await buscarEnderecoPorCep('00000000', async () => ({
    ok: true,
    json: async () => ({ erro: true }),
  }))
  assert(!r.ok && r.motivo === 'nao_encontrado', 'O: CEP inválido = nao_encontrado (UI não apaga)')
}

// P. falha de rede não impede preenchimento manual
{
  const r = await buscarEnderecoPorCep('39400000', async () => {
    throw new Error('offline')
  })
  assert(!r.ok && r.motivo === 'rede', 'P: rede falhou de forma controlada')
}

console.log(`OK — ${n} asserções passaram.`)
