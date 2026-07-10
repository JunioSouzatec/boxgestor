import { isUuidFormato, localIdParaUuid } from '@/lib/local-id-uuid'
import {
  listarIdsLocaisCandidatos,
  obterLocalIdPorUuid,
  registrarMapeamentoId,
} from '@/services/supabase-sync/id-registry'
import type { Fornecedor } from '@/types/fornecedor'
import type { MovimentacaoEstoque } from '@/types/movimentacao-estoque'
import type { CategoriaPeca, Peca } from '@/types/peca'
import { normalizarUnidadePeca, type UnidadePecaOS } from '@/types/unidade-peca'

export interface InventoryItemRow {
  id: string
  office_id: string
  local_id?: string | null
  name: string
  code: string
  brand: string
  cost: number
  sale_price: number
  quantity: number
  minimum_stock: number
  category?: string | null
  supplier_id?: string | null
  unit?: string | null
  location?: string | null
  notes?: string | null
  barcode?: string | null
  active?: boolean | null
  deleted_at?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface SupplierRow {
  id: string
  office_id: string
  local_id?: string | null
  name: string
  metadata?: Record<string, unknown> | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface InventoryMovementRow {
  id: string
  office_id: string
  local_id?: string | null
  inventory_item_id: string
  movement_type: string
  quantity: number
  unit_cost: number
  total_value: number
  movement_date: string
  service_order_id?: string | null
  supplier_id?: string | null
  reason?: string | null
  notes?: string | null
  user_id?: string | null
  user_name?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

interface FornecedorMetadata {
  cnpj?: string
  telefone?: string
  whatsapp?: string
  email?: string
  endereco?: string
  cidade?: string
  estado?: string
  observacoes?: string
}

interface MovimentacaoMetadata {
  peca_id?: string
  peca_nome?: string
  fornecedor_id?: string
  fornecedor_nome?: string
  ordem_servico_numero?: number
  numero_nota?: string
}

async function uuidDeLocal(localId: string): Promise<string> {
  const trimmed = localId.trim()
  if (isUuidFormato(trimmed)) return trimmed
  return localIdParaUuid(trimmed)
}

async function uuidOpcional(localId?: string | null): Promise<string | null> {
  if (!localId?.trim()) return null
  return uuidDeLocal(localId)
}

async function localDeUuid(
  uuid: string,
  candidatos: string[],
  prefixoFallback?: string
): Promise<string> {
  const registrado = obterLocalIdPorUuid(uuid)
  if (registrado) return registrado

  for (const localId of candidatos) {
    if ((await localIdParaUuid(localId)) === uuid) {
      registrarMapeamentoId(localId, uuid)
      return localId
    }
  }

  if (prefixoFallback) return `${prefixoFallback}-${uuid.slice(0, 8)}`
  return uuid
}

export async function mapearFornecedorParaSupabase(
  fornecedor: Fornecedor,
  officeUuid: string
): Promise<SupplierRow> {
  const id = await uuidDeLocal(fornecedor.id)
  registrarMapeamentoId(fornecedor.id, id)

  const metadata: FornecedorMetadata = {
    cnpj: fornecedor.cnpj,
    telefone: fornecedor.telefone,
    whatsapp: fornecedor.whatsapp,
    email: fornecedor.email,
    endereco: fornecedor.endereco,
    cidade: fornecedor.cidade,
    estado: fornecedor.estado,
    observacoes: fornecedor.observacoes,
  }

  return {
    id,
    office_id: officeUuid,
    local_id: fornecedor.id,
    name: fornecedor.nome,
    metadata: metadata as Record<string, unknown>,
    active: fornecedor.ativo !== false,
    created_at: fornecedor.created_at ?? new Date().toISOString(),
    updated_at: fornecedor.updated_at ?? fornecedor.created_at ?? new Date().toISOString(),
  }
}

export async function mapearFornecedorDoSupabase(
  row: SupplierRow,
  officeIdLocal: string
): Promise<Fornecedor> {
  const localId = row.local_id?.trim() || (await localDeUuid(row.id, listarIdsLocaisCandidatos(), 'forn'))
  registrarMapeamentoId(localId, row.id)

  const meta = (row.metadata ?? {}) as FornecedorMetadata

  return {
    id: localId,
    oficina_id: officeIdLocal,
    office_id: officeIdLocal,
    nome: row.name,
    cnpj: meta.cnpj,
    telefone: meta.telefone,
    whatsapp: meta.whatsapp,
    email: meta.email,
    endereco: meta.endereco,
    cidade: meta.cidade,
    estado: meta.estado,
    observacoes: meta.observacoes,
    ativo: row.active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function mapearPecaParaSupabase(
  peca: Peca,
  officeUuid: string,
  mapaFornecedorUuid: Map<string, string>
): Promise<InventoryItemRow> {
  const id = await uuidDeLocal(peca.id)
  registrarMapeamentoId(peca.id, id)

  const supplierUuid = peca.fornecedor_id ? mapaFornecedorUuid.get(peca.fornecedor_id) ?? null : null

  return {
    id,
    office_id: officeUuid,
    local_id: peca.id,
    name: peca.nome,
    code: peca.codigo || peca.id,
    brand: peca.marca || '',
    cost: peca.custo ?? 0,
    sale_price: peca.preco_venda ?? 0,
    quantity: peca.quantidade ?? 0,
    minimum_stock: peca.estoque_minimo ?? 0,
    category: peca.categoria ?? 'outros',
    supplier_id: supplierUuid,
    unit: peca.unidade ?? 'unidade',
    location: peca.localizacao,
    notes: peca.observacao,
    barcode: peca.codigo_barras,
    active: peca.ativo !== false && !peca.deleted_at,
    deleted_at: peca.deleted_at ?? null,
    metadata: {
      fornecedor_id_local: peca.fornecedor_id,
    } as Record<string, unknown>,
    created_at: peca.created_at ?? new Date().toISOString(),
    updated_at: peca.updated_at ?? peca.created_at ?? new Date().toISOString(),
  }
}

export async function mapearPecaDoSupabase(
  row: InventoryItemRow,
  officeIdLocal: string,
  mapaFornecedorLocal: Map<string, string>
): Promise<Peca> {
  const localId = row.local_id?.trim() || (await localDeUuid(row.id, listarIdsLocaisCandidatos(), 'peca'))
  registrarMapeamentoId(localId, row.id)

  const meta = (row.metadata ?? {}) as { fornecedor_id_local?: string }
  let fornecedorId = meta.fornecedor_id_local
  if (!fornecedorId && row.supplier_id) {
    fornecedorId = mapaFornecedorLocal.get(row.supplier_id)
  }

  return {
    id: localId,
    oficina_id: officeIdLocal,
    office_id: officeIdLocal,
    nome: row.name,
    codigo: row.code,
    codigo_barras: row.barcode ?? undefined,
    marca: row.brand ?? '',
    categoria: (row.category as CategoriaPeca | undefined) ?? 'outros',
    fornecedor_id: fornecedorId,
    custo: Number(row.cost) || 0,
    preco_venda: Number(row.sale_price) || 0,
    quantidade: Number(row.quantity) || 0,
    estoque_minimo: Number(row.minimum_stock) || 0,
    localizacao: row.location ?? undefined,
    observacao: row.notes ?? undefined,
    unidade: normalizarUnidadePeca(row.unit) as UnidadePecaOS,
    ativo: row.active !== false && !row.deleted_at,
    deleted_at: row.deleted_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function mapearMovimentacaoParaSupabase(
  mov: MovimentacaoEstoque,
  officeUuid: string,
  mapaPecaUuid: Map<string, string>,
  mapaFornecedorUuid: Map<string, string>
): Promise<InventoryMovementRow | null> {
  const inventoryItemId = mapaPecaUuid.get(mov.peca_id)
  if (!inventoryItemId) return null

  const id = await uuidDeLocal(mov.id)
  registrarMapeamentoId(mov.id, id)

  const metadata: MovimentacaoMetadata = {
    peca_id: mov.peca_id,
    peca_nome: mov.peca_nome,
    fornecedor_id: mov.fornecedor_id,
    fornecedor_nome: mov.fornecedor_nome,
    ordem_servico_numero: mov.ordem_servico_numero,
    numero_nota: mov.numero_nota,
  }

  return {
    id,
    office_id: officeUuid,
    local_id: mov.id,
    inventory_item_id: inventoryItemId,
    movement_type: mov.tipo,
    quantity: mov.quantidade,
    unit_cost: mov.valor_unitario ?? 0,
    total_value: mov.valor_total ?? 0,
    movement_date: mov.data?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    service_order_id: await uuidOpcional(mov.ordem_servico_id),
    supplier_id: mov.fornecedor_id ? mapaFornecedorUuid.get(mov.fornecedor_id) ?? null : null,
    reason: mov.motivo,
    notes: mov.observacao,
    user_id: await uuidOpcional(mov.usuario_id),
    user_name: mov.usuario_nome,
    metadata: metadata as Record<string, unknown>,
    created_at: mov.created_at ?? new Date().toISOString(),
  }
}

export async function mapearMovimentacaoDoSupabase(
  row: InventoryMovementRow,
  officeIdLocal: string,
  mapaPecaLocal: Map<string, string>
): Promise<MovimentacaoEstoque> {
  const localId = row.local_id?.trim() || (await localDeUuid(row.id, listarIdsLocaisCandidatos(), 'mov'))
  registrarMapeamentoId(localId, row.id)

  const meta = (row.metadata ?? {}) as MovimentacaoMetadata
  const pecaId =
    meta.peca_id ??
    (row.inventory_item_id ? mapaPecaLocal.get(row.inventory_item_id) : undefined) ??
    row.inventory_item_id

  return {
    id: localId,
    oficina_id: officeIdLocal,
    office_id: officeIdLocal,
    peca_id: pecaId,
    peca_nome: meta.peca_nome ?? '',
    tipo: row.movement_type as MovimentacaoEstoque['tipo'],
    quantidade: Number(row.quantity) || 0,
    valor_unitario: Number(row.unit_cost) || 0,
    valor_total: Number(row.total_value) || 0,
    data: row.movement_date,
    fornecedor_id: meta.fornecedor_id,
    fornecedor_nome: meta.fornecedor_nome,
    ordem_servico_id: row.service_order_id ?? undefined,
    ordem_servico_numero: meta.ordem_servico_numero,
    numero_nota: meta.numero_nota,
    motivo: row.reason ?? undefined,
    observacao: row.notes ?? undefined,
    usuario_id: row.user_id ?? undefined,
    usuario_nome: row.user_name ?? undefined,
    created_at: row.created_at,
  }
}
