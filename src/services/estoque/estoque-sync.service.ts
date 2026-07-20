import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import { logBootstrap } from '@/lib/bootstrap-debug'
import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  logDiagnosticoEstoque,
  registrarUltimoPullEstoque,
} from '@/services/estoque/estoque-diagnostico'
import { logSyncEstoqueDev } from '@/services/estoque/estoque-sync-debug'
import {
  mesclarFornecedoresEstoque,
  mesclarPecasEstoque,
} from '@/services/estoque/estoque-merge.helpers'
import {
  carregarEstoqueDoSupabase,
  persistirEstoqueNoSupabase,
  atualizarQuantidadePecaNoSupabase,
  verificarPecaNoSupabase,
} from '@/services/estoque/supabase-estoque.persistence'
import {
  atualizarContagemPendenciasAtivas,
  emitirEventoPersistencia,
} from '@/services/persistence-status.events'
import { localCraftRepository } from '@/services/repository/local.repository'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { CraftDatabase } from '@/types/database'
import type { MovimentacaoEstoque } from '@/types/movimentacao-estoque'
import type { Peca } from '@/types/peca'

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

function logCreateEstoque(payload: Record<string, unknown>): void {
  console.info('[BoxGestor Estoque][create]', payload)
}

function logUpdateEstoque(payload: Record<string, unknown>): void {
  console.info('[BoxGestor Estoque][update]', payload)
}

function statusFilaPecas(officeId: string): {
  pendentes: number
  pecasPendentes: number
  idsPecasPendentes: string[]
} {
  const pendentes = syncQueueService.listar(officeId, 'pendente')
  const pecas = pendentes.filter((i) => i.entidade === 'peca')
  return {
    pendentes: pendentes.length,
    pecasPendentes: pecas.length,
    idsPecasPendentes: pecas.map((i) => i.entidade_id),
  }
}

function enfileirarPecaSync(
  officeId: string,
  peca: Peca,
  tipoAcao: 'create' | 'update',
  extraPayload?: Record<string, unknown>
): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: tipoAcao,
    entidade: 'peca',
    entidade_id: peca.id,
    payload: {
      peca_id: peca.id,
      codigo: peca.codigo,
      nome: peca.nome,
      quantidade: peca.quantidade,
      ...extraPayload,
    },
  })
  atualizarContagemPendenciasAtivas(officeId)
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
  // Remoto é a fonte da verdade; locais só entram se ainda não existem no servidor
  // (evita devolução local “fantasma” após RPC já ter estornado).
  const porId = new Map<string, MovimentacaoEstoque>()
  for (const m of remoto) porId.set(m.id, m)
  for (const m of local) {
    if (porId.has(m.id)) continue
    // Se já há movimento remoto da mesma OS/peça/tipo/chave, descartar local duplicado
    const chave = m.chave_idempotencia
    const duplicadoRemoto = chave
      ? remoto.some((r) => r.chave_idempotencia === chave)
      : remoto.some(
          (r) =>
            r.peca_id === m.peca_id &&
            r.tipo === m.tipo &&
            r.ordem_servico_id === m.ordem_servico_id &&
            Math.abs((r.quantidade ?? 0) - (m.quantidade ?? 0)) < 0.0001
        )
    if (duplicadoRemoto) continue
    porId.set(m.id, m)
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

  // Quantidade: remoto sempre vence quando a peça existe no Supabase
  const pecasMescladas = mesclarPecasEstoque(localPecas, remoto.pecas, {
    ...opcoes,
    quantidadeRemotaVence: true,
  })
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
  }, 1200)
}

export function agendarPullEstoqueRemoto(officeId: string, delayMs = 800): void {
  if (!estoqueModoSupabase()) return

  clearTimeout(pullTimers[officeId])
  pullTimers[officeId] = setTimeout(() => {
    void pullEstoqueDoSupabase(officeId)
  }, delayMs)
}

/**
 * Publica só soft-deletes locais antes do pull.
 * Sem isso, pull remoto ativo apaga o tombstone local e a peça “volta”.
 */
