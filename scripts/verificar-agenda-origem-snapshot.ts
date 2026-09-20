import assert from 'node:assert/strict'
import { executarPushAgendamentos } from '../src/services/agenda/agenda-push.ts'
import {
  enfileirarPushAgenda,
  resetarFilaPushAgendaParaTeste,
} from '../src/services/agenda/agenda-push-queue.ts'
import type { Agendamento } from '../src/types/agendamento.ts'

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
const D719 = 'd71945fa-aaaa-4bbb-8ccc-111111111111'
const NOVO = '4fc69f21-dddd-4eee-8fff-222222222222'
const AGORA = '2026-09-19T03:00:00.000Z'

function agendamento(id: string, clienteId: string, motoId: string): Agendamento {
  return {
    id,
    oficina_id: OFFICE,
    office_id: OFFICE,
    data: '2026-09-19',
    horario: '10:00',
    cliente_id: clienteId,
    moto_id: motoId,
    servico: 'tecnico',
    status: 'agendado',
    created_at: AGORA,
    updated_at: AGORA,
  }
}

const d719 = agendamento(D719, 'cli-4d0684fa', 'moto-9bfe2738')
const novo = agendamento(NOVO, '14175b13-f669-5d37-b081-0d1a32742359', '0e08aaea-a07d-53b2-bc38-5ec87899c067')

function resolverSnapshot(opcoes: {
  agendamentos?: Agendamento[]
  repo: Agendamento[]
}): Agendamento[] {
  if (opcoes.agendamentos) return opcoes.agendamentos
  return opcoes.repo
}

async function publicarComoApp(opcoes: {
  memoria?: Agendamento[]
  repo: Agendamento[]
  remoto?: Agendamento[]
}): Promise<Agendamento[]> {
  resetarFilaPushAgendaParaTeste()
  const snapshot = resolverSnapshot({ agendamentos: opcoes.memoria, repo: opcoes.repo })
  const persistidos: Agendamento[] = []
  await enfileirarPushAgenda(OFFICE, snapshot, (locais) =>
    executarPushAgendamentos({
      officeId: OFFICE,
      habilitado: true,
      online: true,
      locais,
      carregarRemoto: async () => ({
        ok: true,
        dados: opcoes.remoto ?? [],
        erros: [],
      }),
      persistir: async (ags) => {
        persistidos.push(...ags)
        return {
          ok: true,
          enviados: ags.length,
          erros: [],
          loteIds: ags.map((a) => a.id),
          loteTamanho: ags.length,
        }
      },
      contarFila: () => 0,
      enfileirar: () => undefined,
      marcarSincronizados: () => undefined,
    })
  )
  return persistidos
}

// 1) repo SEM d719 + snapshot em memória COM d719 → push envia d719
const casoMemoria = await publicarComoApp({
  memoria: [d719, novo],
  repo: [novo],
})
assert.equal(casoMemoria.some((a) => a.id === D719), true, 'memoria com d719 deve ir no lote')
assert.equal(casoMemoria.some((a) => a.id === NOVO), true)

// 2) repo COM d719 + snapshot explícito SEM d719 → snapshot vence
const casoExplicitoLimpo = await publicarComoApp({
  memoria: [novo],
  repo: [d719, novo],
})
assert.equal(casoExplicitoLimpo.some((a) => a.id === D719), false, 'explicito sem d719 vence o repo')
assert.equal(casoExplicitoLimpo.some((a) => a.id === NOVO), true)

// 3) sem snapshot explícito → lê o repo
const casoRepo = await publicarComoApp({
  repo: [d719, novo],
})
assert.equal(casoRepo.some((a) => a.id === D719), true, 'repo com d719 vai no lote quando nao ha explicito')

// 4) merge com remoto sem d719 nao remove o local-only
const casoMergeMantem = await publicarComoApp({
  memoria: [d719, novo],
  repo: [novo],
  remoto: [novo],
})
assert.equal(casoMergeMantem.some((a) => a.id === D719), true)

resetarFilaPushAgendaParaTeste()
console.log('verificar-agenda-origem-snapshot: ok')
