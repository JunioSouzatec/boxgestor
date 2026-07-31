/**
 * Gera public/version.json e src/generated/app-version.ts antes do build.
 * Usa VERCEL_GIT_COMMIT_SHA quando disponível; senão timestamp.
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const commitRaw =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  ''
const commit = String(commitRaw).trim()
const builtAt = new Date().toISOString()
const short = commit ? commit.slice(0, 12) : ''
const version = short || `build-${builtAt.replace(/[:.]/g, '-')}`

const payload = {
  version,
  builtAt,
  commit: commit || null,
}

const publicDir = path.join(root, 'public')
fs.mkdirSync(publicDir, { recursive: true })
fs.writeFileSync(
  path.join(publicDir, 'version.json'),
  `${JSON.stringify(payload, null, 2)}\n`,
  'utf8'
)

const generatedDir = path.join(root, 'src', 'generated')
fs.mkdirSync(generatedDir, { recursive: true })
const ts = `/** Gerado por scripts/generate-app-version.cjs — não editar à mão. */
export const APP_DEPLOY_VERSION = ${JSON.stringify(version)} as const
export const APP_DEPLOY_BUILT_AT = ${JSON.stringify(builtAt)} as const
export const APP_DEPLOY_COMMIT = ${JSON.stringify(commit)} as const
`
fs.writeFileSync(path.join(generatedDir, 'app-version.ts'), ts, 'utf8')

console.log(`[generate-app-version] version=${version} builtAt=${builtAt}`)
