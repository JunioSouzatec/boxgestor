import { logBootstrap } from '@/lib/bootstrap-debug'
import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import { logSyncEstoqueDev } from '@/services/estoque/estoque-sync-debug'
import {
  mesclarFornecedoresEstoque,
  mesclarPecasEstoque,
} from '@/services/estoque/estoque-merge.helpers'
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
const pullTimers: Record<string, ReturnType<typeof setTimeout>> = {}
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

function mesclarMovimentacoes(
  local: MovimentacaoEstoque[],
  remoto: MovimentacaoEstoque[]
): MovimentacaoEstoque[] {
  const porId = new Map<string, MovimentacaoEstoque>()
  for (const m of [...remoto, ...local]) {
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

function salvarCamposEstoqueNoDatabase(
  officeId: string,
  campos: Pick<CraftDatabase, 'pecas' | 'fornecedores' | 'movimentacoes_estoque'>
): void {
  const atual = localCraftRepository.carregar(officeId)
  salvarDatabaseSemSync(officeId, {
    ...atual,
    pecas: campos.pecas,
    fornecedores: campos.fornecedores,
    movimentacoes_estoque: campos.movimentacoes_estoque,
  })
}

function aplicarCamposEstoqueMesclados(
  localDb: CraftDatabase,
  remoto: NonNullable<Awaited<ReturnType<typeof carregarEstoqueDoSupabase>>['dados']>,
  opcoes: { fonteVerdadeRemota: boolean }
): Pick<CraftDatabase, 'pecas' | 'fornecedores' | 'movimentacoes_estoque'> {
  const localPecas = localDb.pecas ?? []
  const localFornecedores = localDb.fornecedores ?? []
  const localMovimentacoes = localDb.movimentacoes_estoque ?? []

  const pecasMescladas = mesclarPecasEstoque(localPecas, remoto.pecas, opcoes)
  const fornecedoresMesclados = mesclarFornecedoresEstoque(
    localFornecedores,
    remoto.fornecedores,
    opcoes
  )
  const movimentacoesMescladas = mesclarMovimentacoes(localMovimentacoes, remoto.movimentacoes)

  const origem = opcoes.fonteVerdadeRemota
    ? remoto.pecas.length > 0 && localPecas.length === 0
      ? 'supabase'
      : 'merge'
    : 'merge'

  logSyncEstoqueDev('pecas', {
    supabase: remoto.pecas.length,
    local: localPecas.length,
    aposMerge: pecasMescladas.length,
    origem,
    updatedAtExemplo: pecasMescladas[0]?.updated_at,
  })
  logSyncEstoqueDev('fornecedores', {
    supabase: remoto.fornecedores.length,
    local: localFornecedores.length,
    aposMerge: fornecedoresMesclados.length,
    origem,
  })
  logSyncEstoqueDev('movimentacoes', {
    supabase: remoto.movimentacoes.length,
    local: localMovimentacoes.length,
    aposMerge: movimentacoesMescladas.length,
    origem,
  })

  return {
    pecas: pecasMescladas,
    fornecedores: fornecedoresMesclados,
    movimentacoes_estoque: movimentacoesMescladas,
  }
}

export function agendarSincronizacaoEstoque(officeId: string): void {
  if (suprimirSync || !estoqueModoSupabase()) return

  clearTimeout(syncTimers[officeId])
  syncTimers[officeId] = setTimeout(() => {
    void sincronizarEstoqueCompleto(officeId)
  }, 600)
}

export function agendarPullEstoqueRemoto(officeId: string, delayMs = 800): void {
  if (!estoqueModoSupabase()) return

  clearTimeout(pullTimers[officeId])
  pullTimers[officeId] = setTimeout(() => {
    void pullEstoqueDoSupabase(officeId)
  }, delayMs)
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

/** Pull puro do Supabase — não publica cache local antes (evita sobrescrever servidor). */
export async function pullEstoqueDoSupabase(officeId: string): Promise<{
  ok: boolean
  fonte: 'supabase' | 'local'
}> {
  if (!estoqueModoSupabase() || !navigator.onLine) {
    return { ok: false, fonte: 'local' }
  }

  const localDb = localCraftRepository.carregar(officeId)
  const remoto = await carregarEstoqueDoSupabase(officeId)

  if (!remoto.ok || !remoto.dados) {
    if (import.meta.env.DEV && remoto.erros.length > 0) {
      console.warn('[Craft Estoque] Pull remoto falhou', remoto.erros)
    }
    return { ok: false, fonte: 'local' }
  }

  const campos = aplicarCamposEstoqueMesclados(localDb, remoto.dados, {
    fonteVerdadeRemota: true,
  })

  salvarCamposEstoqueNoDatabase(officeId, campos)
  marcarOfficeEstoqueMigrado(officeId)
  emitirEstoqueAtualizado()

  logBootstrap('estoque_pull_remoto', {
    officeId,
    origem: 'supabase',
    pecas: campos.pecas.length,
    fornecedores: campos.fornecedores.length,
  })

  return { ok: true, fonte: 'supabase' }
}

/** Push local → pull remoto → cache espelha Supabase. */
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

  const localDbInicial = localCraftRepository.carregar(officeId)
  const localPecas = localDbInicial.pecas ?? []
  const localFornecedores = localDbInicial.fornecedores ?? []
  const localMovimentacoes = localDbInicial.movimentacoes_estoque ?? []

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

  const campos = aplicarCamposEstoqueMesclados(localDbInicial, remoto.dados, {
    fonteVerdadeRemota: true,
  })

  salvarCamposEstoqueNoDatabase(officeId, campos)
  logBootstrap('estoque_sync_completo', {
    officeId,
    origem: 'supabase',
    pecas: campos.pecas.length,
    fornecedores: campos.fornecedores.length,
  })
  marcarOfficeEstoqueMigrado(officeId)
  emitirEstoqueAtualizado()
  return { ok: true, fonte: 'supabase' }
}

export async function mesclarEstoqueNoDatabase(
  officeId: string,
  db: CraftDatabase,
  opcoes?: { prioridadeRemota?: boolean }
): Promise<CraftDatabase> {
  const fonteVerdadeRemota = opcoes?.prioridadeRemota ?? false
  const localPecas = db.pecas ?? []

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
      (localPecas.length > 0 || (db.fornecedores?.length ?? 0) > 0)
    ) {
      void persistirEstoqueNoSupabase(officeId, {
        pecas: localPecas,
        fornecedores: db.fornecedores ?? [],
        movimentacoes: db.movimentacoes_estoque ?? [],
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
      fornecedores: db.fornecedores ?? [],
      movimentacoes: db.movimentacoes_estoque ?? [],
    })
    marcarOfficeEstoqueMigrado(officeId)
    return {
      ...db,
      pecas: localPecas,
      fornecedores: db.fornecedores ?? [],
      movimentacoes_estoque: db.movimentacoes_estoque ?? [],
    }
  }

  const campos = aplicarCamposEstoqueMesclados(db, remoto.dados, {
    fonteVerdadeRemota: fonteVerdadeRemota,
  })

  return {
    ...db,
    pecas: campos.pecas,
    fornecedores: campos.fornecedores,
    movimentacoes_estoque: campos.movimentacoes_estoque,
  }
}

export async function carregarEstoqueRemoto(
  officeId: string
): Promise<{ ok: boolean; fonte: 'supabase' | 'local' }> {
  return pullEstoqueDoSupabase(officeId)
}

export async function inicializarEstoqueSupabase(officeId: string): Promise<void> {
  await pullEstoqueDoSupabase(officeId)
}

export async function refreshEstoqueDoSupabase(officeId: string): Promise<boolean> {
  const resultado = await pullEstoqueDoSupabase(officeId)
  return resultado.ok && resultado.fonte === 'supabase'
}
