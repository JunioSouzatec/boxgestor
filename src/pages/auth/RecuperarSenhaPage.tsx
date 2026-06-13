import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'

export function RecuperarSenhaPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      await requestPasswordReset(email)
      setEnviado(true)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar o link.')
    } finally {
      setCarregando(false)
    }
  }

  if (enviado) {
    return (
      <div className="space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Verifique seu e-mail</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Se o e-mail estiver cadastrado, enviamos instruções para redefinir sua senha.
          </p>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-left text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Modo simulado</p>
          <p className="mt-1">
            O token de recuperação aparece no console do navegador (F12). Quando o Supabase
            Auth estiver conectado, o link será enviado por e-mail.
          </p>
        </div>

        <Link to="/login">
          <Button variant="outline" className="w-full">
            Voltar ao login
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Recuperar senha</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Informe seu e-mail para receber o link de redefinição
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        {erro && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={carregando}>
          {carregando ? 'Enviando...' : 'Enviar link de recuperação'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Lembrou a senha?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Voltar ao login
        </Link>
      </p>
    </div>
  )
}
