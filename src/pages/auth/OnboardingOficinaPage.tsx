import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { ensureOfficeForUser, getCurrentSupabaseUser } from '@/services/auth/supabase-auth-safe.service'
import { lerSignupMetadata } from '@/services/auth/cadastro-publico.service'
import { getRotaPorEstadoAuth } from '@/services/auth/supabase-auth-state.service'

interface OnboardingOficinaPageProps {
  variant: 'completar-cadastro' | 'criar-oficina'
}

export function OnboardingOficinaPage({ variant }: OnboardingOficinaPageProps) {
  const { emailSupabase, recarregarAuth, logout } = useAuth()
  const navigate = useNavigate()

  const [nomeOficina, setNomeOficina] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cidade, setCidade] = useState('')
  const [estadoUf, setEstadoUf] = useState('')
  const [nomeResponsavel, setNomeResponsavel] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    void getCurrentSupabaseUser().then((user) => {
      if (!user) return
      const signup = lerSignupMetadata(user.user_metadata?.craft_signup)
      if (signup) {
        setNomeOficina((v) => v || signup.nome_oficina)
        setTelefone((v) => v || signup.telefone)
        setCidade((v) => v || signup.cidade || '')
        setEstadoUf((v) => v || signup.estado || '')
      }
      const nome =
        typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''
      if (nome) setNomeResponsavel((v) => v || nome)
    })
  }, [])

  const titulo =
    variant === 'completar-cadastro' ? 'Complete seu cadastro' : 'Criar sua oficina'
  const descricao =
    variant === 'completar-cadastro'
      ? 'Sua conta foi criada, mas ainda falta vincular uma oficina. Preencha os dados abaixo para continuar.'
      : 'Vincule uma oficina à sua conta para acessar o painel.'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const result = await ensureOfficeForUser({
        nome_oficina: nomeOficina,
        telefone,
        cidade,
        estado: estadoUf,
        nome_responsavel: nomeResponsavel || undefined,
        email: emailSupabase ?? undefined,
      })

      if (!result.ok) {
        setErro(result.mensagem)
        return
      }

      await recarregarAuth()
      navigate(getRotaPorEstadoAuth('pronto', 'dono'))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível criar a oficina.')
    } finally {
      setCarregando(false)
    }
  }

  async function handleSair() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
        {emailSupabase && (
          <p className="mt-2 text-xs text-muted-foreground">
            Conta: <span className="text-foreground">{emailSupabase}</span>
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nome_responsavel">Seu nome</Label>
          <Input
            id="nome_responsavel"
            placeholder="João Silva"
            value={nomeResponsavel}
            onChange={(e) => setNomeResponsavel(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nome_oficina">Nome da oficina *</Label>
          <Input
            id="nome_oficina"
            placeholder="Craft Motos"
            value={nomeOficina}
            onChange={(e) => setNomeOficina(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone / WhatsApp *</Label>
          <Input
            id="telefone"
            placeholder="(11) 99999-9999"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cidade">Cidade *</Label>
            <Input
              id="cidade"
              placeholder="São Paulo"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="estado">Estado (UF) *</Label>
            <Input
              id="estado"
              placeholder="SP"
              value={estadoUf}
              onChange={(e) => setEstadoUf(e.target.value)}
              maxLength={2}
              required
            />
          </div>
        </div>

        {erro && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        <Button type="submit" className="w-full gap-2" disabled={carregando}>
          {carregando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Criando oficina…
            </>
          ) : (
            'Criar oficina e continuar'
          )}
        </Button>
      </form>

      <div className="flex justify-center">
        <Button type="button" variant="ghost" size="sm" onClick={() => void handleSair()}>
          Sair da conta
        </Button>
      </div>
    </div>
  )
}
