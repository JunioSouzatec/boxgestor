import { APP_NAME } from '@/lib/app-brand'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { isModoAuthSupabaseAtivo } from '@/lib/craft-auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { DEMO_CREDENTIALS } from '@/services/auth/local-auth.service'

export function LoginPage() {
  const { login, logout, modoAuthLabel, estadoAuth, emailSupabase } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const conviteToken = searchParams.get('convite')
  const emailConvite = searchParams.get('email')
  const modoDemo = !isModoAuthSupabaseAtivo()
  const supabasePronto = isSupabaseConfigured()
  const [email, setEmail] = useState(emailConvite ?? '')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const temSessaoParcial =
    !modoDemo &&
    (estadoAuth === 'sem_perfil' || estadoAuth === 'sem_oficina' || estadoAuth === 'pronto')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const { redirectTo } = await login({ email, senha })
      if (conviteToken) {
        navigate(`/convite/${conviteToken}`, { replace: true })
        return
      }
      navigate(redirectTo)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível entrar.')
    } finally {
      setCarregando(false)
    }
  }

  async function handleSair() {
    await logout()
    setEmail('')
    setSenha('')
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Entrar na sua conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {conviteToken
            ? 'Entre com sua conta para aceitar o convite da oficina.'
            : `Acesse sua oficina no ${APP_NAME}`}
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="senha">Senha</Label>
            <Link
              to="/recuperar-senha"
              className="text-xs text-primary hover:underline"
            >
              Esqueceu a senha?
            </Link>
          </div>
          <Input
            id="senha"
            type="password"
            placeholder="••••••••"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        {erro && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={carregando}>
          {carregando ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>

      {temSessaoParcial && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
          <p className="text-muted-foreground">
            Sessão Supabase ativa:{' '}
            <span className="text-foreground">{emailSupabase ?? '—'}</span>
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 gap-2 text-muted-foreground hover:text-destructive"
            onClick={() => void handleSair()}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      )}

      {!supabasePronto && modoDemo && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
          Supabase não configurado. Use o modo demo ou defina VITE_SUPABASE_URL e
          VITE_SUPABASE_ANON_KEY em .env.local.
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground">{modoAuthLabel}</p>

      {modoDemo && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Conta demo (desenvolvimento)</p>
          <p className="mt-1">
            E-mail: <span className="text-foreground">{DEMO_CREDENTIALS.email}</span>
          </p>
          <p>
            Senha: <span className="text-foreground">{DEMO_CREDENTIALS.senha}</span>
          </p>
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{' '}
        <Link to="/cadastro" className="font-medium text-primary hover:underline">
          Cadastre sua oficina
        </Link>
      </p>
    </div>
  )
}
