import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  consumirConfirmacaoAtualizacao,
  deveExibirAvisoNovaVersao,
  deveExibirConfirmacaoAtualizacao,
  mensagemBoxGestorAtualizado,
  marcarVersaoAtualizacaoSolicitada,
  resetarConfirmacaoAtualizacaoParaTeste,
  versaoAppCurta,
} from '../src/lib/pwa-update-estado.ts'
import {
  buildAppCurto,
  ehAmbienteHomologacao,
  obterIdentidadeApp,
  versaoAppAmigavel,
} from '../src/lib/app-versao.ts'

const mem = new Map<string, string>()
const sessionStorageMock = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  },
  removeItem: (k: string) => {
    mem.delete(k)
  },
}
Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  configurable: true,
})

const pwa = readFileSync(new URL('../src/lib/pwa-update.ts', import.meta.url), 'utf8')
const toastPwa = readFileSync(new URL('../src/components/pwa/AvisoAtualizacaoPwa.tsx', import.meta.url), 'utf8')
const confirmacao = readFileSync(
  new URL('../src/components/pwa/ConfirmacaoAtualizacaoPwa.tsx', import.meta.url),
  'utf8'
)
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../src/components/layout/AppLayout.tsx', import.meta.url), 'utf8')
const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')

const bannerPath = fileURLToPath(new URL('../src/components/layout/NovaVersaoBanner.tsx', import.meta.url))
const hookPath = fileURLToPath(new URL('../src/hooks/useAppVersionCheck.ts', import.meta.url))
assert.equal(existsSync(bannerPath), false, 'NovaVersaoBanner deve ter sido removido')
assert.equal(existsSync(hookPath), false, 'useAppVersionCheck deve ter sido removido')

assert.doesNotMatch(layout, /NovaVersaoBanner/)
assert.match(layout, /AvisoAtualizacaoPwa/)
assert.ok((layout.match(/<AvisoAtualizacaoPwa/g) ?? []).length === 1)

