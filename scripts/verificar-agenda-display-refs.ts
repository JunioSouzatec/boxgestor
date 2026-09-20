/**
 * Exibição Agenda: resolve alias local ↔ UUID remoto via registry (somente leitura).
 * Executar: npx tsx --tsconfig tsconfig.app.json scripts/verificar-agenda-display-refs.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  rotuloClienteAgenda,
  rotuloVeiculoAgenda,
  resolverEntidadeLocalPorRef,
} from '../src/services/agenda/agenda-display-refs.ts'
import {
  limparRegistroIds,
  obterLocalIdPorUuid,
  registrarMapeamentoId,
} from '../src/services/supabase-sync/id-registry.ts'

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

/** Fixtures sintéticas — não usar IDs/dados reais de Production. */
const CLI_ALIAS = 'cli-display-alias-a'
const CLI_UUID = '11111111-2222-4333-8444-555555555501'
const MOTO_ALIAS = 'moto-display-alias-a'
const MOTO_UUID = '11111111-2222-4333-8444-555555555502'
const CARRO_ALIAS = 'carro-display-alias-a'
const CARRO_UUID = '11111111-2222-4333-8444-555555555503'
const NOME = 'Cliente Fixture Display'
const VEICULO_LABEL = 'Marca Fixture Modelo X (ABC1D23)'

const clienteAlias = { id: CLI_ALIAS, nome: NOME }
const clienteUuid = { id: CLI_UUID, nome: NOME }
const motoAlias = {
  id: MOTO_ALIAS,
  marca: 'Marca Fixture',
  modelo: 'Modelo X',
  placa: 'ABC1D23',
}
const motoUuid = {
  id: MOTO_UUID,
  marca: 'Marca Fixture',
  modelo: 'Modelo X',
  placa: 'ABC1D23',
}
const carroAlias = {
  id: CARRO_ALIAS,
  marca: 'Marca Fixture',
  modelo: 'Modelo X',
  placa: 'ABC1D23',
}
const carroUuid = {
  id: CARRO_UUID,
  marca: 'Marca Fixture',
  modelo: 'Modelo X',
  placa: 'ABC1D23',
}

function resetRegistry(): void {
  limparRegistroIds()
  mem.clear()
}

// --- CLIENTE A: alias -> alias ---
resetRegistry()
assert.equal(rotuloClienteAgenda(CLI_ALIAS, [clienteAlias]), NOME)
assert.equal(resolverEntidadeLocalPorRef(CLI_ALIAS, [clienteAlias])?.id, CLI_ALIAS)

// --- CLIENTE B: UUID -> alias via registry ---
resetRegistry()
registrarMapeamentoId(CLI_ALIAS, CLI_UUID, 'verificar-agenda-display-refs')
assert.equal(obterLocalIdPorUuid(CLI_UUID), CLI_ALIAS)
assert.equal(rotuloClienteAgenda(CLI_UUID, [clienteAlias]), NOME)
assert.equal(resolverEntidadeLocalPorRef(CLI_UUID, [clienteAlias])?.id, CLI_ALIAS)

// --- CLIENTE C: UUID -> UUID direto ---
resetRegistry()
assert.equal(rotuloClienteAgenda(CLI_UUID, [clienteUuid]), NOME)
assert.equal(resolverEntidadeLocalPorRef(CLI_UUID, [clienteUuid])?.id, CLI_UUID)

// --- CLIENTE D: não encontrado -> "—" ---
resetRegistry()
assert.equal(rotuloClienteAgenda(CLI_UUID, [clienteAlias]), '—')
assert.equal(resolverEntidadeLocalPorRef(CLI_UUID, [clienteAlias]), undefined)

// --- VEÍCULO (moto) A: alias -> alias ---
resetRegistry()
assert.equal(rotuloVeiculoAgenda(MOTO_ALIAS, [motoAlias]), VEICULO_LABEL)

// --- VEÍCULO (moto) B: UUID -> alias via registry ---
resetRegistry()
registrarMapeamentoId(MOTO_ALIAS, MOTO_UUID, 'verificar-agenda-display-refs')
assert.equal(obterLocalIdPorUuid(MOTO_UUID), MOTO_ALIAS)
assert.equal(rotuloVeiculoAgenda(MOTO_UUID, [motoAlias]), VEICULO_LABEL)
assert.equal(resolverEntidadeLocalPorRef(MOTO_UUID, [motoAlias])?.id, MOTO_ALIAS)

// --- VEÍCULO (moto) C: UUID -> UUID direto ---
resetRegistry()
assert.equal(rotuloVeiculoAgenda(MOTO_UUID, [motoUuid]), VEICULO_LABEL)

// --- VEÍCULO (moto) D: não encontrado -> "—" ---
resetRegistry()
assert.equal(rotuloVeiculoAgenda(MOTO_UUID, [motoAlias]), '—')

// --- VEÍCULO (carro) A–D: mesmo helper rotuloVeiculoAgenda ---
resetRegistry()
assert.equal(rotuloVeiculoAgenda(CARRO_ALIAS, [carroAlias]), VEICULO_LABEL)

resetRegistry()
registrarMapeamentoId(CARRO_ALIAS, CARRO_UUID, 'verificar-agenda-display-refs')
assert.equal(rotuloVeiculoAgenda(CARRO_UUID, [carroAlias]), VEICULO_LABEL)

resetRegistry()
assert.equal(rotuloVeiculoAgenda(CARRO_UUID, [carroUuid]), VEICULO_LABEL)

resetRegistry()
assert.equal(rotuloVeiculoAgenda(CARRO_UUID, [carroAlias]), '—')

// Helper: só leitura + obterLocalIdPorUuid (sem writes)
const helperSrc = readFileSync(
  new URL('../src/services/agenda/agenda-display-refs.ts', import.meta.url),
  'utf8'
)
assert.match(helperSrc, /obterLocalIdPorUuid/)
assert.match(helperSrc, /rotuloVeiculoAgenda/)
assert.doesNotMatch(helperSrc, /registrarMapeamento/)
assert.doesNotMatch(helperSrc, /aplicarRefsTecnicas/)
assert.doesNotMatch(helperSrc, /setDados/)
assert.doesNotMatch(helperSrc, /obterUuidPorLocalId/)

const agendaPageSrc = readFileSync(
  new URL('../src/pages/AgendaPage.tsx', import.meta.url),
  'utf8'
)
assert.match(agendaPageSrc, /rotuloClienteAgenda/)
assert.match(agendaPageSrc, /rotuloVeiculoAgenda/)
assert.doesNotMatch(agendaPageSrc, /clientes\.find\(\(c\) => c\.id === id\)/)
assert.doesNotMatch(agendaPageSrc, /motos\.find\(\(mo\) => mo\.id === id\)/)

const panelSrc = readFileSync(
  new URL('../src/components/agenda/AgendamentosDiaPanel.tsx', import.meta.url),
  'utf8'
)
assert.match(panelSrc, /rotuloClienteAgenda/)
assert.match(panelSrc, /rotuloVeiculoAgenda/)

console.log('verificar-agenda-display-refs: ok')
