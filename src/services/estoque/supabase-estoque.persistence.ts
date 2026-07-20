import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import {
  mapearFornecedorDoSupabase,
  mapearFornecedorParaSupabase,
  mapearMovimentacaoDoSupabase,
  mapearMovimentacaoParaSupabase,
  mapearPecaDoSupabase,
  mapearPecaParaSupabase,
  type InventoryItemRow,
  type InventoryMovementRow,
  type SupplierRow,
} from '@/services/estoque/estoque-mappers'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import type { Fornecedor } from '@/types/fornecedor'
import type { MovimentacaoEstoque } from '@/types/movimentacao-estoque'
import type { Peca } from '@/types/peca'

export interface DadosEstoqueRemotos {
  pecas: Peca[]
  fornecedores: Fornecedor[]
  movimentacoes: MovimentacaoEstoque[]
}

export interface ResultadoCarregamentoEstoque {
  ok: boolean
  dados: DadosEstoqueRemotos | null
  erros: SyncErro[]
}

export interface ResultadoPersistenciaEstoque {
  ok: boolean
  erros: SyncErro[]
  pecasEnviadas: number
  fornecedoresEnviados: number
  movimentacoesEnviadas: number
}

async function resolverOfficeUuid(officeIdLocal: string): Promise<string | null> {
  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  return contexto?.officeUuid ?? null
}

function sanitizarLinha(linha: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    if (valor !== undefined) out[chave] = valor
  }
  return out
}

function tabelaInexistente(msg: string): boolean {
  const m = msg.toLowerCase()
  return m.includes('does not exist') || m.includes('relation')
}

/** Garante tombstones no Supabase e remove duplicatas ativas por código/local_id. */
async function reconciliarInventoryItemsAposPersistencia(
  officeUuid: string,
  pecas: Peca[]
): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase || pecas.length === 0) return

  const agora = new Date().toISOString()

  for (const peca of pecas) {
    if (!peca.deleted_at && peca.ativo !== false) continue

    const { error } = await supabase
      .from('inventory_items')
      .update({
        active: false,
        deleted_at: peca.deleted_at ?? agora,
        updated_at: agora,
      } as never)
      .eq('office_id', officeUuid)
      .eq('local_id', peca.id)

    if (error && import.meta.env.DEV) {
      console.warn('[Craft Estoque] Falha ao tombstone por local_id', {
        local_id: peca.id,
        error: error.message,
      })
    }
  }

  for (const peca of pecas) {
    if (entidadeFoiExcluida(peca)) continue
    const codigo = peca.codigo?.trim()
    if (!codigo) continue

    // Só tombstone duplicatas ATIVAS com mesmo código e outro local_id.
    // Nunca rodar isso a partir de peça local excluída (apagava catálogo do outro device).
    const { error } = await supabase
      .from('inventory_items')
      .update({
        active: false,
        deleted_at: agora,
        updated_at: agora,
      } as never)
      .eq('office_id', officeUuid)
      .eq('code', codigo)
      .neq('local_id', peca.id)
      .is('deleted_at', null)
      .eq('active', true)

    if (error && import.meta.env.DEV) {
      console.warn('[Craft Estoque] Falha ao tombstone duplicata por código', {
        codigo,
        local_id: peca.id,
        error: error.message,
      })
    }
  }
}

