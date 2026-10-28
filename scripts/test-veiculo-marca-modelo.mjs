/**
 * Testes direcionados marca/modelo (sem vitest).
 * Replica a lógica pura de src/data/veiculos/marcas-modelos.ts
 * Rodar: node scripts/test-veiculo-marca-modelo.mjs
 */

const MARCAS_CARRO = [
  'Chevrolet', 'Fiat', 'Volkswagen', 'Ford', 'Renault', 'Toyota', 'Honda',
  'Hyundai', 'Jeep', 'Nissan', 'Peugeot', 'Citroën', 'Mitsubishi', 'Kia',
  'BMW', 'Mercedes-Benz', 'Audi', 'Volvo', 'CAOA Chery', 'BYD', 'GWM',
]
const MARCAS_MOTO = [
  'Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'BMW', 'Dafra', 'Shineray',
  'Haojue', 'Royal Enfield', 'Bajaj', 'Triumph', 'KTM', 'Ducati',
  'Harley-Davidson', 'Kymco', 'Zontes',
]
const MODELOS_CARRO = {
  Chevrolet: ['Onix', 'Tracker'],
  Fiat: ['Uno', 'Argo'],
  Honda: ['Civic', 'City'],
}
const MODELOS_MOTO = {
  Honda: ['CG 160', 'Biz 125'],
  Yamaha: ['Factor 150'],
  Bajaj: ['Dominar 400'],
}
const OPCAO_OUTRO = 'Outro'

function igualSemCaixa(a, b) {
  return a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR')
}
function ehOpcaoOutro(valor) {
  return igualSemCaixa(valor, OPCAO_OUTRO)
}
function valorManualOuVazio(valor) {
  return ehOpcaoOutro(valor) ? '' : valor
}
function comOutro(lista) {
  return lista.includes(OPCAO_OUTRO) ? lista : [...lista, OPCAO_OUTRO]
}
function marcasPorTipo(tipo) {
  if (tipo === 'moto') return comOutro([...MARCAS_MOTO])
  if (tipo === 'carro' || tipo === 'caminhonete') return comOutro([...MARCAS_CARRO])
  return comOutro([...new Set([...MARCAS_CARRO, ...MARCAS_MOTO])])
}
function modelosPorMarca(tipo, marca) {
  const chave = marca.trim()
  if (!chave || igualSemCaixa(chave, OPCAO_OUTRO)) return [OPCAO_OUTRO]
  let lista = []
  if (tipo === 'moto') lista = MODELOS_MOTO[chave] ? [...MODELOS_MOTO[chave]] : []
  else if (tipo === 'carro' || tipo === 'caminhonete') {
    lista = MODELOS_CARRO[chave] ? [...MODELOS_CARRO[chave]] : []
  }
  return comOutro(lista)
}
function ehModeloConhecidoDaMarca(tipo, marca, modelo) {
  if (!modelo.trim() || ehOpcaoOutro(modelo)) return false
  return modelosPorMarca(tipo, marca)
    .filter((m) => !ehOpcaoOutro(m))
    .some((m) => igualSemCaixa(m, modelo))
}
function resolverModeloAoTrocarMarca(tipo, marcaAntiga, marcaNova, modeloAtual) {
  if (!modeloAtual.trim()) return ''
  if (igualSemCaixa(marcaAntiga, marcaNova)) return modeloAtual
  const eraConhecidoDaAntiga = ehModeloConhecidoDaMarca(tipo, marcaAntiga, modeloAtual)
  const eConhecidoDaNova = ehModeloConhecidoDaMarca(tipo, marcaNova, modeloAtual)
  if (eraConhecidoDaAntiga && !eConhecidoDaNova) return ''
  return modeloAtual
}

let n = 0
function assert(cond, msg) {
  if (!cond) throw new Error(`FALHOU: ${msg}`)
  n++
}

