import {
  obterLocalIdPorUuid,
  registrarMapeamentoId,
} from '@/services/supabase-sync/id-registry'
import { localIdParaUuid } from '@/lib/local-id-uuid'

export async function resolverLocalId(
  uuid: string,
  candidatos: string[],
  prefixoFallback: string
): Promise<string> {
  const registrado = obterLocalIdPorUuid(uuid)
  if (registrado) return registrado

  for (const localId of candidatos) {
    if (localId && (await localIdParaUuid(localId)) === uuid) {
      registrarMapeamentoId(localId, uuid)
      return localId
    }
  }

  const metaLocal = candidatos.find(Boolean)
  if (metaLocal) {
    registrarMapeamentoId(metaLocal, uuid)
    return metaLocal
  }

  const fallback = `${prefixoFallback}-${uuid.slice(0, 8)}`
  registrarMapeamentoId(fallback, uuid)
  return fallback
}