export async function carregarEstoqueDoSupabase(
  officeIdLocal: string
): Promise<ResultadoCarregamentoEstoque> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Estoque', mensagem: 'Supabase não configurado' }],
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Estoque', mensagem: 'Cliente Supabase indisponível' }],
    }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return {
      ok: false,
      dados: null,
      erros: [{ entidade: 'Estoque', mensagem: 'Sem office_id no perfil' }],
    }
  }

  const [fornecedoresRes, pecasRes, movimentacoesRes] = await Promise.all([
    supabase.from('suppliers').select('*').eq('office_id', officeUuid).order('name'),
    supabase.from('inventory_items').select('*').eq('office_id', officeUuid).order('name'),
    supabase
      .from('inventory_movements')
      .select('*')
      .eq('office_id', officeUuid)
      .order('movement_date', { ascending: false }),
  ])

  const erros: SyncErro[] = []
  if (fornecedoresRes.error) {
    if (!tabelaInexistente(fornecedoresRes.error.message)) {
      erros.push({ entidade: 'Fornecedores', mensagem: fornecedoresRes.error.message })
    }
  }
  if (pecasRes.error) {
    erros.push({ entidade: 'Peças', mensagem: pecasRes.error.message })
  }
  if (movimentacoesRes.error && !tabelaInexistente(movimentacoesRes.error.message)) {
    erros.push({ entidade: 'Movimentações', mensagem: movimentacoesRes.error.message })
  }

  if (pecasRes.error) {
    registrarUltimoErroSupabase({ mensagem: pecasRes.error.message, entidade: 'inventory_items' })
    return { ok: false, dados: null, erros }
  }

  const fornecedores: Fornecedor[] = []
  const mapaFornecedorLocal = new Map<string, string>()
  for (const row of (fornecedoresRes.data ?? []) as SupplierRow[]) {
    const f = await mapearFornecedorDoSupabase(row, officeIdLocal)
    fornecedores.push(f)
    mapaFornecedorLocal.set(row.id, f.id)
  }

  const pecas: Peca[] = []
  const mapaPecaLocal = new Map<string, string>()
  for (const row of (pecasRes.data ?? []) as InventoryItemRow[]) {
    const p = await mapearPecaDoSupabase(row, officeIdLocal, mapaFornecedorLocal)
    pecas.push(p)
    mapaPecaLocal.set(row.id, p.id)
  }

  const movimentacoes: MovimentacaoEstoque[] = []
  if (!movimentacoesRes.error) {
    for (const row of (movimentacoesRes.data ?? []) as InventoryMovementRow[]) {
      movimentacoes.push(await mapearMovimentacaoDoSupabase(row, officeIdLocal, mapaPecaLocal))
    }
  }

  return {
    ok: true,
    dados: { pecas, fornecedores, movimentacoes },
    erros,
  }
}

