/**
 * Fotos de OS — base técnica (Fase 1A).
 *
 * ATENÇÃO:
 * - Serviço preparado para UI futura; NÃO importar em telas nesta fase.
 * - Arquivos vão para Supabase Storage (bucket privado); banco só metadados.
 * - NÃO salvar imagem em base64.
 * - Soft delete: apenas `deleted_at` — Storage não é removido na v1.
 * - Bucket/policies devem existir no projeto Supabase antes do uso real
 *   (não criados por esta fase).
 */

import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { isUuidFormato, localIdParaUuid } from '@/lib/local-id-uuid'

export const SERVICE_ORDER_PHOTOS_BUCKET = 'service-order-photos'

export type TipoFotoOS =
  | 'geral'
  | 'entrada'
  | 'avaria'
  | 'peca_antiga'
  | 'peca_nova'
  | 'servico'
  | 'entrega'
  | 'antes'
  | 'depois'

export interface ServiceOrderPhotoRow {
  id: string
  office_id: string
  service_order_id: string
  storage_path: string
  public_url: string | null
  caption: string | null
  photo_type: string
  sort_order: number
  checklist_item_id: string | null
  created_by: string | null
  created_by_name: string | null
  deleted_at: string | null
  local_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ListarFotosOSParams {
  /** office_id local ou UUID da oficina */
  officeId: string
  /** UUID da OS no Supabase (ou id local — será derivado) */
  serviceOrderId: string
  /** Se true, inclui soft-deleted. Default: false. */
  incluirExcluidas?: boolean
}

export interface UploadFotoOSParams {
  officeId: string
  serviceOrderId: string
  file: Blob
  fileName?: string
  contentType?: string
  caption?: string
  photoType?: TipoFotoOS | string
  checklistItemId?: string
  createdBy?: string
  createdByName?: string
  localId?: string
  sortOrder?: number
  metadata?: Record<string, unknown>
}

export interface SoftDeleteFotoOSParams {
  officeId: string
  fotoId: string
}

export interface ResultadoFotosOS<T = unknown> {
  ok: boolean
  dados?: T
  erro?: string
}

function extensaoArquivo(fileName?: string, contentType?: string): string {
  const doNome = fileName?.split('.').pop()?.toLowerCase()
  if (doNome && /^[a-z0-9]{2,5}$/.test(doNome)) return doNome
  if (contentType?.includes('png')) return 'png'
  if (contentType?.includes('webp')) return 'webp'
  if (contentType?.includes('gif')) return 'gif'
  return 'jpg'
}

function montarStoragePath(params: {
  officeUuid: string
  serviceOrderUuid: string
  fotoId: string
  ext: string
}): string {
  return `offices/${params.officeUuid}/orders/${params.serviceOrderUuid}/${params.fotoId}.${params.ext}`
}

async function resolverOfficeUuid(officeId: string): Promise<string | null> {
  const ctx = await obterContextoOfficeSupabase(officeId)
  return ctx?.officeUuid ?? null
}

async function resolverServiceOrderUuid(serviceOrderId: string): Promise<string> {
  const trimmed = serviceOrderId.trim()
  if (isUuidFormato(trimmed)) return trimmed
  return localIdParaUuid(trimmed)
}

/**
 * Lista metadados de fotos da OS (sem baixar o arquivo).
 * Por padrão ignora registros com deleted_at.
 */
export async function listarFotosOS(
  params: ListarFotosOSParams
): Promise<ResultadoFotosOS<ServiceOrderPhotoRow[]>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, erro: 'Cliente Supabase indisponível' }
  }

  const officeUuid = await resolverOfficeUuid(params.officeId)
  if (!officeUuid) {
    return { ok: false, erro: 'Sem office_id no perfil' }
  }

  const serviceOrderUuid = await resolverServiceOrderUuid(params.serviceOrderId)

  let query = supabase
    .from('service_order_photos')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('service_order_id', serviceOrderUuid)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (!params.incluirExcluidas) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query

  if (error) {
    return { ok: false, erro: error.message }
  }

  return {
    ok: true,
    dados: (data ?? []) as ServiceOrderPhotoRow[],
  }
}

/**
 * Faz upload do arquivo no Storage e grava metadados em service_order_photos.
 * Não altera a OS (entry_checklist / fotos JSON).
 */
