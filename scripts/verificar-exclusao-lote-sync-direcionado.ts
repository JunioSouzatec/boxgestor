import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  aplicarExclusaoRegrasEmLote,
  selecionarRegrasParaPersistenciaDirecionada,
} from '../src/services/lembretes/excluir-regras-lote.ts'
import {
  aplicarLimpezaDuplicatasRegras,
  coletarIdsRegraReferenciados,
  escolherRegraCanonicaDuplicatas,
  mensagemConfirmacaoLimpezaDuplicatas,
} from '../src/services/lembretes/limpar-duplicatas-regras.ts'
import {
  filtrarRegrasLembreteAtivas,
  filtrarRegrasParaNaoRessuscitar,
  mesclarRegrasLembreteSemDuplicar,
} from '../src/services/lembretes/regra-lembrete-identidade.ts'
import {
  MSG_EXCLUSAO_LOTE_PENDENTE,
  sincronizarExclusaoRegrasLote,
} from '../src/services/lembretes/sincronizar-exclusao-regras-lote.ts'
import type { LembreteCliente, RegistroHistoricoLembrete, RegraLembrete } from '../src/types/lembrete.ts'
import type { ResultadoPersistenciaLembretes } from '../src/services/lembretes/supabase-lembretes.persistence.ts'

function regra(
  parcial: Partial<RegraLembrete> & Pick<RegraLembrete, 'id' | 'nome_regra'>
): RegraLembrete {
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

function persistOk(enviados: number): ResultadoPersistenciaLembretes {
  return { ok: true, erros: [], enviados: { regras: enviados, lembretes: 0, historico: 0 } }
}

const agora = '2026-09-13T18:00:00.000Z'
const persistencia = readFileSync(
  new URL('../src/services/lembretes/supabase-lembretes.persistence.ts', import.meta.url),
  'utf8'
)
const ctx = readFileSync(new URL('../src/context/LembretesContext.tsx', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/pages/LembretesPage.tsx', import.meta.url), 'utf8')
const persistFn = persistencia.match(
  /export async function persistirRegrasLembreteSelecionadas[\s\S]*?\nexport async function contarLembretesNoSupabase/
)
assert.ok(persistFn, 'persistirRegrasLembreteSelecionadas não encontrada')

const oleo = regra({ id: 'regra-oleo', nome_regra: 'Troca de óleo' })
const bateria = regra({
  id: 'regra-bateria',
  nome_regra: 'Bateria',
  categoria: 'eletrica',
  prazo_dias: 0,
  prazo_meses: 12,
})
const filtro = regra({ id: 'regra-filtro', nome_regra: 'Filtro de ar' })
const store = [oleo, bateria, filtro]

// A — exclusão normal de 1 regra
const uma = aplicarExclusaoRegrasEmLote(store, [oleo.id], agora)
assert.deepEqual(uma.resultado.marcadas, [oleo.id])
assert.equal(uma.regras.find((item) => item.id === oleo.id)?.deleted_at, agora)
assert.equal(uma.regras.find((item) => item.id === bateria.id)?.deleted_at ?? null, null)
const envioUma = selecionarRegrasParaPersistenciaDirecionada(uma.regras, uma.resultado.marcadas)
assert.equal(envioUma.length, 1)
assert.equal(envioUma[0]?.id, oleo.id)
assert.ok(envioUma[0]?.deleted_at)

// B — exclusão em lote de N regras
const lote = aplicarExclusaoRegrasEmLote(store, [oleo.id, bateria.id], agora)
assert.deepEqual(lote.resultado.marcadas, [oleo.id, bateria.id])
const envioLote = selecionarRegrasParaPersistenciaDirecionada(lote.regras, lote.resultado.marcadas)
assert.equal(envioLote.length, 2)
assert.ok(envioLote.every((item) => item.deleted_at === agora))
assert.equal(envioLote.some((item) => item.id === filtro.id), false)

// C — operação remota envia somente as regras afetadas
let regrasEnviadas: RegraLembrete[] = []
const syncC = await sincronizarExclusaoRegrasLote('office-1', envioLote, {
  persistirSelecionadas: async (_officeId, regrasSel) => {
    regrasEnviadas = regrasSel
    return persistOk(regrasSel.length)
  },
  enfileirarRetry: () => {
    throw new Error('retry não deveria rodar em sucesso')
  },
  estaOnline: () => true,
})
assert.equal(syncC.sincronizado, true)
assert.deepEqual(
  regrasEnviadas.map((item) => item.id),
  [oleo.id, bateria.id]
)

// D + volume: não executa pull completo de históricos para liberar o botão
const VOLUME_REGRAS = 603
const VOLUME_HISTORICO = 5581
const regrasVolume: RegraLembrete[] = Array.from({ length: VOLUME_REGRAS }, (_, indice) =>
  regra({
    id: `regra-vol-${indice}`,
    nome_regra: indice < 6 ? 'Bateria' : `Regra ${indice}`,
    created_at: `2026-01-01T00:${String(indice % 60).padStart(2, '0')}:00.000Z`,
    updated_at: `2026-01-01T00:${String(indice % 60).padStart(2, '0')}:00.000Z`,
  })
)
const historicosVolume: RegistroHistoricoLembrete[] = Array.from(
  { length: VOLUME_HISTORICO },
  (_, indice) => ({
    id: `hist-${indice}`,
    data: '2026-01-02T00:00:00.000Z',
    tipo_acao: 'observacao',
    canal: 'manual',
    responsavel: 'Sistema',
    status_apos: 'pendente',
    observacao: `hist ${indice}`,
  })
)
const lembretesVolume: LembreteCliente[] = [
  {
    id: 'lem-vol',
    office_id: 'office-1',
    cliente_id: 'cli-1',
    moto_id: 'moto-1',
    regra_id: regrasVolume[0]!.id,
    servico: 'Bateria',
    data_prevista: '2026-10-01',
    mensagem: 'volume',
    created_at: '2026-01-01T00:00:00.000Z',
    historico: historicosVolume,
  },
]

let historicosPercorridos = 0
let pullCompletoChamado = false
const idsVolume = regrasVolume.slice(0, 8).map((item) => item.id)
const loteVolume = aplicarExclusaoRegrasEmLote(regrasVolume, idsVolume, agora)
const envioVolume = selecionarRegrasParaPersistenciaDirecionada(
  loteVolume.regras,
  loteVolume.resultado.marcadas
)
assert.equal(envioVolume.length, 8)
assert.equal(envioVolume.length < VOLUME_REGRAS, true)

const inicioVolume = Date.now()
const syncVolume = await sincronizarExclusaoRegrasLote('office-1', envioVolume, {
  persistirSelecionadas: async (_officeId, regrasSel) => {
    assert.equal(regrasSel.length, 8)
    assert.doesNotMatch(JSON.stringify(regrasSel), /hist-/)
    return persistOk(regrasSel.length)
  },
  enfileirarRetry: () => {
    throw new Error('volume não deveria enfileirar em sucesso')
  },
  estaOnline: () => true,
})
const elapsedVolume = Date.now() - inicioVolume
assert.equal(syncVolume.sincronizado, true)
assert.equal(historicosPercorridos, 0)
assert.equal(pullCompletoChamado, false)
assert.ok(elapsedVolume < 200, `exclusão de volume esperou demais: ${elapsedVolume}ms`)
assert.equal(lembretesVolume[0]?.historico?.length, VOLUME_HISTORICO)

// Prova extra: o caminho errado (mapear 5581 históricos) existiria se o lote esperasse o pull
async function caminhoErradoPullHistorico(): Promise<void> {
  pullCompletoChamado = true
  for (const registro of historicosVolume) {
    historicosPercorridos += 1
    await Promise.resolve(registro.id)
  }
}
assert.equal(typeof caminhoErradoPullHistorico, 'function')

// E — botão sai de “Excluindo...” em sucesso
const syncSucesso = await sincronizarExclusaoRegrasLote('office-1', envioUma, {
  persistirSelecionadas: async () => persistOk(1),
  enfileirarRetry: () => undefined,
  estaOnline: () => true,
})
assert.equal(syncSucesso.sincronizado, true)
assert.match(page, /setExcluindoRegrasLote\(false\)/)
assert.match(page, /finally \{/)

// F — botão sai de “Excluindo...” em timeout/falha
let retryTimeout = 0
const syncTimeout = await sincronizarExclusaoRegrasLote('office-1', envioUma, {
  persistirSelecionadas: () =>
    new Promise(() => {
      /* remoto nunca confirma */
    }),
  enfileirarRetry: () => {
    retryTimeout += 1
  },
  estaOnline: () => true,
  timeoutMs: 40,
})
assert.equal(syncTimeout.sincronizado, false)
assert.equal(syncTimeout.timeout, true)
assert.equal(syncTimeout.pendente, true)
assert.equal(retryTimeout, 1)
assert.match(page, /MSG_EXCLUSAO_LOTE_PENDENTE/)
assert.equal(
  MSG_EXCLUSAO_LOTE_PENDENTE,
  'Exclusão registrada neste dispositivo. A sincronização ficará pendente.'
)

const syncFalha = await sincronizarExclusaoRegrasLote('office-1', envioUma, {
  persistirSelecionadas: async () => ({
    ok: false,
    erros: [{ entidade: 'Regra de lembrete', mensagem: 'rede' }],
    enviados: { regras: 0, lembretes: 0, historico: 0 },
  }),
  enfileirarRetry: () => {
    retryTimeout += 1
  },
  estaOnline: () => true,
})
assert.equal(syncFalha.sincronizado, false)
assert.equal(syncFalha.pendente, true)

// G — tombstone local permanece em falha
assert.equal(uma.regras.find((item) => item.id === oleo.id)?.deleted_at, agora)
assert.equal(filtrarRegrasLembreteAtivas(uma.regras).some((item) => item.id === oleo.id), false)

// H — retry posterior consegue publicar
let retryOffline = 0
const syncOffline = await sincronizarExclusaoRegrasLote('office-1', envioUma, {
  persistirSelecionadas: async () => {
    throw new Error('não deveria persistir offline')
  },
  enfileirarRetry: () => {
    retryOffline += 1
  },
  estaOnline: () => false,
})
assert.equal(syncOffline.pendente, true)
assert.equal(retryOffline, 1)
const syncRetry = await sincronizarExclusaoRegrasLote('office-1', envioUma, {
  persistirSelecionadas: async (_officeId, regrasSel) => persistOk(regrasSel.length),
  enfileirarRetry: () => {
    throw new Error('retry de sucesso não enfileira de novo')
  },
  estaOnline: () => true,
})
assert.equal(syncRetry.sincronizado, true)

// I — F5 não ressuscita ID tombstonado
const aposF5 = mesclarRegrasLembreteSemDuplicar(uma.regras, [oleo, bateria, filtro])
assert.equal(aposF5.find((item) => item.id === oleo.id)?.deleted_at, agora)
assert.equal(filtrarRegrasLembreteAtivas(aposF5).some((item) => item.id === oleo.id), false)

// J — segunda sessão não ressuscita
const sessao2 = mesclarRegrasLembreteSemDuplicar([oleo, bateria, filtro], uma.regras)
assert.equal(sessao2.find((item) => item.id === oleo.id)?.deleted_at, agora)
assert.equal(
  filtrarRegrasParaNaoRessuscitar([oleo], [{ id: 'uuid-oleo', local_id: oleo.id, deleted_at: agora }])
    .length,
  0
)

// K/L/M — limpeza de grupo com 10+ duplicatas, 1 ativa, demais deleted_at
const copiasBateria = Array.from({ length: 12 }, (_, indice) =>
  regra({
    id: `bat-${String(indice).padStart(2, '0')}`,
    nome_regra: 'Bateria',
    categoria: 'eletrica',
    prazo_dias: 0,
    prazo_meses: 12,
    mensagem_padrao: 'msg Bateria',
    created_at: `2026-02-01T00:00:${String(indice).padStart(2, '0')}.000Z`,
    updated_at: `2026-02-01T00:00:${String(indice).padStart(2, '0')}.000Z`,
  })
)
const outras = [filtro]
const limpeza = aplicarLimpezaDuplicatasRegras(
  [...copiasBateria, ...outras],
  'bat-11',
  new Set(),
  agora
)
assert.equal(limpeza.ok, true)
assert.equal(limpeza.canonicaId, 'bat-11')
assert.equal(limpeza.arquivadas.length, 11)
assert.equal(filtrarRegrasLembreteAtivas(limpeza.regras).filter((item) => item.nome_regra === 'Bateria').length, 1)
assert.equal(limpeza.regras.find((item) => item.id === 'bat-11')?.deleted_at ?? null, null)
assert.ok(
  limpeza.arquivadas.every((id) => limpeza.regras.find((item) => item.id === id)?.deleted_at === agora)
)
assert.equal(limpeza.regras.find((item) => item.id === filtro.id)?.deleted_at ?? null, null)

const escolhaAmbiguo = escolherRegraCanonicaDuplicatas(copiasBateria, new Set(['bat-01', 'bat-02']))
assert.equal(escolhaAmbiguo.ambiguo, true)
const limpezaAmbigua = aplicarLimpezaDuplicatasRegras(
  copiasBateria,
  'bat-01',
  new Set(['bat-01', 'bat-02']),
  agora
)
assert.equal(limpezaAmbigua.ok, false)
assert.equal(limpezaAmbigua.motivo, 'ambigua')
assert.equal(filtrarRegrasLembreteAtivas(limpezaAmbigua.regras).length, 12)

const confirmacao = mensagemConfirmacaoLimpezaDuplicatas('Bateria', 95)
assert.match(confirmacao, /Esta regra possui 95 cópias antigas/)
assert.match(confirmacao, /1 será mantida ativa e 94 serão arquivadas/)
assert.match(confirmacao, /Lembretes e históricos existentes serão preservados/)

// N — históricos continuam existentes
const historicoOleo: LembreteCliente = {
  id: 'lem-oleo',
  office_id: 'office-1',
  cliente_id: 'cli-1',
  moto_id: 'moto-1',
  regra_id: oleo.id,
  servico: 'Troca de óleo',
  data_prevista: '2026-10-01',
  mensagem: 'histórico',
  created_at: '2026-01-01T00:00:00.000Z',
  historico: [
    {
      id: 'h1',
      data: agora,
      tipo_acao: 'observacao',
      canal: 'manual',
      responsavel: 'Sistema',
      status_apos: 'pendente',
      observacao: 'ok',
    },
  ],
}
assert.equal(historicoOleo.regra_id, oleo.id)
assert.equal(historicoOleo.historico?.length, 1)
assert.equal(coletarIdsRegraReferenciados([historicoOleo]).has(oleo.id), true)

// O — nenhum hard delete
assert.doesNotMatch(persistFn[0], /\.delete\(/)
assert.doesNotMatch(persistFn[0], /lembretes_historico/)
assert.doesNotMatch(persistFn[0], /carregarLembretesDoSupabase/)
assert.match(persistFn[0], /upsert/)
assert.match(persistFn[0], /mapearRegraLembreteParaSupabase/)
assert.match(persistFn[0], /selecionarRegrasSegurasParaPersistir/)
assert.match(persistFn[0], /montarLinhasRegraComIdsRemotosResolvidos/)
assert.match(persistFn[0], /buscarLinhasRemotasPorLocalIds/)

const ctxLote = ctx.match(
  /const excluirRegrasEmLote = useCallback\([\s\S]*?\[oficinaId, persistirRegrasAfetadas, recarregar\]/
)
assert.ok(ctxLote)
assert.doesNotMatch(ctxLote[0], /sincronizarLembretesCompleto/)
assert.match(ctx, /persistirRegrasLembreteSelecionadas/)
assert.match(ctx, /sincronizarExclusaoRegrasLote/)
assert.match(page, /Limpar duplicadas/)
assert.match(page, /— \$\{infoDuplicatas\.totalAtivas\} cópias/)
assert.doesNotMatch(ctxLote[0], /Promise\.all\(/)

console.log('OK — exclusão direcionada e limpeza explícita de duplicatas validadas.')
