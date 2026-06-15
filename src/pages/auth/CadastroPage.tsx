import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { APP_NAME } from '@/lib/app-brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { MSG } from '@/lib/mensagens-usuario'

export function CadastroPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    nome_responsavel: '',
    email: '',
    senha: '',
    confirmar_senha: '',
    nome_oficina: '',
    endereco: '',
    telefone: '',
    cidade: '',
    estado: '',
  })
  const [erro, setErro] = useState('')
  const [sucessoEmail, setSucessoEmail] = useState(false)
  const [carregando, setCarregando] = useState(false)

  function atualizar(campo: keyof typeof form, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSucessoEmail(false)

    if (form.senha !== form.confirmar_senha) {
      setErro('As senhas não coincidem.')
      return
    }

    setCarregando(true)
    try {
      const { redirectTo, requerConfirmacaoEmail } = await register({
        nome_responsavel: form.nome_responsavel,
        email: form.email,
        senha: form.senha,
        nome_oficina: form.nome_oficina,
        endereco: form.endereco || undefined,
        telefone: form.telefone,
        whatsapp: form.telefone,
        cidade: form.cidade,
        estado: form.estado,
      })

      if (requerConfirmacaoEmail) {
        setSucessoEmail(true)
        return
      }

      navigate(redirectTo)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível cadastrar.')
    } finally {
      setCarregando(false)
    }
  }

  if (sucessoEmail) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conta criada</h1>
          <p className="mt-2 text-sm text-muted-foreground">{MSG.cadastroConfirmarEmail}</p>
        </div>
        <Button asChild className="w-full">
          <Link to="/login">Ir para o login</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Comece seu Teste Premium grátis</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Teste o {APP_NAME} completo por 7 dias. Cadastre sua oficina e comece a usar agora.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        <p>{MSG.cadastroBeneficioOrganizacao}</p>
        <p>{MSG.cadastroBeneficioPremium}</p>
        <p>{MSG.cadastroSemCartao}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="border-b border-border pb-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Dados do responsável
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome_responsavel">Nome *</Label>
              <Input
                id="nome_responsavel"
                placeholder="João Silva"
                value={form.nome_responsavel}
                onChange={(e) => atualizar('nome_responsavel', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                placeholder="contato@oficina.com"
                value={form.email}
                onChange={(e) => atualizar('email', e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="senha">Senha *</Label>
                <Input
                  id="senha"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={form.senha}
                  onChange={(e) => atualizar('senha', e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmar_senha">Confirmar senha *</Label>
                <Input
                  id="confirmar_senha"
                  type="password"
                  placeholder="Repita a senha"
                  value={form.confirmar_senha}
                  onChange={(e) => atualizar('confirmar_senha', e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone / WhatsApp *</Label>
              <Input
                id="telefone"
                placeholder="(11) 99999-9999"
                value={form.telefone}
                onChange={(e) => atualizar('telefone', e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Dados da oficina
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome_oficina">Nome da oficina *</Label>
              <Input
                id="nome_oficina"
                placeholder="Minha Oficina de Motos"
                value={form.nome_oficina}
                onChange={(e) => atualizar('nome_oficina', e.target.value)}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cidade">Cidade *</Label>
                <Input
                  id="cidade"
                  placeholder="Montes Claros"
                  value={form.cidade}
                  onChange={(e) => atualizar('cidade', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estado">Estado (UF) *</Label>
                <Input
                  id="estado"
                  placeholder="MG"
                  value={form.estado}
                  onChange={(e) => atualizar('estado', e.target.value.toUpperCase())}
                  maxLength={2}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endereco">Endereço (opcional)</Label>
              <Input
                id="endereco"
                placeholder="Rua, número, bairro"
                value={form.endereco}
                onChange={(e) => atualizar('endereco', e.target.value)}
              />
            </div>
          </div>
        </div>

        {erro && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={carregando}>
          {carregando ? 'Criando conta…' : 'Começar Teste Premium grátis'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Faça login
        </Link>
      </p>
    </div>
  )
}
