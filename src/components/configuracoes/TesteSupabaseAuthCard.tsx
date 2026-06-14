import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  carregarEstadoSupabaseAuth,
  criarContaTesteSupabase,
  entrarContaTesteSupabase,
  ensureOfficeForUser,
  sairContaSupabase,
  testarConexaoSupabaseAuth,
  verificarOficinaSupabase,
  verificarPerfilSupabase,
  type ResultadoOperacaoAuth,
  type SupabaseAuthEstado,
} from '@/services/auth/supabase-auth-safe.service'
import type { ResultadoTesteSupabase } from '@/services/supabase-connection.service'
import { profileParaAuthUser } from '@/services/auth/supabase-auth.mappers'

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        ok
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-red-500/40 bg-red-500/10 text-red-300'
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : null}
      {label}
    </span>
  )
}

function MensagemResultado({
  resultado,
}: {
  resultado: ResultadoOperacaoAuth | ResultadoTesteSupabase | null
}) {
  if (!resultado) return null
  return (
    <div
      className={cn(
        'rounded-md border p-3 text-sm',
        resultado.ok
          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100/90'
          : 'border-amber-500/30 bg-amber-500/5 text-amber-100/90'
      )}
      role="status"
    >
      <p className="font-medium">{resultado.mensagem}</p>
      {'detalhe' in resultado && resultado.detalhe && (
        <p className="mt-1 text-xs opacity-90">{resultado.detalhe}</p>
      )}
    </div>
  )
}

