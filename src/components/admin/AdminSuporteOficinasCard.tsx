import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/context/ToastContext'
import { formatarDataBrasil } from '@/lib/utils'
import { getLabelPlano } from '@/types/plano'
import { formatarOfficeIdCurto } from '@/services/assinatura/office-admin.service'
import {
  officeRegistryService,
  type OficinaRegistro,
} from '@/services/assinatura/office-registry.service'
import {
  adminUsaSupabaseRemoto,
  ADMIN_LIST_OFFICES_TIMEOUT_MS,
  AdminRpcTimeoutError,
  iniciarWatchdogAdmin,
  MENSAGEM_ERRO_LISTAGEM_OFICINAS,
  type AdminStatusOperacao,
} from '@/lib/admin-env'
import { AdminStatusDiagnostico } from '@/components/admin/AdminStatusDiagnostico'
import { useAdminMounted } from '@/hooks/useAdminMounted'
import { AdminOficinaRaioXDialog } from '@/components/admin/AdminOficinaRaioXDialog'
import { carregarTipoOficinaAdmin } from '@/services/admin/admin-tipo-oficina.service'
import { carregarModuloFiscalAdicionalAdmin } from '@/services/admin/admin-fiscal-addon.service'
import { carregarDetalhesOficinaAdmin } from '@/services/admin/admin-office-details.service'
import { labelTipoOficina, type TipoOficina } from '@/types/tipo-oficina'

type OficinaSuporteRow = OficinaRegistro & {
  tipo_oficina?: TipoOficina
  fiscal_adicional?: boolean
  total_os?: number
  total_clientes?: number
  total_pagamentos?: number
}

function badgeStatusOficina(status: OficinaRegistro['status']) {
  switch (status) {
    case 'teste':
      return { variant: 'info' as const, label: 'Teste Premium' }
    case 'teste_expirado':
      return { variant: 'warning' as const, label: 'Teste encerrado' }
    default:
      return { variant: 'success' as const, label: 'Ativa' }
  }
}