export async function publicarTombstonesEstoque(officeId: string): Promise<boolean> {
  if (!estoqueModoSupabase() || !navigator.onLine) return false

  const local = localCraftRepository.carregar(officeId)
  const tombstones = (local.pecas ?? []).filter((p) => entidadeFoiExcluida(p))
  if (tombstones.length === 0) return true

  const push = await persistirEstoqueNoSupabase(
    officeId,
    {
      pecas: tombstones,
      fornecedores: [],
      movimentacoes: [],
    },
    { sobrescreverQuantidade: false }
  )

  return push.ok || push.pecasEnviadas > 0
}

/**
 * Publica catálogo + movimentos. NÃO sobrescreve quantity remoto
 * (exceto peças novas ainda não existentes no servidor).
 */
export async function publicarEstoqueLocais(officeId: string): Promise<boolean> {
  if (!estoqueModoSupabase() || !navigator.onLine) return false

  const local = localCraftRepository.carregar(officeId)
  const push = await persistirEstoqueNoSupabase(
    officeId,
    {
      pecas: local.pecas ?? [],
      fornecedores: local.fornecedores ?? [],
      movimentacoes: local.movimentacoes_estoque ?? [],
    },
    { sobrescreverQuantidade: false }
  )

  return push.ok || push.pecasEnviadas > 0 || push.fornecedoresEnviados > 0
}

export interface ResultadoPublicacaoPeca {
  ok: boolean
  remoto: boolean
  pendente: boolean
  erro?: string
}

/**
 * CREATE: grava imediatamente em inventory_items.
 * Offline/falha → pendência clara na fila sync (entidade peca).
 */
export async function publicarPecaCriada(
  officeId: string,
  peca: Peca
): Promise<ResultadoPublicacaoPeca> {
  const baseLog = {
    office_id: officeId,
    local_id: peca.id,
    id_gerado: peca.id,
    codigo: peca.codigo,
    nome: peca.nome,
    quantidade: peca.quantidade,
  }

  logCreateEstoque({
    fase: 'inicio',
    ...baseLog,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    modo_supabase: estoqueModoSupabase(),
    status_fila: statusFilaPecas(officeId),
  })

  if (!estoqueModoSupabase()) {
    logCreateEstoque({
      fase: 'modo_local_sem_remoto',
      ...baseLog,
      status_fila: statusFilaPecas(officeId),
    })
    return { ok: true, remoto: false, pendente: false }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enfileirarPecaSync(officeId, peca, 'create')
    logCreateEstoque({
      fase: 'offline_pendencia',
      ...baseLog,
      tentativa_persistencia: false,
      status_fila: statusFilaPecas(officeId),
    })
    return { ok: true, remoto: false, pendente: true }
  }

  logCreateEstoque({
    fase: 'tentativa_persistencia',
    ...baseLog,
    status_fila: statusFilaPecas(officeId),
  })

  const push = await persistirEstoqueNoSupabase(
    officeId,
    {
      pecas: [peca],
      fornecedores: [],
      movimentacoes: [],
    },
    // Peça nova: incluir quantity inicial
    { sobrescreverQuantidade: true }
  )

  const erroMsg =
    push.erros.map((e) => e.mensagem).filter(Boolean).join('; ') || undefined

  if (push.ok && push.pecasEnviadas > 0) {
    const verificacao = await verificarPecaNoSupabase(officeId, peca.id)
    if (!verificacao.existe) {
      enfileirarPecaSync(officeId, peca, 'create')
      logCreateEstoque({
        fase: 'upsert_sem_linha_remota',
        ...baseLog,
        office_uuid: verificacao.officeUuid,
        pecas_enviadas: push.pecasEnviadas,
        erro_supabase: verificacao.erro ?? 'upsert ok mas SELECT não encontrou a peça',
        status_fila: statusFilaPecas(officeId),
      })
      return {
        ok: false,
        remoto: false,
        pendente: true,
        erro: verificacao.erro ?? 'Peça não encontrada no Supabase após upsert',
      }
    }

    syncQueueService.marcarSincronizadosPorEntidade(officeId, 'peca', peca.id)
    atualizarContagemPendenciasAtivas(officeId)
    emitirEventoPersistencia({ type: 'supabase_ok' })
    logCreateEstoque({
      fase: 'ok_supabase',
      ...baseLog,
      office_uuid: verificacao.officeUuid,
      pecas_enviadas: push.pecasEnviadas,
      erro_supabase: null,
      status_fila: statusFilaPecas(officeId),
    })
    return { ok: true, remoto: true, pendente: false }
  }

  enfileirarPecaSync(officeId, peca, 'create')
  logCreateEstoque({
    fase: 'erro_enfileirado',
    ...baseLog,
    pecas_enviadas: push.pecasEnviadas,
    erro_supabase: erroMsg ?? 'upsert sem confirmação',
    erros: push.erros,
    status_fila: statusFilaPecas(officeId),
  })

  return {
    ok: false,
    remoto: false,
    pendente: true,
    erro: erroMsg ?? 'Falha ao persistir peça no Supabase',
  }
}