export function TesteSupabaseAuthCard() {
  const [estado, setEstado] = useState<SupabaseAuthEstado | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [ultimoResultado, setUltimoResultado] = useState<
    ResultadoOperacaoAuth | ResultadoTesteSupabase | null
  >(null)

  const [email, setEmail] = useState('teste@craft.com')
  const [senha, setSenha] = useState('craft123456')
  const [nomeResponsavel, setNomeResponsavel] = useState('Responsável Teste')

  const [nomeOficina, setNomeOficina] = useState('Oficina Teste Craft')
  const [telefone, setTelefone] = useState('(11) 99999-0000')
  const [cidade, setCidade] = useState('São Paulo')
  const [estadoUf, setEstadoUf] = useState('SP')

  const atualizarEstado = useCallback(async () => {
    setCarregando(true)
    try {
      const next = await carregarEstadoSupabaseAuth()
      setEstado(next)
    } catch (e) {
      console.error('[Teste Supabase Auth]', e)
      setUltimoResultado({
        ok: false,
        mensagem: 'Erro ao carregar estado do Supabase Auth.',
        detalhe: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void atualizarEstado()
  }, [atualizarEstado])

  async function executar<T extends ResultadoOperacaoAuth | ResultadoTesteSupabase>(
    acao: () => Promise<T>
  ) {
    setProcessando(true)
    setUltimoResultado(null)
    try {
      const resultado = await acao()
      setUltimoResultado(resultado)
      if ('estado' in resultado && resultado.estado) {
        setEstado(resultado.estado)
      } else {
        await atualizarEstado()
      }
    } catch (e) {
      setUltimoResultado({
        ok: false,
        mensagem: 'Operação falhou inesperadamente.',
        detalhe: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setProcessando(false)
    }
  }

  const situacaoCor: Record<string, string> = {
    completo: 'text-emerald-400',
    sem_usuario: 'text-muted-foreground',
    usuario_sem_profile: 'text-amber-400',
    profile_sem_oficina: 'text-amber-400',
    nao_configurado: 'text-red-400',
  }

  return (
    <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Teste de Login Supabase
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-prose">
            Área isolada para testar Supabase Auth sem alterar o login local do app. O modo atual
            permanece <strong className="font-medium text-foreground">{estado?.authModeLabel ?? '—'}</strong>.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={carregando || processando}
          onClick={() => void atualizarEstado()}
        >
          {carregando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">VITE_SUPABASE_URL</p>
          <StatusBadge
            ok={estado?.env.urlOk ?? false}
            label={estado?.env.urlOk ? estado.env.host ?? 'OK' : 'Ausente'}
          />
        </div>
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">VITE_SUPABASE_ANON_KEY</p>
          <StatusBadge
            ok={estado?.env.anonKeyOk ?? false}
            label={estado?.env.anonKeyOk ? 'Definida' : 'Ausente'}
          />
        </div>
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Modo do app</p>
          <p className="text-sm font-medium">{estado?.authModeLabel ?? '—'}</p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Situação Supabase</p>
          <p className={cn('text-sm font-medium', situacaoCor[estado?.situacao ?? ''])}>
            {estado?.mensagemStatus ?? 'Carregando…'}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/10 p-3 text-sm space-y-2">
        <p className="font-medium">Sessão Supabase (independente do login local)</p>
        {carregando ? (
          <p className="text-muted-foreground">Carregando…</p>
        ) : !estado?.sessao.existe ? (
          <p className="text-muted-foreground">Nenhum usuário Supabase logado.</p>
        ) : (
          <div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
            <p>
              E-mail:{' '}
              <span className="text-foreground">{estado.usuario?.email ?? '—'}</span>
            </p>
            <p>
              User ID:{' '}
              <span className="font-mono text-xs text-foreground">
                {estado.usuario?.id?.slice(0, 8) ?? '—'}…
              </span>
            </p>
            <p>
              Expira em:{' '}
              <span className="text-foreground">{estado.sessao.expiraEm ?? '—'}</span>
            </p>
            <p>
              Perfil:{' '}
              <span className="text-foreground">
                {estado.profile
                  ? `${estado.profile.full_name} (${profileParaAuthUser(estado.profile, estado.usuario?.email ?? '').papel})`
                  : '—'}
              </span>
            </p>
            <p>
              Office ID:{' '}
              <span className="font-mono text-xs text-foreground">
                {estado.profile?.office_id?.slice(0, 8) ?? '—'}
                {estado.profile?.office_id ? '…' : ''}
              </span>
            </p>
            <p>
              Oficina:{' '}
              <span className="text-foreground">{estado.office?.name ?? '—'}</span>
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sb-test-email">E-mail de teste</Label>
          <Input
            id="sb-test-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teste@craft.com"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sb-test-senha">Senha de teste</Label>
          <Input
            id="sb-test-senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="sb-test-nome">Nome do responsável (cadastro)</Label>
          <Input
            id="sb-test-nome"
            value={nomeResponsavel}
            onChange={(e) => setNomeResponsavel(e.target.value)}
            placeholder="Nome completo"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={processando || !estado?.env.configurado}
          onClick={() => void executar(testarConexaoSupabaseAuth)}
        >
          {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Testar conexão Supabase Auth
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={processando || !estado?.env.configurado}
          onClick={() =>
            void executar(() =>
              criarContaTesteSupabase({
                email,
                senha,
                nome_responsavel: nomeResponsavel,
              })
            )
          }
        >
          <UserPlus className="h-4 w-4" />
          Criar conta de teste
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-2"
          disabled={processando || !estado?.env.configurado}
          onClick={() =>
            void executar(() => entrarContaTesteSupabase({ email, senha }))
          }
        >
          <LogIn className="h-4 w-4" />
          Entrar com conta de teste
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2"
          disabled={processando || !estado?.sessao.existe}
          onClick={() => void executar(sairContaSupabase)}
        >
          <LogOut className="h-4 w-4" />
          Sair da conta Supabase
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={processando || !estado?.sessao.existe}
          onClick={() => void executar(verificarPerfilSupabase)}
        >
          Verificar perfil
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={processando || !estado?.sessao.existe}
          onClick={() => void executar(verificarOficinaSupabase)}
        >
          Verificar oficina vinculada
        </Button>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Criar primeira oficina (Supabase)
        </p>
        <p className="text-xs text-muted-foreground">
          Requer usuário Supabase logado sem perfil. Cria registro em <code>offices</code>, perfil
          com cargo Dono e vincula <code>office_id</code>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sb-office-nome">Nome da oficina</Label>
            <Input
              id="sb-office-nome"
              value={nomeOficina}
              onChange={(e) => setNomeOficina(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sb-office-tel">Telefone / WhatsApp</Label>
            <Input
              id="sb-office-tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sb-office-cidade">Cidade</Label>
            <Input
              id="sb-office-cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sb-office-estado">Estado</Label>
            <Input
              id="sb-office-estado"
              value={estadoUf}
              onChange={(e) => setEstadoUf(e.target.value)}
              maxLength={2}
            />
          </div>
        </div>
        <Button
          type="button"
          className="gap-2"
          disabled={processando || !estado?.sessao.existe}
          onClick={() =>
            void executar(async () => {
              const result = await ensureOfficeForUser({
                nome_oficina: nomeOficina,
                telefone,
                cidade,
                estado: estadoUf,
                nome_responsavel: nomeResponsavel,
                email,
              })
              const estadoAtual = await carregarEstadoSupabaseAuth()
              setEstado(estadoAtual)
              return {
                ok: result.ok,
                mensagem: result.mensagem,
                detalhe: result.office
                  ? `${result.office.name} · ID ${result.officeId?.slice(0, 8)}…`
                  : undefined,
                estado: estadoAtual,
              }
            })
          }
        >
          {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          Criar oficina para usuário logado
        </Button>
      </div>

      <MensagemResultado resultado={ultimoResultado} />

      {!estado?.env.configurado && (
        <p className="text-xs text-amber-400/90">
          Configure as variáveis Supabase em .env.local e reinicie o servidor. Mantenha{' '}
          <code>VITE_CRAFT_AUTH=local</code> para continuar usando o modo demo.
        </p>
      )}
    </div>
  )
}
