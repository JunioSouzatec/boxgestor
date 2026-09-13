import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deveExibirAvisoNovaVersao } from '../src/lib/pwa-update-estado.ts'

const pwa = readFileSync(new URL('../src/lib/pwa-update.ts', import.meta.url), 'utf8')
const hook = readFileSync(new URL('../src/hooks/useAppVersionCheck.ts', import.meta.url), 'utf8')
const banner = readFileSync(new URL('../src/components/layout/NovaVersaoBanner.tsx', import.meta.url), 'utf8')
const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')

assert.match(hook, /recarregarPwaComNovaVersao\(/)
assert.match(hook, /marcarVersaoAtualizacaoSolicitada\(/)
const adiarBloco = hook.match(/const adiar = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\)/)
assert.ok(adiarBloco, 'bloco adiar não encontrado')
assert.match(adiarBloco[0], /setSnoozedUntil\(Date\.now\(\) \+ SNOOZE_MS\)/)
assert.doesNotMatch(adiarBloco[0], /recarregarPwaComNovaVersao|location\.reload/)
assert.doesNotMatch(hook, /location\.reload/)
const atualizarBloco = hook.match(/const atualizarAgora = useCallback\(\(\) => \{[\s\S]*?\}, \[remoteVersion\]\)/)
assert.ok(atualizarBloco, 'bloco atualizarAgora não encontrado')
assert.match(atualizarBloco[0], /recarregarPwaComNovaVersao\(/)
assert.doesNotMatch(atualizarBloco[0], /location\.reload/)
assert.match(hook, /visibilityState === 'visible'\) void verificar\(\)/)
assert.match(hook, /addEventListener\('visibilitychange', onVisibility\)/)
assert.doesNotMatch(hook, /onVisibility[\s\S]*reload/)
assert.doesNotMatch(hook, /12\s*\*\s*1000|12000/)

assert.match(banner, /onClick=\{adiar\}/)
assert.match(banner, /onClick=\{atualizarAgora\}/)
assert.doesNotMatch(banner, /location\.reload|recarregarPwaComNovaVersao/)

assert.match(pwa, /recarregarPwaComNovaVersao/)
assert.match(pwa, /SKIP_WAITING/)
assert.match(pwa, /controllerchange/)
assert.match(pwa, /atualizarPwa\(true\)/)
assert.match(pwa, /recarregarPaginaUmaVez/)
assert.doesNotMatch(pwa, /visibilitychange|aplicarAtualizacaoPwaSePendente/)
assert.doesNotMatch(pwa, /12\s*\*\s*1000|12000/)

assert.match(vite, /registerType:\s*'prompt'/)
assert.match(vite, /skipWaiting:\s*false/)

assert.equal(deveExibirAvisoNovaVersao('v1', null), false)
assert.equal(deveExibirAvisoNovaVersao('v1', 'v1'), false)
assert.equal(deveExibirAvisoNovaVersao('v1', 'v2'), true)
assert.equal(deveExibirAvisoNovaVersao('v1', 'v2', 'v2'), false)
assert.equal(deveExibirAvisoNovaVersao('v1', 'v3', 'v2'), true)
assert.equal(deveExibirAvisoNovaVersao('v2', 'v2', 'v2'), false)

console.log('OK — Atualizar agora usa ativação do SW e Depois não recarrega.')
