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
  }
): Promise<ResultadoPersistenciaEstoque> {
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

  let pecasEnviadas = 0
  if (dados.pecas.length > 0) {
    const linhasPecas = await Promise.all(
      dados.pecas.map((p) => mapearPecaParaSupabase(p, officeUuid, mapaFornecedorUuid))
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
    } else {
      pecasEnviadas = linhasPecas.length
    }
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
