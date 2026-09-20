import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localIdParaUuid } from '../src/lib/local-id-uuid.ts'
import { mapearAgendamentoParaSupabase } from '../src/services/agenda/agenda-mappers.ts'
import { executarPushAgendamentos } from '../src/services/agenda/agenda-push.ts'
import { aplicarDedupClientesNoDatabase } from '../src/services/clientes/deduplicate-clientes.service.ts'
import {
  aplicarCanonicalizacaoRefs,
  canonicalizarFase1Snapshot,
  encontrarClienteLocalCorrespondente,
  gerarCustomerIdRemap,
  gerarMotorcycleIdRemap,
} from '../src/services/supabase-sync/fase1-canonicalizar-refs.ts'
import {
  limparRegistroIds,
  obterLocalIdPorUuid,
  obterUuidPorLocalId,
  registrarMapeamentoId,
} from '../src/services/supabase-sync/id-registry.ts'
import { registrarIdsCanonicosAposCanonicalizacao } from '../src/services/supabase-sync/fase1-registry-repair.ts'
import type { Agendamento } from '../src/types/agendamento.ts'
import type { Cliente } from '../src/types/cliente.ts'
import type { CraftDatabase } from '../src/types/database.ts'
import type { Moto } from '../src/types/moto.ts'
import type { OrdemServico } from '../src/types/ordem-servico.ts'
import type { DadosFase1Remotos } from '../src/services/supabase-sync/reverse-mappers.ts'

const mem = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v)
    },
    removeItem: (k: string) => {
      mem.delete(k)
    },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    },
  },
  configurable: true,
})

const OFFICE = 'fdd4e82f-2a03-4cd7-9340-b5f067d2fed5'
const CLI_ALIAS = 'cli-4d0684fa'
const MOTO_ALIAS = 'moto-9bfe2738'
const CUSTOMER_REAL = '4d0684fa-acc3-55a6-8430-97e83187d2b8'
const MOTO_REAL = '9bfe2738-d569-516f-bc87-f4abb8ce91c6'
const HASH_C = '08da8694-07f8-5a7c-9174-607b142d8af4'
const HASH_M = '2e3c80ad-b639-5f4c-bf98-bd4659b7da33'
const CLI_NOVO = 'cli-14175b13'
const MOTO_NOVA = 'moto-0e08aaea'
const CUSTOMER_B = '14175b13-f669-5d37-b081-0d1a32742359'
const MOTO_B = '0e08aaea-a07d-53b2-bc38-5ec87899c067'
const APT_ANTIGO = 'd71945fa-1111-4111-8111-aaaaaaaaaaaa'
const APT_NOVO = '4fc69f21-2222-4222-8222-bbbbbbbbbbbb'
const APT_REMOTO_A = '2a2a0944-4792-4aab-9339-cb836ada9c42'
const APT_REMOTO_B = 'b1dfdd63-319b-402d-a6dd-67b792ccc103'
const CLI_OUTRO = 'cli-nao-relacionado'
const MOTO_OUTRA = 'moto-nao-relacionada'
const APT_OUTRO = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OS_ALIAS = 'os-local-antiga'
const AGORA = '2026-09-18T23:00:00.000Z'

function cliente(id: string, telefone: string, nome: string): Cliente {
  return {
    id,
    oficina_id: OFFICE,
    office_id: OFFICE,
    nome,
    telefone,
    endereco: '',
    criado_em: '2026-09-18',
    atualizado_em: '2026-09-18',
  }
}

function moto(id: string, clienteId: string, placa: string): Moto {
  return {
    id,
    oficina_id: OFFICE,
    office_id: OFFICE,
    cliente_id: clienteId,
    marca: 'Honda',
    modelo: 'CG',
    ano: 2020,
    placa,
    cor: 'preta',
    quilometragem: 1000,
    criado_em: '2026-09-18',
    atualizado_em: '2026-09-18',
  }
}

function agendamento(
  id: string,
  clienteId: string,
  motoId: string,
  servico: string,
  extras: Partial<Agendamento> = {}
): Agendamento {
  return {
    id,
    oficina_id: OFFICE,
    office_id: OFFICE,
    data: '2026-09-18',
    horario: '10:00',
    cliente_id: clienteId,
    moto_id: motoId,
    servico,
    status: 'agendado',
    observacoes: 'nota-local',
    created_at: AGORA,
    updated_at: AGORA,
    ...extras,
  }
}