/**
 * UPDATE intencional (edição/ajuste/entrada): grava quantity no Supabase imediatamente.
 * O sync de catálogo NÃO envia quantity — por isso este caminho é obrigatório.
 */
export async function publicarPecaAtualizada(
  officeId: string,
  peca: Peca,
  opcoes?: {
    quantidadeAnterior?: number
    /** Se true (default quando quantidade muda), faz UPDATE de quantity */
    incluirQuantidade?: boolean
  }
): Promise<ResultadoPublicacaoPeca> {
  const incluirQuantidade = opcoes?.incluirQuantidade !== false
  const quantidadeAnterior = opcoes?.quantidadeAnterior
  const baseLog = {
    office_id: officeId,
    local_id: peca.id,
    codigo: peca.codigo,
    nome: peca.nome,
    quantity_antiga: quantidadeAnterior,
    quantity_nova_enviada: peca.quantidade,
    incluir_quantidade: incluirQuantidade,
  }

  logUpdateEstoque({
    fase: 'inicio',
    ...baseLog,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    modo_supabase: estoqueModoSupabase(),
    status_fila: statusFilaPecas(officeId),
  })

  if (!estoqueModoSupabase()) {
    logUpdateEstoque({
      fase: 'modo_local_sem_remoto',
      ...baseLog,
      status_fila: statusFilaPecas(officeId),
    })
    return { ok: true, remoto: false, pendente: false }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enfileirarPecaSync(officeId, peca, 'update', {
      incluir_quantidade: incluirQuantidade,
      quantity_antiga: quantidadeAnterior,
      quantity_nova: peca.quantidade,
    })
    logUpdateEstoque({
      fase: 'offline_pendencia',
      ...baseLog,
      entrou_fila_offline: true,
      chamada_supabase: false,
      status_fila: statusFilaPecas(officeId),
    })
    return { ok: true, remoto: false, pendente: true }
  }

  // 1) Catálogo (nome, preço, etc.) — sem quantity se não for update de qty
  logUpdateEstoque({
    fase: 'tentativa_upsert_catalogo',
    ...baseLog,
    chamada_supabase: 'upsert inventory_items',
    status_fila: statusFilaPecas(officeId),
  })

  const pushCatalogo = await persistirEstoqueNoSupabase(
    officeId,
    {
      pecas: [peca],
      fornecedores: [],
      movimentacoes: [],
    },
    { sobrescreverQuantidade: incluirQuantidade }
  )

  if (!pushCatalogo.ok && pushCatalogo.pecasEnviadas === 0) {
    const erroMsg =
      pushCatalogo.erros.map((e) => e.mensagem).filter(Boolean).join('; ') ||
      'Falha no upsert de catálogo'
    enfileirarPecaSync(officeId, peca, 'update', {
      incluir_quantidade: incluirQuantidade,
      quantity_antiga: quantidadeAnterior,
      quantity_nova: peca.quantidade,
    })
    logUpdateEstoque({
      fase: 'erro_catalogo_enfileirado',
      ...baseLog,
      erro_supabase: erroMsg,
      resposta_supabase: pushCatalogo,
      entrou_fila_offline: true,
      status_fila: statusFilaPecas(officeId),
    })
    return { ok: false, remoto: false, pendente: true, erro: erroMsg }
  }

  // 2) Quantity: UPDATE explícito (fonte da verdade para edição manual)
  if (incluirQuantidade) {
    logUpdateEstoque({
      fase: 'tentativa_update_quantity',
      ...baseLog,
      chamada_supabase: 'update inventory_items.quantity',
      status_fila: statusFilaPecas(officeId),
    })

    const qty = await atualizarQuantidadePecaNoSupabase(officeId, peca.id, peca.quantidade)

    logUpdateEstoque({
      fase: qty.ok ? 'resposta_update_quantity_ok' : 'resposta_update_quantity_erro',
      ...baseLog,
      inventory_item_id: qty.inventoryItemId,
      office_uuid: qty.officeUuid,
      quantity_antiga_remota: qty.quantityAntes,
      quantity_depois_remota: qty.quantityDepois,
      erro_supabase: qty.erro ?? null,
      resposta_supabase: qty,
      status_fila: statusFilaPecas(officeId),
    })

    if (!qty.ok) {
      enfileirarPecaSync(officeId, peca, 'update', {
        incluir_quantidade: true,
        quantity_antiga: quantidadeAnterior ?? qty.quantityAntes,
        quantity_nova: peca.quantidade,
      })
      logUpdateEstoque({
        fase: 'erro_quantity_enfileirado',
        ...baseLog,
        inventory_item_id: qty.inventoryItemId,
        erro_supabase: qty.erro,
        entrou_fila_offline: true,
        status_fila: statusFilaPecas(officeId),
      })
      return {
        ok: false,
        remoto: false,
        pendente: true,
        erro: qty.erro ?? 'Falha ao atualizar quantity no Supabase',
      }
    }
  }

  syncQueueService.marcarSincronizadosPorEntidade(officeId, 'peca', peca.id)
  atualizarContagemPendenciasAtivas(officeId)
  emitirEventoPersistencia({ type: 'supabase_ok' })
  logUpdateEstoque({
    fase: 'ok_supabase',
    ...baseLog,
    entrou_fila_offline: false,
    status_fila: statusFilaPecas(officeId),
  })
  return { ok: true, remoto: true, pendente: false }
}

