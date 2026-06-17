import { useCallback, useState } from 'react'
import { CloudUpload, Link2, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useBancoStatus } from '@/context/BancoStatusContext'
import { useCraft } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { cn } from '@/lib/utils'
import { obterUrlSupabaseMascarada } from '@/services/supabase-connection.service'
import {
  repararVinculoPagamentosComSupabase,
  sincronizarDadosLocaisComSupabase,
  sincronizarOsPendentesComSupabase,
  sincronizarPagamentosPendentesComSupabase,
} from '@/services/supabase-sync/supabase-sync.service'
import type { ResultadoSincronizacaoSupabase } from '@/services/supabase-sync/supabase-sync.types'
import {
  carregarEstadoSincronizacao,
  type EstadoSincronizacaoLocal,
} from '@/services/supabase-sync/sync-state.storage'
import { BackupLocalCard } from '@/components/configuracoes/BackupLocalCard'
import { AmbienteTesteCard } from '@/components/configuracoes/AmbienteTesteCard'
import { BotaoRepararPagamentosDuplicados } from '@/components/configuracoes/RepararPagamentosDuplicadosDialog'
import { AuditarPagamentosOsSection } from '@/components/configuracoes/AuditarPagamentosOsSection'
import { PagamentosOrfaosSection } from '@/components/configuracoes/PagamentosOrfaosSection'
import { OsComparacaoLocalSupabaseSection } from '@/components/admin/OsComparacaoLocalSupabaseSection'
import { MigrarOficinaSupabaseCard } from '@/components/configuracoes/MigrarOficinaSupabaseCard'
import { DiagnosticoSupabaseCard } from '@/components/configuracoes/DiagnosticoSupabaseCard'
import { TesteSupabaseAuthCard } from '@/components/configuracoes/TesteSupabaseAuthCard'
import { useAuth } from '@/context/AuthContext'

function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function labelSupabase(status: string, configurado: boolean): string {
  if (!configurado) return 'Não configurado'
  if (status === 'offline_sync') return 'Offline / fila pendente'
  if (status === 'supabase') return 'Conectado'
  if (status === 'supabase_fallback') return 'Fallback local'
  if (status === 'local') return 'Modo local ativo'
  return 'Aguardando'
}

