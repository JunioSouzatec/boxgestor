/**
 * Fotos de OS — base técnica + helpers de exibição.
 *
 * ATENÇÃO:
 * - Arquivos vão para Supabase Storage (bucket privado); banco só metadados.
 * - NÃO salvar imagem em base64.
 * - Soft delete / ocultar: marca deleted_at + auditoria — Storage NÃO é removido.
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

/** Evento UI: galeria e checklist recarregam fotos da mesma OS. */
export const FOTOS_OS_ATUALIZADAS_EVENT = 'craft:fotos-os-atualizadas'

export interface FotosOsAtualizadasDetail {
  serviceOrderId: string
}

export function emitirFotosOsAtualizadas(serviceOrderId: string): void {
  const id = serviceOrderId.trim()
  if (!id || typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<FotosOsAtualizadasDetail>(FOTOS_OS_ATUALIZADAS_EVENT, {
      detail: { serviceOrderId: id },
    })
  )
}

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
  deleted_by: string | null
  deleted_by_name: string | null
  deleted_reason: string | null
  include_in_pdf: boolean
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
  /** Label do item (salvo em metadata / caption — sem migration) */
  checklistItemLabel?: string
  /** Contexto da foto: os | checklist (salvo em metadata) */
  photoContext?: 'os' | 'checklist'
  /** Marca include_in_pdf no insert (default false) */
  includeInPdf?: boolean
  createdBy?: string
  createdByName?: string
  localId?: string
  sortOrder?: number
  metadata?: Record<string, unknown>
}

/** Resultado do upload de foto vinculada ao checklist (com aviso de limite PDF). */
export interface ResultadoUploadFotoChecklist {
  foto: ServiceOrderPhotoRow
  include_in_pdf: boolean
  /** Presente quando quis marcar no PDF mas o limite de 6 já estava cheio */
  aviso_limite_pdf?: string
}

export interface SoftDeleteFotoOSParams {
  officeId: string
  fotoId: string
  deletedBy?: string
  deletedByName?: string
  deletedReason?: string
}

export interface AtualizarIncluirFotoPdfOSParams {
  officeId: string
  photoId: string
  includeInPdf: boolean
}

export interface ListarFotosOSParaPdfParams {
  officeId: string
  serviceOrderId: string
  /** Número da OS — aceita number ou string numérica */
  osNumero?: number | string
  /** Máximo de fotos no PDF. Default: 6. */
  limite?: number
}

/** Foto preparada para o PDF (DataURL ou indisponível). */
export interface FotoOSParaPdf {
  id: string
  photo_type: string
  caption: string | null
  created_at: string
  created_by_name: string | null
  storage_path: string
  checklist_item_id: string | null
  /** Label do item do checklist (metadata ou caption). */
  checklist_item_label: string | null
  photo_context: 'os' | 'checklist' | null
  /** Data URL (data:image/...) para html2canvas. null se download falhou. */
  data_url: string | null
  /** Motivo amigável quando data_url é null. */
  erro_imagem?: string
}

