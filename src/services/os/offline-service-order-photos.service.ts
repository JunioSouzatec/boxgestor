/**
 * Fotos de OS offline: IndexedDB (2B/2C) + sync remoto (2D).
 * Blob nunca vai para localStorage/base64.
 */

import {
  contarFotosPendentesSync,
  deletePendingPhotoCompleto,
  getPhotoBlob,
  listPendingPhotosByOs,
  listPendingPhotosParaSync,
  putPendingPhotoMeta,
  putPhotoBlob,
  recuperarUploadsTravados,
  type OfflinePendingPhotoMeta,
  type OfflinePhotoStatus,
} from '@/services/os/offline-service-order-photos.store'
import {
  buscarFotoOsPorLocalId,
  emitirFotosOsAtualizadas,
  listarFotosOSComUrls,
  uploadFotoOS,
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

export interface ResultadoSyncFotosPendentes {
  ok: boolean
  total: number
  enviadas: number
  falhas: number
  puladasOsRemota: number
  mensagem?: string
}

let syncFotosEmAndamento: Promise<ResultadoSyncFotosPendentes> | null = null
const cacheContagemFotosPendentes = new Map<string, number>()

export function getCachedContagemFotosPendentes(officeId: string): number {
  return cacheContagemFotosPendentes.get(officeId.trim()) ?? 0
}

export async function atualizarCacheContagemFotosPendentes(
  officeId: string
): Promise<number> {
  const office = officeId.trim()
  if (!office) return 0
  try {
    const n = await contarFotosPendentesSync(office)
    cacheContagemFotosPendentes.set(office, n)
    return n
  } catch {
    return getCachedContagemFotosPendentes(office)
  }
}

export function ehFotoPendenteOffline(
  foto: Pick<ServiceOrderPhotoComUrl, 'pending_offline' | 'metadata'>
): boolean {
  if (foto.pending_offline) return true
  return foto.metadata?.pending_offline === true
}

export function obterStatusFotoPendenteOffline(
  foto: Pick<ServiceOrderPhotoComUrl, 'metadata'>
): OfflinePhotoStatus | null {
  const st = foto.metadata?.offline_status
  if (
    st === 'pending' ||
    st === 'uploading' ||
    st === 'failed' ||
    st === 'uploaded' ||
    st === 'cancelled'
  ) {
    return st
  }
  return null
}

export function obterLabelBadgeFotoPendente(
  foto: Pick<ServiceOrderPhotoComUrl, 'pending_offline' | 'metadata'>
): string | null {
  if (!ehFotoPendenteOffline(foto)) return null
  const st = obterStatusFotoPendenteOffline(foto)
  if (st === 'uploading') return 'Enviando...'
  if (st === 'failed') return 'Falha no envio'
  return 'Pendente de envio'
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
      offline_status: meta.status,
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

async function atualizarMetaStatus(
  meta: OfflinePendingPhotoMeta,
  patch: Partial<OfflinePendingPhotoMeta>
): Promise<OfflinePendingPhotoMeta> {
  const next: OfflinePendingPhotoMeta = {
    ...meta,
    ...patch,
    updated_at: new Date().toISOString(),
  }
  await putPendingPhotoMeta(next)
  return next
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
    include_in_pdf: Boolean(params.includeInPdf),
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
    await atualizarCacheContagemFotosPendentes(officeId)
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
  localPhotoId: string,
  officeId?: string
): Promise<ResultadoFotoOffline<{ local_photo_id: string }>> {
  try {
    const ok = await deletePendingPhotoCompleto(localPhotoId)
    if (!ok) {
      return { ok: false, erro: 'Foto pendente não encontrada neste aparelho.' }
    }
    if (officeId?.trim()) {
      await atualizarCacheContagemFotosPendentes(officeId)
    } else {
      for (const office of [...cacheContagemFotosPendentes.keys()]) {
        await atualizarCacheContagemFotosPendentes(office)
      }
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

export { contarFotosPendentesSync }

async function finalizarFotoJaRemota(
  meta: OfflinePendingPhotoMeta,
  remoteId: string
): Promise<void> {
  // Só remove local depois de confirmar registro remoto
  await deletePendingPhotoCompleto(meta.local_photo_id)
  emitirFotosOsAtualizadas(meta.local_os_id)
  console.info('[BoxGestor Fotos Offline] Foto já existia no remoto (idempotente)', {
    local_photo_id: meta.local_photo_id,
    remote_photo_id: remoteId,
  })
}

async function sincronizarUmaFotoPendente(
  meta: OfflinePendingPhotoMeta
): Promise<'enviada' | 'falha' | 'os_remota'> {
  let atual = await atualizarMetaStatus(meta, {
    status: 'uploading',
    erro: null,
  })
  emitirFotosOsAtualizadas(meta.local_os_id)

  try {
    const existente = await buscarFotoOsPorLocalId({
      officeId: meta.office_id,
      localId: meta.local_photo_id,
    })
    if (existente.ok && existente.dados?.id) {
      await finalizarFotoJaRemota(atual, existente.dados.id)
      return 'enviada'
    }

    const blob = await getPhotoBlob(meta.blob_key)
    if (!blob) {
      await atualizarMetaStatus(atual, {
        status: 'failed',
        tentativas: atual.tentativas + 1,
        erro: 'Arquivo da foto não encontrado neste aparelho.',
      })
      emitirFotosOsAtualizadas(meta.local_os_id)
      return 'falha'
    }

    const upload = await uploadFotoOS({
      officeId: meta.office_id,
      serviceOrderId: meta.local_os_id,
      osNumero: meta.os_numero ?? undefined,
      file: blob,
      fileName: meta.file_name,
      contentType: meta.content_type,
      caption: meta.caption ?? undefined,
      photoType: meta.photo_type,
      checklistItemId: meta.checklist_item_id ?? undefined,
      photoContext: meta.photo_context,
      includeInPdf: Boolean(meta.include_in_pdf),
      createdBy: meta.created_by ?? undefined,
      createdByName: meta.created_by_name ?? undefined,
      localId: meta.local_photo_id,
      metadata: {
        offline_synced: true,
        synced_from_local_photo_id: meta.local_photo_id,
      },
    })

    if (!upload.ok || !upload.dados) {
      const msg = upload.erro ?? 'Falha ao enviar foto.'
      const osNaoRemota = /ainda não foi sincronizada/i.test(msg)
      await atualizarMetaStatus(atual, {
        status: osNaoRemota ? 'pending' : 'failed',
        tentativas: atual.tentativas + 1,
        erro: msg,
      })
      emitirFotosOsAtualizadas(meta.local_os_id)
      return osNaoRemota ? 'os_remota' : 'falha'
    }

    // Confirma novamente pelo local_id antes de apagar blob
    const confirmado = await buscarFotoOsPorLocalId({
      officeId: meta.office_id,
      localId: meta.local_photo_id,
    })
    if (!confirmado.ok || !confirmado.dados?.id) {
      await atualizarMetaStatus(atual, {
        status: 'failed',
        tentativas: atual.tentativas + 1,
        erro:
          'Upload concluído, mas a foto ainda não foi confirmada no servidor. Tente sincronizar novamente.',
        service_order_id: upload.dados.service_order_id,
        remote_photo_id: upload.dados.id,
      })
      emitirFotosOsAtualizadas(meta.local_os_id)
      return 'falha'
    }

    await deletePendingPhotoCompleto(meta.local_photo_id)
    emitirFotosOsAtualizadas(meta.local_os_id)
    return 'enviada'
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Falha inesperada ao sincronizar foto.'
    await atualizarMetaStatus(atual, {
      status: 'failed',
      tentativas: atual.tentativas + 1,
      erro: msg,
    })
    emitirFotosOsAtualizadas(meta.local_os_id)
    return 'falha'
  }
}

/**
 * Envia fotos pending/failed do IndexedDB após a OS remota existir.
 * Não apaga blob local antes de confirmar Storage + service_order_photos.
 */
export async function sincronizarFotosPendentesOffline(
  officeId: string
): Promise<ResultadoSyncFotosPendentes> {
  const office = officeId.trim()
  if (!office) {
    return {
      ok: false,
      total: 0,
      enviadas: 0,
      falhas: 0,
      puladasOsRemota: 0,
      mensagem: 'Oficina inválida.',
    }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      total: 0,
      enviadas: 0,
      falhas: 0,
      puladasOsRemota: 0,
      mensagem: 'Sem conexão com a internet.',
    }
  }

  if (syncFotosEmAndamento) {
    return syncFotosEmAndamento
  }

  syncFotosEmAndamento = (async () => {
    try {
      await recuperarUploadsTravados(office)
      const pendentes = await listPendingPhotosParaSync(office)
      if (pendentes.length === 0) {
        return {
          ok: true,
          total: 0,
          enviadas: 0,
          falhas: 0,
          puladasOsRemota: 0,
          mensagem: undefined,
        }
      }

      let enviadas = 0
      let falhas = 0
      let puladasOsRemota = 0

      for (const meta of pendentes) {
        const resultado = await sincronizarUmaFotoPendente(meta)
        if (resultado === 'enviada') enviadas += 1
        else if (resultado === 'os_remota') puladasOsRemota += 1
        else falhas += 1
      }

      const total = pendentes.length
      const ok = falhas === 0 && puladasOsRemota === 0
      let mensagem: string | undefined
      if (total === 0) mensagem = undefined
      else if (enviadas > 0 && falhas === 0 && puladasOsRemota === 0) {
        mensagem = 'Fotos pendentes sincronizadas.'
      } else if (enviadas > 0 || falhas > 0 || puladasOsRemota > 0) {
        mensagem =
          'Algumas fotos não foram enviadas. Elas continuam salvas neste aparelho.'
      }

      await atualizarCacheContagemFotosPendentes(office)

      return {
        ok,
        total,
        enviadas,
        falhas,
        puladasOsRemota,
        mensagem,
      }
    } finally {
      syncFotosEmAndamento = null
    }
  })()

  return syncFotosEmAndamento
}
