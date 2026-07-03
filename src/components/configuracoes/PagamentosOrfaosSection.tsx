import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCraft } from '@/context/CraftContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { ehAdminSistema } from '@/lib/craft-admin'
import { MSG } from '@/lib/mensagens-usuario'
import { diagnosticarPagamentosSemVinculoExatoOs } from '@/lib/pagamentos-os-vinculo'
import { formatarData, formatarMoeda } from '@/lib/utils'
import {
  type PendenciaPagamentoDiagnostico,
  resumirPendenciasPagamentos,
} from '@/services/pagamentos/payment-pending-diagnostic.service'
import {
  detectarPossivelDuplicidadePendencia,
  descartarPendenciaLocalAdmin,
  listarIdsPendenciasSuspeitasDuplicidade,
  marcarPendenciaComoResolvidaLocal,
  sincronizarPendenciaIndividualAdmin,
} from '@/services/pagamentos/payment-pending-resolution.service'
import { listarAuditoriaOrfaos } from '@/services/pagamentos/payment-orphan.storage'
import {
  arquivarPagamentosOrfaosLocais,
  limparPendenciasInvalidasLocais,
  limparPendenciasJaSincronizadas,
  recarregarDiagnosticoPendencias,
} from '@/services/supabase-sync/supabase-sync.service'
import { emitirDiagnosticoPendenciasAtualizado } from '@/services/persistence-status.events'
import { reconciliarPendenciasPagamentosOffice } from '@/services/pagamentos/payment-sync-reconcile.service'
import { listarAuditoriaSyncPendencias } from '@/services/pagamentos/payment-sync-audit.storage'
import { getLabelFormaPagamento } from '@/types/labels'
import type { CraftDatabase } from '@/types/database'

const LABEL_TIPO: Record<PendenciaPagamentoDiagnostico['tipo'], string> = {
  pagamento_os: 'Pagamento OS',
  financeiro: 'Financeiro',
  fila_sem_lancamento: 'Fila (sem lançamento)',
}

const LABEL_CLASSIFICACAO: Record<PendenciaPagamentoDiagnostico['classificacao'], string> = {
  sincronizavel: 'Sincronizável',
  orfao: 'Órfão (sem OS)',
  invalida: 'Inválida',
  quebrada: 'Quebrada',
  ja_sincronizado: 'Já no Supabase',
}

type AcaoDuplicidade = 'cancelar' | 'resolver' | 'sincronizar'