function osLocal(id: string, clienteId: string, motoId: string): OrdemServico {
  return {
    id,
    oficina_id: OFFICE,
    office_id: OFFICE,
    cliente_id: clienteId,
    moto_id: motoId,
    numero: 7,
    defeito_relatado: 'barulho',
    diagnostico: '',
    servicos_executados: '',
    pecas_utilizadas: [],
    valor_pecas: 0,
    valor_mao_obra: 0,
    desconto: 0,
    valor_total: 0,
    status: 'orcamento',
    criado_em: '2026-09-18',
    atualizado_em: '2026-09-18',
  } as OrdemServico
}

function dbLocal(parcial: Partial<CraftDatabase> = {}): CraftDatabase {
  return {
    configuracao: { id: OFFICE, office_id: OFFICE, oficina_id: OFFICE, nome: 'T', endereco: '', telefone: '' },
    clientes: [],
    motos: [],
    ordens_servico: [],
    pecas: [],
    fornecedores: [],
    movimentacoes_estoque: [],
    lancamentos: [],
    agendamentos: [],
    modelos_checklist: [],
    servicos_catalogo: [],
    perfis_comissao: [],
    proximo_numero_os: 1,
    ...parcial,
  } as CraftDatabase
}

function remotoFase1(clientes: Cliente[], motos: Moto[], os: OrdemServico[] = []): DadosFase1Remotos {
  return {
    configuracao: dbLocal().configuracao,
    clientes,
    motos,
    ordens_servico: os,
    proximo_numero_os: 1,
  }
}

function mesclarLocal(local: CraftDatabase, remoto: DadosFase1Remotos): CraftDatabase {
  const clientes = new Map(remoto.clientes.map((c) => [c.id, c]))
  for (const c of local.clientes) if (!clientes.has(c.id)) clientes.set(c.id, c)
  const motoRemap = gerarMotorcycleIdRemap(remoto.motos, local.motos)
  const motos = new Map(remoto.motos.map((m) => [m.id, m]))
  for (const m of local.motos) {
    if (motos.has(m.id) || motoRemap.get(m.id) !== m.id) continue
    motos.set(m.id, m)
  }
  const os = new Map(remoto.ordens_servico.map((o) => [o.id, o]))
  for (const o of local.ordens_servico) if (!os.has(o.id)) os.set(o.id, o)
  return {
    ...local,
    clientes: [...clientes.values()],
    motos: [...motos.values()],
    ordens_servico: [...os.values()],
  }
}

function plantarVenenoEReverseUuid(): void {
  limparRegistroIds()
  registrarMapeamentoId(CLI_ALIAS, HASH_C)
  registrarMapeamentoId(MOTO_ALIAS, HASH_M)
  registrarMapeamentoId(CUSTOMER_REAL, CUSTOMER_REAL)
  registrarMapeamentoId(MOTO_REAL, MOTO_REAL)
  registrarMapeamentoId(CLI_NOVO, CUSTOMER_B)
  registrarMapeamentoId(MOTO_NOVA, MOTO_B)
}

// A) customer alias → canônico por telefone, sem usar prefixo
const remotoCliente = cliente(CUSTOMER_REAL, '11900000001', 'Cliente tecnico')
const localAliasNomeDiferente = cliente(CLI_ALIAS, '11900000001', 'Apelido local')
assert.equal(encontrarClienteLocalCorrespondente(remotoCliente, [localAliasNomeDiferente])?.id, CLI_ALIAS)
const prefixoFalso = cliente('cli-aaaa0001', '11888888888', 'Outro')
const uuidParecido = cliente('aaaa0001-0000-4000-8000-000000000001', '11777777777', 'Distinto')
assert.equal(encontrarClienteLocalCorrespondente(uuidParecido, [prefixoFalso]), undefined)

// B) motorcycle alias → canônico por placa
const motorcycleIdRemap = gerarMotorcycleIdRemap(
  [moto(MOTO_REAL, CUSTOMER_REAL, 'TST0A00')],
  [moto(MOTO_ALIAS, CLI_ALIAS, 'TST0A00'), moto(MOTO_OUTRA, CLI_OUTRO, 'ZZZ9Z99')]
)
assert.equal(motorcycleIdRemap.get(MOTO_ALIAS), MOTO_REAL)
assert.equal(motorcycleIdRemap.get(MOTO_OUTRA), MOTO_OUTRA)
assert.equal(motorcycleIdRemap.get(MOTO_REAL), MOTO_REAL)

