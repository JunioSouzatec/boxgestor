export type EscopoFallbackPersistencia = 'geral' | 'pagamento' | 'os'

export type PersistenceStatusEvent =
  | { type: 'supabase_ok' }
  | { type: 'pagamento_ok'; mensagem: string }
  | { type: 'pagamentos_pendentes'; mensagem: string; pendentes: number }
  | { type: 'fallback'; mensagem: string; escopo?: EscopoFallbackPersistencia }
  | { type: 'offline'; mensagem: string }
  | { type: 'fila_atualizada'; pendentes: number }

type Listener = (event: PersistenceStatusEvent) => void

const listeners = new Set<Listener>()

export function emitirEventoPersistencia(event: PersistenceStatusEvent): void {
  listeners.forEach((fn) => fn(event))
}

export function inscreverEventosPersistencia(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function contarPagamentosPendentesNaFila(
  items: { entidade: string; status: string }[]
): number {
  return items.filter((i) => i.status === 'pendente' && i.entidade === 'lancamento').length
}
