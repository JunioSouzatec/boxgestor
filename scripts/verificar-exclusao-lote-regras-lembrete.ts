import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aplicarExclusaoRegrasEmLote } from '../src/services/lembretes/excluir-regras-lote.ts'
import {
  encontrarRegraLembreteEquivalente,
  filtrarRegrasLembreteAtivas,
  marcarRegraLembreteExcluida,
  mesclarRegrasLembreteSemDuplicar,
} from '../src/services/lembretes/regra-lembrete-identidade.ts'
import type { LembreteCliente, RegraLembrete } from '../src/types/lembrete.ts'

function regra(parcial: Partial<RegraLembrete> & Pick<RegraLembrete, 'id' | 'nome_regra'>): RegraLembrete {
  return {
    office_id: 'office-1',
    servico_relacionado: parcial.nome_regra,
    categoria: 'geral',
    prazo_dias: 90,
    prazo_meses: 0,
    mensagem_padrao: `msg ${parcial.nome_regra}`,
    ativo: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...parcial,
  }
}

const agora = '2026-09-13T16:00:00.000Z'
const oleo = regra({ id: 'regra-oleo', nome_regra: 'Troca de óleo' })
const bateria = regra({
  id: 'regra-bateria',
  nome_regra: 'Bateria',
  categoria: 'eletrica',
  prazo_dias: 0,
  prazo_meses: 12,
})
const filtro = regra({ id: 'regra-filtro', nome_regra: 'Filtro de ar' })
const jaExcluida = marcarRegraLembreteExcluida(
  regra({ id: 'regra-velha', nome_regra: 'Velha' }),
  '2026-08-01T00:00:00.000Z'
)

const visiveis = [oleo, bateria, filtro]
const store = [oleo, bateria, filtro, jaExcluida]

