import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  FileDown,
  Loader2,
  Pencil,
  Printer,
  Receipt,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { OsDocumentoConteudo } from '@/components/os/OsDocumentoConteudo'
import { BotaoEnviarWhatsAppOs } from '@/components/os/BotaoEnviarWhatsAppOs'
import { OsAcoesMensagemCliente } from '@/components/comunicacao/OsAcoesMensagemCliente'
import { useAuth } from '@/context/AuthContext'
import { useAutorizacaoValores } from '@/context/AutorizacaoValoresContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { buildOsDocumentoViewModel, exportarOsPdf } from '@/services/os-pdf.service'
import { exportarReciboPdf } from '@/services/recibo-pdf.service'
import { listarPagamentosOS } from '@/services/os-pagamento.service'
import { HistoricoEventosOSSection } from '@/components/os/HistoricoEventosOSSection'
import { PagamentoOSSection } from '@/components/os/PagamentoOSSection'
import { PagamentoOSSimples } from '@/components/os/PagamentoOSSimples'
import {
  deduplicarHistoricoEventos,
  obterNomeCriadorOS,
  rotuloCriadorOS,
} from '@/services/os-historico.service'
import { temRecursoComAssinatura } from '@/services/assinatura/plano-features'
import {
  osVisivelParaUsuario,
  podeAcessarModuloUsuario,
  podeEditarPagamentoOS,
  podeExcluirPagamentoOS,
  podeRegistrarPagamentoOS,
  podeRegistrarPagamentoComPinOS,
  podeVerSecaoPagamentoOS,
  podeVerValoresFinanceirosOS,
} from '@/services/auth/permissions'
import { converterOrcamentoEmOSComSync } from '@/services/os/orcamento-conversao.service'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { marcarPularPersistenciaRemotaProxima } from '@/services/supabase-sync/persistencia-opcoes'
import {
  BotaoVerOsGerada,
  OsOrigemOrcamentoHint,
} from '@/components/os/OrcamentoConvertidoListagem'
import {
  patchAprovarOrcamento,
  patchRecusarOrcamento,
  podeConverterOrcamentoEmOS,
  orcamentoEstaConvertido,
} from '@/lib/orcamento-fluxo'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { OrcamentoFluxoAcoes } from '@/components/os/OrcamentoFluxoAcoes'
import { resolverOsPorParametroRota } from '@/lib/rota-os'
import { normalizarTipoOficina } from '@/types/tipo-oficina'
import { garantirChecklistPadrao } from '@/services/checklist-modelo.service'
import type { OrdemServico } from '@/types'
import { calcularValorTotalOS } from '@/types'

export function OrdensServicoVisualizarPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()
  const user = session?.user
  const { assinatura } = useAssinatura()
  const { toast } = useToast()
  const { solicitarAutorizacao } = useAutorizacaoValores()
  const { atualizarOS, aplicarDatabase } = useCraft()
  const { ordens, clientes, motos, lancamentos, configuracao, modelosChecklist } =
    useOficinaData()
  const officeId = configuracao.office_id ?? configuracao.oficina_id
  const tipoOficina = normalizarTipoOficina(configuracao.tipo_oficina)
  const modelosSeguros = useMemo(
    () => garantirChecklistPadrao(modelosChecklist, officeId, tipoOficina),
    [modelosChecklist, officeId, tipoOficina]
  )
  const { executar } = useSalvarAcao()
  const [exportandoPdf, setExportandoPdf] = useState(false)
  const [gerandoRecibo, setGerandoRecibo] = useState(false)

  const os = useMemo(
    () => resolverOsPorParametroRota(ordens, id),
    [ordens, id]
  )

  const podeVerModulo = useMemo(
    () =>
      user != null && podeAcessarModuloUsuario(user, 'ordens_servico', configuracao),
    [user, configuracao]
  )

  const podeVerFinanceiro = useMemo(
    () => podeVerValoresFinanceirosOS(user ?? 'dono', configuracao),
    [user, configuracao]
  )

  const podeRegistrarPagamento = useMemo(
    () => podeRegistrarPagamentoOS(user ?? 'dono', configuracao),
    [user, configuracao]
  )

  const podeRegistrarPagamentoComPin = useMemo(
    () => podeRegistrarPagamentoComPinOS(user ?? 'dono', configuracao),
    [user, configuracao]
  )

  const podeVerSecaoPagamento = useMemo(
    () => podeVerSecaoPagamentoOS(user ?? 'dono', configuracao),
    [user, configuracao]
  )

  const solicitarPinValores = useCallback(
    async (campoId: string) => {
      if (!configuracao.pin_autorizacao_valores?.trim()) {
        toast.atencao(
          'PIN de autorização não configurado. Peça ao dono/admin para definir em Configurações.'
        )
        return false
      }
      return solicitarAutorizacao(configuracao.pin_autorizacao_valores, campoId)
    },
    [solicitarAutorizacao, configuracao.pin_autorizacao_valores, toast]
  )

  const podeEditarPagamento = useMemo(
    () => podeEditarPagamentoOS(user ?? 'dono', configuracao),
    [user, configuracao]
  )

  const podeExcluirPagamento = useMemo(
    () => podeExcluirPagamentoOS(user ?? 'dono', configuracao),
    [user, configuracao]
  )

  const podeFinanceiroCompleto = temRecursoComAssinatura(assinatura, 'financeiro_completo')

  const podeExportarPdf = temRecursoComAssinatura(assinatura, 'pdf_os')

  const pagamentosOs = useMemo(
    () => (os ? listarPagamentosOS(os, lancamentos).filter((p) => p.pago) : []),
    [os, lancamentos]
  )
  const reciboDisponivel =
    Boolean(os) &&
    !ehDocumentoOrcamento(os!) &&
    pagamentosOs.length > 0 &&
    podeExportarPdf

  const dados = useMemo(() => {
    if (!os) return null
    const cliente = clientes.find((c) => c.id === os.cliente_id)
    const moto = motos.find((m) => m.id === os.moto_id)
    if (!cliente || !moto) return null
    return buildOsDocumentoViewModel(
      os,
      cliente,
      moto,
      configuracao,
      lancamentos,
      modelosSeguros,
      officeId
    )
  }, [os, clientes, motos, configuracao, lancamentos, modelosSeguros, officeId])

  useEffect(() => {
    if (!dados) return
    document.title = `${dados.os.rotuloNumero} — BoxGestor`
    return () => {
      document.title = 'BoxGestor'
    }
  }, [dados])

  if (!id) {
    return <Navigate to="/ordens-servico" replace />
  }

  if (!podeVerModulo) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          Você não tem permissão para visualizar esta ordem de serviço.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/ordens-servico">Voltar para ordens de serviço</Link>
        </Button>
      </div>
    )
  }

  if (!os) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground">Ordem de serviço não encontrada.</p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/ordens-servico">Voltar para ordens de serviço</Link>
        </Button>
      </div>
    )
  }

  if (!user || !osVisivelParaUsuario(os, user, configuracao)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          Você não tem permissão para visualizar esta ordem de serviço.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/ordens-servico">Voltar para ordens de serviço</Link>
        </Button>
      </div>
    )
  }

  if (!dados) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground">
          Não foi possível montar o documento desta ordem de serviço.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/ordens-servico">Voltar para ordens de serviço</Link>
        </Button>
      </div>
    )
  }

  const ehOrcamento = ehDocumentoOrcamento(os)
  const cliente = clientes.find((c) => c.id === os.cliente_id)
  const moto = motos.find((m) => m.id === os.moto_id)
  const valorTotalOs =
    os.valor_total ??
    calcularValorTotalOS(
      os.valor_pecas,
      os.valor_mao_obra,
      os.desconto,
      os.valor_adicional ?? 0
    )
  const usuarioAtual = user ? { id: user.id, nome: user.nome } : undefined
  const exibirPagamentoNaVisualizacao = podeVerSecaoPagamento && !ehOrcamento

  function voltarLista() {
    navigate('/ordens-servico')
  }

  function abrirEditar() {
    navigate(`/ordens-servico?editar=${os!.id}`)
  }

  async function exportarPdf() {
    if (!podeExportarPdf) {
      window.alert('Exportação PDF disponível a partir do plano Profissional.')
      return
    }
    const cliente = clientes.find((c) => c.id === os!.cliente_id)
    const moto = motos.find((m) => m.id === os!.moto_id)
    if (!cliente || !moto) {
      window.alert('Cliente ou veículo não encontrados para esta OS.')
      return
    }

    setExportandoPdf(true)
    try {
      await exportarOsPdf(
        os!,
        cliente,
        moto,
        configuracao,
        lancamentos,
        modelosSeguros,
        officeId
      )
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Não foi possível gerar o PDF da ordem de serviço.'
      )
    } finally {
      setExportandoPdf(false)
    }
  }

  async function exportarRecibo() {
    if (!reciboDisponivel || !os) return
    const clienteDoc = clientes.find((c) => c.id === os.cliente_id)
    const motoDoc = motos.find((m) => m.id === os.moto_id)
    const pagamento = pagamentosOs[pagamentosOs.length - 1]
    if (!clienteDoc || !motoDoc || !pagamento) {
      window.alert('Dados insuficientes para gerar o recibo.')
      return
    }
    setGerandoRecibo(true)
    try {
      await exportarReciboPdf(os, pagamento, clienteDoc, motoDoc, configuracao, lancamentos)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Não foi possível gerar o recibo.')
    } finally {
      setGerandoRecibo(false)
    }
  }

  function imprimir() {
    document.body.classList.add('os-imprimindo-documento')
    window.print()
    window.addEventListener(
      'afterprint',
      () => {
        document.body.classList.remove('os-imprimindo-documento')
      },
      { once: true }
    )
  }

  async function aprovarOrcamento(ordem: OrdemServico) {
    void executar({
      acao: async () => atualizarOS(ordem.id, patchAprovarOrcamento()),
      sucesso: 'Orçamento aprovado.',
    })
  }

  async function recusarOrcamento(ordem: OrdemServico) {
    void executar({
      acao: async () => atualizarOS(ordem.id, patchRecusarOrcamento()),
      sucesso: 'Orçamento marcado como recusado.',
    })
  }

  async function converterOrcamentoParaOS(ordem: OrdemServico) {
    if (!podeConverterOrcamentoEmOS(ordem)) return
    let novaOsId = ''
    void executar({
      acao: async () => {
        const resultado = await converterOrcamentoEmOSComSync(ordem, {
          officeId,
          responsavel: user?.nome,
        })
        if (getCraftPersistenceMode() === 'supabase' && typeof navigator !== 'undefined' && navigator.onLine) {
          marcarPularPersistenciaRemotaProxima()
        }
        aplicarDatabase(resultado.db)
        novaOsId = resultado.novaOs.id
        return `Orçamento #${ordem.numero} convertido em OS #${resultado.novaOs.numero}.`
      },
      onSuccess: () => {
        navigate(
          novaOsId
            ? `/ordens-servico/${novaOsId}/visualizar`
            : `/ordens-servico/${ordem.id}/visualizar`,
          { replace: true }
        )
      },
    })
  }

  return (
    <div className="os-visualizacao-print-root -mx-4 -mb-24 -mt-4 flex min-h-[calc(100dvh-4rem)] flex-col sm:-mx-6 sm:-mt-6 lg:-mb-6">
      <div className="os-visualizacao-barra sticky top-0 z-20 shrink-0 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm sm:px-4">
        <div className="mx-auto flex max-w-[210mm] flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold sm:text-xl">{dados.os.rotuloNumero}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={ehOrcamento ? 'secondary' : 'outline'}>
                  {dados.os.tituloDocumento}
                </Badge>
                <span className="text-sm text-muted-foreground">Status: {dados.os.status}</span>
              </div>
              {obterNomeCriadorOS(os) && (
                <p className="text-xs text-muted-foreground">{rotuloCriadorOS(os)}</p>
              )}
              {!ehOrcamento && (
                <OsOrigemOrcamentoHint os={os} ordens={ordens} />
              )}
              {ehOrcamento && orcamentoEstaConvertido(os) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <BotaoVerOsGerada os={os} ordens={ordens} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={voltarLista}>
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button variant="outline" size="sm" onClick={abrirEditar}>
                <Pencil className="h-4 w-4" />
                {ehOrcamento ? 'Editar orçamento' : 'Editar OS'}
              </Button>
              {ehOrcamento && (
                <OrcamentoFluxoAcoes
                  os={os}
                  onAprovar={() => aprovarOrcamento(os)}
                  onRecusar={() => recusarOrcamento(os)}
                  onConverter={() => converterOrcamentoParaOS(os)}
                  compact
                />
              )}
              {podeExportarPdf && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void exportarPdf()}
                  disabled={exportandoPdf}
                >
                  {exportandoPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  {exportandoPdf
                    ? 'Gerando PDF...'
                    : ehOrcamento
                      ? 'Baixar orçamento'
                      : 'Baixar PDF'}
                </Button>
              )}
              {reciboDisponivel && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void exportarRecibo()}
                  disabled={gerandoRecibo}
                >
                  {gerandoRecibo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Receipt className="h-4 w-4" />
                  )}
                  {gerandoRecibo ? 'Gerando recibo...' : 'Baixar recibo'}
                </Button>
              )}
              {cliente && moto && (
                <>
                  <OsAcoesMensagemCliente os={os} cliente={cliente} moto={moto} />
                  <BotaoEnviarWhatsAppOs
                    os={os}
                    cliente={cliente}
                    moto={moto}
                    variant="default"
                    exibirValores={podeVerFinanceiro}
                  />
                </>
              )}
              <Button variant="outline" size="sm" onClick={imprimir}>
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
              <Button variant="ghost" size="sm" onClick={voltarLista}>
                <X className="h-4 w-4" />
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-800/95 py-4 sm:py-8">
        <div className="mx-auto w-full max-w-[210mm] space-y-4 px-2 sm:px-4">
          {(os.historico_eventos?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-zinc-600/50 bg-zinc-900/80 p-4">
              <HistoricoEventosOSSection
                eventos={deduplicarHistoricoEventos(os.historico_eventos ?? [])}
              />
            </div>
          )}
          {exibirPagamentoNaVisualizacao && (
            <div className="rounded-lg border border-zinc-600/50 bg-zinc-900/80 p-4">
              {podeFinanceiroCompleto || podeRegistrarPagamentoComPin ? (
                <PagamentoOSSection
                  os={os}
                  valorTotal={valorTotalOs}
                  statusFinanceiro={os.status_financeiro}
                  vencimentoPagamento={os.vencimento_pagamento}
                  observacoesPagamento={os.observacoes_pagamento}
                  lancamentos={lancamentos}
                  oficina={configuracao}
                  cliente={cliente ?? null}
                  moto={moto ?? null}
                  usuario={usuarioAtual}
                  podeRegistrar={podeRegistrarPagamento}
                  podeRegistrarComPin={podeRegistrarPagamentoComPin}
                  onSolicitarAutorizacaoPin={solicitarPinValores}
                  podeEditar={podeEditarPagamento}
                  podeExcluir={podeExcluirPagamento}
                  podeGerarRecibo={podeExportarPdf && podeRegistrarPagamento}
                  onChangeOs={(pag) => atualizarOS(os.id, pag)}
                />
              ) : (
                <PagamentoOSSimples
                  os={os}
                  valorTotal={valorTotalOs}
                  lancamentos={lancamentos}
                />
              )}
            </div>
          )}
          <div className="os-visualizacao-documento overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-xl sm:p-8">
            <OsDocumentoConteudo dados={dados} exibirFinanceiro={podeVerFinanceiro} />
          </div>
        </div>
      </div>
    </div>
  )
}