/** Reenvia peças com pendência na fila sync. */
export async function processarFilaPecasPendente(officeId: string): Promise<boolean> {
  if (!estoqueModoSupabase()) return true
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false

  const pendentes = syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'peca')

  if (pendentes.length === 0) return true

  const local = localCraftRepository.carregar(officeId)
  let algumOk = false

  for (const item of pendentes) {
    const peca = (local.pecas ?? []).find((p) => p.id === item.entidade_id)
    if (!peca) {
      syncQueueService.marcarSincronizado(item.id)
      algumOk = true
      logCreateEstoque({
        fase: 'fila_peca_ausente_local',
        office_id: officeId,
        local_id: item.entidade_id,
        status_fila: statusFilaPecas(officeId),
      })
      continue
    }

    logCreateEstoque({
      fase: 'fila_retry',
      office_id: officeId,
      local_id: peca.id,
      id_gerado: peca.id,
      codigo: peca.codigo,
      tipo_acao: item.tipo_acao,
      status_fila: statusFilaPecas(officeId),
    })

    const payload = (item.payload ?? {}) as {
      incluir_quantidade?: boolean
      quantity_nova?: number
    }
    const incluirQty =
      item.tipo_acao === 'create' ||
      payload.incluir_quantidade === true ||
      typeof payload.quantity_nova === 'number'

    // create / update intencional de qty: envia quantity; demais updates de catálogo não
    const resultado = await persistirEstoqueNoSupabase(
      officeId,
      {
        pecas: [peca],
        fornecedores: [],
        movimentacoes: [],
      },
      {
        sobrescreverQuantidade:
          (item.tipo_acao === 'create' || incluirQty) && !entidadeFoiExcluida(peca),
      }
    )

    if (
      resultado.ok &&
      resultado.pecasEnviadas > 0 &&
      incluirQty &&
      item.tipo_acao === 'update' &&
      !entidadeFoiExcluida(peca)
    ) {
      const qty = await atualizarQuantidadePecaNoSupabase(officeId, peca.id, peca.quantidade)
      logUpdateEstoque({
        fase: qty.ok ? 'fila_update_quantity_ok' : 'fila_update_quantity_erro',
        office_id: officeId,
        local_id: peca.id,
        inventory_item_id: qty.inventoryItemId,
        quantity_nova_enviada: peca.quantidade,
        erro_supabase: qty.erro ?? null,
        status_fila: statusFilaPecas(officeId),
      })
      if (!qty.ok) {
        syncQueueService.marcarErro(item.id, qty.erro ?? 'Erro ao atualizar quantity')
        continue
      }
    }

    if (resultado.ok && resultado.pecasEnviadas > 0) {
      syncQueueService.marcarSincronizado(item.id)
      syncQueueService.marcarSincronizadosPorEntidade(officeId, 'peca', peca.id)
      algumOk = true
      logCreateEstoque({
        fase: 'fila_ok',
        office_id: officeId,
        local_id: peca.id,
        status_fila: statusFilaPecas(officeId),
      })
    } else {
      const msg = resultado.erros[0]?.mensagem ?? 'Erro ao sincronizar peça'
      syncQueueService.marcarErro(item.id, msg)
      logCreateEstoque({
        fase: 'fila_erro',
        office_id: officeId,
        local_id: peca.id,
        erro_supabase: msg,
        status_fila: statusFilaPecas(officeId),
      })
    }
  }

  atualizarContagemPendenciasAtivas(officeId)
  if (algumOk) emitirEventoPersistencia({ type: 'supabase_ok' })
  return algumOk || pendentes.length === 0
}

