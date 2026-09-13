import assert from 'node:assert/strict'
import {
  calcularTotaisLinhaPeca,
  criarPecaUtilizadaManual,
} from '../src/services/os-pecas.service.ts'
import type { PecaUtilizada } from '../src/types/ordem-servico.ts'
import type { Peca } from '../src/types/peca.ts'

const manualRepasse = criarPecaUtilizadaManual({
  nome: 'Peça avulsa',
  quantidade: 1,
  custo_unitario: 120,
  valor_unitario: 120,
})
assert.deepEqual(calcularTotaisLinhaPeca(manualRepasse), {
  venda: 120,
  custo: 120,
  lucro: 0,
  custoUnitarioEfetivo: 120,
  custoConhecido: true,
})

const manualComMargem = criarPecaUtilizadaManual({
  nome: 'Peça avulsa com margem',
  quantidade: 2,
  custo_unitario: 50,
  valor_unitario: 80,
})
assert.equal(calcularTotaisLinhaPeca(manualComMargem).venda, 160)
assert.equal(calcularTotaisLinhaPeca(manualComMargem).custo, 100)
assert.equal(calcularTotaisLinhaPeca(manualComMargem).lucro, 60)

const manualLegada: PecaUtilizada = {
  nome: 'Peça manual antiga',
  quantidade: 1,
  valor_unitario: 120,
  manual: true,
}
assert.equal(calcularTotaisLinhaPeca(manualLegada).custo, 120)
assert.equal(calcularTotaisLinhaPeca(manualLegada).lucro, 0)
assert.equal(calcularTotaisLinhaPeca(manualLegada).custoConhecido, false)

const pecaEstoque = {
  id: 'estoque-1',
  custo: 50,
} as Peca
const linhaEstoque: PecaUtilizada = {
  peca_id: 'estoque-1',
  nome: 'Peça do estoque',
  quantidade: 2,
  valor_unitario: 80,
  manual: false,
}
assert.equal(calcularTotaisLinhaPeca(linhaEstoque, pecaEstoque).venda, 160)
assert.equal(calcularTotaisLinhaPeca(linhaEstoque, pecaEstoque).custo, 100)
assert.equal(calcularTotaisLinhaPeca(linhaEstoque, pecaEstoque).lucro, 60)

console.log('OK — cálculos de peça avulsa e compatibilidade legada passaram.')