export function SupabaseConexaoCard({ modoAdmin = false }: { modoAdmin?: boolean }) {
  const { oficinaId } = useCraft()
  const { toast } = useToast()
  const { session } = useAuth()
  const isDono = session?.user?.papel === 'dono'
  const {
    status,
    statusLabel,
    modoPersistenciaLabel,
    modoSupabaseExperimental,
    supabaseConfigurado,
    emFallbackLocal,
    ultimoAviso,
    pendenciasAtivas,
    filaSyncBruta,
    pagamentosPendentes,
    pagamentosPendentesVinculoOs,
    testando,
    ultimoTeste,
    testadoEm,
    testarConexao,
  } = useBancoStatus()

  const [estadoSync, setEstadoSync] = useState<EstadoSincronizacaoLocal | null>(() =>
    carregarEstadoSincronizacao()
  )
  const [sincronizando, setSincronizando] = useState(false)
  const [sincronizandoPagamentos, setSincronizandoPagamentos] = useState(false)
  const [sincronizandoOs, setSincronizandoOs] = useState(false)
  const [reparandoVinculo, setReparandoVinculo] = useState(false)
  const [ultimoSync, setUltimoSync] = useState<ResultadoSincronizacaoSupabase | null>(
    () => carregarEstadoSincronizacao()?.ultimoResultado ?? null
  )

  const host = obterUrlSupabaseMascarada()

  const handleTestar = useCallback(async () => {
    await testarConexao()
  }, [testarConexao])

  const handleSincronizar = useCallback(async () => {
    setSincronizando(true)
    try {
      const resultado = await sincronizarDadosLocaisComSupabase(oficinaId)
      setUltimoSync(resultado)
      setEstadoSync(carregarEstadoSincronizacao())
      await testarConexao()
    } finally {
      setSincronizando(false)
    }
  }, [oficinaId, testarConexao])

  const handleSincronizarPagamentos = useCallback(async () => {
    setSincronizandoPagamentos(true)
    try {
      const resultado = await sincronizarPagamentosPendentesComSupabase(oficinaId)
      setUltimoSync(resultado)
      setEstadoSync(carregarEstadoSincronizacao())
      if (!resultado.ok && resultado.mensagem.includes('duplicados')) {
        toast.erro(resultado.mensagem)
      }
      await testarConexao()
    } finally {
      setSincronizandoPagamentos(false)
    }
  }, [oficinaId, testarConexao, toast])

  const handleSincronizarOs = useCallback(async () => {
    setSincronizandoOs(true)
    try {
      const resultado = await sincronizarOsPendentesComSupabase(oficinaId)
      setUltimoSync(resultado)
      setEstadoSync(carregarEstadoSincronizacao())
      await testarConexao()
    } finally {
      setSincronizandoOs(false)
    }
  }, [oficinaId, testarConexao])

  const handleRepararVinculo = useCallback(async () => {
    setReparandoVinculo(true)
    try {
      const resultado = await repararVinculoPagamentosComSupabase(oficinaId)
      setUltimoSync(resultado)
      setEstadoSync(carregarEstadoSincronizacao())
      await testarConexao()
    } finally {
      setReparandoVinculo(false)
    }
  }, [oficinaId, testarConexao])

  const enviados = ultimoSync?.enviados
  const erros = ultimoSync?.erros ?? []

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">
          {modoAdmin ? 'Manutenção e diagnóstico técnico' : 'Backup e Segurança'}
        </CardTitle>
        <CardDescription>
          Conexão, sincronização manual e modo experimental Supabase. O backup local (localStorage)
          permanece ativo como segurança.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Banco atual</p>
            <p className="text-sm font-medium">Local</p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Supabase</p>
            <p
              className={cn(
                'text-sm font-medium',
                status === 'supabase' && 'text-emerald-400',
                status === 'supabase_fallback' && 'text-amber-400',
                (status === 'offline_sync' || !supabaseConfigurado) && 'text-orange-400'
              )}
            >
              {labelSupabase(status, supabaseConfigurado)}
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Persistência ativa</p>
            <p className="text-sm font-medium">{modoPersistenciaLabel}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Status geral</p>
            <p className="text-sm font-medium">{statusLabel}</p>
          </div>
          {modoSupabaseExperimental && (
            <>
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Pendências ativas</p>
                <p className="text-sm font-medium">{pendenciasAtivas} pendente(s)</p>
                {filaSyncBruta > pendenciasAtivas && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Fila local: {filaSyncBruta} item(ns)
                  </p>
                )}
              </div>
              {pagamentosPendentes > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xs text-muted-foreground">Pagamentos pendentes</p>
                  <p className="text-sm font-medium text-amber-100/90">
                    {pagamentosPendentes}
                    {pagamentosPendentesVinculoOs ? ' (vínculo com OS)' : ''}
                  </p>
                  <a
                    href="#pendencias-pagamentos"
                    className="text-xs text-primary hover:underline mt-1 inline-block"
                  >
                    Ver diagnóstico abaixo
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        {ultimoAviso && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100/90">
            {ultimoAviso}
          </div>
        )}

        {modoSupabaseExperimental && (
          <p className="text-sm text-emerald-400/90">
            Modo Supabase ativo: oficina, clientes, motos, OS e pagamentos sincronizam com a nuvem.
            Estoque, fotos e demais módulos ainda usam cache local.
          </p>
        )}

        {emFallbackLocal && modoSupabaseExperimental && (
          <p className="text-sm text-amber-400/90">
            Fallback local ativo — alterações foram salvas no navegador e serão reenviadas quando
            possível.
          </p>
        )}

        <div className="rounded-md border border-border bg-muted/10 p-3 text-sm space-y-2">
          <p className="font-medium text-foreground">Status da sincronização</p>
          <div className="grid gap-2 sm:grid-cols-2 text-muted-foreground">
            <p>
              Última sincronização:{' '}
              <span className="text-foreground">
                {formatarData(estadoSync?.ultimaSincronizacao ?? ultimoSync?.fimEm)}
              </span>
            </p>
            <p>
              Registros enviados:{' '}
              <span className="text-foreground">{enviados?.total ?? '—'}</span>
            </p>
            <p>
              Registros com erro:{' '}
              <span className={cn('text-foreground', erros.length > 0 && 'text-red-400')}>
                {ultimoSync ? erros.length : '—'}
              </span>
            </p>
          </div>
          {enviados && enviados.total > 0 && (
            <p className="text-xs text-muted-foreground">
              Detalhe: oficina {enviados.office}, configurações {enviados.settings}, clientes{' '}
              {enviados.customers}, motos {enviados.motorcycles}, OS {enviados.service_orders}
              {enviados.service_order_payments > 0 || enviados.financial_transactions > 0
                ? `, pagamentos OS ${enviados.service_order_payments}, financeiro ${enviados.financial_transactions}`
                : ''}
            </p>
          )}
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            Supabase:{' '}
            {supabaseConfigurado ? (
              <span className="text-foreground">{host ?? 'configurado'}</span>
            ) : (
              <span className="text-amber-400">não configurado (.env.local)</span>
            )}
          </p>
          <p>
            Sincroniza: oficina, clientes, motos, ordens de serviço e pagamentos (tabelas{' '}
            <code className="text-primary">service_order_payments</code> e{' '}
            <code className="text-primary">financial_transactions</code>). Estoque e fotos permanecem
            locais nesta fase.
          </p>
          <p>
            Antes da primeira sync, execute{' '}
            <code className="text-primary">docs/supabase-fix-rls-v2.sql</code> e{' '}
            <code className="text-primary">docs/supabase-payments-finance.sql</code> e{' '}
            <code className="text-primary">docs/supabase-payments-idempotency.sql</code> no SQL Editor
            do Supabase.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={testando || !supabaseConfigurado}
            onClick={handleTestar}
          >
            {testando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testando conexão…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Testar conexão Supabase
              </>
            )}
          </Button>

          <Button
            type="button"
            className="gap-2"
            disabled={
              sincronizando ||
              sincronizandoPagamentos ||
              sincronizandoOs ||
              reparandoVinculo ||
              !supabaseConfigurado
            }
            onClick={handleSincronizar}
          >
            {sincronizando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sincronizando…
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4" />
                Sincronizar dados locais com Supabase
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={
              sincronizando ||
              sincronizandoPagamentos ||
              sincronizandoOs ||
              reparandoVinculo ||
              !supabaseConfigurado
            }
            onClick={handleSincronizarOs}
          >
            {sincronizandoOs ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sincronizando OS…
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4" />
                Sincronizar OS pendentes
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={
              sincronizando ||
              sincronizandoPagamentos ||
              sincronizandoOs ||
              reparandoVinculo ||
              !supabaseConfigurado
            }
            onClick={handleSincronizarPagamentos}
          >
            {sincronizandoPagamentos ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sincronizando pagamentos…
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4" />
                Sincronizar pagamentos pendentes
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={
              sincronizando ||
              sincronizandoPagamentos ||
              sincronizandoOs ||
              reparandoVinculo ||
              !supabaseConfigurado
            }
            onClick={handleRepararVinculo}
          >
            {reparandoVinculo ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Reparando vínculo…
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" />
                Reparar vínculo de pagamentos com OS
              </>
            )}
          </Button>

          <BotaoRepararPagamentosDuplicados variant="outline" />
        </div>

        {modoSupabaseExperimental && supabaseConfigurado && (
          <>
            <PagamentosOrfaosSection />
            {modoAdmin && (
              <>
                <AuditarPagamentosOsSection />
                <OsComparacaoLocalSupabaseSection />
              </>
            )}
          </>
        )}

        {!supabaseConfigurado && (
          <p className="text-sm text-amber-400/90">
            Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local e reinicie o
            servidor de desenvolvimento.
          </p>
        )}

        {ultimoTeste && (
          <div
            className={cn(
              'rounded-md border p-3 text-sm',
              ultimoTeste.ok
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100/90'
                : 'border-red-500/30 bg-red-500/5 text-red-100/90'
            )}
            role="status"
          >
            <p className="font-medium">{ultimoTeste.mensagem}</p>
            {ultimoTeste.detalhe && (
              <p className="mt-1 text-xs opacity-90">{ultimoTeste.detalhe}</p>
            )}
            {testadoEm && (
              <p className="mt-2 text-xs text-muted-foreground">
                Último teste: {formatarData(testadoEm)}
              </p>
            )}
          </div>
        )}

        {ultimoSync && (
          <div
            className={cn(
              'rounded-md border p-3 text-sm',
              ultimoSync.ok
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100/90'
                : 'border-amber-500/30 bg-amber-500/5 text-amber-100/90'
            )}
            role="status"
          >
            <p className="font-medium">{ultimoSync.mensagem}</p>
            {erros.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs opacity-90 max-h-40 overflow-y-auto">
                {erros.slice(0, 20).map((erro, i) => (
                  <li key={`${erro.entidade}-${erro.id ?? i}`}>
                    <span className="font-medium">{erro.entidade}</span>
                    {erro.id ? ` (${erro.id.slice(0, 8)}…)` : ''}: {erro.mensagem}
                  </li>
                ))}
                {erros.length > 20 && (
                  <li>… e mais {erros.length - 20} erro(s)</li>
                )}
              </ul>
            )}
          </div>
        )}

        <BackupLocalCard />

        {isDono && <AmbienteTesteCard />}

        {isDono && <TesteSupabaseAuthCard />}

        <MigrarOficinaSupabaseCard />

        <DiagnosticoSupabaseCard embutido />
      </CardContent>
    </Card>
  )
}
