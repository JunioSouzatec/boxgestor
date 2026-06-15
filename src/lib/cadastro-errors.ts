/** Cadastro criou usuário no Supabase, mas exige confirmação de e-mail antes da sessão. */
export class CadastroRequerConfirmacaoEmailError extends Error {
  readonly email: string

  constructor(email: string) {
    super('Conta criada. Confirme seu e-mail para acessar o BoxGestor.')
    this.name = 'CadastroRequerConfirmacaoEmailError'
    this.email = email
  }
}

export function ehErroConfirmacaoEmail(err: unknown): err is CadastroRequerConfirmacaoEmailError {
  return err instanceof CadastroRequerConfirmacaoEmailError
}
