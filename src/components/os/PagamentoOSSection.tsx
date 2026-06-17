import { useMemo, useState, useEffect } from 'react'
import { CreditCard, FileDown, Loader2, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { ResumoParcelamentoPreview } from '@/components/shared/ResumoParcelamentoPreview'
import { StatusFinanceiroBadge } from '@/components/shared/StatusBadges'
import {
  formatarFormaPagamentoHistorico,
  OPCOES_PARCELAS,
  parcelasCreditoValidas,
} from '@/lib/pagamento-format'
import { MSG } from '@/lib/mensagens-usuario'
import { getCraftPersistenceMode } from '@/lib/supabase'
import {
  finalizarOperacaoSalvamentoExplicito,
  iniciarOperacaoSalvamentoExplicito,
  marcarPularPersistenciaRemotaProxima,
} from '@/services/supabase-sync/persistencia-opcoes'
import {
  obterUltimoLancamentoOs,
  sincronizarPagamentoNoSupabase,
} from '@/services/supabase-sync/os-payment-save-flow.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import { useCraft } from '@/context/CraftContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useOsStatusSupabase } from '@/hooks/useOsStatusSupabase'
import { usePlanoEscrita } from '@/hooks/usePlanoEscrita'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { exportarReciboPdf } from '@/services/recibo-pdf.service'
import {
  MENSAGEM_OS_FALHA_SALVAR,
  MENSAGEM_SALVE_OS_ANTES_UI,
  validarOsParaRegistrarPagamento,
  type OsSupabaseMeta,
} from '@/services/supabase-sync/payment-sync.helpers'
import {
  calcularResumoFinanceiroOS,
  criarInputLancamentoPagamento,
  encontrarPossivelDuplicidadePagamentoOs,
  lancamentoPagamentoAtualizado,
  listarPagamentosOS,
  validarValorPagamentoOs,
  type PagamentoOSInput,
} from '@/services/os-pagamento.service'
import { marcarPagamentoExcluido } from '@/services/pagamentos/payment-active.helpers'
import {
  atualizarStatusFinanceiroOrdens,
  diagnosticarPagamentosOs,
  processarArquivamentoPagamentos,
} from '@/services/pagamentos/payment-archive.service'
import { sugerirStatusFinanceiro } from '@/services/os-financeiro.service'
import { BotaoRepararPagamentosDuplicados } from '@/components/configuracoes/RepararPagamentosDuplicadosDialog'
import type { Cliente, FormaPagamento, LancamentoFinanceiro, Moto, Oficina, OrdemServico, StatusFinanceiroOS } from '@/types'
import { FORMAS_PAGAMENTO, STATUS_FINANCEIRO_OS } from '@/types'

interface PagamentoOSSectionProps {
  os: OrdemServico | null
  valorTotal: number
  statusFinanceiro?: StatusFinanceiroOS
  vencimentoPagamento?: string
  observacoesPagamento?: string
  lancamentos: LancamentoFinanceiro[]
  oficina: Oficina
  cliente?: Cliente | null
  moto?: Moto | null
  usuario?: { id: string; nome: string }
  podeRegistrar: boolean
  podeEditar: boolean
  podeExcluir: boolean
  podeGerarRecibo: boolean
  onChangeOs: (dados: {
    status_financeiro?: StatusFinanceiroOS
    vencimento_pagamento?: string
    observacoes_pagamento?: string
  }) => void
  /** Incrementar após salvar a OS para revalidar vínculo com Supabase */
  osSyncTick?: number
  /** Meta confirmada após sync explícito — libera pagamento imediatamente */
  osSupabaseMeta?: OsSupabaseMeta | null
  /** Salvar OS no Supabase e registrar pagamento em um único fluxo */
  onSalvarOsEPagamento?: (pagamento: PagamentoOSInput) => Promise<boolean>
  /** Estado de salvamento vindo da página (Salvar / Salvar OS e pagamento) */
  salvandoOs?: boolean
  /** Notifica a página quando o formulário de pagamento muda (botão principal) */
  onPagamentoFormChange?: (pagamento: PagamentoOSInput, preenchido: boolean) => void
  /** OS nova — ocultar registro isolado; usar botão principal do rodapé */
  osNova?: boolean
  /** Fase do salvamento combinado (feedback visual) */
  faseSalvamento?: 'idle' | 'os' | 'pagamento'
}