const customerRemapPlaca = gerarCustomerIdRemap({
  remoto: [remotoCliente],
  local: [localAliasNomeDiferente, cliente(CLI_OUTRO, '11811111111', 'Nao')],
  motorcycleIdRemap,
  motosRemotas: [moto(MOTO_REAL, CUSTOMER_REAL, 'TST0A00')],
  motosLocais: [moto(MOTO_ALIAS, CLI_ALIAS, 'TST0A00')],
})
assert.equal(customerRemapPlaca.get(CLI_ALIAS), CUSTOMER_REAL)
assert.equal(customerRemapPlaca.get(CLI_OUTRO), undefined)

plantarVenenoEReverseUuid()

const local = dbLocal({
  clientes: [
    localAliasNomeDiferente,
    cliente(CLI_NOVO, '11900000002', 'Cliente B'),
    cliente(CLI_OUTRO, '11811111111', 'Nao relacionado'),
  ],
  motos: [
    moto(MOTO_ALIAS, CLI_ALIAS, 'TST0A00'),
    moto(MOTO_NOVA, CLI_NOVO, 'BBB1B11'),
    moto(MOTO_OUTRA, CLI_OUTRO, 'ZZZ9Z99'),
  ],
  ordens_servico: [osLocal(OS_ALIAS, CLI_ALIAS, MOTO_ALIAS)],
  agendamentos: [
    agendamento(APT_ANTIGO, CLI_ALIAS, MOTO_ALIAS, 'teste tombstone 1'),
    agendamento(APT_NOVO, CLI_NOVO, MOTO_NOVA, 'CREATE novo', { horario: '11:00' }),
    agendamento(APT_OUTRO, CLI_OUTRO, MOTO_OUTRA, 'outro'),
  ],
})

const remoto = remotoFase1(
  [remotoCliente, cliente(CUSTOMER_B, '11900000002', 'Cliente B')],
  [moto(MOTO_REAL, CUSTOMER_REAL, 'TST0A00'), moto(MOTO_B, CUSTOMER_B, 'BBB1B11')]
)

const mesclado = mesclarLocal(local, remoto)
assert.ok(mesclado.clientes.some((c) => c.id === CLI_ALIAS), 'merge ainda tem o alias antes da canon')
assert.ok(mesclado.agendamentos.some((a) => a.id === APT_ANTIGO))

const canon = canonicalizarFase1Snapshot({
  local,
  remoto,
  snapshotMesclado: mesclado,
})

registrarIdsCanonicosAposCanonicalizacao({
  remotoClientes: remoto.clientes,
  remotoMotos: remoto.motos,
  customerIdRemap: canon.customerIdRemap,
  motorcycleIdRemap: canon.motorcycleIdRemap,
})

// A/B) mapas
assert.equal(canon.customerIdRemap.get(CLI_ALIAS), CUSTOMER_REAL)
assert.equal(canon.motorcycleIdRemap.get(MOTO_ALIAS), MOTO_REAL)
assert.equal(canon.customerIdRemap.get(CLI_NOVO), CUSTOMER_B)
assert.equal(canon.motorcycleIdRemap.get(MOTO_NOVA), MOTO_B)

// C) appointment antigo remapeado, sem perder dados
const antigo = canon.snapshot.agendamentos.find((a) => a.id === APT_ANTIGO)
assert.ok(antigo)
assert.equal(antigo.cliente_id, CUSTOMER_REAL)
assert.equal(antigo.moto_id, MOTO_REAL)
assert.equal(antigo.servico, 'teste tombstone 1')
assert.equal(antigo.data, '2026-09-18')
assert.equal(antigo.horario, '10:00')
assert.equal(antigo.status, 'agendado')
assert.equal(antigo.observacoes, 'nota-local')

// D) OS relacionada
const osCan = canon.snapshot.ordens_servico.find((o) => o.id === OS_ALIAS)
assert.ok(osCan)
assert.equal(osCan.cliente_id, CUSTOMER_REAL)
assert.equal(osCan.moto_id, MOTO_REAL)
assert.equal(osCan.numero, 7)
assert.equal(osCan.defeito_relatado, 'barulho')

