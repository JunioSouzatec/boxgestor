import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  aplicarLimpezaDuplicatasRegras,
  coletarIdsRegraReferenciados,
  montarInfoDuplicatasVisiveis,
} from '../src/services/lembretes/limpar-duplicatas-regras.ts'
import {
  deduplicarRegrasLembreteSeguras,
  deveSemearRegrasPadrao,
  encontrarRegraLembreteEquivalente,
  filtrarRegrasLembreteAtivas,
  marcarRegraLembreteExcluida,
  mesclarRegrasLembreteSemDuplicar,
  semearRegrasPadraoSeSeguro,
} from '../src/services/lembretes/regra-lembrete-identidade.ts'
import type { LembreteCliente, RegistroHistoricoLembrete, RegraLembrete } from '../src/types/lembrete.ts'

function regraBateria(
  parcial: Partial<RegraLembrete> & Pick<RegraLembrete, 'id'>
): RegraLembrete {
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

const agora = '2026-09-13T18:20:00.000Z'
const COPIAS = 95
const HISTORICOS = 2500

const ativas: RegraLembrete[] = Array.from({ length: COPIAS }, (_, indice) =>
  regraBateria({
    id: `bat-${String(indice).padStart(3, '0')}`,
    created_at: `2026-01-01T00:${String(indice % 60).padStart(2, '0')}:00.000Z`,
    updated_at: `2026-02-01T00:${String(indice % 60).padStart(2, '0')}:00.000Z`,
  })
)
const tombstones: RegraLembrete[] = [
  marcarRegraLembreteExcluida(regraBateria({ id: 'bat-old-1' }), '2026-08-01T00:00:00.000Z'),
  marcarRegraLembreteExcluida(regraBateria({ id: 'bat-old-2' }), '2026-08-02T00:00:00.000Z'),
]
const oleo: RegraLembrete = {
  ...regraBateria({ id: 'regra-oleo' }),
  nome_regra: 'Troca de óleo',
  servico_relacionado: 'Troca de óleo',
  categoria: 'lubrificacao',
  prazo_dias: 90,
  prazo_meses: 0,
  mensagem_padrao: 'óleo',
}

const historicos: RegistroHistoricoLembrete[] = Array.from({ length: HISTORICOS }, (_, indice) => ({
  id: `hist-${indice}`,
  data: '2026-03-01T00:00:00.000Z',
  tipo_acao: 'observacao',
  canal: 'manual',
  responsavel: 'Sistema',
  status_apos: 'pendente',
  observacao: `hist ${indice}`,
}))
const lembrete: LembreteCliente = {
  id: 'lem-1',
  office_id: 'office-1',
  cliente_id: 'cli-1',
  moto_id: 'moto-1',
  regra_id: ativas[94]!.id,
  servico: 'Bateria',
  data_prevista: '2026-10-01',
  mensagem: 'volume',
  created_at: '2026-01-01T00:00:00.000Z',
  historico: historicos,
}

const remoto = [...ativas, ...tombstones, oleo]
const localParcial = [ativas[0]!, oleo]
const aposPull = mesclarRegrasLembreteSemDuplicar(localParcial, remoto)

// A. pull preserva todos os IDs ativos
assert.equal(aposPull.filter((item) => item.id.startsWith('bat-') && !item.deleted_at).length, COPIAS)
assert.equal(new Set(aposPull.map((item) => item.id)).size, aposPull.length)

// B. tombstones permanecem
assert.equal(aposPull.find((item) => item.id === 'bat-old-1')?.deleted_at, '2026-08-01T00:00:00.000Z')
assert.equal(aposPull.find((item) => item.id === 'bat-old-2')?.deleted_at, '2026-08-02T00:00:00.000Z')

// C. listarRegras() mostra somente 1 “Bateria”
const visiveis = deduplicarRegrasLembreteSeguras(
  filtrarRegrasLembreteAtivas(aposPull),
  coletarIdsRegraReferenciados([lembrete])
)
assert.equal(visiveis.filter((item) => item.nome_regra === 'Bateria').length, 1)
assert.equal(visiveis.find((item) => item.nome_regra === 'Bateria')?.id, 'bat-094')

// D. info de duplicatas usa o RAW e informa 95
const infos = montarInfoDuplicatasVisiveis(
  visiveis,
  aposPull,
  coletarIdsRegraReferenciados([lembrete])
)
const infoBateria = infos.find((item) => item.nome === 'Bateria')
assert.ok(infoBateria)
assert.equal(infoBateria.totalAtivas, COPIAS)
assert.equal(infoBateria.ambiguo, false)
assert.equal(
  infos.some((item) => item.nome === 'Troca de óleo'),
  false
)

// E/F/G. limpeza recebe os 95 IDs, fica 1 ativa, demais deleted_at
const limpeza = aplicarLimpezaDuplicatasRegras(
  aposPull,
  infoBateria.regraId,
  coletarIdsRegraReferenciados([lembrete]),
  agora
)
assert.equal(limpeza.ok, true)
assert.equal(limpeza.canonicaId, 'bat-094')
assert.equal(limpeza.arquivadas.length, COPIAS - 1)
assert.equal(
  filtrarRegrasLembreteAtivas(limpeza.regras).filter((item) => item.nome_regra === 'Bateria').length,
  1
)
assert.ok(
  limpeza.arquivadas.every(
    (id) => limpeza.regras.find((item) => item.id === id)?.deleted_at === agora
  )
)
assert.equal(limpeza.regras.find((item) => item.id === 'bat-094')?.deleted_at ?? null, null)
assert.equal(lembrete.historico?.length, HISTORICOS)
assert.equal(lembrete.regra_id, 'bat-094')

// H. F5/pull com remoto antigo ativo não recria as 94
const remotoAntigoAtivo = remoto.map((item) => ({ ...item, deleted_at: undefined }))
const aposF5 = mesclarRegrasLembreteSemDuplicar(limpeza.regras, remotoAntigoAtivo)
assert.equal(
  filtrarRegrasLembreteAtivas(aposF5).filter((item) => item.nome_regra === 'Bateria').length,
  1
)
assert.equal(aposF5.filter((item) => item.nome_regra === 'Bateria').length, COPIAS + 2)
assert.ok(aposF5.every((item) => item.id !== undefined))

// I. criação manual de outra Bateria continua bloqueada
assert.ok(encontrarRegraLembreteEquivalente(limpeza.regras, ativas[0]!))
assert.ok(encontrarRegraLembreteEquivalente(aposF5, ativas[0]!))
assert.equal(encontrarRegraLembreteEquivalente(limpeza.regras, ativas[0]!)?.id, 'bat-094')

// J. seed não adiciona nova cópia
assert.equal(deveSemearRegrasPadrao(aposF5), false)
assert.equal(semearRegrasPadraoSeSeguro([], 'office-1', aposF5, agora), aposF5)

// K. visão operacional deduplicada não multiplica lembretes
const regrasOperacionais = deduplicarRegrasLembreteSeguras(filtrarRegrasLembreteAtivas(aposPull))
assert.equal(regrasOperacionais.filter((item) => item.nome_regra === 'Bateria').length, 1)
assert.equal(regrasOperacionais.length, 2)

const identidade = readFileSync(
  new URL('../src/services/lembretes/regra-lembrete-identidade.ts', import.meta.url),
  'utf8'
)
const mergeFn = identidade.match(
  /export function mesclarRegrasLembreteSemDuplicar\([\s\S]*?\n\}/
)
assert.ok(mergeFn)
assert.doesNotMatch(mergeFn[0], /deduplicarRegrasLembreteSeguras/)
assert.match(mergeFn[0], /resolverRegraLembreteComTombstone/)

const service = readFileSync(
  new URL('../src/services/lembretes/lembretes.service.ts', import.meta.url),
  'utf8'
)
assert.match(service, /export function obterDadosOfficeLembretes/)
assert.match(service, /regras: office\.regras\.slice\(\)/)
const obterInicio = service.indexOf('export function obterDadosOfficeLembretes')
const obterBloco = service.slice(obterInicio, obterInicio + 450)
assert.doesNotMatch(obterBloco, /deduplicarRegrasLembreteSeguras/)

const listarInicio = service.indexOf('listarRegras(officeId: string)')
assert.ok(listarInicio >= 0)
const listarBloco = service.slice(listarInicio, listarInicio + 500)
assert.match(listarBloco, /deduplicarRegrasLembreteSeguras/)

const criarInicio = service.indexOf('criarLembretesDeRegras(')
assert.ok(criarInicio >= 0)
const criarBloco = service.slice(criarInicio, criarInicio + 1200)
assert.match(criarBloco, /regrasOperacionais = deduplicarRegrasLembreteSeguras/)

const infoInicio = service.indexOf('listarInfoDuplicatasRegras(')
assert.ok(infoInicio >= 0)
const infoBloco = service.slice(infoInicio, infoInicio + 500)
assert.match(infoBloco, /office\.regras/)
assert.match(infoBloco, /listarRegras\(officeId\)/)

console.log('OK — cache preserva IDs de duplicatas; UI/operação continuam deduplicados.')
