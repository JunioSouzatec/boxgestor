import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  chaveSemanticaRegraLembrete,
  criarRegrasPadraoSemDuplicar,
  deduplicarRegrasLembreteSeguras,
  encontrarRegraLembreteEquivalente,
  idLocalRegraPadrao,
  mesclarRegrasLembreteSemDuplicar,
  regrasLembreteSaoEquivalentes,
} from '../src/services/lembretes/regra-lembrete-identidade.ts'
import type { RegraLembrete } from '../src/types/lembrete.ts'

const base: RegraLembrete = {
  id: 'regra-a',
  office_id: 'office-1',
  nome_regra: 'Bateria',
  servico_relacionado: 'Bateria',
  categoria: 'eletrica',
  prazo_dias: 0,
  prazo_meses: 12,
  km_retorno: undefined,
  mensagem_padrao: 'Verifique a bateria.',
  ativo: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const equivalente: RegraLembrete = {
  ...base,
  id: 'regra-b',
  nome_regra: '  BATERÍA ',
  mensagem_padrao: ' Verifique   a bateria. ',
  updated_at: '2026-02-01T00:00:00.000Z',
}
assert.equal(regrasLembreteSaoEquivalentes(base, equivalente), true)
assert.equal(chaveSemanticaRegraLembrete(base), chaveSemanticaRegraLembrete(equivalente))
assert.equal(deduplicarRegrasLembreteSeguras([base, equivalente]).length, 1)
assert.equal(mesclarRegrasLembreteSemDuplicar([base], [equivalente]).length, 1)

const diferente = { ...equivalente, id: 'regra-c', prazo_meses: 6 }
assert.equal(regrasLembreteSaoEquivalentes(base, diferente), false)
assert.equal(mesclarRegrasLembreteSemDuplicar([base], [diferente]).length, 2)

const ambasReferenciadas = deduplicarRegrasLembreteSeguras(
  [base, equivalente],
  new Set([base.id, equivalente.id])
)
assert.equal(ambasReferenciadas.length, 2)
assert.equal(idLocalRegraPadrao(base), idLocalRegraPadrao(equivalente))

const padroes = [
  {
    nome_regra: base.nome_regra,
    servico_relacionado: base.servico_relacionado,
    categoria: base.categoria,
    prazo_dias: base.prazo_dias,
    prazo_meses: base.prazo_meses,
    km_retorno: base.km_retorno,
    mensagem_padrao: base.mensagem_padrao,
    observacoes_internas: base.observacoes_internas,
  },
]
const seedInicial = criarRegrasPadraoSemDuplicar(padroes, 'office-seed', base.created_at)
const seedRepetido = criarRegrasPadraoSemDuplicar(padroes, 'office-seed', base.created_at)
assert.equal(seedInicial.length, 1)
assert.deepEqual(
  seedRepetido.map((regra) => regra.id),
  seedInicial.map((regra) => regra.id)
)
const bateriaSeed = seedInicial.find((regra) => regra.nome_regra === 'Bateria')
assert.ok(bateriaSeed)
assert.equal(encontrarRegraLembreteEquivalente(seedInicial, equivalente)?.id, bateriaSeed.id)
assert.equal(encontrarRegraLembreteEquivalente(seedInicial, diferente), undefined)

const pwa = readFileSync(new URL('../src/lib/pwa-update.ts', import.meta.url), 'utf8')
const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
assert.doesNotMatch(pwa, /visibilitychange|aplicarAtualizacaoPwaSePendente/)
assert.match(pwa, /atualizarPwa\(true\)/)
assert.match(pwa, /SKIP_WAITING/)
assert.match(vite, /registerType:\s*'prompt'/)
assert.match(vite, /skipWaiting:\s*false/)
assert.match(css, /overscroll-behavior-y:\s*contain/)

console.log('OK — PWA explícita, overscroll e identidade semântica validados.')