// E) entidade já canônica não muda
assert.ok(canon.snapshot.clientes.some((c) => c.id === CUSTOMER_REAL))
assert.ok(canon.snapshot.motos.some((m) => m.id === MOTO_REAL))

// F) não relacionado permanece
const outro = canon.snapshot.agendamentos.find((a) => a.id === APT_OUTRO)
assert.ok(outro)
assert.equal(outro.cliente_id, CLI_OUTRO)
assert.equal(outro.moto_id, MOTO_OUTRA)
assert.ok(canon.snapshot.clientes.some((c) => c.id === CLI_OUTRO))
assert.ok(!canon.snapshot.clientes.some((c) => c.id === CLI_ALIAS))
assert.ok(!canon.snapshot.motos.some((m) => m.id === MOTO_ALIAS))

// 5) CREATE novo permanece
const novo = canon.snapshot.agendamentos.find((a) => a.id === APT_NOVO)
assert.ok(novo)
assert.equal(novo.servico, 'CREATE novo')
assert.equal(novo.horario, '11:00')
assert.equal(novo.cliente_id, CUSTOMER_B)
assert.equal(novo.moto_id, MOTO_B)

// mapper do appointment antigo
const rowAntigo = await mapearAgendamentoParaSupabase(antigo, OFFICE)
assert.ok(rowAntigo)
assert.equal(rowAntigo.customer_id, CUSTOMER_REAL)
assert.equal(rowAntigo.motorcycle_id, MOTO_REAL)
assert.notEqual(rowAntigo.customer_id, HASH_C)
assert.notEqual(rowAntigo.motorcycle_id, HASH_M)

const rowNovo = await mapearAgendamentoParaSupabase(novo, OFFICE)
assert.ok(rowNovo)
assert.equal(rowNovo.customer_id, CUSTOMER_B)
assert.equal(rowNovo.motorcycle_id, MOTO_B)

// G) registry 1:1 no canônico
assert.equal(obterLocalIdPorUuid(CUSTOMER_REAL), CUSTOMER_REAL)
assert.equal(obterUuidPorLocalId(CUSTOMER_REAL), CUSTOMER_REAL)
assert.equal(obterLocalIdPorUuid(MOTO_REAL), MOTO_REAL)
assert.equal(obterUuidPorLocalId(MOTO_REAL), MOTO_REAL)
assert.notEqual(obterLocalIdPorUuid(CUSTOMER_REAL), CLI_ALIAS)
assert.notEqual(obterLocalIdPorUuid(MOTO_REAL), MOTO_ALIAS)

// J) lote de 4
const loteLocal = [
  agendamento(APT_REMOTO_A, CUSTOMER_REAL, MOTO_REAL, 'rev'),
  agendamento(APT_REMOTO_B, CUSTOMER_B, MOTO_B, 'Teste realtime exclusivo 2'),
  antigo,
  novo,
]
const rowsLote = await Promise.all(
  loteLocal.map((ag) => mapearAgendamentoParaSupabase(ag, OFFICE))
)
assert.equal(rowsLote.length, 4)
for (const row of rowsLote) {
  assert.ok(row)
  assert.notEqual(row.customer_id, HASH_C)
  assert.notEqual(row.motorcycle_id, HASH_M)
  assert.ok(
    row.customer_id === CUSTOMER_REAL || row.customer_id === CUSTOMER_B,
    String(row.customer_id)
  )
  assert.ok(row.motorcycle_id === MOTO_REAL || row.motorcycle_id === MOTO_B)
}

const persistido: Record<string, unknown>[] = []
const lote = await executarPushAgendamentos({
  officeId: OFFICE,
  habilitado: true,
  online: true,
  locais: loteLocal,
  carregarRemoto: async () => ({
    ok: true,
    dados: [
      agendamento(APT_REMOTO_A, CUSTOMER_REAL, MOTO_REAL, 'rev'),
      agendamento(APT_REMOTO_B, CUSTOMER_B, MOTO_B, 'Teste realtime exclusivo 2'),
    ],
    erros: [],
  }),
  persistir: async (ags) => {
    for (const ag of ags) {
      const row = await mapearAgendamentoParaSupabase(ag, OFFICE)
      if (row) persistido.push(row)
    }
    return { ok: true, enviados: ags.length, erros: [], loteIds: ags.map((a) => a.id), loteTamanho: ags.length }
  },
  contarFila: () => 0,
  enfileirar: () => undefined,
  marcarSincronizados: () => undefined,
})
assert.equal(lote.ok, true)
assert.equal(lote.enviados, 4)
assert.equal(persistido.length, 4)
assert.ok(loteLocal.some((a) => a.id === APT_ANTIGO))
assert.ok(loteLocal.some((a) => a.id === APT_NOVO))
for (const row of persistido) {
  assert.notEqual(row.customer_id, HASH_C)
  assert.notEqual(row.motorcycle_id, HASH_M)
}

