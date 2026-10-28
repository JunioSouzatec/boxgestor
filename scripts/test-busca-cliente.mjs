/**
 * Testes direcionados da busca de cliente da Agenda.
 * Rodar: node scripts/test-busca-cliente.mjs
 */

function normalizarTextoBusca(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

function somenteDigitos(valor) {
  return valor.replace(/\D/g, '')
}

function filtrarClientesAgenda(clientes, motos, query, limite = 25) {
  const q = normalizarTextoBusca(query)
  const qDigitos = somenteDigitos(query)
  const placasPorCliente = new Map()
  for (const m of motos) {
    const lista = placasPorCliente.get(m.cliente_id) ?? []
    if (m.placa) lista.push(m.placa)
    placasPorCliente.set(m.cliente_id, lista)
  }
  if (!q && !qDigitos) {
    return clientes.slice(0, limite).map((c) => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      placa: placasPorCliente.get(c.id)?.[0],
    }))
  }
  const achados = []
  for (const c of clientes) {
    const nome = normalizarTextoBusca(c.nome)
    const tel = somenteDigitos(c.telefone)
    const placas = placasPorCliente.get(c.id) ?? []
    const placaOk = placas.some((p) => normalizarTextoBusca(p).includes(q))
    const nomeOk = q ? nome.includes(q) : false
    const telOk = qDigitos.length >= 2 && tel.includes(qDigitos)
    if (!nomeOk && !telOk && !placaOk) continue
    achados.push({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      placa: placas.find((p) => normalizarTextoBusca(p).includes(q)) ?? placas[0],
    })
    if (achados.length >= limite) break
  }
  return achados
}

const clientes = [
  { id: 'c1', nome: 'Júnio Souza', telefone: '(38) 99999-0000' },
  { id: 'c2', nome: 'Maria Silva', telefone: '31988887777' },
]
const motos = [
  { id: 'm1', cliente_id: 'c1', placa: 'HOM1A23' },
  { id: 'm2', cliente_id: 'c2', placa: 'ABC1D23' },
]

let n = 0
function assert(cond, msg) {
  if (!cond) throw new Error(`FALHOU: ${msg}`)
  n++
}

// G. busca por nome (acento)
{
  const r = filtrarClientesAgenda(clientes, motos, 'jun')
  assert(r.length === 1 && r[0].id === 'c1', 'G: jun encontra Júnio')
}

// H. busca por telefone
{
  const r = filtrarClientesAgenda(clientes, motos, '3899')
  assert(r.length === 1 && r[0].id === 'c1', 'H: 3899 encontra pelo telefone')
}

// I. busca por placa
{
  const r = filtrarClientesAgenda(clientes, motos, 'HOM1')
  assert(r.length === 1 && r[0].id === 'c1', 'I: HOM1 encontra pela placa')
}

// J. guest/avulso: a busca vazia não obriga cadastro novo — só lista existentes
{
  const r = filtrarClientesAgenda(clientes, motos, '')
  assert(r.length === 2, 'J: busca vazia lista clientes já carregados (guest fica no fluxo da tela)')
}

// K. selecionar cliente retorna ID correto
{
  const r = filtrarClientesAgenda(clientes, motos, 'Maria')
  assert(r[0].id === 'c2', 'K: Maria retorna id c2')
}

console.log(`OK — ${n} asserções passaram.`)
