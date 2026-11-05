/**
 * Testes locais — consulta por placa (5E.23 / 5E.23.2 / 5E.23.3).
 * Executar: npx tsx --tsconfig tsconfig.app.json scripts/test-plate-lookup-form-auto-fill.ts
 * (Alternativa: npx vite-node --config vite.config.ts scripts/test-plate-lookup-form-auto-fill.ts)
 */
function ensureLocalStoragePolyfill(): void {
  if (typeof globalThis.localStorage !== 'undefined') return
  const store: Record<string, string> = {}
  globalThis.localStorage = {
    get length() {
      return Object.keys(store).length
    },
    clear() {
      for (const k of Object.keys(store)) delete store[k]
    },
    getItem(key: string) {
      return store[key] ?? null
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null
    },
    removeItem(key: string) {
      delete store[key]
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
  } as Storage
}

ensureLocalStoragePolyfill()

const { executarTestesLocaisMotoFormConsultaPlaca } = await import('../src/lib/moto-form.ts')
executarTestesLocaisMotoFormConsultaPlaca()
console.log('executarTestesLocaisMotoFormConsultaPlaca: OK')

const { executarTestesLocaisVerificacaoPlacaOficina } = await import(
  '../src/services/veiculos/veiculo-verificacao-placa-oficina.service.ts'
)
await executarTestesLocaisVerificacaoPlacaOficina()
console.log('executarTestesLocaisVerificacaoPlacaOficina: OK')