/** Limite padrão de fotos no PDF da OS (v1). */
export const LIMITE_FOTOS_PDF_OS = 6

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

  const checklistItemId = params.checklistItemId?.trim() || null
  const checklistItemLabel = params.checklistItemLabel?.trim() || null
  const photoContext =
    params.photoContext ??
    (checklistItemId ? 'checklist' : 'os')

  const captionPadrao =
    params.caption?.trim() ||
    (photoContext === 'checklist' && checklistItemLabel
      ? `Checklist: ${checklistItemLabel}`
      : null)

  const linha = {
    id: fotoId,
    office_id: officeUuid,
    service_order_id: serviceOrderUuid,
    storage_path: storagePath,
    public_url: null as string | null,
    caption: captionPadrao,
    photo_type: (params.photoType ?? 'geral').trim() || 'geral',
    sort_order: params.sortOrder ?? 0,
    checklist_item_id: checklistItemId,
    created_by: params.createdBy?.trim() || null,
    created_by_name: params.createdByName?.trim() || null,
    deleted_at: null as string | null,
    include_in_pdf: Boolean(params.includeInPdf),
    local_id: params.localId?.trim() || null,
    metadata: {
      ...(params.metadata ?? {}),
      content_type: contentType,
      file_name: params.fileName ?? null,
      size: typeof params.file.size === 'number' ? params.file.size : null,
      photo_context: photoContext,
      checklist_item_label: checklistItemLabel,
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
 * Soft delete / ocultação: marca deleted_at + auditoria.
 * NÃO remove arquivo do Storage. NÃO chama storage.remove.
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
  const deletedBy =
    params.deletedBy?.trim() && isUuidFormato(params.deletedBy)
      ? params.deletedBy.trim()
      : null
  const deletedByName = params.deletedByName?.trim() || null
  const deletedReason = params.deletedReason?.trim() || 'Ocultada pelo usuário'

  const { data, error } = await supabase
    .from('service_order_photos')
    .update({
      deleted_at: deletedAt,
      deleted_by: deletedBy,
      deleted_by_name: deletedByName,
      deleted_reason: deletedReason,
      include_in_pdf: false,
    } as never)
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

/**
 * Marca/desmarca foto para impressão/PDF futuro.
 * NÃO altera Storage. NÃO altera PDF nesta fase — só o flag include_in_pdf.
 * Ignora fotos soft-deleted (deleted_at IS NULL).
 */
export async function atualizarIncluirFotoPdfOS(
  params: AtualizarIncluirFotoPdfOSParams
): Promise<ResultadoFotosOS<{ id: string; include_in_pdf: boolean }>> {
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

  const photoId = params.photoId?.trim()
  if (!photoId) {
    return { ok: false, erro: 'Foto inválida' }
  }

  const { data, error } = await supabase
    .from('service_order_photos')
    .update({ include_in_pdf: Boolean(params.includeInPdf) } as never)
    .eq('office_id', officeUuid)
    .eq('id', photoId)
    .is('deleted_at', null)
    .select('id, include_in_pdf')
    .maybeSingle()

  if (error) {
    return { ok: false, erro: error.message }
  }

  if (!data) {
    return { ok: false, erro: 'Foto não encontrada ou já ocultada' }
  }

  return {
    ok: true,
    dados: data as { id: string; include_in_pdf: boolean },
  }
}

function normalizarOsNumeroPdf(osNumero?: number | string): number | undefined {
  if (osNumero == null || osNumero === '') return undefined
  const n = typeof osNumero === 'number' ? osNumero : Number(String(osNumero).trim())
  return Number.isFinite(n) ? n : undefined
}

/** Converte Blob → DataURL no navegador (FileReader). Sem APIs Node. */
function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string' && result.startsWith('data:')) {
        resolve(result)
        return
      }
      reject(new Error('Falha ao converter imagem para DataURL'))
    }
    reader.onerror = () => reject(new Error('Falha ao ler imagem'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Baixa arquivo privado do Storage e converte para DataURL.
 * Preferência v1 para PDF (evita CORS do html2canvas com signed URL).
 * Não usa getPublicUrl.
 */
async function baixarFotoStorageComoDataUrl(
  storagePath: string
): Promise<{ dataUrl: string | null; erro?: string }> {
  const path = storagePath.trim()
  if (!path) {
    return { dataUrl: null, erro: 'Caminho da foto inválido' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { dataUrl: null, erro: 'Cliente Supabase indisponível' }
  }

  try {
    const { data, error } = await supabase.storage
      .from(SERVICE_ORDER_PHOTOS_BUCKET)
      .download(path)

    if (error || !data) {
      return {
        dataUrl: null,
        erro: error?.message ?? 'Não foi possível baixar a foto',
      }
    }

    const dataUrl = await blobParaDataUrl(data)
    return { dataUrl }
  } catch (err) {
    return {
      dataUrl: null,
      erro: err instanceof Error ? err.message : 'Falha ao preparar imagem para o PDF',
    }
  }
}

/**
 * Lista fotos marcadas para o PDF da OS.
 * Filtros: include_in_pdf = true, deleted_at IS NULL.
 * Converte cada arquivo privado em DataURL (Storage.download).
 * Falha de uma imagem não derruba as demais (data_url null + erro_imagem).
 * Não altera o PDF nesta fase — só prepara os dados.
 */
export async function listarFotosOSParaPdf(
  params: ListarFotosOSParaPdfParams
): Promise<ResultadoFotosOS<FotoOSParaPdf[]>> {
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

  const limiteRaw = params.limite ?? LIMITE_FOTOS_PDF_OS
  const limite =
    Number.isFinite(limiteRaw) && limiteRaw > 0
      ? Math.min(Math.floor(limiteRaw), 50)
      : LIMITE_FOTOS_PDF_OS

  const resolvido = await resolverServiceOrderUuidRemoto({
    officeUuid,
    serviceOrderId: params.serviceOrderId,
    osNumero: normalizarOsNumeroPdf(params.osNumero),
  })
  if (!resolvido.uuid) {
    return { ok: true, dados: [] }
  }

  const { data, error } = await supabase
    .from('service_order_photos')
    .select(
      'id, photo_type, caption, created_at, created_by_name, storage_path, sort_order, checklist_item_id, metadata'
    )
    .eq('office_id', officeUuid)
    .eq('service_order_id', resolvido.uuid)
    .eq('include_in_pdf', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limite)

  if (error) {
    return { ok: false, erro: error.message }
  }

  const linhas = (data ?? []) as Array<{
    id: string
    photo_type: string
    caption: string | null
    created_at: string
    created_by_name: string | null
    storage_path: string
    checklist_item_id: string | null
    metadata: Record<string, unknown> | null
  }>

  const fotos: FotoOSParaPdf[] = await Promise.all(
    linhas.map(async (foto) => {
      const baixada = await baixarFotoStorageComoDataUrl(foto.storage_path)
      const meta = foto.metadata ?? {}
      const metaLabel =
        typeof meta.checklist_item_label === 'string'
          ? meta.checklist_item_label.trim()
          : ''
      const caption = foto.caption?.trim() || null
      const checklistLabel =
        metaLabel ||
        (caption?.toLowerCase().startsWith('checklist:')
          ? caption.replace(/^checklist:\s*/i, '').trim()
          : '')
      const photoContextRaw = meta.photo_context
      const photoContext =
        photoContextRaw === 'checklist' || photoContextRaw === 'os'
          ? photoContextRaw
          : foto.checklist_item_id
            ? 'checklist'
            : null

      return {
        id: foto.id,
        photo_type: foto.photo_type,
        caption,
        created_at: foto.created_at,
        created_by_name: foto.created_by_name,
        storage_path: foto.storage_path,
        checklist_item_id: foto.checklist_item_id?.trim() || null,
        checklist_item_label: checklistLabel || null,
        photo_context: photoContext,
        data_url: baixada.dataUrl,
        ...(baixada.erro ? { erro_imagem: baixada.erro } : {}),
      }
    })
  )

  return { ok: true, dados: fotos }
}

/** Quantas fotos ativas já estão marcadas para o PDF (include_in_pdf). */
export async function contarFotosMarcadasPdfOS(
  params: ListarFotosOSParams
): Promise<ResultadoFotosOS<number>> {
  const listagem = await listarFotosOS(params)
  if (!listagem.ok || !listagem.dados) {
    return { ok: false, erro: listagem.erro ?? 'Falha ao contar fotos do PDF' }
  }
  const total = listagem.dados.filter((f) => f.include_in_pdf && !f.deleted_at).length
  return { ok: true, dados: total }
}

/** Conta fotos ativas por checklist_item_id. */
export function contarFotosPorItemChecklist(
  fotos: Pick<ServiceOrderPhotoRow, 'checklist_item_id' | 'deleted_at'>[]
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const foto of fotos) {
    if (foto.deleted_at) continue
    const itemId = foto.checklist_item_id?.trim()
    if (!itemId) continue
    out[itemId] = (out[itemId] ?? 0) + 1
  }
  return out
}

export async function listarFotosChecklistItem(
  params: ListarFotosOSParams & { checklistItemId: string }
): Promise<ResultadoFotosOS<ServiceOrderPhotoRow[]>> {
  const itemId = params.checklistItemId.trim()
  if (!itemId) return { ok: false, erro: 'Item do checklist inválido' }

  const listagem = await listarFotosOS(params)
  if (!listagem.ok || !listagem.dados) {
    return { ok: false, erro: listagem.erro ?? 'Falha ao listar fotos do item' }
  }

  return {
    ok: true,
    dados: listagem.dados.filter((f) => f.checklist_item_id?.trim() === itemId),
  }
}

export async function listarFotosChecklistItemComUrls(
  params: ListarFotosOSParams & { checklistItemId: string }
): Promise<ResultadoFotosOS<ServiceOrderPhotoComUrl[]>> {
  const listagem = await listarFotosChecklistItem(params)
  if (!listagem.ok || !listagem.dados) {
    return { ok: false, erro: listagem.erro ?? 'Falha ao listar fotos do item' }
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

export async function enviarFotoChecklistItem(
  params: UploadFotoOSParams & {
    checklistItemId: string
    checklistItemLabel?: string
    /** Itens com foto obrigatória: tenta marcar include_in_pdf se houver vaga no limite */
    preferirIncluirNoPdf?: boolean
  }
): Promise<ResultadoFotosOS<ResultadoUploadFotoChecklist>> {
  const checklistItemId = params.checklistItemId.trim()
  if (!checklistItemId) {
    return { ok: false, erro: 'Item do checklist inválido' }
  }

  let includeInPdf = false
  let avisoLimitePdf: string | undefined

  if (params.preferirIncluirNoPdf) {
    const contagem = await contarFotosMarcadasPdfOS({
      officeId: params.officeId,
      serviceOrderId: params.serviceOrderId,
      osNumero: params.osNumero,
    })
    const marcadas = contagem.ok ? (contagem.dados ?? 0) : 0
    if (marcadas < LIMITE_FOTOS_PDF_OS) {
      includeInPdf = true
    } else {
      avisoLimitePdf =
        'Foto salva, mas não foi marcada para PDF porque o limite de 6 fotos já foi atingido.'
    }
  }

  const upload = await uploadFotoOS({
    ...params,
    checklistItemId,
    checklistItemLabel: params.checklistItemLabel,
    photoContext: 'checklist',
    photoType: params.photoType ?? 'entrada',
    includeInPdf,
  })

  if (!upload.ok || !upload.dados) {
    return { ok: false, erro: upload.erro ?? 'Não foi possível enviar a foto.' }
  }

  return {
    ok: true,
    dados: {
      foto: upload.dados,
      include_in_pdf: Boolean(upload.dados.include_in_pdf),
      ...(avisoLimitePdf ? { aviso_limite_pdf: avisoLimitePdf } : {}),
    },
  }
}

export async function contarFotosChecklistItem(
  params: ListarFotosOSParams & { checklistItemId: string }
): Promise<ResultadoFotosOS<number>> {
  const listagem = await listarFotosChecklistItem(params)
  if (!listagem.ok || !listagem.dados) {
    return { ok: false, erro: listagem.erro ?? 'Falha ao contar fotos do item' }
  }
  return { ok: true, dados: listagem.dados.length }
}

/** Label amigável para galeria geral (metadata ou caption). */
export function obterLabelChecklistDaFoto(
  foto: Pick<ServiceOrderPhotoRow, 'checklist_item_id' | 'caption' | 'metadata'>
): string | null {
  const metaLabel = foto.metadata?.checklist_item_label
  if (typeof metaLabel === 'string' && metaLabel.trim()) {
    return `Checklist: ${metaLabel.trim()}`
  }
  const caption = foto.caption?.trim()
  if (caption?.toLowerCase().startsWith('checklist:')) return caption
  if (foto.checklist_item_id?.trim()) return 'Checklist'
  return null
}

/** Badge da galeria: checklist ou OS geral. */
export function obterBadgeContextoFoto(
  foto: Pick<ServiceOrderPhotoRow, 'checklist_item_id' | 'caption' | 'metadata'>
): string {
  return obterLabelChecklistDaFoto(foto) ?? 'OS'
}
