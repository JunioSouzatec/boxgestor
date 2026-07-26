/**
 * Fotos de OS offline (fase 2B/2C): salva no aparelho e expõe preview.
 * Upload/sync remoto fica fora desta fase.
 */

import {
  deletePendingPhotoCompleto,
  getPhotoBlob,
  listPendingPhotosByOs,
  putPendingPhotoMeta,
  putPhotoBlob,
  type OfflinePendingPhotoMeta,
} from '@/services/os/offline-service-order-photos.store'
import {
  listarFotosOSComUrls,
  type ServiceOrderPhotoComUrl,
  type TipoFotoOS,
} from '@/services/os/service-order-photos.service'

export interface SalvarFotoOfflineParams {
  officeId: string
  localOsId: string
  osNumero?: number
  file: Blob
  fileName?: string
  contentType?: string
  caption?: string
  photoType?: TipoFotoOS | string
  checklistItemId?: string
  checklistItemLabel?: string
  photoContext?: 'os' | 'checklist'
  includeInPdf?: boolean
  createdBy?: string
  createdByName?: string
}

export interface ResultadoFotoOffline<T = unknown> {
  ok: boolean
  dados?: T
  erro?: string
}

export function ehFotoPendenteOffline(
  foto: Pick<ServiceOrderPhotoComUrl, 'pending_offline' | 'metadata'>
): boolean {
  if (foto.pending_offline) return true
  return foto.metadata?.pending_offline === true
}

function metaParaExibicao(
  meta: OfflinePendingPhotoMeta,
  objectUrl: string | null
): ServiceOrderPhotoComUrl {
  return {
    id: meta.local_photo_id,
    office_id: meta.office_id,
    service_order_id: meta.service_order_id?.trim() || meta.local_os_id,
    storage_path: '',
    public_url: null,
    caption: meta.caption,
    photo_type: meta.photo_type || 'geral',
    sort_order: 0,
    checklist_item_id: meta.checklist_item_id?.trim() || null,
    created_by: meta.created_by?.trim() || null,
    created_by_name: meta.created_by_name?.trim() || null,
    deleted_at: null,
    deleted_by: null,
    deleted_by_name: null,
    deleted_reason: null,
    include_in_pdf: false,
    local_id: meta.local_photo_id,
    metadata: {
      pending_offline: true,
      photo_context: meta.photo_context,
      content_type: meta.content_type,
      file_name: meta.file_name,
      size: meta.size_bytes,
      checklist_item_label:
        meta.photo_context === 'checklist' && meta.caption?.startsWith('Checklist:')
          ? meta.caption.replace(/^Checklist:\s*/i, '')
          : null,
    },
    created_at: meta.created_at,
    updated_at: meta.updated_at,
    signed_url: objectUrl,
    pending_offline: true,
  }
}

export async function salvarFotoOsOffline(
  params: SalvarFotoOfflineParams
): Promise<ResultadoFotoOffline<OfflinePendingPhotoMeta>> {
  const officeId = params.officeId.trim()
  const localOsId = params.localOsId.trim()
  if (!officeId || !localOsId) {
    return { ok: false, erro: 'OS ou oficina inválida para salvar foto offline.' }
  }
  if (!(params.file instanceof Blob) || params.file.size <= 0) {
    return { ok: false, erro: 'Arquivo de foto inválido.' }
  }

  const agora = new Date().toISOString()
  const localPhotoId = crypto.randomUUID()
  const blobKey = localPhotoId
  const contentType =
    params.contentType?.trim() || params.file.type || 'image/jpeg'
  const checklistItemId = params.checklistItemId?.trim() || null
  const photoContext =
    params.photoContext ?? (checklistItemId ? 'checklist' : 'os')
  const checklistLabel = params.checklistItemLabel?.trim() || null
  const caption =
    params.caption?.trim() ||
    (photoContext === 'checklist' && checklistLabel
      ? `Checklist: ${checklistLabel}`
      : null)

  const meta: OfflinePendingPhotoMeta = {
    local_photo_id: localPhotoId,
    office_id: officeId,
    local_os_id: localOsId,
    service_order_id: null,
    os_numero: params.osNumero ?? null,
    checklist_item_id: checklistItemId,
    photo_context: photoContext,
    photo_type: (params.photoType ?? (photoContext === 'checklist' ? 'entrada' : 'geral'))
      .toString()
      .trim() || 'geral',
    caption,
    include_in_pdf: false,
    file_name: params.fileName?.trim() || `foto-${localPhotoId}.jpg`,
    content_type: contentType,
    size_bytes: params.file.size,
    blob_key: blobKey,
    status: 'pending',
    tentativas: 0,
    erro: null,
    created_at: agora,
    updated_at: agora,
    created_by: params.createdBy?.trim() || null,
    created_by_name: params.createdByName?.trim() || null,
  }

  try {
    await putPhotoBlob(blobKey, params.file)
    await putPendingPhotoMeta(meta)
    return { ok: true, dados: meta }
  } catch (err) {
    try {
      await deletePendingPhotoCompleto(localPhotoId)
    } catch {
      /* best-effort */
    }
    return {
      ok: false,
      erro:
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar a foto neste aparelho.',
    }
  }
}

