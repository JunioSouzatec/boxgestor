import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Archive, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { formatarData, formatarMoeda } from '@/lib/utils'
import {
  type PendenciaPagamentoDiagnostico,
  resumirPendenciasPagamentos,
} from '@/services/pagamentos/payment-pending-diagnostic.service'
import { listarAuditoriaOrfaos } from '@/services/pagamentos/payment-orphan.storage'
import {
  arquivarPagamentosOrfaosLocais,
  limparPendenciasInvalidasLocais,
  recarregarDiagnosticoPendencias,
} from '@/services/supabase-sync/supabase-sync.service'
import { getLabelFormaPagamento } from '@/types/labels'

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
}

export function PagamentosOrfaosSection() {
  const { dados, oficinaId, aplicarDatabase } = useCraft()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const [carregando, setCarregando] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [pendencias, setPendencias] = useState<PendenciaPagamentoDiagnostico[]>([])

  const resumo = useMemo(() => resumirPendenciasPagamentos(pendencias), [pendencias])
  const invalidas = useMemo(() => pendencias.filter((p) => p.pode_limpar), [pendencias])

  const auditoria = useMemo(() => listarAuditoriaOrfaos(10), [dados.lancamentos, processando])

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try {
      const { itens } = await recarregarDiagnosticoPendencias(oficinaId, dados)
      setPendencias(itens)
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao recarregar diagnóstico de pendências.')
    } finally {
      setCarregando(false)
    }
  }, [dados, oficinaId, toast])

  const [analiseExecutada, setAnaliseExecutada] = useState(false)

  async function executarAnalise() {
    await recarregar()
    setAnaliseExecutada(true)
  }

  async function executarLimparInvalidas() {
    if (invalidas.length === 0) return

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
    if (invalidas.length === 0) return

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

  return (
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
            Análise manual de pendências locais. Execute somente quando precisar investigar
            sincronização de pagamentos.
          </p>
          {resumo.total > 0 && (
            <p className="text-xs text-amber-200/80 mt-1">
              {resumo.total} pendência(s): {resumo.sincronizaveis} sincronizável(is),{' '}
              {resumo.invalidas} inválida(s)/órfã(s).
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
      </div>

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
                  <TableHead>ID local</TableHead>
                  <TableHead>OS / service_order</TableHead>
                  <TableHead>Cliente / Moto (Supabase)</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Motivo / erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendencias.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs">{LABEL_TIPO[item.tipo]}</TableCell>
                    <TableCell className="text-xs">
                      {LABEL_CLASSIFICACAO[item.classificacao]}
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
                    <TableCell className="font-mono text-[10px] max-w-[100px] truncate">
                      {item.id}
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px]">
                      {item.os_numero != null && <span>OS #{item.os_numero}</span>}
                      {item.local_service_order_id && (
                        <span className="block font-mono text-[10px] truncate">
                          local: {item.local_service_order_id}
                        </span>
                      )}
                      {item.service_order_uuid && (
                        <span className="block font-mono text-[10px] truncate text-muted-foreground">
                          uuid: {item.service_order_uuid.slice(0, 8)}…
                        </span>
                      )}
                      {!item.os_numero && !item.local_service_order_id && '—'}
                    </TableCell>
                    <TableCell className="text-xs max-w-[140px]">
                      <span className="block font-mono text-[10px] truncate">
                        cli local: {item.customer_id_local?.slice(0, 12) ?? '—'}
                      </span>
                      <span className="block font-mono text-[10px] truncate text-muted-foreground">
                        cli SB: {item.customer_id_supabase?.slice(0, 12) ?? '—'}{' '}
                        {item.cliente_existe_supabase === false ? '✗' : item.cliente_existe_supabase ? '✓' : ''}
                      </span>
                      <span className="block font-mono text-[10px] truncate">
                        moto SB: {item.motorcycle_id_supabase?.slice(0, 12) ?? '—'}{' '}
                        {item.moto_existe_supabase === false ? '✗' : item.moto_existe_supabase ? '✓' : ''}
                      </span>
                      {item.erro_fk && (
                        <span className="block text-[10px] text-red-400/90">{item.erro_fk}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{item.origem}</TableCell>
                    <TableCell className="max-w-[180px] text-xs">{item.motivo}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {invalidas.length > 0 && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 space-y-3">
              <p className="text-xs text-red-100/90">
                {invalidas.length} pendência(s) inválida(s) — sem vínculo válido com cliente, moto
                ou OS no Supabase (inclui erros customer_id_fkey). Você pode limpar ou arquivar com
                segurança (apenas local).
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

          <div className="flex flex-wrap gap-2">
            {resumo.sincronizaveis > 0 && (
              <p className="text-xs text-muted-foreground self-center">
                {resumo.sincronizaveis} pendência(s) sincronizável(is): use &quot;Sincronizar OS
                pendentes&quot; e &quot;Sincronizar pagamentos pendentes&quot; acima.
              </p>
            )}
          </div>
        </>
      ) : (
        !carregando && (
          <p className="text-sm text-muted-foreground">
            Nenhuma pendência ativa. O topo deve exibir &quot;Banco: Supabase&quot;.
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
    </div>
  )
}