export function AdminSuporteOficinasCard() {
  const { toast } = useToast()
  const { iniciarOperacao, operacaoAtiva, mountedRef } = useAdminMounted()
  const modoRemoto = adminUsaSupabaseRemoto()
  const [oficinas, setOficinas] = useState<OficinaSuporteRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const [statusAdmin, setStatusAdmin] = useState<AdminStatusOperacao>('carregando')
  const [ultimaTentativa, setUltimaTentativa] = useState<Date | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [raioXOficina, setRaioXOficina] = useState<OficinaRegistro | null>(null)
  const [enriquecendo, setEnriquecendo] = useState(false)

  const carregar = useCallback(async () => {
    const seq = iniciarOperacao()
    setCarregando(true)
    setErro(null)
    setStatusAdmin('carregando')
    const stopWatchdog = iniciarWatchdogAdmin(ADMIN_LIST_OFFICES_TIMEOUT_MS, () => {
      if (!operacaoAtiva(seq)) return
      setStatusAdmin('timeout')
      setErro(MENSAGEM_ERRO_LISTAGEM_OFICINAS)
      setUltimaTentativa(new Date())
      setCarregando(false)
    })
    try {
      const resultado = await officeRegistryService.listarOficinasAsync()
      if (!operacaoAtiva(seq)) return
      setOficinas(resultado.oficinas.map((o) => ({ ...o })))
      setErro(resultado.erroRemoto ?? null)
      setStatusAdmin(
        resultado.statusOperacao ?? (resultado.erroRemoto ? 'erro' : 'sucesso')
      )
      setUltimaTentativa(new Date())
      if (resultado.erroRemoto) toast.erro(resultado.erroRemoto)
    } catch (e) {
      if (!operacaoAtiva(seq)) return
      const msg =
        e instanceof AdminRpcTimeoutError
          ? MENSAGEM_ERRO_LISTAGEM_OFICINAS
          : e instanceof Error
            ? e.message
            : MENSAGEM_ERRO_LISTAGEM_OFICINAS
      setErro(msg)
      setStatusAdmin(e instanceof AdminRpcTimeoutError ? 'timeout' : 'erro')
      setUltimaTentativa(new Date())
      toast.erro(msg)
    } finally {
      stopWatchdog()
      if (operacaoAtiva(seq)) setCarregando(false)
    }
  }, [iniciarOperacao, operacaoAtiva, toast])

  useEffect(() => {
    void carregar()
  }, [carregar])

  /** Enriquecimento leve (somente leitura) para totais/tipo/fiscal — não bloqueia a lista. */
  useEffect(() => {
    if (!modoRemoto || oficinas.length === 0) return
    let cancelado = false
    setEnriquecendo(true)
    ;(async () => {
      const amostra = oficinas.slice(0, 40)
      const atualizados = await Promise.all(
        amostra.map(async (o) => {
          try {
            const [det, tipo, fiscal] = await Promise.all([
              carregarDetalhesOficinaAdmin(o.office_id).catch(() => null),
              carregarTipoOficinaAdmin(o.office_id).catch(() => undefined),
              carregarModuloFiscalAdicionalAdmin(o.office_id).catch(() => false),
            ])
            return {
              office_id: o.office_id,
              tipo_oficina: tipo,
              fiscal_adicional: Boolean(fiscal),
              total_os: det?.totais.ordens,
              total_clientes: det?.totais.clientes,
              total_pagamentos: det?.totais.pagamentos,
            }
          } catch {
            return { office_id: o.office_id }
          }
        })
      )
      if (cancelado || !mountedRef.current) return
      setOficinas((prev) =>
        prev.map((o) => {
          const extra = atualizados.find((a) => a.office_id === o.office_id)
          return extra ? { ...o, ...extra } : o
        })
      )
      setEnriquecendo(false)
    })()
    return () => {
      cancelado = true
    }
  }, [modoRemoto, oficinas.length, mountedRef])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return oficinas
    return oficinas.filter((o) => {
      const codigo = formatarOfficeIdCurto(o.office_id).toLowerCase()
      return (
        o.nome.toLowerCase().includes(q) ||
        o.office_id.toLowerCase().includes(q) ||
        codigo.includes(q) ||
        (o.dono_email ?? '').toLowerCase().includes(q) ||
        getLabelPlano(o.plano).toLowerCase().includes(q)
      )
    })
  }, [busca, oficinas])

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Stethoscope className="h-4 w-4 shrink-0" />
                Suporte das Oficinas
              </CardTitle>
              <CardDescription>
                Central somente leitura para diagnóstico de suporte. Não altera pagamentos, caixa,
                estoque nem OS.
              </CardDescription>
            </div>
            <Badge variant="outline" className="gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />
              Somente leitura
            </Badge>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, código, e-mail ou plano…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={carregando}
              onClick={() => void carregar()}
            >
              {carregando ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Atualizar
            </Button>
          </div>
          {enriquecendo ? (
            <p className="text-xs text-muted-foreground">Carregando totais de suporte…</p>
          ) : null}
          <AdminStatusDiagnostico status={statusAdmin} ultimaTentativa={ultimaTentativa} />
          {erro ? (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erro}</span>
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {carregando && oficinas.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando oficinas…
            </div>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma oficina encontrada.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Oficina</th>
                    <th className="px-3 py-2 font-medium">Plano / Status</th>
                    <th className="px-3 py-2 font-medium">Tipo / Fiscal</th>
                    <th className="px-3 py-2 font-medium">Totais</th>
                    <th className="px-3 py-2 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtradas.map((o) => {
                    const st = badgeStatusOficina(o.status)
                    return (
                      <tr key={o.office_id} className="align-top">
                        <td className="px-3 py-3">
                          <p className="font-medium break-words">{o.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            Código: {formatarOfficeIdCurto(o.office_id)}
                          </p>
                          {o.trial_fim_em ? (
                            <p className="text-xs text-muted-foreground">
                              Trial até {formatarDataBrasil(o.trial_fim_em)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline">{getLabelPlano(o.plano)}</Badge>
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          <p>{o.tipo_oficina ? labelTipoOficina(o.tipo_oficina) : '—'}</p>
                          <p>{o.fiscal_adicional ? 'Fiscal adicional: sim' : 'Fiscal adicional: —'}</p>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          <p>OS: {o.total_os ?? '—'}</p>
                          <p>Clientes: {o.total_clientes ?? '—'}</p>
                          <p>Pagamentos: {o.total_pagamentos ?? '—'}</p>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button size="sm" onClick={() => setRaioXOficina(o)}>
                            Abrir Raio-X
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AdminOficinaRaioXDialog
        oficina={raioXOficina}
        aberto={Boolean(raioXOficina)}
        onFechar={() => setRaioXOficina(null)}
      />
    </>
  )
}
