import { getSupabaseClient } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { obterLocalIdPorUuid } from '@/services/supabase-sync/id-registry'
import type { OrdemServico } from '@/types/ordem-servico'

interface ServiceOrderRowBusca {
  id: string
  number: number
  parts_used?: { craft_meta?: { local_id?: string } }
}

/** Busca OS por número diretamente no Supabase (não depende da lista visível). */
export async function buscarIdsOsPorNumeroNoSupabase(
  officeLocalId: string,
  numero: number
): Promise<string[]> {
  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  if (!contexto?.officeUuid) return []

  const supabase = getSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('service_orders')
    .select('id, number, parts_used')
    .eq('office_id', contexto.officeUuid)
    .eq('number', numero)

  if (error || !data?.length) return []

  const ids: string[] = []
  for (const row of data as ServiceOrderRowBusca[]) {
    const metaLocal = row.parts_used?.craft_meta?.local_id?.trim()
    const localId = metaLocal ?? obterLocalIdPorUuid(String(row.id))
    if (localId) ids.push(localId)
  }
  return ids
}

export function filtrarOrdensPorNumeroSupabase(
  ordens: OrdemServico[],
  numero: number,
  idsEncontrados: string[]
): OrdemServico[] {
  const porNumero = ordens.filter((o) => o.numero === numero)
  if (porNumero.length > 0) return porNumero

  return ordens.filter((o) => idsEncontrados.includes(o.id))
}