assert.match(toastPwa, /solicitarAtualizacaoApp\(/)
assert.match(toastPwa, /Atualizar agora/)
assert.match(toastPwa, /Depois/)
assert.match(toastPwa, /Nova versão disponível/)
assert.doesNotMatch(toastPwa, /location\.reload/)
assert.doesNotMatch(toastPwa, /recarregarPwaComNovaVersao/)

const depoisBloco = toastPwa.match(/onClick=\{\(\) => setVisivel\(false\)\}[\s\S]*?Depois/)
assert.ok(depoisBloco, 'Depois deve só esconder o card')
assert.doesNotMatch(depoisBloco[0], /solicitarAtualizacaoApp|location\.reload/)

const atualizarBloco = toastPwa.match(/onClick=\{\(\) => \{[\s\S]*?solicitarAtualizacaoApp\(\)[\s\S]*?\}\}/)
assert.ok(atualizarBloco, 'Atualizar agora deve chamar solicitarAtualizacaoApp')
assert.doesNotMatch(atualizarBloco[0], /setVisivel\(false\)/)
assert.doesNotMatch(atualizarBloco[0], /location\.reload/)

assert.match(confirmacao, /consumirConfirmacaoAtualizacao/)
assert.match(confirmacao, /mensagemBoxGestorAtualizado/)
assert.match(app, /ConfirmacaoAtualizacaoPwa/)

assert.match(pwa, /solicitarAtualizacaoApp/)
assert.match(pwa, /SKIP_WAITING/)
assert.match(pwa, /controllerchange/)
assert.match(pwa, /atualizarPwa\(false\)/)
assert.match(pwa, /recarregarPaginaUmaVez/)
assert.match(pwa, /verificarAtualizacaoPwa/)
assert.match(pwa, /registro\.update\(\)/)
assert.match(pwa, /visibilitychange/)
assert.match(pwa, /visibilityState === 'visible'/)
assert.match(pwa, /addEventListener\('focus'/)
assert.match(pwa, /addEventListener\('online'/)
assert.match(pwa, /INTERVALO_VERIFICACAO_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/)
assert.match(pwa, /setInterval\(onIntervaloVerificacao,\s*INTERVALO_VERIFICACAO_MS\)/)
assert.match(pwa, /void verificarAtualizacaoPwa\(\)/)
assert.match(pwa, /registroPwaIniciado/)
assert.match(pwa, /updateEmAndamento/)
assert.match(pwa, /ultimoWaitingAnunciado:\s*ServiceWorker\s*\|\s*null/)
assert.match(pwa, /waiting === ultimoWaitingAnunciado/)
assert.match(pwa, /ultimoWaitingAnunciado\s*=\s*waiting/)
assert.doesNotMatch(pwa, /idDoWaiting/)
assert.doesNotMatch(pwa, /scriptURL\?\.trim/)
assert.doesNotMatch(pwa, /ultimoWaitingAnunciado:\s*string/)
assert.doesNotMatch(pwa, /ultimoWaitingAnunciado\s*=\s*(id|url|scriptURL)/)
assert.doesNotMatch(pwa, /atualizarPwa\(true\)/)
assert.doesNotMatch(pwa, /aplicarAtualizacaoPwaSePendente/)
assert.doesNotMatch(pwa, /12\s*\*\s*1000|12000/)
assert.doesNotMatch(pwa, /useAppVersionCheck|NovaVersaoBanner/)
assert.doesNotMatch(pwa, /registerType:\s*'autoUpdate'|skipWaiting:\s*true/)

assert.match(vite, /registerType:\s*'prompt'/)
assert.match(vite, /skipWaiting:\s*false/)
assert.doesNotMatch(vite, /registerType:\s*'autoUpdate'/)

// Contrato: identidade = referência do ServiceWorker, não scriptURL (/sw.js igual entre builds)
{
  let ultimo: { scriptURL: string } | null = null
  const avisar = (waiting: { scriptURL: string } | null): boolean => {
    if (!waiting) return false
    if (waiting === ultimo) return false
    ultimo = waiting
    return true
  }
  const waitingB = { scriptURL: 'https://app.example/sw.js' }
  const waitingC = { scriptURL: 'https://app.example/sw.js' }
  assert.equal(waitingB.scriptURL, waitingC.scriptURL)
  assert.equal(avisar(waitingB), true)
  assert.equal(avisar(waitingB), false, 'mesmo waiting após Depois')
  assert.equal(avisar(waitingC), true, 'nova instância com mesmo scriptURL anuncia')
  assert.equal(avisar(waitingC), false)
}


assert.equal(deveExibirAvisoNovaVersao('v1', null), false)
assert.equal(deveExibirAvisoNovaVersao('v1', 'v1'), false)
assert.equal(deveExibirAvisoNovaVersao('v1', 'v2'), true)

resetarConfirmacaoAtualizacaoParaTeste()
assert.equal(deveExibirConfirmacaoAtualizacao('v2'), false)
marcarVersaoAtualizacaoSolicitada('v2')
assert.equal(deveExibirConfirmacaoAtualizacao('v1'), false)
assert.equal(deveExibirConfirmacaoAtualizacao('v2'), true)
assert.equal(consumirConfirmacaoAtualizacao('v1'), false)
assert.equal(consumirConfirmacaoAtualizacao('v2'), true)
assert.equal(consumirConfirmacaoAtualizacao('v2'), false)
assert.equal(deveExibirConfirmacaoAtualizacao('v2'), false)

assert.equal(versaoAppAmigavel('build-2026-09-18T00-38-29-405Z'), '2026.09.18-0038')
assert.equal(
  versaoAppAmigavel('abc123def456', '2026-09-18T23:37:46.656Z'),
  '2026.09.18-2337'
)
assert.equal(versaoAppCurta('build-2026-09-18T00-38-29-405Z'), '2026.09.18-0038')
assert.equal(
  versaoAppAmigavel('build-2026-09-18T23-37-46-656Z'),
  versaoAppAmigavel('build-2026-09-18T23-37-46-656Z')
)
assert.notEqual(
  versaoAppAmigavel('build-2026-09-18T23-37-46-656Z'),
  versaoAppAmigavel('build-2026-09-18T23-40-00-000Z')
)
assert.equal(buildAppCurto('build-2026-09-18T23-37-46-656Z'), '20260918-233746')
assert.equal(buildAppCurto('a1b2c3d4e5f67890'), 'a1b2c3d4e5f6')
assert.equal(
  ehAmbienteHomologacao('https://cqnktgouczyrxkkeusio.supabase.co'),
  true
)
assert.equal(
  ehAmbienteHomologacao('https://fgarivlagocabyumniiz.supabase.co'),
  false
)

const identHomolog = obterIdentidadeApp({
  version: 'build-2026-09-18T23-37-46-656Z',
  builtAt: '2026-09-18T23:37:46.656Z',
  supabaseUrl: 'https://cqnktgouczyrxkkeusio.supabase.co',
})
assert.equal(identHomolog.versaoAmigavel, '2026.09.18-2337')
assert.equal(identHomolog.buildCurto, '20260918-233746')
assert.equal(identHomolog.homolog, true)

const identProd = obterIdentidadeApp({
  version: 'build-2026-09-18T23-37-46-656Z',
  builtAt: '2026-09-18T23:37:46.656Z',
  supabaseUrl: 'https://fgarivlagocabyumniiz.supabase.co',
})
assert.equal(identProd.versaoAmigavel, '2026.09.18-2337')
assert.equal(identProd.homolog, false)

const toastVersao = mensagemBoxGestorAtualizado(
  'build-2026-09-18T00-38-29-405Z',
  '2026-09-18T00:38:29.405Z'
)
assert.equal(
  toastVersao,
  'BoxGestor atualizado com sucesso.\nVersão atual: 2026.09.18-0038'
)
assert.equal(toastVersao.includes('cqnktgouczyrxkkeusio'), false)
assert.equal(toastVersao.includes('fgarivlagocabyumniiz'), false)
assert.equal(toastVersao.includes('eyJ'), false)

const mais = readFileSync(new URL('../src/components/layout/MobileMaisMenu.tsx', import.meta.url), 'utf8')
assert.match(mais, /IdentidadeBoxGestor/)
const identidade = readFileSync(
  new URL('../src/components/layout/IdentidadeBoxGestor.tsx', import.meta.url),
  'utf8'
)
assert.match(identidade, /Ambiente: Homologação/)
assert.match(identidade, /Versão \{versaoAmigavel\}/)
assert.doesNotMatch(identidade, /VITE_SUPABASE|supabase\.co|anon/i)

console.log('OK — descoberta PWA via registration.update + toast inferior, sem banner antigo.')