// 1-7. UX da página: modo seleção, contador, cancelar, 0 desabilita excluir
const page = readFileSync(new URL('../src/pages/LembretesPage.tsx', import.meta.url), 'utf8')
assert.match(page, />Selecionar</)
assert.match(page, /entrarModoSelecaoRegras/)
assert.match(page, /cancelarModoSelecaoRegras/)
assert.match(page, /setModoSelecaoRegras\(false\)/)
assert.match(page, /setRegrasSelecionadas\(new Set\(\)\)/)
assert.match(page, /Selecionar todas visíveis/)
assert.match(page, /selecionarTodasRegrasVisiveis/)
assert.match(page, /new Set\(regras\.map\(\(regra\) => regra\.id\)\)/)
assert.match(page, /\{regrasSelecionadas\.size\} selecionadas/)
assert.match(page, /Excluir selecionadas \(\$\{regrasSelecionadas\.size\}\)/)
assert.match(page, /disabled=\{regrasSelecionadas\.size === 0 \|\| excluindoRegrasLote\}/)
assert.match(page, /modoSelecaoRegras &&/)
assert.match(page, /type="checkbox"/)
assert.doesNotMatch(page, /Promise\.allSettled\(\s*regrasSelecionadas/)
assert.doesNotMatch(page, /ids\.map\(\s*\(.*excluirRegra/)
assert.match(page, /excluirRegrasEmLote\(ids\)/)
assert.match(page, /excluindoRegrasLote/)
assert.match(
  page,
  /As regras deixarão de aparecer nesta oficina\./
)
assert.match(page, /Lembretes já criados e históricos serão preservados\./)
assert.match(page, /MSG_EXCLUSAO_LOTE_PENDENTE/)
assert.match(page, /Nenhuma regra válida para excluir/)

const cancelarBloco = page.match(
  /function cancelarModoSelecaoRegras\(\) \{[\s\S]*?\n\s{2}\}/
)
assert.ok(cancelarBloco, 'cancelarModoSelecaoRegras não encontrado')
assert.match(cancelarBloco[0], /setModoSelecaoRegras\(false\)/)
assert.match(cancelarBloco[0], /setRegrasSelecionadas\(new Set\(\)\)/)
assert.doesNotMatch(cancelarBloco[0], /excluirRegra|excluirRegrasEmLote/)

const todasVisiveis = page.match(
  /function selecionarTodasRegrasVisiveis\(\) \{[\s\S]*?\n\s{2}\}/
)
assert.ok(todasVisiveis, 'selecionarTodasRegrasVisiveis não encontrado')
assert.match(todasVisiveis[0], /regras\.map/)
assert.doesNotMatch(todasVisiveis[0], /deleted_at|listarRegras|office\.regras/)

// 8-10. lote marca só os IDs pedidos, uma passagem, sem consolidar equivalentes
const lote = aplicarExclusaoRegrasEmLote(store, [oleo.id, bateria.id, oleo.id], agora)
assert.deepEqual(lote.resultado.marcadas, [oleo.id, bateria.id])
assert.deepEqual(lote.resultado.jaExcluidas, [])
assert.deepEqual(lote.resultado.naoEncontradas, [])
assert.equal(lote.regras.find((item) => item.id === oleo.id)?.deleted_at, agora)
assert.equal(lote.regras.find((item) => item.id === bateria.id)?.deleted_at, agora)
assert.equal(lote.regras.find((item) => item.id === filtro.id)?.deleted_at ?? null, null)
assert.equal(lote.regras.find((item) => item.id === jaExcluida.id)?.deleted_at, jaExcluida.deleted_at)
assert.equal(filtrarRegrasLembreteAtivas(lote.regras).map((item) => item.id).join(','), filtro.id)

// 6. 0 IDs não altera store
const vazio = aplicarExclusaoRegrasEmLote(store, [], agora)
assert.deepEqual(vazio.resultado, { marcadas: [], jaExcluidas: [], naoEncontradas: [] })
assert.deepEqual(
  vazio.regras.map((item) => item.deleted_at ?? null),
  store.map((item) => item.deleted_at ?? null)
)

// parcial: existentes + já excluída + inexistente
const parcial = aplicarExclusaoRegrasEmLote(
  store,
  [filtro.id, jaExcluida.id, 'regra-sumiu'],
  agora
)
assert.deepEqual(parcial.resultado.marcadas, [filtro.id])
assert.deepEqual(parcial.resultado.jaExcluidas, [jaExcluida.id])
assert.deepEqual(parcial.resultado.naoEncontradas, ['regra-sumiu'])
assert.equal(parcial.regras.find((item) => item.id === oleo.id)?.deleted_at ?? null, null)

// 12. F5 / lista ativa não traz excluídas
assert.equal(
  filtrarRegrasLembreteAtivas(lote.regras).some((item) => item.id === oleo.id || item.id === bateria.id),
  false
)

// 13. merge com remoto antigo não ressuscita
const remotoAntigo = [oleo, bateria, filtro]
const aposMerge = mesclarRegrasLembreteSemDuplicar(lote.regras, remotoAntigo)
assert.equal(aposMerge.find((item) => item.id === oleo.id)?.deleted_at, agora)
assert.equal(aposMerge.find((item) => item.id === bateria.id)?.deleted_at, agora)
assert.equal(filtrarRegrasLembreteAtivas(aposMerge).map((item) => item.id).join(','), filtro.id)

// 14. histórico / lembrete permanece com o mesmo regra_id
const lembrete: LembreteCliente = {
  id: 'lem-1',
  office_id: 'office-1',
  cliente_id: 'cli-1',
  moto_id: 'moto-1',
  regra_id: oleo.id,
  servico: 'Troca de óleo',
  data_prevista: '2026-10-01',
  mensagem: 'histórico',
  personalizado: false,
  created_at: '2026-01-01T00:00:00.000Z',
}
assert.equal(lembrete.regra_id, oleo.id)
assert.ok(lote.regras.some((item) => item.id === lembrete.regra_id && item.deleted_at === agora))

// 15-16. criação/edição unitária e duplicata semântica continuam
const service = readFileSync(new URL('../src/services/lembretes/lembretes.service.ts', import.meta.url), 'utf8')
assert.match(service, /salvarRegra\(officeId: string, input: RegraLembreteInput, id\?: string\)/)
assert.match(service, /encontrarRegraLembreteEquivalente\(office\.regras, input, id\)/)
assert.match(service, /excluirRegra\(officeId: string, id: string\)/)
assert.match(service, /Já existe uma regra equivalente/)
assert.ok(encontrarRegraLembreteEquivalente(visiveis, { ...oleo, nome_regra: '  TROCA DE ÓLEO ' }))
assert.equal(
  encontrarRegraLembreteEquivalente(lote.regras, { ...oleo, nome_regra: '  TROCA DE ÓLEO ' }),
  undefined
)

const metodoLote = service.match(
  /excluirRegrasEmLote\(officeId: string, ids: readonly string\[\]\): ResultadoExclusaoRegrasLote \{[\s\S]*?\n\s{2}\}/
)
assert.ok(metodoLote, 'excluirRegrasEmLote não encontrado no service')
assert.match(metodoLote[0], /aplicarExclusaoRegrasEmLote/)
assert.match(metodoLote[0], /localStorage\.setItem\(LEMBRETES_STORAGE_KEY/)
assert.doesNotMatch(metodoLote[0], /saveStore\(|agendarSincronizacaoLembretes|excluirRegra\(/)
assert.equal((metodoLote[0].match(/localStorage\.setItem/g) ?? []).length, 1)

// 11. Context persiste só os tombstones afetados, sem sync completo da oficina
const ctx = readFileSync(new URL('../src/context/LembretesContext.tsx', import.meta.url), 'utf8')
const ctxLote = ctx.match(
  /const excluirRegrasEmLote = useCallback\([\s\S]*?\[oficinaId, persistirRegrasAfetadas, recarregar\]/
)
assert.ok(ctxLote, 'excluirRegrasEmLote do Context não encontrado')
assert.doesNotMatch(ctxLote[0], /sincronizarLembretesCompleto/)
assert.match(ctxLote[0], /lembretesService\.excluirRegrasEmLote\(oficinaId, ids\)/)
assert.match(ctxLote[0], /persistirRegrasAfetadas\(resultado\.marcadas\)/)
assert.doesNotMatch(ctxLote[0], /excluirRegra\(|posAlteracao|Promise\.all/)
assert.match(ctx, /sincronizarExclusaoRegrasLote/)
assert.match(ctx, /persistirRegrasLembreteSelecionadas/)
assert.doesNotMatch(ctxLote[0], /carregarLembretesDoSupabase/)

// tombstones visíveis nunca entram na lista da tela
assert.match(
  service,
  /filtrarRegrasLembreteAtivas\(office\.regras\)/
)

// lote não mexe em PWA
const pwa = readFileSync(new URL('../src/lib/pwa-update.ts', import.meta.url), 'utf8')
assert.match(pwa, /SKIP_WAITING/)

console.log('OK — exclusão em lote de regras de retorno validada.')
