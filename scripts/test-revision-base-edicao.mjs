/** Testes direcionados da base CAS de edição (sem vitest). */

function normalizarRevisionBaseEdicao(revision) {
  return typeof revision === 'number' && Number.isFinite(revision) ? revision : null
}

function expectedRevisionParaCas(revisionBaseEdicao, osFallback) {
  if (revisionBaseEdicao !== null) return revisionBaseEdicao
  return normalizarRevisionBaseEdicao(osFallback?.revision)
}

function revisionOrdemServicoAposMergeFresh(
  dialogOsAberto,
  osEmAtualizacaoId,
  osListaId,
  revisionLocal,
  revisionRemota
) {
  if (dialogOsAberto && osEmAtualizacaoId === osListaId) {
    return revisionLocal ?? revisionRemota
  }
  return revisionRemota ?? revisionLocal
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/** Simula abrirEditar: resetar → setup → definir base (ordem corrigida). */
function simularAbrirEditar(os) {
  let revisionBaseEdicaoRef = null
  function limparRevisionBaseEdicao() {
    revisionBaseEdicaoRef = null
  }
  function definirRevisionBaseEdicaoDeOs(entidade) {
    revisionBaseEdicaoRef = normalizarRevisionBaseEdicao(entidade.revision)
  }
  function resetarEstadoDialogo() {
    limparRevisionBaseEdicao()
  }
  function avancarRevisionBaseEdicao(revision) {
    const norm = normalizarRevisionBaseEdicao(revision)
    if (norm !== null) revisionBaseEdicaoRef = norm
  }

  resetarEstadoDialogo()
  definirRevisionBaseEdicaoDeOs(os)
  return {
    get base() {
      return revisionBaseEdicaoRef
    },
    avancar: avancarRevisionBaseEdicao,
    fechar: limparRevisionBaseEdicao,
  }
}

// A) abrir revision 1 → base = 1
const sessaoA = simularAbrirEditar({ revision: 1 })
assert(sessaoA.base === 1, 'A: abrir revision 1 → base = 1')

// B) storage externo vira 2; base congelada continua 1
assert(
  expectedRevisionParaCas(sessaoA.base, { revision: 2 }) === 1,
  'B: storage 2 não altera CAS (base ref = 1)'
)
assert(
  revisionOrdemServicoAposMergeFresh(true, 'os-1', 'os-1', 1, 2) === 1,
  'B: merge fresh não promove revision com dialog aberto'
)

// C) save próprio retorna revision 2 → base = 2
sessaoA.avancar(2)
assert(sessaoA.base === 2, 'C: após save confirmado base = 2')
assert(
  expectedRevisionParaCas(sessaoA.base, { revision: 1 }) === 2,
  'C: segundo save no mesmo dialog usa base 2'
)

// D) conflito + carregar remoto revision 2 → base = 2
const sessaoD = simularAbrirEditar({ revision: 2 })
assert(sessaoD.base === 2, 'D: abrirEditar(versaoRemota rev 2) → base = 2')

// E) fechar/cancelar → base = null
sessaoD.fechar()
assert(sessaoD.base === null, 'E: fechar dialog → base = null')

// Fallback fora do dialog (fila offline / lista)
assert(
  expectedRevisionParaCas(null, { revision: 3 }) === 3,
  'fallback revision quando base não fixada'
)

console.log('OK — revision-base-edicao (ciclo A–E + fallback)')
