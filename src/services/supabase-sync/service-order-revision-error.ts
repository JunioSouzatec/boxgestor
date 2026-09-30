export const CODIGO_CONFLITO_REVISION_OS = 'SERVICE_ORDER_REVISION_CONFLICT'
export const MENSAGEM_CONFLITO_REVISION_OS =
  'Esta OS foi alterada por outro usuário ou dispositivo enquanto você estava editando.'

export class ErroConflitoRevisionOs extends Error {
  readonly codigo = CODIGO_CONFLITO_REVISION_OS

  constructor(mensagem = MENSAGEM_CONFLITO_REVISION_OS) {
    super(mensagem)
    this.name = 'ErroConflitoRevisionOs'
  }
}

export function isErroConflitoRevisionOs(err: unknown): err is ErroConflitoRevisionOs {
  return (
    err instanceof ErroConflitoRevisionOs ||
    (typeof err === 'object' &&
      err !== null &&
      'codigo' in err &&
      (err as { codigo?: string }).codigo === CODIGO_CONFLITO_REVISION_OS)
  )
}

/** Toast genérico de salvamento só para falha inesperada — conflito já tem modal próprio. */
export function deveMostrarToastGenericoAoSalvar(err: unknown): boolean {
  return !isErroConflitoRevisionOs(err)
}
