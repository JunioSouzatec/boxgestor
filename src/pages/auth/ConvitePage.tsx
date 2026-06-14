import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2, LogOut, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import {
  obterConvitePorTokenAsync,
  type ConviteUsuario,
} from '@/services/auth/convites.service'
import { getLabelPapel } from '@/types/auth'
import { MSG } from '@/lib/mensagens-usuario'
import { formatarData } from '@/lib/utils'

export function ConvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { aceitarConvite, logout, session, emailSupabase } = useAuth()
  const { toast } = useToast()
  const [carregando, setCarregando] = useState(true)
  const [convite, setConvite] = useState<ConviteUsuario | null>(null)
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [aceitando, setAceitando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelled = false
    async function carregar() {
      setCarregando(true)
      setErro('')
      try {
        const encontrado = await obterConvitePorTokenAsync(token)
        if (!cancelled) setConvite(encontrado)
      } catch (e) {
        if (import.meta.env.DEV) console.error('[Craft] Erro ao carregar convite:', e)
        if (!cancelled) setConvite(null)
      } finally {
        if (!cancelled) setCarregando(false)
      }
    }
    void carregar()
    return () => {
      cancelled = true
    }
  }, [token])

  if (carregando) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!convite) {
    return (
      <Card className="mx-auto max-w-md border-0 bg-transparent shadow-none">
        <CardHeader>
          <CardTitle>Convite inválido</CardTitle>
          <CardDescription>{MSG.conviteIndisponivel}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/login">Ir para o login</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (convite.status === 'expirado') {
    return (
      <Card className="mx-auto max-w-md border-0 bg-transparent shadow-none">
        <CardHeader>
          <CardTitle>Convite expirado</CardTitle>
          <CardDescription>
            Este convite expirou em {formatarData(convite.expira_em.slice(0, 10))}. Solicite um
            novo link ao responsável da oficina.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/login">Ir para o login</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (convite.status === 'cancelado' || convite.status === 'aceito') {
    return (
      <Card className="mx-auto max-w-md border-0 bg-transparent shadow-none">
        <CardHeader>
          <CardTitle>Convite indisponível</CardTitle>
          <CardDescription>{MSG.conviteIndisponivel}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/login">Ir para o login</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const conviteAtivo = convite
  const nomeOficina = conviteAtivo.nome_oficina ?? 'oficina'
  const cargoLabel = getLabelPapel(conviteAtivo.papel)
  const emailConvite = conviteAtivo.email.toLowerCase()
  const emailLogado = (session?.user.email ?? emailSupabase)?.trim().toLowerCase()
  const sessaoMesmoEmail = emailLogado === emailConvite
  const sessaoEmailDiferente = Boolean(emailLogado && emailLogado !== emailConvite)

  async function handleAceitar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem.')
      return
    }

    setAceitando(true)
    try {
      const result = await aceitarConvite(token, senha)
      if (result.requerConfirmacaoEmail) {
        toast.sucesso(MSG.conviteContaCriadaConfirmarEmail)
        navigate(result.redirectTo, { replace: true })
        return
      }
      toast.sucesso(MSG.conviteEntrouOficina)
      navigate(result.redirectTo || '/', { replace: true })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Craft] Erro ao aceitar convite:', err)
      setErro(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.')
    } finally {
      setAceitando(false)
    }
  }

  async function handleAceitarComSessao() {
    if (!emailLogado) {
      navigate(`/login?convite=${token}&email=${encodeURIComponent(conviteAtivo.email)}`)
      return
    }
    if (emailLogado !== emailConvite) {
      toast.atencao(MSG.conviteEmailDiferente)
      return
    }

    setAceitando(true)
    try {
      const result = await aceitarConvite(token, '')
      if (result.requerConfirmacaoEmail) {
        toast.sucesso(MSG.conviteContaCriadaConfirmarEmail)
        navigate(result.redirectTo, { replace: true })
        return
      }
      toast.sucesso(MSG.conviteAceito)
      navigate(result.redirectTo || '/', { replace: true })
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.')
    } finally {
      setAceitando(false)
    }
  }

  async function handleSair() {
    await logout()
    navigate(`/login?convite=${token}&email=${encodeURIComponent(conviteAtivo.email)}`)
  }

  return (
    <Card className="mx-auto max-w-lg border-0 bg-transparent shadow-none">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <UserPlus className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>Convite para a equipe</CardTitle>
        <CardDescription className="text-base">
          Você foi convidado para entrar na oficina{' '}
          <strong>{nomeOficina}</strong> como <Badge variant="secondary">{cargoLabel}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
          <p>
            <span className="text-muted-foreground">Nome:</span> {conviteAtivo.nome}
          </p>
          <p>
            <span className="text-muted-foreground">E-mail:</span> {conviteAtivo.email}
          </p>
        </div>

        {sessaoEmailDiferente && (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <p className="text-destructive">{MSG.conviteEmailDiferente}</p>
            <Button variant="outline" className="w-full gap-2" onClick={handleSair}>
              <LogOut className="h-4 w-4" />
              Sair e entrar com o e-mail convidado
            </Button>
          </div>
        )}

        {sessaoMesmoEmail ? (
          <Button className="w-full" onClick={handleAceitarComSessao} disabled={aceitando}>
            {aceitando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando…
              </>
            ) : (
              'Aceitar convite e continuar'
            )}
          </Button>
        ) : (
          !sessaoEmailDiferente && (
            <form onSubmit={handleAceitar} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="senha-convite">Criar senha</Label>
                <Input
                  id="senha-convite"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmar-senha-convite">Confirmar senha</Label>
                <Input
                  id="confirmar-senha-convite"
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              {erro && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {erro}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={aceitando}>
                {aceitando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Criando conta…
                  </>
                ) : (
                  'Criar senha e entrar'
                )}
              </Button>
            </form>
          )
        )}

        {!sessaoEmailDiferente && (
          <div className="text-center text-sm text-muted-foreground">
            Já tem conta?{' '}
            <Link
              to={`/login?convite=${token}&email=${encodeURIComponent(conviteAtivo.email)}`}
              className="text-primary hover:underline"
            >
              Entrar e aceitar convite
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
