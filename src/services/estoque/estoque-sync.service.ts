import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import { logSyncEstoqueDev } from '@/services/estoque/estoque-sync-debug'
import {
  carregarEstoqueDoSupabase,
  persistirEstoqueNoSupabase,
} from '@/services/estoque/supabase-estoque.persistence'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { CraftDatabase } from '@/types/database'
import type { MovimentacaoEstoque } from '@/types/movimentacao-estoque'

export const ESTOQUE_MIGRACAO_KEY = 'craft_estoque_migrados_supabase_v1'
export const ESTOQUE_EVENTO_ATUALIZADO = 'craft:estoque-atualizado'

interface MigracaoEstoqueStore {
  version: 1
  offices: Record<string, { migrado_em: string }>
}

const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {}
let suprimirSync = false

export function estoqueModoSupabase(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

function emitirEstoqueAtualizado(): void {
  window.dispatchEvent(new CustomEvent(ESTOQUE_EVENTO_ATUALIZADO))
}

function carregarMigracao(): MigracaoEstoqueStore {
  try {
    const raw = localStorage.getItem(ESTOQUE_MIGRACAO_KEY)
    if (raw) return JSON.parse(raw) as MigracaoEstoqueStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

function salvarMigracao(store: MigracaoEstoqueStore): void {
  localStorage.setItem(ESTOQUE_MIGRACAO_KEY, JSON.stringify(store))
}

export function officeEstoqueJaMigrado(officeId: string): boolean {
  return Boolean(carregarMigracao().offices[officeId])
}

function marcarOfficeEstoqueMigrado(officeId: string): void {
  const store = carregarMigracao()
  store.offices[officeId] = { migrado_em: new Date().toISOString() }
  salvarMigracao(store)
}

function obterUpdatedAt<T extends { updated_at?: string; created_at?: string }>(item: T): string {
  return item.updated_at ?? item.created_at ?? ''
}

function mesclarPorId<T extends { id: string; updated_at?: string; created_at?: string }>(
  local: T[],
  remoto: T[],
  prioridadeRemota = false
): T[] {
  const porId = new Map<string, T>()
  const todosIds = new Set([...local.map((x) => x.id), ...remoto.map((x) => x.id)])

  for (const id of todosIds) {
    const l = local.find((x) => x.id === id)
    const r = remoto.find((x) => x.id === id)

    if (!l && r) {
      porId.set(id, r)
      continue
    }
    if (l && !r) {
      porId.set(id, l)
      continue
    }
    if (!l || !r) continue

    if (prioridadeRemota) {
      const lTs = obterUpdatedAt(l)
      const rTs = obterUpdatedAt(r)
      porId.set(id, rTs >= lTs ? r : l)
    } else {
      const lTs = obterUpdatedAt(l)
      const rTs = obterUpdatedAt(r)
      porId.set(id, rTs >= lTs ? r : l)
    }
  }

  return [...porId.values()]
}

function mesclarMovimentacoes(
  local: MovimentacaoEstoque[],
  remoto: MovimentacaoEstoque[]
): MovimentacaoEstoque[] {
  const porId = new Map<string, MovimentacaoEstoque>()
  for (const m of [...local, ...remoto]) {
    if (!porId.has(m.id)) porId.set(m.id, m)
  }
  return [...porId.values()].sort((a, b) => b.data.localeCompare(a.data))
}

function salvarDatabaseSemSync(officeId: string, db: CraftDatabase): void {
  suprimirSync = true
  try {
    localCraftRepository.salvar(officeId, db)
  } finally {
    suprimirSync = false
  }
}

export function agendarSincronizacaoEstoque(officeId: string): void {
  if (suprimirSync || !estoqueModoSupabase()) return

  clearTimeout(syncTimers[officeId])
  syncTimers[officeId] = setTimeout(() => {
    void sincronizarEstoqueCompleto(officeId)
  }, 600)
}

export async function publicarEstoqueLocais(officeId: string): Promise<boolean> {
  if (!estoqueModoSupabase() || !navigator.onLine) return false

  const local = localCraftRepository.carregar(officeId)
  const push = await persistirEstoqueNoSupabase(officeId, {
    pecas: local.pecas ?? [],
    fornecedores: local.fornecedores ?? [],
    movimentacoes: local.movimentacoes_estoque ?? [],
  })

  return push.ok || push.pecasEnviadas > 0 || push.fornecedoresEnviados > 0
}

export async function sincronizarEstoqueCompleto(officeId: string): Promise<{
  ok: boolean
  fonte: 'supabase' | 'local'
}> {
  if (!estoqueModoSupabase()) {
    return { ok: true, fonte: 'local' }
  }

  if (!navigator.onLine) {
    return { ok: false, fonte: 'local' }
  }

  const localDb = localCraftRepository.carregar(officeId)
  const localPecas = localDb.pecas ?? []
  const localFornecedores = localDb.fornecedores ?? []
  const localMovimentacoes = localDb.movimentacoes_estoque ?? []

  if (
    !officeEstoqueJaMigrado(officeId) &&
    (localPecas.length > 0 || localFornecedores.length > 0 || localMovimentacoes.length > 0)
  ) {
    await persistirEstoqueNoSupabase(officeId, {
      pecas: localPecas,
      fornecedores: localFornecedores,
      movimentacoes: localMovimentacoes,
    })
    marcarOfficeEstoqueMigrado(officeId)
  }

  await publicarEstoqueLocais(officeId)

  const remoto = await carregarEstoqueDoSupabase(officeId)
  if (!remoto.ok || !remoto.dados) {
    return { ok: false, fonte: 'local' }
  }

  const pecasMescladas = mesclarPorId(localPecas, remoto.dados.pecas, true)
  const fornecedoresMesclados = mesclarPorId(localFornecedores, remoto.dados.fornecedores, true)
  const movimentacoesMescladas = mesclarMovimentacoes(localMovimentacoes, remoto.dados.movimentacoes)

  logSyncEstoqueDev('pecas', {
    supabase: remoto.dados.pecas.length,
    local: localPecas.length,
    aposMerge: pecasMescladas.length,
    origem: 'merge',
    updatedAtExemplo: pecasMescladas[0]?.updated_at,
  })
  logSyncEstoqueDev('fornecedores', {
    supabase: remoto.dados.fornecedores.length,
    local: localFornecedores.length,
    aposMerge: fornecedoresMesclados.length,
    origem: 'merge',
  })
  logSyncEstoqueDev('movimentacoes', {
    supabase: remoto.dados.movimentacoes.length,
    local: localMovimentacoes.length,
    aposMerge: movimentacoesMescladas.length,
    origem: 'merge',
  })

  const dbAtualizado: CraftDatabase = {
    ...localDb,
    pecas: pecasMescladas,
    fornecedores: fornecedoresMesclados,
    movimentacoes_estoque: movimentacoesMescladas,
  }

  salvarDatabaseSemSync(officeId, dbAtualizado)
  marcarOfficeEstoqueMigrado(officeId)
  emitirEstoqueAtualizado()
  return { ok: true, fonte: 'supabase' }
}

/** Mescla estoque do Supabase no snapshot após carregar fase 1. */
export async function mesclarEstoqueNoDatabase(
  officeId: string,
  db: CraftDatabase,
  opcoes?: { prioridadeRemota?: boolean }
): Promise<CraftDatabase> {
  const prioridadeRemota = opcoes?.prioridadeRemota ?? true
  const localPecas = db.pecas ?? []
  const localFornecedores = db.fornecedores ?? []
  const localMovimentacoes = db.movimentacoes_estoque ?? []

  if (!estoqueModoSupabase() || !navigator.onLine) {
    logSyncEstoqueDev('pecas', {
      local: localPecas.length,
      aposMerge: localPecas.length,
      origem: 'local',
    })
    return db
  }

  const remoto = await carregarEstoqueDoSupabase(officeId)

  if (!remoto.ok || !remoto.dados) {
    if (
      !officeEstoqueJaMigrado(officeId) &&
      (localPecas.length > 0 || localFornecedores.length > 0)
    ) {
      void persistirEstoqueNoSupabase(officeId, {
        pecas: localPecas,
        fornecedores: localFornecedores,
        movimentacoes: localMovimentacoes,
      }).then(() => marcarOfficeEstoqueMigrado(officeId))
    }
    logSyncEstoqueDev('pecas', {
      local: localPecas.length,
      aposMerge: localPecas.length,
      origem: 'local',
    })
    return db
  }

  if (
    !officeEstoqueJaMigrado(officeId) &&
    localPecas.length > 0 &&
    remoto.dados.pecas.length === 0
  ) {
    await persistirEstoqueNoSupabase(officeId, {
      pecas: localPecas,
      fornecedores: localFornecedores,
      movimentacoes: localMovimentacoes,
    })
    marcarOfficeEstoqueMigrado(officeId)
    return db
  }

  const pecasMescladas = mesclarPorId(localPecas, remoto.dados.pecas, prioridadeRemota)
  const fornecedoresMesclados = mesclarPorId(
    localFornecedores,
    remoto.dados.fornecedores,
    prioridadeRemota
  )
  const movimentacoesMescladas = mesclarMovimentacoes(
    localMovimentacoes,
    remoto.dados.movimentacoes
  )

  const origem =
    remoto.dados.pecas.length > 0 && localPecas.length === 0
      ? 'supabase'
      : localPecas.length > 0 && remoto.dados.pecas.length === 0
        ? 'local'
        : 'merge'

  logSyncEstoqueDev('pecas', {
    supabase: remoto.dados.pecas.length,
    local: localPecas.length,
    aposMerge: pecasMescladas.length,
    origem,
    updatedAtExemplo: pecasMescladas[0]?.updated_at,
  })
  logSyncEstoqueDev('fornecedores', {
    supabase: remoto.dados.fornecedores.length,
    local: localFornecedores.length,
    aposMerge: fornecedoresMesclados.length,
    origem,
  })
  logSyncEstoqueDev('movimentacoes', {
    supabase: remoto.dados.movimentacoes.length,
    local: localMovimentacoes.length,
    aposMerge: movimentacoesMescladas.length,
    origem,
  })

  return {
    ...db,
    pecas: pecasMescladas,
    fornecedores: fornecedoresMesclados,
    movimentacoes_estoque: movimentacoesMescladas,
  }
}

export async function carregarEstoqueRemoto(
  officeId: string
): Promise<{ ok: boolean; origem: 'supabase' | 'local' }> {
  if (!estoqueModoSupabase() || !navigator.onLine) {
    return { ok: true, origem: 'local' }
  }

  const localDb = localCraftRepository.carregar(officeId)
  const mesclado = await mesclarEstoqueNoDatabase(officeId, localDb, { prioridadeRemota: true })
  salvarDatabaseSemSync(officeId, mesclado)
  emitirEstoqueAtualizado()
  return { ok: true, origem: 'supabase' }
}

export async function inicializarEstoqueSupabase(officeId: string): Promise<void> {
  if (!estoqueModoSupabase()) return

  await mesclarEstoqueNoDatabase(officeId, localCraftRepository.carregar(officeId)).then((db) => {
    salvarDatabaseSemSync(officeId, db)
    emitirEstoqueAtualizado()
  })
  await sincronizarEstoqueCompleto(officeId)
}

export async function refreshEstoqueDoSupabase(officeId: string): Promise<boolean> {
  const resultado = await carregarEstoqueRemoto(officeId)
  return resultado.ok && resultado.origem === 'supabase'
}
