/**
 * F5A — Sync do Catálogo de Serviços via settings.metadata.servicos_catalogo.
 * Sem migration: reutiliza JSONB de settings já existente.
 * Soft delete com deleted_at (tombstone) — não ressuscita no F5.
 * Preserva metadata.fiscal em cada serviço. Não emite NFS-e.
 */
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { ServicoCatalogo } from '@/types/servico-catalogo'
import type { CraftDatabase } from '@/types/database'

const DEBOUNCE_MS = 700
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function ts(s?: string | null): number {
  if (!s) return 0
  const n = Date.parse(s)
  return Number.isFinite(n) ? n : 0
}

function versaoTs(s: ServicoCatalogo): number {
  return Math.max(ts(s.updated_at), ts(s.deleted_at), ts(s.created_at))
}

function mesclarMetadataFiscal(
  a?: ServicoCatalogo['metadata'],
  b?: ServicoCatalogo['metadata'],
  preferirB = true
): ServicoCatalogo['metadata'] {
  const ma = isRecord(a) ? a : {}
  const mb = isRecord(b) ? b : {}
  const fiscalPreferido = preferirB
    ? (isRecord(mb.fiscal) && mb.fiscal) || (isRecord(ma.fiscal) && ma.fiscal)
    : (isRecord(ma.fiscal) && ma.fiscal) || (isRecord(mb.fiscal) && mb.fiscal)
  return {
    ...ma,
    ...mb,
    ...(preferirB ? {} : { ...mb, ...ma }),
    fiscal: fiscalPreferido || undefined,
  }
}

/**
 * Merge por id com tombstone:
 * - união de todos os IDs (ausência no payload NÃO apaga o outro lado);
 * - deleted_at mais recente vence serviço ativo antigo;
 * - edição mais nova que o tombstone pode restaurar (updated_at > deleted_at).
 */
