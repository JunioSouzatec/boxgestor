/**
 * Fotos de OS — base técnica + helpers de exibição.
 *
 * ATENÇÃO:
 * - Arquivos vão para Supabase Storage (bucket privado); banco só metadados.
 * - NÃO salvar imagem em base64.
 * - Soft delete: apenas `deleted_at` — Storage não é removido na v1.
 * - Upload/delete pela UI ainda não estão ligados nesta fase (2.1 = leitura).
 */

import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { isUuidFormato, localIdParaUuid } from '@/lib/local-id-uuid'
import {
  obterUuidPorLocalId,
  registrarMapeamentoId,
} from '@/services/supabase-sync/id-registry'
import {
  osExisteNoSupabasePorId,
  vincularOsExistentePorNumero,
} from '@/services/supabase-sync/payment-os-sync.service'
import type { OrdemServico } from '@/types/ordem-servico'

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
  /** Id local da OS (gerarId/UUID local) — NÃO é necessariamente o id remoto */
  serviceOrderId: string
  /** Número da OS — fallback de vínculo office+number (igual pagamentos) */
  osNumero?: number
  /** Se true, inclui soft-deleted. Default: false. */
  incluirExcluidas?: boolean
}

export interface UploadFotoOSParams {
  officeId: string
  serviceOrderId: string
  /** Número da OS — fallback de vínculo office+number (igual pagamentos) */
  osNumero?: number
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

/**
 * Resolve UUID remoto da OS — alinhado a resolverOsSalvaNoSupabase (pagamentos).
 *
 * IMPORTANTE: ids locais são crypto.randomUUID() (gerarId). Parecer UUID NÃO
 * significa id remoto. O remoto costuma ser localIdParaUuid(idLocal).
 *
 * Ordem: registry → office+número → hash determinístico → UUID literal (raro).
 */
async function resolverServiceOrderUuidRemoto(params: {
  officeUuid: string
  serviceOrderId: string
  osNumero?: number
}): Promise<{ uuid: string | null; estrategia: string }> {
  const trimmed = params.serviceOrderId.trim()
  const officeUuid = params.officeUuid

  const mapeado = obterUuidPorLocalId(trimmed)
  if (mapeado && isUuidFormato(mapeado)) {
    if (await osExisteNoSupabasePorId(officeUuid, mapeado)) {
      return { uuid: mapeado.trim(), estrategia: 'id_registry' }
    }
  }

  if (params.osNumero != null && Number.isFinite(params.osNumero)) {
    const vinculada = await vincularOsExistentePorNumero(
      { id: trimmed, numero: params.osNumero } as OrdemServico,
      officeUuid
    )
    if (vinculada) {
      return { uuid: vinculada, estrategia: 'numero_office' }
    }
  }

  const deterministico = await localIdParaUuid(trimmed)
  if (await osExisteNoSupabasePorId(officeUuid, deterministico)) {
    registrarMapeamentoId(trimmed, deterministico)
    return { uuid: deterministico, estrategia: 'uuid_deterministico' }
  }

  // Caso raro: id local já é o UUID remoto real
  if (isUuidFormato(trimmed) && (await osExisteNoSupabasePorId(officeUuid, trimmed))) {
    registrarMapeamentoId(trimmed, trimmed)
    return { uuid: trimmed, estrategia: 'uuid_literal' }
  }

  console.warn('[BoxGestor Fotos OS] OS remota não encontrada', {
    osIdRecebido: trimmed,
    osNumero: params.osNumero ?? null,
    officeUuid,
    uuidMapeado: mapeado ?? null,
    uuidDeterministico: deterministico,
    estrategia: 'nao_encontrada',
  })

  return { uuid: null, estrategia: 'nao_encontrada' }
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

  const resolvido = await resolverServiceOrderUuidRemoto({
    officeUuid,
    serviceOrderId: params.serviceOrderId,
    osNumero: params.osNumero,
  })
  if (!resolvido.uuid) {
    return { ok: true, dados: [] }
  }

  let query = supabase
    .from('service_order_photos')
    .select('*')
    .eq('office_id', officeUuid)
    .eq('service_order_id', resolvido.uuid)
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

export type ServiceOrderPhotoComUrl = ServiceOrderPhotoRow & {
  /** URL temporária para exibir imagem de bucket privado. null se falhar. */
  signed_url: string | null
}

/**
 * Gera URL assinada (TTL padrão 1h) para path no bucket privado.
 * Não usa getPublicUrl. Não persiste public_url.
 */
export async function criarUrlAssinadaFotoOS(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<ResultadoFotosOS<string>> {
  const path = storagePath.trim()
  if (!path) {
    return { ok: false, erro: 'Caminho da foto inválido' }
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, erro: 'Cliente Supabase indisponível' }
  }

  const { data, error } = await supabase.storage
    .from(SERVICE_ORDER_PHOTOS_BUCKET)
    .createSignedUrl(path, expiresInSeconds)

  if (error || !data?.signedUrl) {
    return { ok: false, erro: error?.message ?? 'Não foi possível gerar URL assinada' }
  }

  return { ok: true, dados: data.signedUrl }
}

/**
 * Lista metadados e tenta assinar cada arquivo.
 * Falha de signed URL em uma foto não derruba a listagem.
 */
export async function listarFotosOSComUrls(
  params: ListarFotosOSParams
): Promise<ResultadoFotosOS<ServiceOrderPhotoComUrl[]>> {
  const listagem = await listarFotosOS(params)
  if (!listagem.ok || !listagem.dados) {
    return { ok: false, erro: listagem.erro ?? 'Falha ao listar fotos' }
  }

  const comUrls: ServiceOrderPhotoComUrl[] = await Promise.all(
    listagem.dados.map(async (foto) => {
      const assinado = await criarUrlAssinadaFotoOS(foto.storage_path)
      return {
        ...foto,
        signed_url: assinado.ok && assinado.dados ? assinado.dados : null,
      }
    })
  )

  return { ok: true, dados: comUrls }
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

  const resolvido = await resolverServiceOrderUuidRemoto({
    officeUuid,
    serviceOrderId: params.serviceOrderId,
    osNumero: params.osNumero,
  })
  if (!resolvido.uuid) {
    return {
      ok: false,
      erro:
        'Esta OS ainda não foi sincronizada com o servidor. Clique em Salvar e tente adicionar a foto novamente.',
    }
  }

  const serviceOrderUuid = resolvido.uuid
  console.info('[BoxGestor Fotos OS] OS remota resolvida para upload', {
    osIdRecebido: params.serviceOrderId,
    osNumero: params.osNumero ?? null,
    serviceOrderUuid,
    estrategia: resolvido.estrategia,
  })

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
        serviceOrderUuid,
        officeUuid,
        insertError: motivoInsert,
        insertErrorCode: insertError?.code ?? null,
        insertErrorDetails: insertError?.details ?? null,
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
      serviceOrderUuid,
      officeUuid,
      insertError: motivoInsert,
      insertErrorCode: insertError?.code ?? null,
      insertErrorDetails: insertError?.details ?? null,
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