// reaplicar é idempotente
const deNovo = aplicarCanonicalizacaoRefs(
  canon.snapshot,
  canon.customerIdRemap,
  canon.motorcycleIdRemap
)
assert.equal(deNovo.agendamentos.find((a) => a.id === APT_ANTIGO)?.cliente_id, CUSTOMER_REAL)
assert.equal(deNovo.agendamentos.find((a) => a.id === APT_NOVO)?.cliente_id, CUSTOMER_B)

// H/I) CREATE/UPDATE não foram alterados
const craftSrc = readFileSync(new URL('../src/context/CraftContext.tsx', import.meta.url), 'utf8')
const craftDataSrc = readFileSync(
  new URL('../src/services/craft-data.service.ts', import.meta.url),
  'utf8'
)
const mapperSrc = readFileSync(
  new URL('../src/services/agenda/agenda-mappers.ts', import.meta.url),
  'utf8'
)
const pushSrc = readFileSync(new URL('../src/services/agenda/agenda-push.ts', import.meta.url), 'utf8')
const realtimeSrc = readFileSync(
  new URL('../src/services/sync/agenda-realtime-channel.ts', import.meta.url),
  'utf8'
)
assert.match(craftSrc, /adicionarAgendamento = useCallback/)
assert.match(craftSrc, /atualizarAgendamento = useCallback/)
assert.match(craftSrc, /concluirSaveAgenda = useCallback/)
assert.match(craftDataSrc, /stampCreate\(\s*\{ \.\.\.input, id: gerarId\(\)/)
assert.match(mapperSrc, /async function uuidFkObrigatorio/)
assert.match(pushSrc, /const paraEnviar = mesclarAgendamentos\(locais, remoto\.dados\)/)
assert.match(realtimeSrc, /export const PREFIXO_CHANNEL_AGENDA = 'boxgestor-agenda-'/)
assert.match(realtimeSrc, /table: 'appointments'/)
assert.match(realtimeSrc, /bindingsAgendaUnicos/)

assert.equal(await localIdParaUuid(CLI_ALIAS), HASH_C)
assert.equal(await localIdParaUuid(MOTO_ALIAS), HASH_M)

// ---------------------------------------------------------------------------
// Caso fiel ao aparelho (build 20260919-030205):
// sessão anterior (merge/dedup) JÁ removeu as rows alias.
// d71945fa continua com cli-/moto-. Remaps atuais NÃO varrem appointments.
// A canonicalização vigente DEVE falhar — não corrigir neste teste.
// Relação old→canonical NÃO é prefixo: vem do remoto Homolog já conhecido
// (customer 4d0684fa-acc3-... / moto 9bfe2738-d569-...) que sobreviveu.
// ---------------------------------------------------------------------------
const localSoRemotos = dbLocal({
  clientes: [cliente(CUSTOMER_REAL, '11900000001', 'Cliente tecnico')],
  motos: [moto(MOTO_REAL, CUSTOMER_REAL, 'TST0A00')],
  ordens_servico: [osLocal(OS_ALIAS, CLI_ALIAS, MOTO_ALIAS)],
  agendamentos: [
    agendamento(APT_ANTIGO, CLI_ALIAS, MOTO_ALIAS, 'teste tombstone 1'),
  ],
})
assert.equal(localSoRemotos.clientes.some((c) => c.id === CLI_ALIAS), false)
assert.equal(localSoRemotos.motos.some((m) => m.id === MOTO_ALIAS), false)
assert.equal(localSoRemotos.agendamentos[0]?.cliente_id, CLI_ALIAS)
assert.equal(localSoRemotos.agendamentos[0]?.moto_id, MOTO_ALIAS)

const remotoSoRemotos = remotoFase1(
  [cliente(CUSTOMER_REAL, '11900000001', 'Cliente tecnico')],
  [moto(MOTO_REAL, CUSTOMER_REAL, 'TST0A00')]
)
const mescladoSoRemotos = mesclarLocal(localSoRemotos, remotoSoRemotos)
assert.equal(mescladoSoRemotos.clientes.some((c) => c.id === CLI_ALIAS), false)
assert.equal(mescladoSoRemotos.motos.some((m) => m.id === MOTO_ALIAS), false)

const dedupSoRemotos = aplicarDedupClientesNoDatabase(mescladoSoRemotos)
assert.equal(dedupSoRemotos.mapaIdAntigoParaCanonico.has(CLI_ALIAS), false)
assert.equal(dedupSoRemotos.db.agendamentos[0]?.cliente_id, CLI_ALIAS)
assert.equal(dedupSoRemotos.db.agendamentos[0]?.moto_id, MOTO_ALIAS)

const canonAparelho = canonicalizarFase1Snapshot({
  local: localSoRemotos,
  remoto: remotoSoRemotos,
  snapshotMesclado: mescladoSoRemotos,
})

assert.equal(canonAparelho.customerIdRemap.has(CLI_ALIAS), false)
assert.equal(canonAparelho.customerIdRemap.get(CLI_ALIAS), undefined)
assert.equal(canonAparelho.motorcycleIdRemap.has(MOTO_ALIAS), false)
assert.equal(canonAparelho.motorcycleIdRemap.get(MOTO_ALIAS), undefined)

const aptAparelho = canonAparelho.snapshot.agendamentos.find((a) => a.id === APT_ANTIGO)
assert.ok(aptAparelho)
assert.equal(aptAparelho.cliente_id, CLI_ALIAS)
assert.equal(aptAparelho.moto_id, MOTO_ALIAS)

const rowAparelho = await mapearAgendamentoParaSupabase(aptAparelho, OFFICE)
assert.ok(rowAparelho)
assert.equal(rowAparelho.customer_id, HASH_C)
assert.equal(rowAparelho.motorcycle_id, HASH_M)

// Mesmo bootstrap, aliases ainda nas rows: remap funciona (contraste).
const localComAlias = dbLocal({
  clientes: [
    cliente(CUSTOMER_REAL, '11900000001', 'Cliente tecnico'),
    cliente(CLI_ALIAS, '11900000001', 'Cliente tecnico'),
  ],
  motos: [
    moto(MOTO_REAL, CUSTOMER_REAL, 'TST0A00'),
    moto(MOTO_ALIAS, CLI_ALIAS, 'TST0A00'),
  ],
  agendamentos: [agendamento(APT_ANTIGO, CLI_ALIAS, MOTO_ALIAS, 'teste tombstone 1')],
})
const canonComAlias = canonicalizarFase1Snapshot({
  local: localComAlias,
  remoto: remotoSoRemotos,
  snapshotMesclado: mesclarLocal(localComAlias, remotoSoRemotos),
})
assert.equal(canonComAlias.customerIdRemap.get(CLI_ALIAS), CUSTOMER_REAL)
assert.equal(canonComAlias.motorcycleIdRemap.get(MOTO_ALIAS), MOTO_REAL)
assert.equal(
  canonComAlias.snapshot.agendamentos.find((a) => a.id === APT_ANTIGO)?.cliente_id,
  CUSTOMER_REAL
)

// Dedup com Agenda no snapshot — não usar agendamentos: []
const dedupComAgenda = aplicarDedupClientesNoDatabase(
  dbLocal({
    clientes: [
      cliente(CUSTOMER_REAL, '11900000001', 'Cliente tecnico'),
      cliente(CLI_ALIAS, '11900000001', 'Cliente tecnico'),
    ],
    motos: [moto(MOTO_REAL, CUSTOMER_REAL, 'TST0A00')],
    agendamentos: [agendamento(APT_ANTIGO, CLI_ALIAS, MOTO_ALIAS, 'teste tombstone 1')],
  })
)
assert.equal(dedupComAgenda.mapaIdAntigoParaCanonico.get(CLI_ALIAS), CUSTOMER_REAL)
assert.equal(dedupComAgenda.db.agendamentos[0]?.id, APT_ANTIGO)
assert.equal(dedupComAgenda.db.agendamentos[0]?.cliente_id, CUSTOMER_REAL)
assert.equal(dedupComAgenda.db.agendamentos[0]?.servico, 'teste tombstone 1')

// ---------------------------------------------------------------------------
// Dois boots — o teste que faltava. Sem canonicalRefMap (não implementar).
// BOOT 1: aliases existem; código atual canoniza e remove as rows.
//         remaps ficam só na memória; o save persiste só o snapshot.
// BOOT 2: aliases já não estão em clientes[]/motos[]; residual com oldId.
//         código atual NÃO reconstrói o remap.
// ---------------------------------------------------------------------------
const boot1 = canonicalizarFase1Snapshot({
  local: localComAlias,
  remoto: remotoSoRemotos,
  snapshotMesclado: mesclarLocal(localComAlias, remotoSoRemotos),
})
assert.equal(boot1.customerIdRemap.get(CLI_ALIAS), CUSTOMER_REAL)
assert.equal(boot1.motorcycleIdRemap.get(MOTO_ALIAS), MOTO_REAL)
assert.equal(boot1.snapshot.agendamentos.find((a) => a.id === APT_ANTIGO)?.cliente_id, CUSTOMER_REAL)
assert.equal(boot1.snapshot.clientes.some((c) => c.id === CLI_ALIAS), false)
assert.equal(boot1.snapshot.motos.some((m) => m.id === MOTO_ALIAS), false)

const persistidoAposBoot1 = boot1.snapshot
const residualComOldId = {
  ...persistidoAposBoot1,
  agendamentos: [agendamento(APT_ANTIGO, CLI_ALIAS, MOTO_ALIAS, 'teste tombstone 1')],
}
const boot2 = canonicalizarFase1Snapshot({
  local: residualComOldId,
  remoto: remotoSoRemotos,
  snapshotMesclado: mesclarLocal(residualComOldId, remotoSoRemotos),
})
assert.equal(boot2.customerIdRemap.has(CLI_ALIAS), false)
assert.equal(boot2.motorcycleIdRemap.has(MOTO_ALIAS), false)
assert.equal(boot2.snapshot.agendamentos.find((a) => a.id === APT_ANTIGO)?.cliente_id, CLI_ALIAS)
assert.equal(boot2.snapshot.agendamentos.find((a) => a.id === APT_ANTIGO)?.moto_id, MOTO_ALIAS)

// OS remota Homolog 8cc191bc… com UUIDs + OS local mesmo id ainda com alias:
// evidência A potencial, mas o gerador atual NÃO varre OS.
const OS_REAL = '8cc191bc-98ab-595b-90b7-c73db0bae04d'
const localOsMesmoId = dbLocal({
  clientes: [cliente(CUSTOMER_REAL, '11900000001', 'Cliente tecnico')],
  motos: [moto(MOTO_REAL, CUSTOMER_REAL, 'TST0A00')],
  ordens_servico: [osLocal(OS_REAL, CLI_ALIAS, MOTO_ALIAS)],
  agendamentos: [agendamento(APT_ANTIGO, CLI_ALIAS, MOTO_ALIAS, 'teste tombstone 1')],
})
const remotoComOs = remotoFase1(
  [cliente(CUSTOMER_REAL, '11900000001', 'Cliente tecnico')],
  [moto(MOTO_REAL, CUSTOMER_REAL, 'TST0A00')],
  [osLocal(OS_REAL, CUSTOMER_REAL, MOTO_REAL)]
)
const canonOs = canonicalizarFase1Snapshot({
  local: localOsMesmoId,
  remoto: remotoComOs,
  snapshotMesclado: mesclarLocal(localOsMesmoId, remotoComOs),
})
assert.equal(canonOs.customerIdRemap.has(CLI_ALIAS), false)
assert.equal(canonOs.motorcycleIdRemap.has(MOTO_ALIAS), false)
assert.equal(canonOs.snapshot.agendamentos.find((a) => a.id === APT_ANTIGO)?.cliente_id, CLI_ALIAS)
assert.equal(canonOs.snapshot.agendamentos.find((a) => a.id === APT_ANTIGO)?.moto_id, MOTO_ALIAS)

console.log('verificar-fase1-canonicalizacao: ok')