export function PagamentosOrfaosSection() {
  const { dados, oficinaId, aplicarDatabase, recarregarDadosSupabase } = useCraft()
  const { session } = useAuth()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const isAdminSistema = ehAdminSistema(session?.user)

  const [carregando, setCarregando] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [pendencias, setPendencias] = useState<PendenciaPagamentoDiagnostico[]>([])
  const [analiseExecutada, setAnaliseExecutada] = useState(false)
  const [ultimosReconciliados, setUltimosReconciliados] = useState(0)

  const [dialogDescartar, setDialogDescartar] = useState<PendenciaPagamentoDiagnostico | null>(null)
  const [confirmacaoDescartar, setConfirmacaoDescartar] = useState('')

  const [dialogDuplicidade, setDialogDuplicidade] = useState<{
    item: PendenciaPagamentoDiagnostico
    osNumero?: number
  } | null>(null)

  const pagamentosSemVinculoExato = useMemo(
    () => diagnosticarPagamentosSemVinculoExatoOs(dados),
    [dados]
  )

  const resumo = useMemo(() => resumirPendenciasPagamentos(pendencias), [pendencias])
  const invalidas = useMemo(() => pendencias.filter((p) => p.pode_limpar), [pendencias])
  const idsSuspeitosDuplicidade = useMemo(
    () => listarIdsPendenciasSuspeitasDuplicidade(pendencias, dados),
    [pendencias, dados]
  )

  const auditoria = useMemo(() => listarAuditoriaOrfaos(10), [dados.lancamentos, processando])
  const auditoriaSync = useMemo(() => listarAuditoriaSyncPendencias(8), [pendencias, processando])

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try {
      const { itens, reconciliados } = await recarregarDiagnosticoPendencias(oficinaId, dados)
      setPendencias(itens)
      setUltimosReconciliados(reconciliados)
      if (reconciliados > 0) {
        await recarregarDadosSupabase()
      }
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao recarregar diagnóstico de pendências.')
    } finally {
      setCarregando(false)
    }
  }, [dados, oficinaId, toast, recarregarDadosSupabase])

  async function executarLimparJaSincronizadas() {
    if (!isAdminSistema) return

    const ok = await confirmar({
      titulo: 'Limpar pendências já sincronizadas',
      mensagem:
        'Remove apenas itens da fila/cache local cujo pagamento equivalente já existe no Supabase. Nenhum pagamento, OS, cliente ou moto real será apagado.',
      confirmarTexto: 'Limpar pendências já sincronizadas',
    })
    if (!ok) return

    setProcessando(true)
    try {
      const { limpos, db } = await limparPendenciasJaSincronizadas(oficinaId, dados)
      if (limpos > 0) {
        aplicarDatabase(db)
        await recarregarDadosSupabase()
      }
      toast.sucesso(
        limpos > 0
          ? `${limpos} pendência(s) local(is) removida(s) — pagamentos já estavam no Supabase.`
          : 'Nenhuma pendência local obsoleta encontrada.'
      )
      await recarregar()
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao limpar pendências sincronizadas.')
    } finally {
      setProcessando(false)
    }
  }

  async function executarAnalise() {
    await recarregar()
    setAnaliseExecutada(true)
  }

  async function aplicarResolucaoSegura(db: CraftDatabase) {
    aplicarDatabase(db)
    const { db: reconciliado } = await reconciliarPendenciasPagamentosOffice(oficinaId, db, {
      consultarSupabase: true,
    })
    aplicarDatabase(reconciliado)
    emitirDiagnosticoPendenciasAtualizado(oficinaId)
  }

  async function executarMarcarResolvida(item: PendenciaPagamentoDiagnostico) {
    if (!isAdminSistema) return

    const ok = await confirmar({
      titulo: 'Marcar como resolvida',
      mensagem:
        item.ja_existe_supabase || item.pode_limpar_sincronizado
          ? 'O pagamento já existe no Supabase. Deseja remover apenas a pendência local/cache? Nenhum pagamento ou OS real será apagado.'
          : 'Esta pendência já está registrada na OS. Deseja apenas removê-la da fila local?',
      confirmarTexto: 'Marcar como resolvida',
    })
    if (!ok) return

    setProcessando(true)
    setProcessandoId(item.id)
    try {
      const { db } = marcarPendenciaComoResolvidaLocal(oficinaId, dados, item.id)
      await aplicarResolucaoSegura(db)
      toast.sucesso('Pendência marcada como resolvida.')
      await recarregar()
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao marcar pendência como resolvida.')
    } finally {
      setProcessando(false)
      setProcessandoId(null)
    }
  }

  function abrirDescartar(item: PendenciaPagamentoDiagnostico) {
    if (!isAdminSistema) return
    setConfirmacaoDescartar('')
    setDialogDescartar(item)
  }

  async function confirmarDescartar() {
    if (!dialogDescartar || !isAdminSistema) return
    if (confirmacaoDescartar.trim().toUpperCase() !== 'DESCARTAR') {
      toast.erro('Digite DESCARTAR para confirmar.')
      return
    }

    setProcessando(true)
    setProcessandoId(dialogDescartar.id)
    try {
      const { db } = descartarPendenciaLocalAdmin(oficinaId, dados, dialogDescartar.id)
      await aplicarResolucaoSegura(db)
      toast.sucesso('Pendência local descartada com sucesso.')
      setDialogDescartar(null)
      await recarregar()
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao descartar pendência local.')
    } finally {
      setProcessando(false)
      setProcessandoId(null)
    }
  }

  async function executarSyncIndividual(
    item: PendenciaPagamentoDiagnostico,
    ignorarDuplicidade = false
  ) {
    if (!isAdminSistema) return

    if (!ignorarDuplicidade && item.lancamento) {
      const dup = detectarPossivelDuplicidadePendencia(item.lancamento, dados)
      if (dup) {
        setDialogDuplicidade({ item, osNumero: dup.os_numero ?? item.os_numero })
        return
      }
    }

    setProcessando(true)
    setProcessandoId(item.id)
    try {
      const resultado = await sincronizarPendenciaIndividualAdmin(oficinaId, dados, item.id)
      await aplicarResolucaoSegura(resultado.db)
      if (resultado.ok) {
        toast.sucesso(resultado.mensagem)
      } else {
        toast.erro(resultado.mensagem)
      }
      await recarregar()
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao sincronizar pendência.')
    } finally {
      setProcessando(false)
      setProcessandoId(null)
      setDialogDuplicidade(null)
    }
  }

  async function resolverDuplicidade(acao: AcaoDuplicidade) {
    if (!dialogDuplicidade) return
    const { item } = dialogDuplicidade

    if (acao === 'cancelar') {
      setDialogDuplicidade(null)
      return
    }

    if (acao === 'resolver') {
      setDialogDuplicidade(null)
      await executarMarcarResolvida(item)
      return
    }

    await executarSyncIndividual(item, true)
  }

  async function executarLimparInvalidas() {
    if (invalidas.length === 0 || !isAdminSistema) return

    const ok = await confirmar({
      titulo: 'Limpar pendências inválidas',
      mensagem:
        'Essas pendências locais não podem ser sincronizadas porque estão sem vínculo válido com cliente, moto ou OS no Supabase. Deseja arquivar/remover apenas essas pendências locais? Nada será apagado do Supabase.',
      confirmarTexto: 'Limpar pendências inválidas',
      destrutivo: true,
    })
    if (!ok) return

    setProcessando(true)
    try {
      const ids = invalidas.map((p) => p.id)
      const { processados, db } = await limparPendenciasInvalidasLocais(oficinaId, ids, dados)
      aplicarDatabase(db)
      toast.sucesso(
        processados > 0
          ? `${processados} pendência(s) inválida(s) removida(s) da fila ativa.`
          : 'Nenhuma pendência processada.'
      )
      await recarregar()
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao limpar pendências inválidas.')
    } finally {
      setProcessando(false)
    }
  }

  async function executarArquivarInvalidas() {
    if (invalidas.length === 0 || !isAdminSistema) return

    const ok = await confirmar({
      titulo: 'Arquivar pendências inválidas',
      mensagem:
        'Essas pendências locais não podem ser sincronizadas porque estão sem vínculo válido com cliente, moto ou OS no Supabase. Deseja arquivar apenas essas pendências locais? Nada será apagado do Supabase.',
      confirmarTexto: 'Arquivar pendências inválidas',
    })
    if (!ok) return

    setProcessando(true)
    try {
      const ids = invalidas.map((p) => p.id)
      const { processados, db } = await arquivarPagamentosOrfaosLocais(oficinaId, ids, 'arquivar')
      aplicarDatabase(db)
      toast.sucesso(
        processados > 0
          ? `${processados} pendência(s) inválida(s) arquivada(s).`
          : 'Nenhuma pendência processada.'
      )
      await recarregar()
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao arquivar pendências inválidas.')
    } finally {
      setProcessando(false)
    }
  }

  function linkVerOs(item: PendenciaPagamentoDiagnostico): string | null {
    const osId = item.ordem_servico_id ?? item.local_service_order_id
    if (!osId) return null
    return `/ordens-servico/${encodeURIComponent(osId)}/visualizar`
  }

  const linhaProcessando = (id: string) => processando && processandoId === id

  return (
    <>
      <div
        id="pendencias-pagamentos"
        className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-100/95">
              <AlertTriangle className="h-4 w-4" />
              Pagamentos pendentes sem OS
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Análise manual de pendências locais. Resolva individualmente para evitar duplicar
              pagamentos no Supabase.
            </p>
            {resumo.total > 0 && (
              <p className="text-xs text-amber-200/80 mt-1">
                {resumo.total} pendência(s): {resumo.sincronizaveis} sincronizável(is),{' '}
                {resumo.invalidas} inválida(s)/órfã(s).
                {idsSuspeitosDuplicidade.size > 0 && (
                  <span className="block text-amber-300/90 mt-0.5">
                    {idsSuspeitosDuplicidade.size} com possível duplicidade na OS.
                  </span>
                )}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={carregando || processando}
            onClick={() => void executarAnalise()}
          >
            {carregando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Analisar pendências
          </Button>
          {isAdminSistema && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-2"
              disabled={carregando || processando}
              onClick={() => void executarLimparJaSincronizadas()}
            >
              {processando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Limpar pendências já sincronizadas
            </Button>
          )}
        </div>

        {ultimosReconciliados > 0 && (
          <p className="text-xs text-emerald-300/90">
            {ultimosReconciliados} pendência(s) obsoleta(s) removida(s) automaticamente — pagamentos
            já existiam no Supabase.
          </p>
        )}

        {!analiseExecutada && !carregando && (
          <p className="text-sm text-muted-foreground">
            Clique em &quot;Analisar pendências&quot; para verificar a fila de sincronização.
          </p>
        )}

        {carregando && pendencias.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analisando filas e localStorage…
          </div>
        ) : pendencias.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>No Supabase</TableHead>
                    {isAdminSistema && (
                      <TableHead className="min-w-[280px] text-right">Ações</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendencias.map((item) => {
                    const verOs = linkVerOs(item)
                    const suspeita = idsSuspeitosDuplicidade.has(item.id)
                    const busy = linhaProcessando(item.id)

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs">{LABEL_TIPO[item.tipo]}</TableCell>
                        <TableCell className="text-xs">
                          {LABEL_CLASSIFICACAO[item.classificacao]}
                          {suspeita && (
                            <span className="block text-[10px] text-amber-400/90">
                              possível duplicata
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.valor != null ? formatarMoeda(item.valor) : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.forma_pagamento
                            ? getLabelFormaPagamento(item.forma_pagamento)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.data ? formatarData(item.data) : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.os_numero != null ? `OS #${item.os_numero}` : '—'}
                        </TableCell>
                        <TableCell className="text-xs">{item.origem}</TableCell>
                        <TableCell className="max-w-[180px] text-xs">
                          {item.motivo_detalhado ?? item.motivo}
                          {item.erro_tecnico && (
                            <span className="block text-[10px] text-red-300/80 mt-0.5">
                              {item.erro_tecnico}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.ja_existe_supabase ? 'Sim' : 'Não'}
                        </TableCell>
                        {isAdminSistema && (
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-1">
                              {verOs && (
                                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" asChild>
                                  <Link to={verOs}>
                                    <ExternalLink className="h-3 w-3" />
                                    Ver OS
                                  </Link>
                                </Button>
                              )}
                              {item.classificacao === 'sincronizavel' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 text-xs"
                                  disabled={processando}
                                  onClick={() => void executarSyncIndividual(item)}
                                >
                                  {busy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CloudUpload className="h-3 w-3" />
                                  )}
                                  Sincronizar
                                </Button>
                              )}
                              {(item.pode_limpar ||
                                item.pode_limpar_sincronizado ||
                                item.ja_existe_supabase) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 text-xs"
                                  disabled={processando}
                                  onClick={() => void executarMarcarResolvida(item)}
                                >
                                  {busy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3 w-3" />
                                  )}
                                  Resolvida
                                </Button>
                              )}
                              {item.pode_limpar && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                                  disabled={processando}
                                  onClick={() => abrirDescartar(item)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Descartar
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {invalidas.length > 0 && isAdminSistema && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 space-y-3">
                <p className="text-xs text-red-100/90">
                  {invalidas.length} pendência(s) inválida(s) — sem vínculo válido com cliente, moto
                  ou OS no Supabase. Você pode limpar ou arquivar com segurança (apenas local).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    disabled={processando || carregando}
                    onClick={() => void executarLimparInvalidas()}
                  >
                    {processando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Limpar pendências inválidas
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 border-amber-500/40"
                    disabled={processando || carregando}
                    onClick={() => void executarArquivarInvalidas()}
                  >
                    {processando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                    Arquivar pendências inválidas
                  </Button>
                </div>
              </div>
            )}

            {idsSuspeitosDuplicidade.size > 0 && (
              <p className="text-xs text-amber-200/80">
                Use &quot;Marcar como resolvida&quot; quando o pagamento já existir na OS. O botão
                &quot;Sincronizar pagamentos pendentes&quot; (acima) não sincroniza pendências com
                possível duplicidade — resolva linha a linha.
              </p>
            )}
          </>
        ) : (
          !carregando && (
            <p className="text-sm text-muted-foreground">
              Nenhuma pendência ativa. O aviso amarelo de sincronização deve sumir automaticamente.
            </p>
          )
        )}

        {auditoria.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/60">
            <p className="text-xs font-medium text-muted-foreground">
              Auditoria local (pendências descartadas)
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 max-h-28 overflow-y-auto">
              {auditoria.map((reg) => (
                <li key={reg.id}>
                  {formatarData(reg.arquivado_em.slice(0, 10))} — {reg.acao} —{' '}
                  {formatarMoeda(reg.valor)} — {reg.motivo.slice(0, 80)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {pagamentosSemVinculoExato.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/60">
            <p className="text-xs font-medium text-amber-200/95">
              Pagamentos sem vínculo exato com OS ({pagamentosSemVinculoExato.length})
            </p>
            <p className="text-xs text-muted-foreground">
              Estes pagamentos não entram em PDF/recibo até o vínculo com a OS ser corrigido.
            </p>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Possível OS</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagamentosSemVinculoExato.map((item) => (
                    <TableRow key={item.lancamento.id}>
                      <TableCell>{formatarData(item.lancamento.data)}</TableCell>
                      <TableCell>{formatarMoeda(item.lancamento.valor)}</TableCell>
                      <TableCell>
                        {getLabelFormaPagamento(item.lancamento.forma_pagamento)}
                      </TableCell>
                      <TableCell>
                        {item.os_possivel_numero != null
                          ? `OS #${item.os_possivel_numero}`
                          : item.lancamento.ordem_servico_id
                            ? item.lancamento.ordem_servico_id.slice(0, 8) + '…'
                            : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px]">
                        {item.motivo}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {auditoriaSync.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/60">
            <p className="text-xs font-medium text-muted-foreground">
              Log técnico — pendências de sincronização
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 max-h-28 overflow-y-auto font-mono">
              {auditoriaSync.map((reg) => (
                <li key={reg.id}>
                  {formatarData(reg.registrado_em.slice(0, 10))} — {reg.acao} — {reg.lancamento_id.slice(0, 8)}… —{' '}
                  {reg.motivo.slice(0, 100)}
                  {reg.erro_tecnico ? ` (${reg.erro_tecnico.slice(0, 60)})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(dialogDescartar)}
        onOpenChange={(open) => {
          if (!open) setDialogDescartar(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Descartar pendência local</DialogTitle>
            <DialogDescription>
              Remove somente o item da fila/localStorage. Não altera pagamentos reais no Supabase
              nem apaga a OS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-descartar">
              Digite <strong>DESCARTAR</strong> para confirmar
            </Label>
            <Input
              id="confirm-descartar"
              value={confirmacaoDescartar}
              onChange={(e) => setConfirmacaoDescartar(e.target.value)}
              placeholder="DESCARTAR"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setDialogDescartar(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={processando}
              onClick={() => void confirmarDescartar()}
            >
              Descartar pendência local
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(dialogDuplicidade)}
        onOpenChange={(open) => {
          if (!open) setDialogDuplicidade(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{MSG.possivelDuplicidadeEncontrada}</DialogTitle>
            <DialogDescription>
              {MSG.possivelDuplicidadeEncontrada} Este pagamento parece já existir na OS
              {dialogDuplicidade?.osNumero != null
                ? ` #${dialogDuplicidade.osNumero}`
                : ''}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => resolverDuplicidade('cancelar')}>
              Cancelar
            </Button>
            <Button type="button" variant="outline" onClick={() => void resolverDuplicidade('resolver')}>
              Marcar como resolvida
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={processando}
              onClick={() => void resolverDuplicidade('sincronizar')}
            >
              Sincronizar mesmo assim
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
