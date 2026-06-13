import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { isModoAuthSupabaseAtivo } from '@/lib/craft-auth'

export function CadastroPage() {
  const { register, modoAuthLabel } = useAuth()
  const navigate = useNavigate()
  const supabaseMode = isModoAuthSupabaseAtivo()

  const [form, setForm] = useState({
    nome_responsavel: '',
    email: '',
    senha: '',
    confirmar_senha: '',
    nome_oficina: '',
    endereco: '',
    telefone: '',
    whatsapp: '',
    cidade: '',
    estado: '',
    cnpj: '',
  })
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  function atualizar(campo: keyof typeof form, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (form.senha !== form.confirmar_senha) {
      setErro('As senhas não coincidem.')
      return
    }

    if (supabaseMode && (!form.cidade.trim() || !form.estado.trim())) {
      setErro('Informe cidade e estado da oficina.')
      return
    }

    setCarregando(true)
    try {
      await register({
        nome_responsavel: form.nome_responsavel,
        email: form.email,
        senha: form.senha,
        nome_oficina: form.nome_oficina,
        endereco: form.endereco || undefined,
        telefone: form.telefone,
        whatsapp: form.whatsapp || form.telefone,
        cidade: form.cidade || undefined,
        estado: form.estado || undefined,
        cnpj: form.cnpj || undefined,
      })
      navigate('/')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível cadastrar.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Cadastre sua oficina</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie sua conta e comece a usar o Craft
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{modoAuthLabel}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nome_responsavel">Seu nome</Label>
          <Input
            id="nome_responsavel"
            placeholder="João Silva"
            value={form.nome_responsavel}
            onChange={(e) => atualizar('nome_responsavel', e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
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
            <Label htmlFor="senha">Senha</Label>
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
            <Label htmlFor="confirmar_senha">Confirmar senha</Label>
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

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Dados da oficina
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome_oficina">Nome da oficina</Label>
              <Input
                id="nome_oficina"
                placeholder="Craft Motos"
                value={form.nome_oficina}
                onChange={(e) => atualizar('nome_oficina', e.target.value)}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone / WhatsApp</Label>
                <Input
                  id="telefone"
                  placeholder="(11) 99999-9999"
                  value={form.telefone}
                  onChange={(e) => atualizar('telefone', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp (opcional)</Label>
                <Input
                  id="whatsapp"
                  placeholder="Se vazio, usa o telefone"
                  value={form.whatsapp}
                  onChange={(e) => atualizar('whatsapp', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cidade">Cidade {supabaseMode && '*'}</Label>
                <Input
                  id="cidade"
                  placeholder="Montes Claros"
                  value={form.cidade}
                  onChange={(e) => atualizar('cidade', e.target.value)}
                  required={supabaseMode}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estado">Estado (UF) {supabaseMode && '*'}</Label>
                <Input
                  id="estado"
                  placeholder="MG"
                  value={form.estado}
                  onChange={(e) => atualizar('estado', e.target.value)}
                  maxLength={2}
                  required={supabaseMode}
                />
              </div>
            </div>

            {!supabaseMode && (
              <div className="space-y-2">
                <Label htmlFor="endereco">Endereço completo</Label>
                <Input
                  id="endereco"
                  placeholder="Rua, número, bairro"
                  value={form.endereco}
                  onChange={(e) => atualizar('endereco', e.target.value)}
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ (opcional)</Label>
              <Input
                id="cnpj"
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={(e) => atualizar('cnpj', e.target.value)}
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
          {carregando ? 'Criando conta...' : 'Criar conta e oficina'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  )
}
