/**
 * F6B — Exports Focus NFe (sem emissão).
 */

export { FocusNfeAdapter, focusNfeAdapter, montarPreviaTecnicaFocus } from './focus.adapter'
export { buildFocusPayloadFromPreparation } from './focus-payload-builder.service'
export { validarFocusAntesDeEnviar } from './focus-validacao-tecnica.service'
export { sanitizeFocusPayloadForPreview, logFocusInterno } from './focus-sanitizer.service'
export type {
  FocusPayloadTecnico,
  FocusPreviaTecnica,
  FocusDocumentoInterno,
} from './focus.types'
