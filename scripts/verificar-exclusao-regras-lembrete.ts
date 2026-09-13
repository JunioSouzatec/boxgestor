import assert from 'node:assert/strict'
import {
  criarRegrasPadraoSemDuplicar,
  deveSemearRegrasPadrao,
  encontrarRegraLembreteEquivalente,
  filtrarRegrasLembreteAtivas,
  filtrarRegrasParaNaoRessuscitar,
  marcarRegraLembreteExcluida,
  mesclarRegrasLembreteSemDuplicar,
  semearRegrasPadraoSeSeguro,
} from '../src/services/lembretes/regra-lembrete-identidade.ts'
import type { LembreteCliente, RegraLembrete, RegraLembreteInput } from '../src/types/lembrete.ts'

const REGRAS_PADRAO: Array<Omit<RegraLembreteInput, 'ativo'>> = [
  {
    nome_regra: 'Troca de óleo',
    servico_relacionado: 'Troca de óleo',
    categoria: 'lubrificacao',
    prazo_dias: 90,
    prazo_meses: 0,
    km_retorno: 3000,
    mensagem_padrao: 'óleo',
  },
  {
    nome_regra: 'Bateria',
    servico_relacionado: 'Bateria',
    categoria: 'eletrica',
    prazo_dias: 0,
    prazo_meses: 12,
    mensagem_padrao: 'Verifique a bateria.',
  },
]

function regra(parcial: Partial<RegraLembrete> & Pick<RegraLembrete, 'id'>): RegraLembrete {
  return {
    office_id: 'office-1',
    nome_regra: 'Bateria',
    servico_relacionado: 'Bateria',
    categoria: 'eletrica',
    prazo_dias: 0,
    prazo_meses: 12,
    mensagem_padrao: 'Verifique a bateria.',
    ativo: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...parcial,
  }
}

const ativa = regra({ id: 'regra-bateria' })
const agora = '2026-09-13T12:00:00.000Z'

// A. excluir some da lista ativa
const excluida = marcarRegraLembreteExcluida(ativa, agora)
assert.equal(excluida.deleted_at, agora)
assert.equal(filtrarRegrasLembreteAtivas([excluida]).length, 0)

// B/E. F5 / pull: tombstone local vence remoto ativo antigo
const remotoAtivoAntigo = { ...ativa, updated_at: '2026-01-02T00:00:00.000Z' }
const aposPull = mesclarRegrasLembreteSemDuplicar([excluida], [remotoAtivoAntigo])
assert.equal(aposPull.find((item) => item.id === ativa.id)?.deleted_at, agora)
assert.equal(filtrarRegrasLembreteAtivas(aposPull).length, 0)

// C/D. outro cache antigo / nova sessão: remoto com tombstone vence local ativo
const aposOutroDispositivo = mesclarRegrasLembreteSemDuplicar([ativa], [excluida])
assert.equal(aposOutroDispositivo[0]?.deleted_at, agora)
assert.equal(filtrarRegrasLembreteAtivas(aposOutroDispositivo).length, 0)

// F. push de cache antigo não ressuscita
const filtradas = filtrarRegrasParaNaoRessuscitar(
  [ativa, regra({ id: 'regra-nova', nome_regra: 'Nova' })],
  [{ id: 'uuid-bateria', local_id: 'regra-bateria', deleted_at: agora }]
)
assert.equal(
  filtradas.some((item) => item.id === 'regra-bateria'),
  false
)
assert.equal(
  filtradas.some((item) => item.id === 'regra-nova'),
  true
)
assert.equal(
  filtrarRegrasParaNaoRessuscitar([excluida], [
    { id: 'uuid-bateria', local_id: 'regra-bateria', deleted_at: agora },
  ]).length,
  1
)

// G. criar nova regra continua possível após exclusão da equivalente
const novaEquivalente = regra({
  id: 'regra-bateria-nova',
  created_at: agora,
  updated_at: agora,
})
assert.equal(encontrarRegraLembreteEquivalente([excluida], novaEquivalente), undefined)
assert.equal(
  mesclarRegrasLembreteSemDuplicar([excluida, novaEquivalente], []).filter(
    (item) => !item.deleted_at
  ).length,
  1
)

// H. editar regra ativa não é afetado pelo tombstone de outro id
const oleo = regra({
  id: 'regra-oleo',
  nome_regra: 'Troca de óleo',
  servico_relacionado: 'Troca de óleo',
  categoria: 'lubrificacao',
  prazo_dias: 90,
  prazo_meses: 0,
  mensagem_padrao: 'Troca de óleo',
})
const oleoEditada = { ...oleo, prazo_dias: 120, updated_at: agora }
const aposEdicao = mesclarRegrasLembreteSemDuplicar([oleoEditada], [oleo, excluida])
assert.equal(aposEdicao.find((item) => item.id === 'regra-oleo')?.prazo_dias, 120)
assert.equal(aposEdicao.find((item) => item.id === 'regra-bateria')?.deleted_at, agora)

// I. duplicata semântica ativa continua bloqueada
assert.equal(encontrarRegraLembreteEquivalente([oleo], oleoEditada, oleo.id), undefined)
assert.ok(encontrarRegraLembreteEquivalente([oleo], { ...oleo, nome_regra: '  TROCA DE ÓLEO ' }))

// J. regra remota ativa ausente no local NÃO é tratada como excluída
const soRemoto = mesclarRegrasLembreteSemDuplicar([], [oleo])
assert.equal(soRemoto.length, 1)
assert.equal(soRemoto[0]?.id, 'regra-oleo')
assert.equal(soRemoto[0]?.deleted_at ?? null, null)

// K. seed não recria regra explicitamente excluída
assert.equal(deveSemearRegrasPadrao([excluida]), false)
assert.deepEqual(semearRegrasPadraoSeSeguro(REGRAS_PADRAO, 'office-1', [excluida], agora), [
  excluida,
])
const seedVazio = semearRegrasPadraoSeSeguro(REGRAS_PADRAO, 'office-1', [], agora)
assert.ok(seedVazio.length > 0)
const seedComTombstonePadrao = criarRegrasPadraoSemDuplicar(
  REGRAS_PADRAO,
  'office-1',
  agora,
  [
    regra({
      id: 'regra-padrao-bateria',
      deleted_at: agora,
      updated_at: agora,
    }),
  ]
)
assert.equal(
  seedComTombstonePadrao.some((item) => item.nome_regra === 'Bateria'),
  false
)

// L. lembrete histórico permanece após exclusão da regra
const lembrete: LembreteCliente = {
  id: 'lem-1',
  office_id: 'office-1',
  cliente_id: 'cli-1',
  moto_id: 'moto-1',
  regra_id: ativa.id,
  servico: 'Bateria',
  data_prevista: '2026-10-01',
  mensagem: 'histórico',
  personalizado: false,
  created_at: '2026-01-01T00:00:00.000Z',
}
const regrasAposExclusao = mesclarRegrasLembreteSemDuplicar([excluida], [ativa])
assert.equal(regrasAposExclusao.some((item) => item.id === lembrete.regra_id), true)
assert.equal(lembrete.regra_id, ativa.id)

console.log('OK — exclusão persistente de regras de retorno validada.')
