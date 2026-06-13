export type PersistenceStatusEvent =
  | { type: 'supabase_ok' }
  | { type: 'fallback'; mensagem: string }
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