const pagamentoVazio: PagamentoOSInput = {
  valor: 0,
  forma_pagamento: 'pix',
  data: new Date().toISOString().slice(0, 10),
  observacao: '',
  parcelas: 1,
}

export function PagamentoOSSection({
  os,
  valorTotal,
  statusFinanceiro,
  vencimentoPagamento,
  observacoesPagamento,
  lancamentos,
  oficina,
  cliente,
  moto,
  usuario,
  podeRegistrar,
  podeEditar,
  podeExcluir,
  podeGerarRecibo,
  onChangeOs,
  osSyncTick = 0,
  osSupabaseMeta = null,
  onSalvarOsEPagamento,
  salvandoOs = false,
  onPagamentoFormChange,
  osNova = false,
  faseSalvamento = 'idle',
}: PagamentoOSSectionProps) {
  const { adicionarLancamento, atualizarLancamento, aplicarDatabase, atualizarOS, dados, oficinaId } = useCraft()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { verificarEscrita } = usePlanoEscrita()
  const { executar, salvando } = useSalvarAcao()
  const salvandoAcao = salvando || salvandoOs
  const online = useOnlineStatus()
  const modoSupabase = getCraftPersistenceMode() === 'supabase'
  const { verificando: verificandoOs, salva: osSalvaSupabase } = useOsStatusSupabase(
    os,
    oficinaId,
    dados,
    osSyncTick,
    osSyncTick > 0 && !osSupabaseMeta,
    osSupabaseMeta
  )
  const [formPagamento, setFormPagamento] = useState<PagamentoOSInput>(pagamentoVazio)
  const [editandoPagamento, setEditandoPagamento] = useState<LancamentoFinanceiro | null>(null)
  const [exportandoReciboId, setExportandoReciboId] = useState<string | null>(null)

  useEffect(() => {
    if (!onPagamentoFormChange) return
    const preenchido = formPagamento.valor > 0 && !editandoPagamento
    onPagamentoFormChange(formPagamento, preenchido)
  }, [formPagamento, editandoPagamento, onPagamentoFormChange])

  const bloquearPagamento =
    modoSupabase &&
    online &&
    !editandoPagamento &&
    (!os || !osSalvaSupabase || verificandoOs)

  const podeSalvarOsEPagamento =
    Boolean(onSalvarOsEPagamento) &&
    !editandoPagamento &&
    formPagamento.valor > 0 &&
    (bloquearPagamento || !os)

  const resumo = useMemo(
    () =>
      calcularResumoFinanceiroOS(
        os ?? {
          id: '',
          valor_pecas: 0,
          valor_mao_obra: 0,
          valor_adicional: 0,
          desconto: 0,
          status: 'recebida',
          status_financeiro: statusFinanceiro,
        },
        lancamentos,
        { totalGeral: valorTotal }
      ),
    [os, lancamentos, valorTotal, statusFinanceiro]
  )

  const historico = useMemo(
    () => (os ? listarPagamentosOS(os, lancamentos) : []),
    [os, lancamentos]
  )

  const osTotalmentePaga = resumo.valorPendente <= 0.009 && resumo.valorPago > 0

  const valorRestanteParaNovoPagamento = useMemo(() => {
    if (editandoPagamento?.pago) {
      return resumo.valorPendente + editandoPagamento.valor
    }
    return resumo.valorPendente
  }, [editandoPagamento, resumo.valorPendente])

  useEffect(() => {
    if (!import.meta.env.DEV || !os) return
    const diag = diagnosticarPagamentosOs(os.id, lancamentos, resumo.totalGeral)
    console.info('[Craft OS Pagamentos]', {
      os_id: os.id,
      os_numero: os.numero,
      supabase: diag.supabase,
      locais: diag.locais,
      ativos_exibidos: diag.ativos,
      ignorados: diag.ignorados,
      valor_pago: diag.valorPago,
      valor_pendente: diag.valorPendente,
    })
  }, [os, lancamentos, resumo.totalGeral, resumo.valorPago, resumo.valorPendente])

  function aplicarStatusFinanceiroAposMudanca(lancamentosAtualizados: typeof lancamentos) {
    if (!os) return
    const novoResumo = calcularResumoFinanceiroOS(os, lancamentosAtualizados, {
      totalGeral: valorTotal,
    })
    const status = sugerirStatusFinanceiro(novoResumo.totalGeral, novoResumo.valorPago, os.status)
    onChangeOs({ status_financeiro: status })
    atualizarOS(os.id, { status_financeiro: status })
  }

  function validarValorInformado(): boolean {
    const validacao = validarValorPagamentoOs(formPagamento.valor, valorRestanteParaNovoPagamento)
    if (!validacao.ok) {
      toast.atencao(validacao.mensagem)
      return false
    }
    return true
  }

  function resetFormPagamento() {
    setFormPagamento(pagamentoVazio)
    setEditandoPagamento(null)
  }

  async function confirmarPossivelDuplicidade(): Promise<boolean> {
    if (!os || editandoPagamento) return true

    const duplicado = encontrarPossivelDuplicidadePagamentoOs(
      os.id,
      formPagamento,
      lancamentos
    )
    if (!duplicado) return true

    const ok = await confirmar({
      titulo: MSG.possivelDuplicidadePagamentoTitulo,
      mensagem: MSG.possivelDuplicidadePagamentoMensagem,
      confirmarTexto: MSG.possivelDuplicidadeConfirmar,
      cancelarTexto: 'Cancelar',
    })

    if (!ok) {
      toast.atencao(MSG.pagamentoCancelado)
      return false
    }

    return true
  }

  async function registrarPagamento() {
    if (!os || !podeRegistrar) return
    if (!verificarEscrita()) return

    if (!validarValorInformado()) return

    if (!(await confirmarPossivelDuplicidade())) return

    void executar({
      acao: async () => {
        const supabaseOnline = getCraftPersistenceMode() === 'supabase' && online
        if (supabaseOnline) iniciarOperacaoSalvamentoExplicito()
        try {
        if (!editandoPagamento && os) {
          const validacao = await validarOsParaRegistrarPagamento(
            oficinaId,
            os,
            dados,
            !online
          )
          if (!validacao.ok) {
            throw new Error(validacao.mensagem ?? MENSAGEM_OS_FALHA_SALVAR)
          }
        }

        const idsAntes = new Set(dados.lancamentos.map((l) => l.id))

        if (editandoPagamento) {
          if (!podeEditar) return MSG.alterado
          marcarPularPersistenciaRemotaProxima()
          atualizarLancamento(
            editandoPagamento.id,
            lancamentoPagamentoAtualizado(os, formPagamento, usuario)
          )
          marcarPularPersistenciaRemotaProxima()
          aplicarStatusFinanceiroAposMudanca(
            lancamentos.map((l) =>
              l.id === editandoPagamento.id
                ? { ...l, ...lancamentoPagamentoAtualizado(os, formPagamento, usuario) }
                : l
            )
          )
          resetFormPagamento()
          return MSG.alterado
        }

        marcarPularPersistenciaRemotaProxima()
        const novo = adicionarLancamento(criarInputLancamentoPagamento(os, formPagamento, usuario))
        marcarPularPersistenciaRemotaProxima()
        marcarPularPersistenciaRemotaProxima()
        aplicarStatusFinanceiroAposMudanca([...lancamentos, novo])
        resetFormPagamento()

        if (supabaseOnline) {
            const dbPos = localCraftRepository.carregar(oficinaId)
            const novoLancamento = obterUltimoLancamentoOs(dbPos.lancamentos, os.id, idsAntes)
            if (novoLancamento) {
              marcarPularPersistenciaRemotaProxima()
              const syncPag = await sincronizarPagamentoNoSupabase(oficinaId, novoLancamento.id)
              if (!syncPag.ok) throw new Error(syncPag.mensagem)
              return syncPag.mensagem
            }
        }

        return MSG.pagamentoRegistrado
        } finally {
          if (supabaseOnline) finalizarOperacaoSalvamentoExplicito()
        }
      },
      erro: MSG.erroSalvar,
    })
  }

  async function salvarOsERegistrarPagamento() {
    if (!onSalvarOsEPagamento) return
    if (!validarValorInformado()) return
    void onSalvarOsEPagamento(formPagamento).then((ok) => {
      if (ok) resetFormPagamento()
    })
  }

  function abrirEditarPagamento(pagamento: LancamentoFinanceiro) {
    if (!podeEditar) return
    setEditandoPagamento(pagamento)
    setFormPagamento({
      valor: pagamento.valor,
      forma_pagamento: pagamento.forma_pagamento,
      data: pagamento.data,
      observacao: pagamento.observacao ?? '',
      pago: pagamento.pago,
      vencimento: pagamento.vencimento,
      parcelas:
        pagamento.forma_pagamento === 'credito'
          ? parcelasCreditoValidas(pagamento.parcelas)
          : undefined,
    })
  }

  async function confirmarExclusaoPagamento(pagamento: LancamentoFinanceiro) {
    if (!podeExcluir || !os) return
    const ok = await confirmar({
      titulo: 'Excluir pagamento',
      mensagem: `Tem certeza que deseja excluir o pagamento de ${formatarMoeda(pagamento.valor)}?`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (ok) {
      if (editandoPagamento?.id === pagamento.id) resetFormPagamento()
      let db = atualizarStatusFinanceiroOrdens(
        {
          ...dados,
          lancamentos: dados.lancamentos.map((l) =>
            l.id === pagamento.id ? marcarPagamentoExcluido(l) : l
          ),
        },
        new Set([os.id])
      )
      aplicarDatabase(db)
      db = await processarArquivamentoPagamentos(oficinaId, db, [pagamento.id], 'deleted')
      aplicarDatabase(db)
      aplicarStatusFinanceiroAposMudanca(db.lancamentos)
      toast.sucesso(MSG.pagamentoExcluido)
    }
  }

  async function gerarRecibo(pagamento: LancamentoFinanceiro) {
    if (!os || !podeGerarRecibo || !cliente || !moto) return

    setExportandoReciboId(pagamento.id)
    try {
      await exportarReciboPdf(os, pagamento, cliente, moto, oficina, lancamentos)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Craft] Erro ao gerar recibo:', err)
      toast.erro(err instanceof Error ? err.message : 'Não foi possível gerar o recibo.')
    } finally {
      setExportandoReciboId(null)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="h-4 w-4" />
            Pagamento
          </h4>
          <p className="text-xs text-muted-foreground">
            Controle financeiro desta ordem de serviço
          </p>
        </div>
        <StatusFinanceiroBadge status={resumo.statusFinanceiroEfetivo} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-background/50 p-3">
          <p className="text-xs text-muted-foreground">Valor total da OS</p>
          <p className="text-lg font-semibold">{formatarMoeda(resumo.totalGeral)}</p>
        </div>
        <div className="rounded-md border border-border bg-background/50 p-3">
          <p className="text-xs text-muted-foreground">Valor pago</p>
          <p className="text-lg font-semibold text-emerald-400">{formatarMoeda(resumo.valorPago)}</p>
        </div>
        <div className="rounded-md border border-border bg-background/50 p-3">
          <p className="text-xs text-muted-foreground">Valor pendente</p>
          <p className="text-lg font-semibold text-amber-400">{formatarMoeda(resumo.valorPendente)}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Status financeiro</Label>
          <Select
            value={statusFinanceiro ?? resumo.statusFinanceiroSugerido}
            onValueChange={(v) =>
              onChangeOs({ status_financeiro: v as StatusFinanceiroOS })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FINANCEIRO_OS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Sugerido: {STATUS_FINANCEIRO_OS.find((s) => s.value === resumo.statusFinanceiroSugerido)?.label}
          </p>
          {resumo.statusFinanceiroManual && (
            <p className="text-xs text-amber-400/90">
              O status financeiro foi ajustado manualmente.
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="venc-pagamento">Vencimento combinado</Label>
          <Input
            id="venc-pagamento"
            type="date"
            value={vencimentoPagamento ?? ''}
            onChange={(e) =>
              onChangeOs({ vencimento_pagamento: e.target.value || undefined })
            }
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="obs-pagamento">Observações do pagamento</Label>
        <Textarea
          id="obs-pagamento"
          rows={2}
          value={observacoesPagamento ?? ''}
          onChange={(e) =>
            onChangeOs({ observacoes_pagamento: e.target.value || undefined })
          }
          placeholder="Condições, acordos, parcelas..."
        />
      </div>

      {!os && (
        <p className="rounded-md border border-dashed border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-100/90">
          {MENSAGEM_SALVE_OS_ANTES_UI} Use o botão principal &quot;Salvar OS e registrar pagamento&quot; no
          final da tela.
        </p>
      )}

      {faseSalvamento === 'os' && (
        <p className="text-sm text-muted-foreground">{MSG.salvandoOs}</p>
      )}
      {faseSalvamento === 'pagamento' && (
        <p className="text-sm text-muted-foreground">{MSG.registrandoPagamento}</p>
      )}

      {podeRegistrar && (
        <div className="rounded-md border border-border bg-background/40 p-4">
          <p className="mb-3 text-sm font-medium">
            {editandoPagamento ? 'Editar pagamento' : 'Registrar pagamento'}
          </p>
          {osTotalmentePaga && !editandoPagamento && (
            <p className="mb-3 text-sm text-muted-foreground">{MSG.osTotalmentePaga}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="valor-pagamento">Valor *</Label>
              <MoneyInput
                id="valor-pagamento"
                value={formPagamento.valor}
                onChange={(valor) => setFormPagamento({ ...formPagamento, valor })}
              />
              {valorRestanteParaNovoPagamento > 0 && !editandoPagamento && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto justify-start px-0 text-xs"
                  onClick={() =>
                    setFormPagamento({
                      ...formPagamento,
                      valor: Math.round(valorRestanteParaNovoPagamento * 100) / 100,
                    })
                  }
                >
                  Usar valor restante ({formatarMoeda(valorRestanteParaNovoPagamento)})
                </Button>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Forma de pagamento</Label>
              <Select
                value={formPagamento.forma_pagamento}
                onValueChange={(v) => {
                  const forma = v as FormaPagamento
                  setFormPagamento({
                    ...formPagamento,
                    forma_pagamento: forma,
                    parcelas: forma === 'credito' ? parcelasCreditoValidas(formPagamento.parcelas) : undefined,
                  })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="data-pagamento">Data do pagamento</Label>
              <Input
                id="data-pagamento"
                type="date"
                value={formPagamento.data}
                onChange={(e) =>
                  setFormPagamento({ ...formPagamento, data: e.target.value })
                }
              />
            </div>
            {formPagamento.forma_pagamento === 'credito' && (
              <div className="grid gap-2">
                <Label>Quantidade de parcelas</Label>
                <Select
                  value={String(parcelasCreditoValidas(formPagamento.parcelas))}
                  onValueChange={(v) =>
                    setFormPagamento({
                      ...formPagamento,
                      parcelas: Number(v),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPCOES_PARCELAS.map((opcao) => (
                      <SelectItem key={opcao.value} value={String(opcao.value)}>
                        {opcao.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {formPagamento.forma_pagamento === 'fiado' && (
              <div className="grid gap-2">
                <Label htmlFor="venc-fiado">Vencimento</Label>
                <Input
                  id="venc-fiado"
                  type="date"
                  value={formPagamento.vencimento ?? ''}
                  onChange={(e) =>
                    setFormPagamento({
                      ...formPagamento,
                      vencimento: e.target.value || undefined,
                    })
                  }
                />
              </div>
            )}
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="obs-item-pagamento">Observação</Label>
              <Input
                id="obs-item-pagamento"
                value={formPagamento.observacao ?? ''}
                onChange={(e) =>
                  setFormPagamento({ ...formPagamento, observacao: e.target.value })
                }
              />
            </div>
          </div>
          {formPagamento.forma_pagamento === 'credito' && formPagamento.valor > 0 && (
            <div className="mt-3">
              <ResumoParcelamentoPreview
                valor={formPagamento.valor}
                formaPagamento={formPagamento.forma_pagamento}
                parcelas={formPagamento.parcelas}
              />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!osNova && (
              <Button
                type="button"
                size="sm"
                onClick={registrarPagamento}
                disabled={
                  salvandoAcao ||
                  bloquearPagamento ||
                  !os ||
                  (osTotalmentePaga && !editandoPagamento)
                }
              >
                {salvandoAcao ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : editandoPagamento ? (
                  'Atualizar pagamento'
                ) : (
                  'Registrar pagamento'
                )}
              </Button>
            )}
            {podeSalvarOsEPagamento && !osNova && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={salvarOsERegistrarPagamento}
                disabled={salvandoAcao || (osTotalmentePaga && resumo.valorPendente <= 0.009)}
              >
                {salvandoAcao ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  'Salvar OS e registrar pagamento'
                )}
              </Button>
            )}
            {bloquearPagamento && os && (
              <p className="text-xs text-amber-400/90">{MENSAGEM_SALVE_OS_ANTES_UI}</p>
            )}
            {verificandoOs && modoSupabase && online && os && !osSupabaseMeta && (
              <p className="text-xs text-muted-foreground">Aguarde…</p>
            )}
            {editandoPagamento && (
              <Button type="button" size="sm" variant="outline" onClick={resetFormPagamento}>
                Cancelar edição
              </Button>
            )}
          </div>
        </div>
      )}

      {os ? (
        <>
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-sm font-medium">Histórico de pagamentos</h5>
              {historico.length > 1 && os && (
                <BotaoRepararPagamentosDuplicados osId={os.id} size="sm" variant="ghost" />
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Forma / Parcelamento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhum pagamento registrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  historico.map((pagamento) => (
                    <TableRow key={pagamento.id}>
                      <TableCell>{formatarData(pagamento.data)}</TableCell>
                      <TableCell>{formatarFormaPagamentoHistorico(pagamento)}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(pagamento.valor)}</TableCell>
                      <TableCell className="max-w-[140px] truncate">
                        {pagamento.observacao ?? '—'}
                      </TableCell>
                      <TableCell>{pagamento.usuario_nome ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {podeGerarRecibo && pagamento.pago && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Gerar recibo"
                              disabled={exportandoReciboId === pagamento.id}
                              onClick={() => gerarRecibo(pagamento)}
                            >
                              {exportandoReciboId === pagamento.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileDown className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => abrirEditarPagamento(pagamento)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {podeExcluir && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmarExclusaoPagamento(pagamento)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
    </div>
  )
}