export async function persistirEstoqueNoSupabase(
  officeIdLocal: string,
  dados: {
    pecas: Peca[]
    fornecedores: Fornecedor[]
    movimentacoes: MovimentacaoEstoque[]
  },
  opcoes?: { sobrescreverQuantidade?: boolean }
): Promise<ResultadoPersistenciaEstoque> {
  const sobrescreverQuantidade = opcoes?.sobrescreverQuantidade === true
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      erros: [{ entidade: 'Estoque', mensagem: 'Supabase não configurado' }],
      pecasEnviadas: 0,
      fornecedoresEnviados: 0,
      movimentacoesEnviadas: 0,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      erros: [{ entidade: 'Estoque', mensagem: 'Cliente Supabase indisponível' }],
      pecasEnviadas: 0,
      fornecedoresEnviados: 0,
      movimentacoesEnviadas: 0,
    }
  }

  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    console.info('[BoxGestor Estoque][create]', {
      fase: 'persist_sem_office_uuid',
      office_id: officeIdLocal,
      pecas: dados.pecas.map((p) => ({ local_id: p.id, codigo: p.codigo })),
      erro_supabase: 'Sem office_id no perfil',
    })
    return {
      ok: false,
      erros: [{ entidade: 'Estoque', mensagem: 'Sem office_id no perfil' }],
      pecasEnviadas: 0,
      fornecedoresEnviados: 0,
      movimentacoesEnviadas: 0,
    }
  }

  const erros: SyncErro[] = []
  const mapaFornecedorUuid = new Map<string, string>()

  if (dados.fornecedores.length > 0) {
    const linhasFornecedores = await Promise.all(
      dados.fornecedores.map((f) => mapearFornecedorParaSupabase(f, officeUuid))
    )
    const { error } = await supabase
      .from('suppliers')
      .upsert(
        linhasFornecedores.map((l) =>
          sanitizarLinha(l as unknown as Record<string, unknown>)
        ) as never[],
        { onConflict: 'office_id,local_id' }
      )

    if (error) {
      if (!tabelaInexistente(error.message)) {
        erros.push({ entidade: 'Fornecedores', mensagem: error.message })
        registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'suppliers' })
      }
    } else {
      for (const linha of linhasFornecedores) {
        if (linha.local_id) mapaFornecedorUuid.set(linha.local_id, linha.id)
      }
    }
  }

  const { data: fornecedoresRemotos } = await supabase
    .from('suppliers')
    .select('id, local_id')
    .eq('office_id', officeUuid)

  for (const row of (fornecedoresRemotos ?? []) as { id: string; local_id?: string | null }[]) {
    if (row.local_id) mapaFornecedorUuid.set(row.local_id, row.id)
  }

  const { data: pecasRemotasExistentes } = await supabase
    .from('inventory_items')
    .select('id, local_id, deleted_at, active, updated_at')
    .eq('office_id', officeUuid)

  type RemotoMeta = {
    local_id?: string | null
    deleted_at?: string | null
    active?: boolean | null
    updated_at?: string | null
  }
  const remotoPorLocalId = new Map<string, RemotoMeta>()
  for (const row of (pecasRemotasExistentes ?? []) as RemotoMeta[]) {
    if (row.local_id) remotoPorLocalId.set(row.local_id, row)
  }

  const localIdsRemotos = new Set(remotoPorLocalId.keys())

  // Dispositivo stale não pode reativar peça já excluída no Supabase
  const pecasParaEnviar = dados.pecas.filter((p) => {
    const rem = remotoPorLocalId.get(p.id)
    if (!rem) return true
    const remExcluido = Boolean(rem.deleted_at) || rem.active === false
    if (remExcluido && !entidadeFoiExcluida(p)) {
      if (import.meta.env.DEV) {
        console.warn('[Craft Estoque] Skip upsert: não ressuscitar tombstone remoto', {
          local_id: p.id,
          deleted_at: rem.deleted_at,
        })
      }
      return false
    }
    return true
  })

  let pecasEnviadas = 0
  if (pecasParaEnviar.length > 0) {
    const linhasPecas = await Promise.all(
      pecasParaEnviar.map(async (p) => {
        const linha = await mapearPecaParaSupabase(p, officeUuid, mapaFornecedorUuid)
        // Nunca sobrescrever quantity remoto com snapshot local antigo
        // (exceto peça nova ainda não publicada, ou flag explícita).
        const pecaNova = !localIdsRemotos.has(p.id)
        if (!sobrescreverQuantidade && !pecaNova) {
          const { quantity: _q, ...semQty } = linha
          return semQty
        }
        return linha
      })
    )
    const { error } = await supabase
      .from('inventory_items')
      .upsert(
        linhasPecas.map((l) => sanitizarLinha(l as unknown as Record<string, unknown>)) as never[],
        { onConflict: 'office_id,local_id' }
      )

    if (error) {
      erros.push({ entidade: 'Peças', mensagem: error.message })
      registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'inventory_items' })
      console.info('[BoxGestor Estoque][create]', {
        fase: 'upsert_erro',
        office_id: officeIdLocal,
        office_uuid: officeUuid,
        local_ids: pecasParaEnviar.map((p) => p.id),
        codigos: pecasParaEnviar.map((p) => p.codigo),
        erro_supabase: error.message,
        erro_code: error.code,
        erro_details: error.details,
      })
    } else {
      pecasEnviadas = linhasPecas.length
      await reconciliarInventoryItemsAposPersistencia(officeUuid, pecasParaEnviar)
    }
  } else if (dados.pecas.length > 0) {
    erros.push({
      entidade: 'Peças',
      mensagem: 'Nenhuma peça enviada (filtradas por tombstone remoto ou lista vazia)',
    })
    console.info('[BoxGestor Estoque][create]', {
      fase: 'upsert_filtrado',
      office_id: officeIdLocal,
      office_uuid: officeUuid,
      local_ids: dados.pecas.map((p) => p.id),
      erro_supabase: 'todas as peças foram filtradas antes do upsert',
    })
  }

  const mapaPecaUuid = new Map<string, string>()
  const { data: pecasRemotas } = await supabase
    .from('inventory_items')
    .select('id, local_id')
    .eq('office_id', officeUuid)

  for (const row of (pecasRemotas ?? []) as { id: string; local_id?: string | null }[]) {
    if (row.local_id) mapaPecaUuid.set(row.local_id, row.id)
  }

  let movimentacoesEnviadas = 0
  if (dados.movimentacoes.length > 0) {
    const linhasMov: InventoryMovementRow[] = []
    for (const mov of dados.movimentacoes) {
      const linha = await mapearMovimentacaoParaSupabase(
        mov,
        officeUuid,
        mapaPecaUuid,
        mapaFornecedorUuid
      )
      if (linha) linhasMov.push(linha)
    }

    if (linhasMov.length > 0) {
      const { error } = await supabase
        .from('inventory_movements')
        .upsert(
          linhasMov.map((l) => sanitizarLinha(l as unknown as Record<string, unknown>)) as never[],
          { onConflict: 'office_id,local_id' }
        )

      if (error) {
        if (!tabelaInexistente(error.message)) {
          erros.push({ entidade: 'Movimentações', mensagem: error.message })
          registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'inventory_movements' })
        }
      } else {
        movimentacoesEnviadas = linhasMov.length
      }
    }
  }

  return {
    ok: erros.length === 0,
    erros,
    pecasEnviadas,
    fornecedoresEnviados: dados.fornecedores.length,
    movimentacoesEnviadas,
  }
}