// A. carro → marcas de carro
assert(marcasPorTipo('carro').includes('Chevrolet'), 'A: carro tem Chevrolet')
assert(!marcasPorTipo('carro').includes('Yamaha'), 'A: carro não tem Yamaha')
assert(marcasPorTipo('carro').includes('Outro'), 'A: carro tem Outro')

// B. moto → marcas de moto
assert(marcasPorTipo('moto').includes('Yamaha'), 'B: moto tem Yamaha')
assert(!marcasPorTipo('moto').includes('Fiat'), 'B: moto não tem Fiat')
assert(marcasPorTipo('moto').includes('Outro'), 'B: moto tem Outro')

// C. "Outro" é atalho — não vira valor salvo
assert(valorManualOuVazio('Outro') === '', 'C: selecionar Outro limpa o campo')
assert(valorManualOuVazio('Honda') === 'Honda', 'C: Honda conhecido permanece')
assert(valorManualOuVazio('MarcaX') === 'MarcaX', 'C: customizado permanece')
assert(resolverModeloAoTrocarMarca('carro', '', '', 'Meu Custom') === 'Meu Custom', 'C: texto livre preservado')
assert(modelosPorMarca('carro', 'Outro').includes('Outro'), 'C: lista ainda oferece Outro como atalho')

// D. veículo antigo com marca customizada continua exibido (não some da resolução)
assert(
  resolverModeloAoTrocarMarca('carro', 'MarcaVelha', 'MarcaVelha', 'Onix') === 'Onix',
  'D: mesma marca customizada preserva'
)

// E. modelo customizado preservado ao trocar marca
assert(
  resolverModeloAoTrocarMarca('carro', 'Chevrolet', 'Fiat', 'Meu Modelo Antigo') === 'Meu Modelo Antigo',
  'E: modelo customizado não é apagado'
)

// F. troca de marca não deixa modelo sugerido incompatível
assert(
  resolverModeloAoTrocarMarca('carro', 'Chevrolet', 'Fiat', 'Onix') === '',
  'F: Onix de Chevrolet some ao ir para Fiat'
)
assert(
  resolverModeloAoTrocarMarca('carro', 'Chevrolet', 'Chevrolet', 'Onix') === 'Onix',
  'F: mesma marca mantém modelo conhecido'
)

// Conceitual: Honda carro → Civic; Honda moto → CG 160; Bajaj moto → Dominar 400
assert(modelosPorMarca('carro', 'Honda').includes('Civic'), 'Honda carro tem Civic')
assert(!modelosPorMarca('carro', 'Honda').includes('CG 160'), 'Honda carro não sugere CG 160')
assert(modelosPorMarca('moto', 'Honda').includes('CG 160'), 'Honda moto tem CG 160')
assert(!modelosPorMarca('moto', 'Honda').includes('Civic'), 'Honda moto não sugere Civic')
assert(modelosPorMarca('moto', 'Bajaj').includes('Dominar 400'), 'Bajaj moto tem Dominar 400')
assert(!marcasPorTipo('carro').includes('Bajaj'), 'Bajaj não está em carros')

function resolverModeloAoTrocarTipo(tipoAntigo, tipoNovo, marca, modeloAtual) {
  if (!modeloAtual.trim()) return ''
  if (tipoAntigo === tipoNovo) return modeloAtual
  const eraConhecido = ehModeloConhecidoDaMarca(tipoAntigo, marca, modeloAtual)
  const eConhecido = ehModeloConhecidoDaMarca(tipoNovo, marca, modeloAtual)
  if (eraConhecido && !eConhecido) return ''
  return modeloAtual
}
assert(resolverModeloAoTrocarTipo('carro', 'moto', 'Honda', 'Civic') === '', 'tipo carro→moto limpa Civic')
assert(resolverModeloAoTrocarTipo('carro', 'moto', 'Honda', 'ModeloX') === 'ModeloX', 'tipo troca preserva customizado')

console.log(`OK — ${n} asserções passaram.`)
