import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localIdParaUuid } from '../src/lib/local-id-uuid.ts'
import {
  aplicarLimpezaDuplicatasRegras,
  coletarIdsRegraReferenciados,
} from '../src/services/lembretes/limpar-duplicatas-regras.ts'
import {
  agruparLinhasRemotasPorLocalId,
  deveAplicarTombstoneEmTodasRemotas,
  resolverIdsRemotosRegraLote,
} from '../src/services/lembretes/resolver-id-remoto-regra-lote.ts'
import type { LembreteCliente, RegistroHistoricoLembrete, RegraLembrete } from '../src/types/lembrete.ts'

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

const agora = '2026-09-13T19:00:00.000Z'
const persistencia = readFileSync(
  new URL('../src/services/lembretes/supabase-lembretes.persistence.ts', import.meta.url),
  'utf8'
)
const persistFn = persistencia.match(
  /export async function persistirRegrasLembreteSelecionadas[\s\S]*?\nexport async function contarLembretesNoSupabase/
)
assert.ok(persistFn, 'persistirRegrasLembreteSelecionadas não encontrada')
assert.match(persistFn[0], /buscarLinhasRemotasPorLocalIds/)
assert.match(persistFn[0], /montarLinhasRegraComIdsRemotosResolvidos/)
assert.match(persistFn[0], /selecionarRegrasSegurasParaPersistir/)
assert.match(persistFn[0], /onConflict: 'id'/)
assert.match(persistencia, /buscarLinhasRemotasPorLocalIds/)
assert.match(persistencia, /\.in\('local_id', localIds\)/)
assert.doesNotMatch(persistFn[0], /\.in\('id', uuids\)/)
assert.doesNotMatch(persistFn[0], /lembretes_historico/)
assert.doesNotMatch(persistFn[0], /\.delete\(/)
assert.doesNotMatch(persistFn[0], /regra_id/)

const persistCompleto = persistencia.match(
  /export async function persistirLembretesNoSupabase[\s\S]*?\n\/\*\* Uma leitura/
)
assert.ok(persistCompleto, 'persistirLembretesNoSupabase não encontrado')
assert.match(persistCompleto[0], /montarLinhasRegraComIdsRemotosResolvidos/)
assert.match(persistCompleto[0], /selecionarRegrasSegurasParaPersistir/)
assert.match(persistCompleto[0], /agruparLinhasRemotasPorLocalId/)
assert.match(persistCompleto[0], /onConflict: 'id'/)
assert.doesNotMatch(persistCompleto[0], /\.in\('id', uuids\)/)

// A — id remoto = UUID(local_id) → atualiza a mesma linha
const localA = 'regra-normal-a'
const uuidA = await localIdParaUuid(localA)
const tombA = { id: uuidA, local_id: localA, deleted_at: null }
const resolucaoA = resolverIdsRemotosRegraLote([tombA], uuidA)
assert.deepEqual(resolucaoA.remoteIds, [uuidA])
assert.equal(resolucaoA.nova, false)
assert.equal(resolucaoA.anomalo, false)

// B — legado: id remoto != UUID(local_id) → reusa o UUID existente, sem sombra
const localB = 'teste-dup-controlada-01'
const uuidHashB = await localIdParaUuid(localB)
const uuidLegadoB = '8793a6f8-26cc-48c2-b4fd-74a7315cad57'
assert.notEqual(uuidLegadoB, uuidHashB)
const resolucaoB = resolverIdsRemotosRegraLote(
  [{ id: uuidLegadoB, local_id: localB, deleted_at: null }],
  uuidHashB
)
assert.deepEqual(resolucaoB.remoteIds, [uuidLegadoB])
assert.equal(resolucaoB.remoteIds.includes(uuidHashB), false)
assert.equal(resolucaoB.nova, false)
assert.equal(resolucaoB.anomalo, false)

// C — várias linhas remotas com o mesmo local_id → tombstone em todas, nenhuma nova
const localC = 'teste-dup-controlada-02'
const uuidHashC = await localIdParaUuid(localC)
const remotasC = [
  { id: '5b0b234a-14bf-46d3-b7c1-d1fe35a40905', local_id: localC, deleted_at: null },
  { id: uuidHashC, local_id: localC, deleted_at: null },
]
const tombC = regra({ id: localC, nome_regra: 'Multi', deleted_at: agora })
const resolucaoC = resolverIdsRemotosRegraLote(remotasC, uuidHashC)
assert.equal(deveAplicarTombstoneEmTodasRemotas(tombC, remotasC), true)
assert.equal(resolucaoC.anomalo, true)
assert.equal(resolucaoC.nova, false)
assert.equal(resolucaoC.remoteIds.length, 2)
assert.ok(resolucaoC.remoteIds.includes(remotasC[0]!.id))
assert.ok(resolucaoC.remoteIds.includes(uuidHashC))
assert.equal(resolucaoC.remoteIds.some((id) => id !== remotasC[0]!.id && id !== uuidHashC), false)

const mapaC = agruparLinhasRemotasPorLocalId([
  ...remotasC,
  { id: 'outra', local_id: 'outro-local', deleted_at: null },
])
assert.equal(mapaC.get(localC)?.length, 2)
assert.equal(mapaC.get('outro-local')?.length, 1)

// D — local_id inexistente → cria com UUID determinístico
const localD = 'regra-nova-d'
const uuidD = await localIdParaUuid(localD)
const resolucaoD = resolverIdsRemotosRegraLote([], uuidD)
assert.deepEqual(resolucaoD.remoteIds, [uuidD])
assert.equal(resolucaoD.nova, true)
assert.equal(resolucaoD.anomalo, false)

// E — 95 duplicatas com local_ids distintos: 1 linha remota cada, sem sombra
const agoraLimpeza = agora
const copias = Array.from({ length: 95 }, (_, indice) =>
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
const limpeza = aplicarLimpezaDuplicatasRegras(copias, 'bat-94', new Set(), agoraLimpeza)
assert.equal(limpeza.ok, true)
assert.equal(limpeza.arquivadas.length, 94)
const idsUpsert: string[] = []
for (const arquivada of limpeza.arquivadas) {
  const localId = arquivada
  const uuid = await localIdParaUuid(localId)
  const resolucao = resolverIdsRemotosRegraLote(
    [{ id: uuid, local_id: localId, deleted_at: null }],
    uuid
  )
  assert.deepEqual(resolucao.remoteIds, [uuid])
  assert.equal(resolucao.nova, false)
  idsUpsert.push(...resolucao.remoteIds)
}
assert.equal(idsUpsert.length, 94)
assert.equal(new Set(idsUpsert).size, 94)
assert.equal(limpeza.regras.find((item) => item.id === 'bat-94')?.deleted_at ?? null, null)

// F — históricos e regra_id não entram no payload direcionado
const historicos: RegistroHistoricoLembrete[] = Array.from({ length: 3 }, (_, indice) => ({
  id: `hist-${indice}`,
  data: agora,
  tipo_acao: 'observacao',
  canal: 'manual',
  responsavel: 'Sistema',
  status_apos: 'pendente',
}))
const lembrete: LembreteCliente = {
  id: 'lem-1',
  office_id: 'office-1',
  cliente_id: 'cli-1',
  moto_id: 'moto-1',
  regra_id: uuidLegadoB,
  servico: 'Legado',
  data_prevista: '2026-10-01',
  mensagem: 'fk',
  created_at: '2026-01-01T00:00:00.000Z',
  historico: historicos,
}
assert.equal(lembrete.regra_id, uuidLegadoB)
assert.equal(lembrete.historico?.length, 3)
assert.equal(coletarIdsRegraReferenciados([lembrete]).has(uuidLegadoB), true)
assert.doesNotMatch(persistFn[0], /mapearLembrete/)
assert.doesNotMatch(persistFn[0], /mapearHistorico/)
assert.doesNotMatch(persistFn[0], /from\('lembretes'\)/)
assert.doesNotMatch(persistFn[0], /from\('lembretes_historico'\)/)

console.log('OK — lookup de ID remoto no lote direcionado validado (A–F).')
