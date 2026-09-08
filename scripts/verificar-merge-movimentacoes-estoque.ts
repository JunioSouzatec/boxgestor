import assert from 'node:assert/strict'
import {
  analisarChaveIdempotenciaDeltaOS,
  chaveIdempotenciaDeltaOS,
  formatarQuantidadeChaveEstoque,
} from '../src/lib/id-deterministico.ts'
import { mesclarMovimentacoesEstoque } from '../src/services/estoque/estoque-movimentacoes-merge.ts'
import type { MovimentacaoEstoque } from '../src/types/movimentacao-estoque.ts'

const OFFICE_ID = 'office-1'
const PECA_ID = 'peca-1'

function movimento(
  id: string,
  opcoes: Partial<MovimentacaoEstoque> = {}
): MovimentacaoEstoque {
  return {
    id,
    oficina_id: OFFICE_ID,
    office_id: OFFICE_ID,
    peca_id: PECA_ID,
    peca_nome: 'Pastilha',
    tipo: 'saida',
    quantidade: 2,
    valor_unitario: 100,
    valor_total: 200,
    data: '2026-09-08',
    ordem_servico_id: 'os-1',
    ordem_servico_numero: 1001,
    motivo: 'Saída por OS #1001',
    observacao: 'Saída por OS #1001',
    ...opcoes,
  }
}

// A. Mesma transição com representação legada da RPC.
const local02 = movimento('local-02', {
  chave_idempotencia: 'os-delta:os-1:peca-1:0->2',
})
const remoto02 = movimento('rpc-02', {
  chave_idempotencia: 'os-delta:os-1:peca-1:0.->2.',
})
const merge02 = mesclarMovimentacoesEstoque([local02], [remoto02])
assert.equal(merge02.length, 1)
assert.equal(merge02[0].id, 'rpc-02')

// B. Forma canônica numérica.
assert.equal(formatarQuantidadeChaveEstoque(0), '0')
assert.equal(formatarQuantidadeChaveEstoque(0.0), '0')
assert.equal(formatarQuantidadeChaveEstoque(0.0), '0')
assert.equal(formatarQuantidadeChaveEstoque(2), '2')
assert.equal(formatarQuantidadeChaveEstoque(2.0), '2')
assert.equal(formatarQuantidadeChaveEstoque(2.0), '2')
assert.equal(
  analisarChaveIdempotenciaDeltaOS('os-delta:os-1:peca-1:0.00->2.000')?.canonica,
  'os-delta:os-1:peca-1:0->2'
)
assert.equal(chaveIdempotenciaDeltaOS('os-1', 'peca-1', 0, 2), 'os-delta:os-1:peca-1:0->2')

// C. Deltas realmente diferentes permanecem separados.
const movimento23 = movimento('mov-23', {
  quantidade: 1,
  valor_total: 100,
  chave_idempotencia: 'os-delta:os-1:peca-1:2->3',
  observacao: 'Saída por OS #1001 (ajuste +1)',
})
assert.equal(mesclarMovimentacoesEstoque([local02, movimento23], []).length, 2)

// D. Tipos diferentes não são fundidos.
const devolucao = movimento('devolucao-02', {
  tipo: 'devolucao',
  chave_idempotencia: 'os-delta:os-1:peca-1:0->2',
})
assert.equal(mesclarMovimentacoesEstoque([local02, devolucao], []).length, 2)

// E. Mesma peça/quantidade em OS diferentes permanece separada.
const outraOs = movimento('outra-os', {
  ordem_servico_id: 'os-2',
  ordem_servico_numero: 1002,
  chave_idempotencia: 'os-delta:os-2:peca-1:0->2',
})
assert.equal(mesclarMovimentacoesEstoque([local02, outraOs], []).length, 2)

// F. Reprocessar a mesma movimentação remota continua idempotente.
const primeiroPull = mesclarMovimentacoesEstoque([local02], [remoto02])
const segundoPull = mesclarMovimentacoesEstoque(primeiroPull, [remoto02])
assert.equal(segundoPull.length, 1)
assert.equal(segundoPull[0].id, 'rpc-02')

console.log('OK — merge de movimentações de estoque passou nos cenários A–F.')
