/**
 * Testes direcionados do fluxo de agenda cadastrado + avulso/rápido.
 * Rodar: node scripts/test-agenda-avulso.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const fonteAgenda = readFileSync(join(raiz, 'src/pages/AgendaPage.tsx'), 'utf8')
const fonteTipos = readFileSync(join(raiz, 'src/types/agendamento.ts'), 'utf8')
const fonteBusca = readFileSync(join(raiz, 'src/lib/busca-cliente.ts'), 'utf8')

function textoNaoVazio(valor) {
  const t = valor?.trim() ?? ''
  return t ? t : null
}
function guestNameValido(ag) {
  return textoNaoVazio(ag.guest_name)
}
function guestVehicleValido(ag) {
  return textoNaoVazio(ag.guest_vehicle)
}
function clienteIdValido(ag) {
  return textoNaoVazio(ag.cliente_id)
}
function motoIdValido(ag) {
  return textoNaoVazio(ag.moto_id)
}
function ehAgendamentoRapido(ag) {
  return (
    Boolean(guestNameValido(ag)) &&
    Boolean(guestVehicleValido(ag)) &&
    !clienteIdValido(ag) &&
    !motoIdValido(ag)
  )
}
function ehAgendamentoCadastrado(ag) {
  return (
    Boolean(clienteIdValido(ag)) &&
    Boolean(motoIdValido(ag)) &&
    !guestNameValido(ag) &&
    !guestVehicleValido(ag)
  )
}
function modoAgendamentoIdentidade(ag) {
  if (ehAgendamentoCadastrado(ag)) return 'cadastrado'
  if (ehAgendamentoRapido(ag)) return 'rapido'
  return null
}
function validarIdentidadeAgendamento(ag) {
  const modo = modoAgendamentoIdentidade(ag)
  if (modo) return null
  const temCliente = Boolean(clienteIdValido(ag))
  const temMoto = Boolean(motoIdValido(ag))
  const temGuestNome = Boolean(guestNameValido(ag))
  const temGuestVeiculo = Boolean(guestVehicleValido(ag))
  if ((temCliente || temMoto) && (temGuestNome || temGuestVeiculo)) {
    return 'Agendamento não pode misturar cliente cadastrado com dados rápidos.'
  }
  if (temCliente !== temMoto) {
    return 'Informe cliente e veículo cadastrados, ou use agendamento rápido.'
  }
  if (temGuestNome !== temGuestVeiculo) {
    return 'No agendamento rápido, informe nome e veículo.'
  }
  return 'Informe cliente e veículo cadastrados, ou nome e veículo no modo rápido.'
}
function normalizarIdentidadeAgendamento(ag, modo) {
  if (modo === 'cadastrado') {
    return {
      ...ag,
      guest_name: null,
      guest_vehicle: null,
      cliente_id: clienteIdValido(ag) ?? ag.cliente_id ?? null,
      moto_id: motoIdValido(ag) ?? ag.moto_id ?? null,
    }
  }
  return {
    ...ag,
    cliente_id: null,
    moto_id: null,
    guest_name: guestNameValido(ag),
    guest_vehicle: guestVehicleValido(ag),
  }
}

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

function rotuloClienteAgenda(ag, clientes) {
  const id = ag.cliente_id?.trim()
  if (id) return clientes.find((c) => c.id === id)?.nome ?? '—'
  return ag.guest_name?.trim() || '—'
}
function rotuloVeiculoAgenda(ag, motos) {
  const id = ag.moto_id?.trim()
  if (id) {
    const m = motos.find((mo) => mo.id === id)
    return m ? `${m.marca} ${m.modelo} (${m.placa})` : '—'
  }
  return ag.guest_vehicle?.trim() || '—'
}

function trocarModoForm(atual, modo) {
  return modo === 'cadastrado'
    ? { ...atual, guest_name: '', guest_vehicle: '' }
    : { ...atual, cliente_id: '', moto_id: '' }
}

const clientes = [
  { id: 'c1', nome: 'Maria Silva', telefone: '(11) 98888-1111' },
  { id: 'c2', nome: 'João Souza', telefone: '11977772222' },
]
const motos = [
  { id: 'm1', cliente_id: 'c1', marca: 'Chevrolet', modelo: 'Onix', placa: 'ABC1D23' },
  { id: 'm2', cliente_id: 'c2', marca: 'Honda', modelo: 'CG 160', placa: 'XYZ9E87' },
]

let n = 0
function assert(cond, msg) {
  if (!cond) throw new Error(`FALHOU: ${msg}`)
  n++
}

// L. busca por nome
assert(filtrarClientesAgenda(clientes, motos, 'maria')[0]?.id === 'c1', 'L: busca por nome')
assert(filtrarClientesAgenda(clientes, motos, 'JOAO')[0]?.id === 'c2', 'L: busca por nome sem acento/caixa')

// M. busca por telefone
assert(filtrarClientesAgenda(clientes, motos, '988881111')[0]?.id === 'c1', 'M: busca por telefone')

// N. busca por placa
assert(filtrarClientesAgenda(clientes, motos, 'ABC1D23')[0]?.id === 'c1', 'N: busca por placa')
assert(fonteBusca.includes('placa'), 'N: busca-cliente considera placa')

// O. cliente cadastrado salva com clientId
const cadastrado = {
  cliente_id: 'c1',
  moto_id: 'm1',
  guest_name: '',
  guest_vehicle: '',
  servico: 'Revisão',
}
assert(ehAgendamentoCadastrado(cadastrado), 'O: identidade cadastrada')
assert(validarIdentidadeAgendamento(cadastrado) === null, 'O: cadastrado válido')
const salvoCadastrado = normalizarIdentidadeAgendamento(cadastrado, 'cadastrado')
assert(salvoCadastrado.cliente_id === 'c1', 'O: clientId persistido')
assert(salvoCadastrado.guest_name === null, 'O: guest limpo no cadastrado')

// P. modo avulso não exige clientId
const avulso = {
  cliente_id: '',
  moto_id: '',
  guest_name: 'Pedro Avulso',
  guest_vehicle: 'Gol 1.6 branco',
  servico: 'Alinhamento',
}
assert(ehAgendamentoRapido(avulso), 'P: identidade avulsa')
assert(validarIdentidadeAgendamento(avulso) === null, 'P: avulso válido sem clientId')
const salvoAvulso = normalizarIdentidadeAgendamento(avulso, 'rapido')
assert(salvoAvulso.cliente_id === null, 'P: avulso grava clientId nulo')

// Q. avulso preserva nome
assert(salvoAvulso.guest_name === 'Pedro Avulso', 'Q: nome avulso preservado')
assert(rotuloClienteAgenda(salvoAvulso, clientes) === 'Pedro Avulso', 'Q: calendário mostra nome avulso')

// R. avulso preserva veículo
assert(salvoAvulso.guest_vehicle === 'Gol 1.6 branco', 'R: veículo avulso preservado')
assert(rotuloVeiculoAgenda(salvoAvulso, motos) === 'Gol 1.6 branco', 'R: calendário mostra veículo avulso')

// S. alternância cadastrado ↔ avulso não mistura dados
const deCadastradoParaAvulso = trocarModoForm(cadastrado, 'rapido')
assert(!deCadastradoParaAvulso.cliente_id, 'S: troca p/ avulso limpa clientId')
assert(!deCadastradoParaAvulso.moto_id, 'S: troca p/ avulso limpa motoId')
const deAvulsoParaCadastrado = trocarModoForm(avulso, 'cadastrado')
assert(!deAvulsoParaCadastrado.guest_name, 'S: troca p/ cadastrado limpa guest_name')
assert(!deAvulsoParaCadastrado.guest_vehicle, 'S: troca p/ cadastrado limpa guest_vehicle')
assert(
  validarIdentidadeAgendamento({
    cliente_id: 'c1',
    moto_id: 'm1',
    guest_name: 'Pedro',
    guest_vehicle: 'Gol',
  }) !== null,
  'S: híbrido é rejeitado'
)

// T. fluxo antigo de agendamento continua válido
const legado = { cliente_id: 'c1', moto_id: 'm1', servico: 'Troca de óleo' }
assert(ehAgendamentoCadastrado(legado), 'T: legado cadastrado ainda válido')
assert(validarIdentidadeAgendamento(legado) === null, 'T: legado passa na validação')
assert(rotuloClienteAgenda(legado, clientes) === 'Maria Silva', 'T: legado mostra nome do cadastro')
assert(rotuloVeiculoAgenda(legado, motos) === 'Chevrolet Onix (ABC1D23)', 'T: legado mostra veículo')

const editadoAvulso = normalizarIdentidadeAgendamento(
  { ...avulso, guest_name: 'Pedro Editado', guest_vehicle: 'Uno 2012' },
  'rapido'
)
assert(editadoAvulso.guest_name === 'Pedro Editado', 'T: edição avulsa preserva nome')
assert(editadoAvulso.cliente_id === null, 'T: edição avulsa não cria clientId')

assert(fonteAgenda.includes('Cliente avulso / rápido'), 'UI: modo avulso presente')
assert(fonteAgenda.includes('ClienteAgendaCombobox'), 'UI: combobox cadastrado preservado')
assert(fonteAgenda.includes('normalizarIdentidadeAgendamento'), 'UI: normaliza identidade ao salvar')
assert(!fonteAgenda.includes('adicionarCliente'), 'UI: avulso não cria cliente')
assert(fonteTipos.includes('guest_name'), 'tipos: guest_name presente')
assert(fonteTipos.includes('guest_vehicle'), 'tipos: guest_vehicle presente')

console.log(`OK — ${n} asserções passaram.`)
