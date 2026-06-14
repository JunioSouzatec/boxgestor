/** Indica falha provável de rede/conexão (não erro de negócio ou RLS). */
export function ehProvavelErroDeRede(mensagem?: string, err?: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true

  const msg = (mensagem ?? (err instanceof Error ? err.message : String(err ?? ''))).toLowerCase()

  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('fetch failed') ||
    msg.includes('load failed') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('aborted') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('err_network_changed') ||
    msg.includes('sem conexão') ||
    msg.includes('sem internet') ||
    msg.includes('offline')
  )
}

export async function aguardarMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