export async function uploadFotoOS(
  params: UploadFotoOSParams
): Promise<ResultadoFotosOS<ServiceOrderPhotoRow>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, erro: 'Cliente Supabase indisponível' }
  }

  const officeUuid = await resolverOfficeUuid(params.officeId)
  if (!officeUuid) {
    return { ok: false, erro: 'Sem office_id no perfil' }
  }

  const serviceOrderUuid = await resolverServiceOrderUuid(params.serviceOrderId)
  const fotoId = crypto.randomUUID()
  const ext = extensaoArquivo(params.fileName, params.contentType ?? params.file.type)
  const storagePath = montarStoragePath({
    officeUuid,
    serviceOrderUuid,
    fotoId,
    ext,
  })

  const contentType = params.contentType ?? params.file.type ?? 'image/jpeg'

  const { error: uploadError } = await supabase.storage
    .from(SERVICE_ORDER_PHOTOS_BUCKET)
    .upload(storagePath, params.file, {
      contentType,
      upsert: false,
      cacheControl: '3600',
    })

  if (uploadError) {
    return { ok: false, erro: uploadError.message }
  }

  const linha = {
    id: fotoId,
    office_id: officeUuid,
    service_order_id: serviceOrderUuid,
    storage_path: storagePath,
    public_url: null as string | null,
    caption: params.caption?.trim() || null,
    photo_type: (params.photoType ?? 'geral').trim() || 'geral',
    sort_order: params.sortOrder ?? 0,
    checklist_item_id: params.checklistItemId?.trim() || null,
    created_by: params.createdBy?.trim() || null,
    created_by_name: params.createdByName?.trim() || null,
    deleted_at: null as string | null,
    local_id: params.localId?.trim() || null,
    metadata: {
      ...(params.metadata ?? {}),
      content_type: contentType,
      file_name: params.fileName ?? null,
      size: typeof params.file.size === 'number' ? params.file.size : null,
    },
  }

  const { data, error: insertError } = await supabase
    .from('service_order_photos')
    .insert(linha as never)
    .select('*')
    .maybeSingle()

  if (insertError || !data) {
    const motivoInsert =
      insertError?.message ?? 'metadados não retornaram após o insert'

    // Compensação: remove somente o arquivo recém-enviado (mesmo storagePath)
    const { error: removeError } = await supabase.storage
      .from(SERVICE_ORDER_PHOTOS_BUCKET)
      .remove([storagePath])

    if (removeError) {
      console.warn('[BoxGestor Fotos OS] Órfão no Storage após falha de metadados', {
        storagePath,
        insertError: motivoInsert,
        removeError: removeError.message,
      })
      return {
        ok: false,
        erro:
          'Não foi possível salvar os dados da foto. O arquivo pode ter ficado pendente no servidor; tente novamente ou avise o suporte.',
      }
    }

    console.warn('[BoxGestor Fotos OS] Upload revertido após falha de metadados', {
      storagePath,
      insertError: motivoInsert,
    })
    return {
      ok: false,
      erro: 'Não foi possível salvar os dados da foto. O envio foi desfeito. Tente novamente.',
    }
  }

  return {
    ok: true,
    dados: data as ServiceOrderPhotoRow,
  }
}

/**
 * Soft delete: marca deleted_at. Não remove o arquivo do Storage na v1.
 */
export async function softDeleteFotoOS(
  params: SoftDeleteFotoOSParams
): Promise<ResultadoFotosOS<{ id: string; deleted_at: string }>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, erro: 'Cliente Supabase indisponível' }
  }

  const officeUuid = await resolverOfficeUuid(params.officeId)
  if (!officeUuid) {
    return { ok: false, erro: 'Sem office_id no perfil' }
  }

  const deletedAt = new Date().toISOString()

  const { data, error } = await supabase
    .from('service_order_photos')
    .update({ deleted_at: deletedAt } as never)
    .eq('office_id', officeUuid)
    .eq('id', params.fotoId)
    .is('deleted_at', null)
    .select('id, deleted_at')
    .maybeSingle()

  if (error) {
    return { ok: false, erro: error.message }
  }

  if (!data) {
    return { ok: false, erro: 'Foto não encontrada ou já excluída' }
  }

  return {
    ok: true,
    dados: data as { id: string; deleted_at: string },
  }
}