/**
 * Peças ativas só no local (sem local_id no Supabase) — publica antes do pull.
 * Cobre creates que falharam sem fila ou ficaram órfãs.
 */
export async function publicarPecasOrfasLocais(officeId: string): Promise<number> {
  if (!estoqueModoSupabase() || !navigator.onLine) return 0

  const local = localCraftRepository.carregar(officeId)
  const ativas = (local.pecas ?? []).filter((p) => !entidadeFoiExcluida(p))
  if (ativas.length === 0) return 0

  const remoto = await carregarEstoqueDoSupabase(officeId)
  if (!remoto.ok || !remoto.dados) {
    logCreateEstoque({
      fase: 'orfas_pull_falhou',
      office_id: officeId,
      erro_supabase: remoto.erros?.[0]?.mensagem,
      status_fila: statusFilaPecas(officeId),
    })
    return 0
  }

  const idsRemotos = new Set(remoto.dados.pecas.map((p) => p.id))
  const orfas = ativas.filter((p) => !idsRemotos.has(p.id))
  if (orfas.length === 0) return 0

  logCreateEstoque({
    fase: 'orfas_encontradas',
    office_id: officeId,
    quantidade: orfas.length,
    ids: orfas.map((p) => p.id),
    codigos: orfas.map((p) => p.codigo),
    status_fila: statusFilaPecas(officeId),
  })

  let enviadas = 0
  for (const peca of orfas) {
    const r = await publicarPecaCriada(officeId, peca)
    if (r.remoto) enviadas++
  }
  return enviadas
}

