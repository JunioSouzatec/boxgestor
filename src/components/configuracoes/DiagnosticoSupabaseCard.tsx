import { useCallback, useEffect, useState } from 'react'
import { Activity, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { useCraft } from '@/context/CraftContext'
import { useBancoStatus } from '@/context/BancoStatusContext'
import { getCraftPersistenceMode, getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { getCurrentProfile } from '@/services/auth/supabase-auth-safe.service'
import { obterUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import { testarSalvarOficinaNoSupabase } from '@/services/supabase-sync/supabase-office.persistence'
import { cn } from '@/lib/utils'

interface DiagnosticoSupabase {
  userId?: string
  profileOk: boolean
  profileOfficeId?: string
  officeOk: boolean
  officeNome?: string
  currentOfficeId?: string | null
  modoBanco: string
  ultimoErro?: string
  ultimoErroEm?: string
  ultimoErroEntidade?: string
  ultimoErroServiceOrder?: {
    office_id?: string
    customer_id?: string
    motorcycle_id?: string
    os_local_id?: string
    os_numero?: number
    current_office_id?: string | null
  }
  ultimoErroTecnico?: string
  erroConsulta?: string
  testeOficina?: string
  testeOficinaOk?: boolean
}

interface DiagnosticoSupabaseCardProps {
  /** Renderiza como seção dentro de Backup e Segurança (sem card externo duplicado). */
  embutido?: boolean
}

export function DiagnosticoSupabaseCard({ embutido = false }: DiagnosticoSupabaseCardProps) {
  const { session, modoAuthLabel, officeId } = useAuth()
  const { oficinaId } = useCraft()
  const { statusLabel, modoPersistenciaLabel } = useBancoStatus()
  const [diag, setDiag] = useState<DiagnosticoSupabase | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [testandoOficina, setTestandoOficina] = useState(false)
  const [ultimaExecucao, setUltimaExecucao] = useState<string | null>(null)

  const executarDiagnostico = useCallback(async () => {
    setCarregando(true)
    const ultimo = obterUltimoErroSupabase()
    const base: DiagnosticoSupabase = {
      userId: session?.user?.id,
      profileOk: false,
      officeOk: false,
      modoBanco: `${modoAuthLabel} · ${modoPersistenciaLabel} · ${statusLabel}`,
      ultimoErro: ultimo?.mensagem,
      ultimoErroEm: ultimo?.em,
      ultimoErroEntidade: ultimo?.entidade,
      ultimoErroTecnico: ultimo?.erro_tecnico,
      ultimoErroServiceOrder: ultimo?.service_order,
    }

    if (!isSupabaseConfigured()) {
      setDiag({
        ...base,
        erroConsulta: 'Supabase não configurado (.env.local)',
      })
      setCarregando(false)
      return
    }

    try {
      const supabase = getSupabaseClient()
      if (!supabase) {
        setDiag({ ...base, erroConsulta: 'Cliente Supabase indisponível' })
        setCarregando(false)
        return
      }

      const userId = session?.user?.id
      let profileOfficeId = session?.user?.office_id

      if (userId) {
        const profile = await getCurrentProfile(userId)
        if (profile) {
          base.profileOk = true
          profileOfficeId = profile.office_id
          base.profileOfficeId = profile.office_id
        }
      }

      const contexto = await obterContextoOfficeSupabase(oficinaId)
      const officeUuid = contexto?.officeUuid ?? profileOfficeId

      if (officeUuid) {
        const { data: office, error } = await supabase
          .from('offices')
          .select('id, name')
          .eq('id', officeUuid)
          .maybeSingle()

        if (error) {
          base.erroConsulta = error.message
        } else if (office) {
          base.officeOk = true
          base.officeNome = (office as { name: string }).name
        }
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc('current_office_id')
      if (!rpcError) {
        base.currentOfficeId = rpcData as string | null
        if (base.ultimoErroServiceOrder) {
          base.ultimoErroServiceOrder = {
            ...base.ultimoErroServiceOrder,
            current_office_id: rpcData as string | null,
          }
        }
      } else {
        base.erroConsulta = base.erroConsulta
          ? `${base.erroConsulta} · RPC: ${rpcError.message}`
          : `RPC current_office_id: ${rpcError.message}`
      }

      setDiag(base)
    } catch (e) {
      setDiag({
        ...base,
        erroConsulta: e instanceof Error ? e.message : 'Erro no diagnóstico',
      })
    } finally {
      setCarregando(false)
      setUltimaExecucao(new Date().toISOString())
    }
  }, [session?.user?.id, session?.user?.office_id, oficinaId, modoPersistenciaLabel, statusLabel, modoAuthLabel])

  useEffect(() => {
    if (!import.meta.env.DEV || !diag) return
    console.info('[Craft diagnóstico — DEV]', {
      auth: modoAuthLabel,
      persistencia: modoPersistenciaLabel,
      status: statusLabel,
      officeIdLocal: officeId,
      officeIdSessao: session?.user?.office_id,
      ...diag,
    })
  }, [diag, modoAuthLabel, modoPersistenciaLabel, statusLabel, officeId, session?.user?.office_id])

  const executarTesteSalvarOficina = useCallback(async () => {
    setTestandoOficina(true)
    try {
      const resultado = await testarSalvarOficinaNoSupabase(oficinaId)
      setDiag((prev) =>
        prev
          ? {
              ...prev,
              testeOficina: resultado.mensagem,
              testeOficinaOk: resultado.ok,
            }
          : {
              testeOficina: resultado.mensagem,
              testeOficinaOk: resultado.ok,
              profileOk: false,
              officeOk: false,
              modoBanco: '',
            }
      )
    } finally {
      setTestandoOficina(false)
    }
  }, [oficinaId])

  if (getCraftPersistenceMode() !== 'supabase') return null

  const statusResumo =
    diag?.profileOk && diag?.officeOk
      ? 'Conexão OK'
      : diag?.erroConsulta
        ? 'Atenção'
        : diag
          ? 'Verificar'
          : 'Aguardando execução'

  const corpo = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
        <span>
          Status: <strong>{statusResumo}</strong>
        </span>
        {ultimaExecucao && (
          <span className="text-xs text-muted-foreground">
            Último diagnóstico: {new Date(ultimaExecucao).toLocaleString('pt-BR')}
          </span>
        )}
      </div>

      {!diag && !carregando && (
        <p className="text-sm text-muted-foreground">
          Clique em &quot;Executar diagnóstico&quot; para verificar sessão, profile e office no
          Supabase.
        </p>
      )}

      {diag && (
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <LinhaDiag label="Login" valor={modoAuthLabel} />
        <LinhaDiag label="Office ID (app)" valor={officeId ?? session?.user?.office_id ?? '—'} />
        <LinhaDiag label="User ID" valor={diag?.userId ? `${diag.userId.slice(0, 8)}…` : '—'} />
        <LinhaDiag
          label="Profile encontrado"
          valor={diag?.profileOk ? 'Sim' : 'Não'}
          ok={diag?.profileOk}
        />
        <LinhaDiag
          label="profile.office_id"
          valor={diag?.profileOfficeId ?? '—'}
        />
        <LinhaDiag
          label="Office carregada"
          valor={diag?.officeOk ? 'Sim' : 'Não'}
          ok={diag?.officeOk}
        />
        <LinhaDiag label="Nome da office" valor={diag?.officeNome ?? '—'} />
        <LinhaDiag
          label="current_office_id()"
          valor={
            diag?.currentOfficeId
              ? String(diag.currentOfficeId)
              : diag?.currentOfficeId === null
                ? 'NULL (RLS/profile)'
                : '—'
          }
          ok={Boolean(diag?.currentOfficeId)}
        />
        <LinhaDiag label="Ambiente técnico" valor={diag?.modoBanco ?? '—'} className="sm:col-span-2" />
      </div>
      )}

      {diag?.ultimoErro && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm space-y-2">
          <p className="font-medium text-red-200/90">Último erro Supabase</p>
          {diag.ultimoErroEntidade && (
            <p className="text-xs text-muted-foreground">Entidade: {diag.ultimoErroEntidade}</p>
          )}
          <p className="text-xs text-red-100/80">{diag.ultimoErro}</p>
          {diag.ultimoErroTecnico && diag.ultimoErroTecnico !== diag.ultimoErro && (
            <p className="text-xs text-red-100/60 font-mono break-all">{diag.ultimoErroTecnico}</p>
          )}
          {diag.ultimoErroServiceOrder && (
            <div className="rounded border border-red-500/20 bg-red-950/20 p-2 text-xs font-mono space-y-1">
              <p className="text-red-200/80 font-sans font-medium">Detalhes service_orders</p>
              <p>office_id enviado: {diag.ultimoErroServiceOrder.office_id?.slice(0, 8) ?? '—'}…</p>
              <p>
                current_office_id():{' '}
                {diag.ultimoErroServiceOrder.current_office_id
                  ? `${String(diag.ultimoErroServiceOrder.current_office_id).slice(0, 8)}…`
                  : 'NULL'}
              </p>
              <p>customer_id: {diag.ultimoErroServiceOrder.customer_id?.slice(0, 8) ?? '—'}…</p>
              <p>motorcycle_id: {diag.ultimoErroServiceOrder.motorcycle_id?.slice(0, 8) ?? '—'}…</p>
              {diag.ultimoErroServiceOrder.os_numero != null && (
                <p>OS #{diag.ultimoErroServiceOrder.os_numero}</p>
              )}
            </div>
          )}
          {diag.ultimoErroEm && (
            <p className="text-xs text-muted-foreground">
              {new Date(diag.ultimoErroEm).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      )}

      {diag?.erroConsulta && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100/90">
          {diag.erroConsulta}
        </div>
      )}

      {diag?.testeOficina && (
        <div
          className={cn(
            'rounded-md border p-3 text-sm',
            diag.testeOficinaOk
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100/90'
              : 'border-red-500/30 bg-red-500/5 text-red-100/90'
          )}
        >
          <p className="font-medium">Teste salvar oficina</p>
          <p className="text-xs mt-1">{diag.testeOficina}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={carregando}
          onClick={() => void executarDiagnostico()}
        >
          {carregando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Executar diagnóstico
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2"
          disabled={testandoOficina || !session?.user?.id}
          onClick={() => void executarTesteSalvarOficina()}
        >
          {testandoOficina ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Activity className="h-4 w-4" />
          )}
          Testar salvar oficina no Supabase
        </Button>
      </div>
    </>
  )

  if (embutido) {
    return (
      <div className="space-y-4 rounded-md border border-primary/20 bg-muted/5 p-4">
        <div>
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Diagnóstico
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            Informações técnicas de login, office ID, persistência e RLS. Uso recomendado para
            suporte e desenvolvimento.
          </p>
        </div>
        {corpo}
      </div>
    )
  }

  return (
    <Card className="lg:col-span-2 border-primary/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Diagnóstico Supabase
        </CardTitle>
        <CardDescription>
          Verifica sessão, profile, office_id e políticas RLS. Após erro em OS, rode{' '}
          <code className="text-primary">docs/supabase-fix-service-orders-rls.sql</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{corpo}</CardContent>
    </Card>
  )
}

function LinhaDiag({
  label,
  valor,
  ok,
  className,
}: {
  label: string
  valor: string
  ok?: boolean
  className?: string
}) {
  return (
    <div className={cn('rounded-md border border-border bg-muted/20 px-3 py-2', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-sm font-medium font-mono',
          ok === true && 'text-emerald-400',
          ok === false && 'text-amber-400'
        )}
      >
        {valor}
      </p>
    </div>
  )
}
