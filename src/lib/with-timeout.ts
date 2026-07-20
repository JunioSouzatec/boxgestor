/** Rejeita a promise se ultrapassar o limite (ms). */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  rotulo = 'operação'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Timeout: ${rotulo} excedeu ${ms}ms`))
        }, ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export const BOOTSTRAP_TIMEOUT_MS = 12_000
export const FILA_SYNC_TIMEOUT_MS = 8_000
export const AUTH_TIMEOUT_MS = 10_000
