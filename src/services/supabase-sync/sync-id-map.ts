import { localIdParaUuid } from '@/lib/local-id-uuid'

export class SyncIdMap {
  private cache = new Map<string, string>()
  private confirmados = new Set<string>()

  /** A) UUID remoto confirmado (SELECT, office do profile, exist-check). */
  seed(localId: string, uuid: string): void {
    const local = localId.trim()
    const remoto = uuid.trim()
    if (!local || !remoto) return
    this.cache.set(local, remoto)
    this.confirmados.add(local)
  }

  /**
   * Lembra um UUID do registry sem prova remota.
   * Pode ser hash provisório — não vira identidade confirmada.
   */
  lembrar(localId: string, uuid: string): void {
    const local = localId.trim()
    const remoto = uuid.trim()
    if (!local || !remoto || this.confirmados.has(local)) return
    this.cache.set(local, remoto)
  }

  ehConfirmado(localId: string): boolean {
    return this.confirmados.has(localId.trim())
  }

  /** A) cache confirmado ou lembrado; B) hash determinístico provisório (não confirma). */
  async uuid(localId: string): Promise<string> {
    const local = localId.trim()
    const cached = this.cache.get(local)
    if (cached) return cached
    const id = await localIdParaUuid(local)
    this.cache.set(local, id)
    return id
  }
}