export function mesclarServicosCatalogo(
  local: ServicoCatalogo[] = [],
  remoto: ServicoCatalogo[] = []
): ServicoCatalogo[] {
  const mapa = new Map<string, ServicoCatalogo>()

  function aplicar(candidato: ServicoCatalogo) {
    if (!candidato?.id) return
    const atual = mapa.get(candidato.id)
    if (!atual) {
      mapa.set(candidato.id, candidato)
      return
    }

    const delAtual = Boolean(atual.deleted_at)
    const delCand = Boolean(candidato.deleted_at)
    const tAtual = versaoTs(atual)
    const tCand = versaoTs(candidato)

    // Ambos deletados ou ambos ativos: LWW por timestamp.
    if (delAtual === delCand) {
      if (tCand >= tAtual) {
        mapa.set(candidato.id, {
          ...atual,
          ...candidato,
          deleted_at: candidato.deleted_at ?? atual.deleted_at ?? null,
          metadata: mesclarMetadataFiscal(atual.metadata, candidato.metadata, true),
        })
      } else {
        mapa.set(candidato.id, {
          ...candidato,
          ...atual,
          deleted_at: atual.deleted_at ?? candidato.deleted_at ?? null,
          metadata: mesclarMetadataFiscal(candidato.metadata, atual.metadata, true),
        })
      }
      return
    }

    // Um deletado, outro ativo: tombstone vence se for mais novo que a edição ativa.
    if (delCand && !delAtual) {
      const tDel = Math.max(ts(candidato.deleted_at), ts(candidato.updated_at))
      if (tDel >= tAtual) {
        mapa.set(candidato.id, {
          ...atual,
          ...candidato,
          ativo: false,
          deleted_at: candidato.deleted_at,
          metadata: mesclarMetadataFiscal(atual.metadata, candidato.metadata, true),
        })
      }
      // senão mantém atual ativo (editado após o delete remoto — raro)
      return
    }

    if (delAtual && !delCand) {
      const tDel = Math.max(ts(atual.deleted_at), ts(atual.updated_at))
      if (tCand > tDel) {
        // Candidato ativo editado depois do tombstone → restaura
        mapa.set(candidato.id, {
          ...atual,
          ...candidato,
          deleted_at: null,
          metadata: mesclarMetadataFiscal(atual.metadata, candidato.metadata, true),
        })
      }
      // senão mantém tombstone
    }
  }

  for (const s of local) aplicar(s)
  for (const s of remoto) aplicar(s)

  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Listagem / seletor: oculta soft-deleted (não confunde com inativo). */
export function servicoCatalogoVisivel(s: ServicoCatalogo): boolean {
  return !s.deleted_at
}

export function filtrarServicosCatalogoVisiveis(
  lista: ServicoCatalogo[] = []
): ServicoCatalogo[] {
  return lista.filter(servicoCatalogoVisivel)
}

export function extrairServicosCatalogoDoMetadata(
  metadata: unknown
): ServicoCatalogo[] {
  if (!isRecord(metadata)) return []
  const raw = metadata.servicos_catalogo
  if (!Array.isArray(raw)) return []
  return raw.filter((s): s is ServicoCatalogo => isRecord(s) && typeof s.id === 'string')
}

export async function publicarServicosCatalogoNoSupabase(
  officeId: string,
  servicos?: ServicoCatalogo[]
): Promise<{ ok: boolean; erro?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, erro: 'Cliente Supabase indisponível' }

  const contexto = await obterContextoOfficeSupabase(officeId)
  const officeUuid = contexto?.officeUuid
  if (!officeUuid) return { ok: false, erro: 'Profile sem office_id' }

  const lista =
    servicos ??
    localCraftRepository.carregar(officeId).servicos_catalogo ??
    []

  const { data: settingsExistente, error: errSelect } = await supabase
    .from('settings')
    .select('id, metadata, updated_at')
    .eq('office_id', officeUuid)
    .maybeSingle()

  if (errSelect) {
    return { ok: false, erro: errSelect.message }
  }

  const row = settingsExistente as
    | { id: string; metadata?: Record<string, unknown> | null; updated_at?: string }
    | null

  const metaAtual = isRecord(row?.metadata) ? { ...row!.metadata } : {}

  // Merge com remoto antes de publicar: evita perder tombstones de outro dispositivo.
  const remoto = extrairServicosCatalogoDoMetadata(metaAtual)
  const mesclado = mesclarServicosCatalogo(lista, remoto)

  const metadata = {
    ...metaAtual,
    servicos_catalogo: mesclado,
    servicos_catalogo_sync_em: new Date().toISOString(),
  }

  const agora = new Date().toISOString()

  if (row?.id) {
    const { error } = await supabase
      .from('settings')
      .update({ metadata, updated_at: agora } as never)
      .eq('id', row.id)
    if (error) return { ok: false, erro: error.message }
    return { ok: true }
  }

  const { error } = await supabase.from('settings').insert({
    office_id: officeUuid,
    metadata,
    dark_theme: true,
    notifications: true,
    low_stock_alert: true,
    next_service_order_num: 1,
    updated_at: agora,
    created_at: agora,
  } as never)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

export async function puxarServicosCatalogoDoSupabase(
  officeId: string
): Promise<{ ok: boolean; servicos: ServicoCatalogo[]; erro?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, servicos: [], erro: 'Supabase não configurado' }
  }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, servicos: [], erro: 'Cliente Supabase indisponível' }

  const contexto = await obterContextoOfficeSupabase(officeId)
  const officeUuid = contexto?.officeUuid
  if (!officeUuid) return { ok: false, servicos: [], erro: 'Profile sem office_id' }

  const { data, error } = await supabase
    .from('settings')
    .select('metadata')
    .eq('office_id', officeUuid)
    .maybeSingle()

  if (error) return { ok: false, servicos: [], erro: error.message }
  const meta = (data as { metadata?: unknown } | null)?.metadata
  return {
    ok: true,
    servicos: extrairServicosCatalogoDoMetadata(meta),
  }
}

/** Aplica merge remoto→local no CraftDatabase e persiste. */
export async function sincronizarServicosCatalogoNoDatabase(
  officeId: string,
  db: CraftDatabase
): Promise<CraftDatabase> {
  const remoto = await puxarServicosCatalogoDoSupabase(officeId)
  if (!remoto.ok) return db
  const mesclado = mesclarServicosCatalogo(db.servicos_catalogo ?? [], remoto.servicos)
  return { ...db, servicos_catalogo: mesclado }
}

export function agendarPublicacaoServicosCatalogo(officeId: string): void {
  const prev = timers.get(officeId)
  if (prev) clearTimeout(prev)
  timers.set(
    officeId,
    setTimeout(() => {
      timers.delete(officeId)
      void publicarServicosCatalogoNoSupabase(officeId).then((r) => {
        if (!r.ok && import.meta.env.DEV) {
          console.warn('[Craft Sync] Catálogo de serviços não publicado:', r.erro)
        }
      })
    }, DEBOUNCE_MS)
  )
}