/** Pull puro do Supabase — quantity remoto vence. */
export async function pullEstoqueDoSupabase(officeId: string): Promise<{
  ok: boolean
  fonte: 'supabase' | 'local'
}> {
  if (!estoqueModoSupabase() || !navigator.onLine) {
    logDiagnosticoEstoque('pull_skip_offline_ou_local', officeId)
    return { ok: false, fonte: 'local' }
  }

  const localDb = localCraftRepository.carregar(officeId)
  logDiagnosticoEstoque('pull_antes', officeId, {
    ativasAntes: (localDb.pecas ?? []).filter((p) => p.ativo !== false && !p.deleted_at).length,
  })

  const remoto = await carregarEstoqueDoSupabase(officeId)

  if (!remoto.ok || !remoto.dados) {
    console.warn('[Craft Estoque] Pull remoto falhou', remoto.erros)
    logDiagnosticoEstoque('pull_erro_supabase', officeId, { erros: remoto.erros })
    return { ok: false, fonte: 'local' }
  }

  const campos = aplicarCamposEstoqueMesclados(localDb, remoto.dados, {
    fonteVerdadeRemota: true,
  })

  salvarCamposEstoqueNoDatabase(officeId, campos)
  marcarOfficeEstoqueMigrado(officeId)
  registrarUltimoPullEstoque(officeId)

  // Limpa fila fantasma que deixa banner “aguardando sincronização”
  syncQueueService.abandonarItensTravados(officeId)
  atualizarContagemPendenciasAtivas(officeId)
  emitirEventoPersistencia({ type: 'supabase_ok' })

  emitirEstoqueAtualizado()

  logDiagnosticoEstoque('pull_depois', officeId, {
    remotoPecas: remoto.dados.pecas.length,
    remotoAtivas: remoto.dados.pecas.filter((p) => p.ativo !== false && !p.deleted_at).length,
    aposMerge: campos.pecas.length,
    aposMergeAtivas: campos.pecas.filter((p) => p.ativo !== false && !p.deleted_at).length,
  })

  logBootstrap('estoque_pull_remoto', {
    officeId,
    origem: 'supabase',
    pecas: campos.pecas.length,
    fornecedores: campos.fornecedores.length,
  })

  return { ok: true, fonte: 'supabase' }
}

/**
 * Sync seguro RC1:
 * 1) Publicar creates/órfãs locais (CREATE deve chegar ao Supabase antes do pull)
 * 2) Publicar tombstones locais
 * 3) Pull (quantidade remota vence; remoto excluído vence)
 * 4) Push catálogo/movimentos sem sobrescrever quantity nem ressuscitar
 */
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

  // Creates pendentes/órfãs ANTES do pull — outro device precisa ver a peça
  await processarFilaPecasPendente(officeId)
  await publicarPecasOrfasLocais(officeId)

  // Exclusões locais antes do pull — senão remoto ativo restaura a peça
  await publicarTombstonesEstoque(officeId)

  const pull = await pullEstoqueDoSupabase(officeId)

  const localDb = localCraftRepository.carregar(officeId)
  const localPecas = localDb.pecas ?? []
  const localFornecedores = localDb.fornecedores ?? []
  const localMovimentacoes = localDb.movimentacoes_estoque ?? []

  if (
    !officeEstoqueJaMigrado(officeId) &&
    (localPecas.length > 0 || localFornecedores.length > 0 || localMovimentacoes.length > 0)
  ) {
    await persistirEstoqueNoSupabase(
      officeId,
      {
        pecas: localPecas,
        fornecedores: localFornecedores,
        movimentacoes: localMovimentacoes,
      },
      // primeira migração pode levar quantity inicial
      { sobrescreverQuantidade: true }
    )
    marcarOfficeEstoqueMigrado(officeId)
  } else {
    await publicarEstoqueLocais(officeId)
  }

  // Pull final para espelhar quantity/movimentos do servidor
  const pullFinal = await pullEstoqueDoSupabase(officeId)
  logBootstrap('estoque_sync_completo', {
    officeId,
    origem: pullFinal.ok ? 'supabase' : 'local',
  })
  return pullFinal.ok || pull.ok
    ? { ok: true, fonte: 'supabase' }
    : { ok: false, fonte: 'local' }
}

export async function mesclarEstoqueNoDatabase(
  officeId: string,
  db: CraftDatabase,
  opcoes?: { prioridadeRemota?: boolean }
): Promise<CraftDatabase> {
  // RC1: quantity remoto é a fonte da verdade por padrão
  const fonteVerdadeRemota = opcoes?.prioridadeRemota ?? true
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
      void persistirEstoqueNoSupabase(
        officeId,
        {
          pecas: localPecas,
          fornecedores: db.fornecedores ?? [],
          movimentacoes: db.movimentacoes_estoque ?? [],
        },
        { sobrescreverQuantidade: true }
      ).then(() => marcarOfficeEstoqueMigrado(officeId))
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
    await persistirEstoqueNoSupabase(
      officeId,
      {
        pecas: localPecas,
        fornecedores: db.fornecedores ?? [],
        movimentacoes: db.movimentacoes_estoque ?? [],
      },
      { sobrescreverQuantidade: true }
    )
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