/** Confirma se inventory_items tem a peça pelo local_id da oficina. */
export async function verificarPecaNoSupabase(
  officeIdLocal: string,
  localId: string
): Promise<{
  existe: boolean
  officeUuid: string | null
  quantity?: number
  inventoryItemId?: string
  erro?: string
}> {
  if (!isSupabaseConfigured()) {
    return { existe: false, officeUuid: null, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { existe: false, officeUuid: null, erro: 'Cliente Supabase indisponível' }
  }
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return { existe: false, officeUuid: null, erro: 'Sem office_id no perfil' }
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, local_id, active, deleted_at, quantity')
    .eq('office_id', officeUuid)
    .eq('local_id', localId)
    .maybeSingle()

  if (error) {
    return { existe: false, officeUuid, erro: error.message }
  }
  if (!data) {
    return { existe: false, officeUuid }
  }
  const row = data as { id: string; quantity?: number | null }
  return {
    existe: true,
    officeUuid,
    quantity: Number(row.quantity) || 0,
    inventoryItemId: row.id,
  }
}

/**
 * UPDATE explícito de quantity em inventory_items (edição/ajuste intencional).
 * Diferente do sync de catálogo, que omit quantity para não sobrescrever com cache stale.
 */
export async function atualizarQuantidadePecaNoSupabase(
  officeIdLocal: string,
  localId: string,
  quantidadeNova: number
): Promise<{
  ok: boolean
  officeUuid: string | null
  inventoryItemId?: string
  quantityAntes?: number
  quantityDepois?: number
  erro?: string
}> {
  if (!isSupabaseConfigured()) {
    return { ok: false, officeUuid: null, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, officeUuid: null, erro: 'Cliente Supabase indisponível' }
  }
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return { ok: false, officeUuid: null, erro: 'Sem office_id no perfil' }
  }

  const { data: antes, error: errSelect } = await supabase
    .from('inventory_items')
    .select('id, quantity')
    .eq('office_id', officeUuid)
    .eq('local_id', localId)
    .maybeSingle()

  if (errSelect) {
    return { ok: false, officeUuid, erro: errSelect.message }
  }
  if (!antes) {
    return {
      ok: false,
      officeUuid,
      erro: 'Peça não encontrada no Supabase (local_id ausente em inventory_items)',
    }
  }

  const rowAntes = antes as { id: string; quantity?: number | null }
  const quantityAntes = Number(rowAntes.quantity) || 0
  const agora = new Date().toISOString()

  const { data: depois, error: errUpdate } = await supabase
    .from('inventory_items')
    .update({
      quantity: quantidadeNova,
      updated_at: agora,
    } as never)
    .eq('office_id', officeUuid)
    .eq('local_id', localId)
    .select('id, quantity')
    .maybeSingle()

  if (errUpdate) {
    return {
      ok: false,
      officeUuid,
      inventoryItemId: rowAntes.id,
      quantityAntes,
      erro: errUpdate.message,
    }
  }

  const rowDepois = depois as { id: string; quantity?: number | null } | null
  const quantityDepois = rowDepois ? Number(rowDepois.quantity) || 0 : undefined

  if (quantityDepois !== quantidadeNova) {
    return {
      ok: false,
      officeUuid,
      inventoryItemId: rowAntes.id,
      quantityAntes,
      quantityDepois,
      erro: `UPDATE não confirmado (esperado ${quantidadeNova}, remoto ${quantityDepois ?? 'null'})`,
    }
  }

  return {
    ok: true,
    officeUuid,
    inventoryItemId: rowAntes.id,
    quantityAntes,
    quantityDepois,
  }
}
