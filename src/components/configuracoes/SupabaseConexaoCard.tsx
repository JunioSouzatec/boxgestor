import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useBancoStatus } from '@/context/BancoStatusContext'
import {
  obterUrlSupabaseMascarada,
} from '@/services/supabase-connection.service'
import { cn } from '@/lib/utils'

export function SupabaseConexaoCard() {
  const {
    status,
    statusLabel,
    modoPersistenciaLabel,
    supabaseConfigurado,
    testando,
    ultimoTeste,
    testadoEm,
    testarConexao,
  } = useBancoStatus()

  const host = obterUrlSupabaseMascarada()

  async function handleTestar() {
    await testarConexao()
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Backup e conexão Supabase</CardTitle>
        <CardDescription>
          Teste a conexão com o banco na nuvem. Os dados continuam no navegador até a migração
          completa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Persistência ativa</p>
            <p className="text-sm font-medium">{modoPersistenciaLabel}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Status do banco</p>
            <p
              className={cn(
                'text-sm font-medium',
                status === 'supabase_conectado' && 'text-emerald-400',
                status === 'supabase_erro' && 'text-red-400',
                status === 'offline' && 'text-amber-400'
              )}
            >
              {statusLabel}
            </p>
          </div>
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
            Variável <code className="text-primary">VITE_CRAFT_PERSISTENCE</code> permanece em{' '}
            <code className="text-primary">local</code> durante os testes.
          </p>
        </div>

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
                Último teste:{' '}
                {new Date(testadoEm).toLocaleString('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
