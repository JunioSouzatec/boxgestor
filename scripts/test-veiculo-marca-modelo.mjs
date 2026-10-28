/**
 * Testes direcionados marca/modelo (sem vitest).
 * Replica a lógica de src/data/veiculos/marcas-modelos.ts
 * e checa o catálogo/combobox nos arquivos-fonte.
 * Rodar: node scripts/test-veiculo-marca-modelo.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const fonteCatalogo = readFileSync(join(raiz, 'src/data/veiculos/marcas-modelos.ts'), 'utf8')
const fonteCampos = readFileSync(join(raiz, 'src/components/veiculos/CamposMarcaModelo.tsx'), 'utf8')
const fonteCombobox = readFileSync(join(raiz, 'src/components/ui/searchable-combobox.tsx'), 'utf8')

function extrairLista(nome) {
  const re = new RegExp(`${nome}: string\\[\\] = \\[([\\s\\S]*?)\\]`)
  const m = fonteCatalogo.match(re)
  if (!m) throw new Error(`Não achei ${nome}`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

function extrairModelos(marca) {
  const re = new RegExp(`${marca}: \\[([\\s\\S]*?)\\]`)
  const m = fonteCatalogo.match(re)
  if (!m) throw new Error(`Não achei modelos de ${marca}`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

const MARCAS_CARRO = extrairLista('MARCAS_CARRO')
const MARCAS_MOTO = extrairLista('MARCAS_MOTO')
const MODELOS_CHEVROLET = extrairModelos('Chevrolet')
const MODELOS_FIAT = extrairModelos('Fiat')
const MODELOS_HONDA_CARRO = (() => {
  const bloco = fonteCatalogo.split('MODELOS_CARRO')[1].split('MODELOS_MOTO')[0]
  const m = bloco.match(/Honda: \[([\s\S]*?)\]/)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
})()
const MODELOS_HONDA_MOTO = (() => {
  const bloco = fonteCatalogo.split('MODELOS_MOTO')[1]
  const m = bloco.match(/Honda: \[([\s\S]*?)\]/)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
})()

const MODELOS_CARRO = {
  Chevrolet: MODELOS_CHEVROLET,
  Fiat: MODELOS_FIAT,
  Honda: MODELOS_HONDA_CARRO,
}
const MODELOS_MOTO = {
  Honda: MODELOS_HONDA_MOTO,
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
function ordenarUnico(valores) {
  return Array.from(new Set(valores)).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
function ordenarSugestoes(valores) {
  const unicos = ordenarUnico(valores.filter((v) => v.trim() && !ehOpcaoOutro(v)))
  return [...unicos, OPCAO_OUTRO]
}
function marcasPorTipo(tipo) {
  if (tipo === 'moto') return ordenarSugestoes(MARCAS_MOTO)
  if (tipo === 'carro' || tipo === 'caminhonete') return ordenarSugestoes(MARCAS_CARRO)
  return ordenarSugestoes([...MARCAS_CARRO, ...MARCAS_MOTO])
}
function modelosPorMarca(tipo, marca) {
  const chave = marca.trim()
  if (!chave || igualSemCaixa(chave, OPCAO_OUTRO)) return [OPCAO_OUTRO]
  let lista = []
  if (tipo === 'moto') lista = MODELOS_MOTO[chave] ? [...MODELOS_MOTO[chave]] : []
  else if (tipo === 'carro' || tipo === 'caminhonete') {
    lista = MODELOS_CARRO[chave] ? [...MODELOS_CARRO[chave]] : []
  }
  return ordenarSugestoes(lista)
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
function resolverModeloAoTrocarTipo(tipoAntigo, tipoNovo, marca, modeloAtual) {
  if (!modeloAtual.trim()) return ''
  if (tipoAntigo === tipoNovo) return modeloAtual
  const eraConhecido = ehModeloConhecidoDaMarca(tipoAntigo, marca, modeloAtual)
  const eConhecido = ehModeloConhecidoDaMarca(tipoNovo, marca, modeloAtual)
  if (eraConhecido && !eConhecido) return ''
  return modeloAtual
}
function opcoesVisiveisCombobox(opcoes, consulta, consultaAtiva) {
  if (!consultaAtiva || !consulta.trim()) return opcoes
  const q = consulta
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
  return opcoes.filter((o) =>
    o
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .includes(q)
  )
}
function listaAlfabeticaSemOutro(lista) {
  const itens = lista.filter((v) => v !== OPCAO_OUTRO)
  for (let i = 1; i < itens.length; i++) {
    if (itens[i - 1].localeCompare(itens[i], 'pt-BR') > 0) return false
  }
  return true
}

let n = 0
function assert(cond, msg) {
  if (!cond) throw new Error(`FALHOU: ${msg}`)
  n++
}

// A. Chevrolet contém Astra
assert(MODELOS_CHEVROLET.includes('Astra'), 'A: Chevrolet contém Astra')
assert(modelosPorMarca('carro', 'Chevrolet').includes('Astra'), 'A: Astra sugerido para Chevrolet')

// B. Chevrolet contém Vectra
assert(MODELOS_CHEVROLET.includes('Vectra'), 'B: Chevrolet contém Vectra')

// C. Chevrolet contém Onix
assert(MODELOS_CHEVROLET.includes('Onix'), 'C: Chevrolet contém Onix')

// D. marcas em ordem alfabética
assert(listaAlfabeticaSemOutro(marcasPorTipo('carro')), 'D: marcas de carro alfabéticas')
assert(listaAlfabeticaSemOutro(marcasPorTipo('moto')), 'D: marcas de moto alfabéticas')

// E. modelos em ordem alfabética
assert(listaAlfabeticaSemOutro(modelosPorMarca('carro', 'Chevrolet')), 'E: modelos Chevrolet alfabéticos')
assert(listaAlfabeticaSemOutro(modelosPorMarca('moto', 'Honda')), 'E: modelos Honda moto alfabéticos')

// F. "Outro" permanece disponível
assert(marcasPorTipo('carro').includes('Outro'), 'F: marcas carro tem Outro')
assert(marcasPorTipo('moto').includes('Outro'), 'F: marcas moto tem Outro')
assert(modelosPorMarca('carro', 'Chevrolet').at(-1) === 'Outro', 'F: Outro no final dos modelos')
assert(valorManualOuVazio('Outro') === '', 'F: Outro não é persistido')

// G. troca Chevrolet → Fiat sem limpar input (lista abre completa)
const marcasAbertas = opcoesVisiveisCombobox(marcasPorTipo('carro'), 'Chevrolet', false)
assert(marcasAbertas.includes('Fiat'), 'G: com Chevrolet visível, Fiat continua clicável')
assert(marcasAbertas.includes('Chevrolet'), 'G: valor atual continua na lista')
assert(fonteCampos.includes('SearchableCombobox'), 'G: CamposMarcaModelo usa SearchableCombobox')
assert(!fonteCampos.includes('datalist'), 'G: datalist removido')
assert(fonteCombobox.includes('opcoesVisiveisCombobox'), 'G: combobox exporta filtro')

// H. modelo incompatível sugerido é limpo
assert(
  resolverModeloAoTrocarMarca('carro', 'Chevrolet', 'Fiat', 'Onix') === '',
  'H: Onix some ao ir para Fiat'
)
assert(
  resolverModeloAoTrocarMarca('carro', 'Chevrolet', 'Chevrolet', 'Onix') === 'Onix',
  'H: mesma marca mantém Onix'
)

// I. modelo customizado é preservado
assert(
  resolverModeloAoTrocarMarca('carro', 'Chevrolet', 'Fiat', 'Meu Modelo Antigo') === 'Meu Modelo Antigo',
  'I: customizado preservado na troca de marca'
)
assert(
  resolverModeloAoTrocarMarca('carro', 'MarcaCustom', 'Fiat', 'ModeloCustom') === 'ModeloCustom',
  'I: legado customizado preservado'
)

// J. carro não mostra modelo de moto
assert(modelosPorMarca('carro', 'Honda').includes('Civic'), 'J: Honda carro tem Civic')
assert(!modelosPorMarca('carro', 'Honda').includes('CG 160'), 'J: Honda carro não sugere CG 160')
assert(!marcasPorTipo('carro').includes('Yamaha'), 'J: carro não lista Yamaha')

// K. moto não mostra modelo de carro
assert(modelosPorMarca('moto', 'Honda').includes('CG 160'), 'K: Honda moto tem CG 160')
assert(!modelosPorMarca('moto', 'Honda').includes('Civic'), 'K: Honda moto não sugere Civic')
assert(!marcasPorTipo('moto').includes('Fiat'), 'K: moto não lista Fiat')

assert(resolverModeloAoTrocarTipo('carro', 'moto', 'Honda', 'Civic') === '', 'tipo carro→moto limpa Civic')
assert(
  resolverModeloAoTrocarTipo('carro', 'moto', 'Honda', 'ModeloX') === 'ModeloX',
  'tipo troca preserva customizado'
)

console.log(`OK — ${n} asserções passaram.`)