export async function cancelarFotoOsPendente(
  localPhotoId: string
): Promise<ResultadoFotoOffline<{ local_photo_id: string }>> {
  try {
    const ok = await deletePendingPhotoCompleto(localPhotoId)
    if (!ok) {
      return { ok: false, erro: 'Foto pendente não encontrada neste aparelho.' }
    }
    return { ok: true, dados: { local_photo_id: localPhotoId.trim() } }
  } catch (err) {
    return {
      ok: false,
      erro:
        err instanceof Error
          ? err.message
          : 'Não foi possível remover a foto pendente.',
    }
  }
}

/**
 * Carrega pendentes ativas da OS com objectURL para preview.
 * Caller deve revogar objectUrls ao trocar de lista / desmontar.
 */
export async function listarFotosPendentesOsComPreview(
  officeId: string,
  localOsId: string
): Promise<{ fotos: ServiceOrderPhotoComUrl[]; objectUrls: string[] }> {
  const metas = await listPendingPhotosByOs(officeId, localOsId)
  const objectUrls: string[] = []
  const fotos: ServiceOrderPhotoComUrl[] = []

  for (const meta of metas) {
    const blob = await getPhotoBlob(meta.blob_key)
    let objectUrl: string | null = null
    if (blob) {
      objectUrl = URL.createObjectURL(blob)
      objectUrls.push(objectUrl)
    }
    fotos.push(metaParaExibicao(meta, objectUrl))
  }

  return { fotos, objectUrls }
}

export function revogarObjectUrls(urls: string[]): void {
  for (const url of urls) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Remotas (se online) + pendentes locais da mesma OS.
 * Offline: só pendentes (e remotas vazias). Não faz upload.
 */
export async function carregarFotosOsComPendentesLocais(params: {
  officeId: string
  serviceOrderId: string
  osNumero?: number
}): Promise<
  ResultadoFotoOffline<{
    fotos: ServiceOrderPhotoComUrl[]
    objectUrls: string[]
    erroRemoto?: string
  }>
> {
  const officeId = params.officeId.trim()
  const serviceOrderId = params.serviceOrderId.trim()
  if (!officeId || !serviceOrderId) {
    return { ok: true, dados: { fotos: [], objectUrls: [] } }
  }

  let remotas: ServiceOrderPhotoComUrl[] = []
  let erroRemoto: string | undefined
  const online = typeof navigator !== 'undefined' && navigator.onLine

  if (online) {
    try {
      const listagem = await listarFotosOSComUrls({
        officeId,
        serviceOrderId,
        osNumero: params.osNumero,
      })
      if (listagem.ok && listagem.dados) {
        remotas = listagem.dados
      } else if (listagem.erro) {
        erroRemoto = listagem.erro
      }
    } catch (err) {
      erroRemoto =
        err instanceof Error ? err.message : 'Falha ao carregar fotos do servidor.'
    }
  }

  let pendentes: ServiceOrderPhotoComUrl[] = []
  let objectUrls: string[] = []
  try {
    const local = await listarFotosPendentesOsComPreview(officeId, serviceOrderId)
    pendentes = local.fotos
    objectUrls = local.objectUrls
  } catch (err) {
    console.warn('[BoxGestor Fotos Offline] Falha ao ler pendentes locais', err)
  }

  return {
    ok: true,
    dados: {
      fotos: [...remotas, ...pendentes],
      objectUrls,
      ...(erroRemoto ? { erroRemoto } : {}),
    },
  }
}
