import { dataLocalParaIso, isUuidFormato, localIdParaUuid } from '@/lib/local-id-uuid'
import { registrarMapeamentoId } from '@/services/supabase-sync/id-registry'
import type { PerfilComissaoFuncionario } from '@/types/comissoes'
import { normalizarTipoComissao, tipoUsaMaoObra, tipoUsaPecas } from '@/types/comissoes'

export interface EmployeeCommissionProfileRow {
  id: string
  office_id: string
  local_id: string
  usuario_id?: string | null
  nome: string
  cargo: string
  salario_fixo_mensal: number
  comissao_ativa: boolean
  tipo_comissao: string
  percentual_comissao?: number | null
  /** Coluna aditiva — pode não existir em bancos antigos (lida também via metadata) */
  percentual_pecas?: number | null
  valor_fixo_por_os?: number | null
  observacoes?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function clampPercentual(valor?: number | null): number {
  return Math.max(0, Math.min(100, Number(valor ?? 0)))
}

async function resolverUsuarioUuid(usuarioId?: string): Promise<string | null> {
  if (!usuarioId?.trim()) return null
  if (isUuidFormato(usuarioId)) return usuarioId
  return localIdParaUuid(usuarioId)
}

export async function mapearPerfilComissaoParaSupabase(
  perfil: PerfilComissaoFuncionario,
  officeUuid: string
): Promise<EmployeeCommissionProfileRow> {
  const localId = perfil.id.trim()
  const id = await localIdParaUuid(`perfil-comissao:${localId}`)
  registrarMapeamentoId(localId, id)

  const tipo = normalizarTipoComissao(perfil.tipo_comissao)
  const percentualMaoObra = tipoUsaMaoObra(tipo) ? clampPercentual(perfil.percentual_comissao) : null
  const percentualPecas = tipoUsaPecas(tipo) ? clampPercentual(perfil.percentual_comissao_pecas) : null
  const valorFixo = tipo === 'valor_fixo_os' ? Math.max(0, perfil.valor_fixo_por_os ?? 0) : null

  // Importante: percentual_pecas NÃO vai como coluna no payload de escrita para não
  // quebrar bancos que ainda não receberam a migration aditiva. Fica no metadata (JSONB).
  return {
    id,
    office_id: officeUuid,
    local_id: localId,
    usuario_id: await resolverUsuarioUuid(perfil.usuario_id),
    nome: perfil.nome.trim(),
    cargo: perfil.cargo?.trim() ?? '',
    salario_fixo_mensal: Math.max(0, perfil.salario_fixo_mensal ?? 0),
    comissao_ativa: perfil.comissao_ativa === true,
    tipo_comissao: tipo,
    percentual_comissao: percentualMaoObra,
    valor_fixo_por_os: valorFixo,
    observacoes: perfil.observacoes?.trim() || null,
    // Espelho em metadata: garante o dado mesmo se a coluna aditiva não existir no banco.
    metadata: {
      tipo_comissao: tipo,
      percentual_pecas: percentualPecas,
    },
    created_at: dataLocalParaIso(perfil.created_at),
    updated_at: dataLocalParaIso(perfil.updated_at ?? perfil.created_at),
  }
}

export async function mapearPerfilComissaoDoSupabase(
  row: EmployeeCommissionProfileRow,
  officeIdLocal: string
): Promise<PerfilComissaoFuncionario> {
  const localId = row.local_id?.trim() || row.id
  registrarMapeamentoId(localId, row.id)

  const meta = (row.metadata ?? {}) as Record<string, unknown>
  // Prefere a coluna; cai para o espelho em metadata (bancos sem a coluna aditiva).
  const tipo = normalizarTipoComissao(row.tipo_comissao ?? meta.tipo_comissao)
  const percentualPecasRaw =
    row.percentual_pecas != null ? row.percentual_pecas : (meta.percentual_pecas as number | null | undefined)

  return {
    id: localId,
    oficina_id: officeIdLocal,
    office_id: officeIdLocal,
    usuario_id: row.usuario_id ?? undefined,
    nome: row.nome?.trim() || 'Funcionário',
    cargo: row.cargo?.trim() ?? '',
    salario_fixo_mensal: Number(row.salario_fixo_mensal ?? 0),
    comissao_ativa: row.comissao_ativa === true,
    tipo_comissao: tipo,
    percentual_comissao:
      row.percentual_comissao != null ? Number(row.percentual_comissao) : undefined,
    percentual_comissao_pecas:
      percentualPecasRaw != null ? Number(percentualPecasRaw) : undefined,
    valor_fixo_por_os: row.valor_fixo_por_os != null ? Number(row.valor_fixo_por_os) : undefined,
    observacoes: row.observacoes?.trim() || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
