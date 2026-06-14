import { useMemo, useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, FileDown, Eye, Loader2, History, Filter } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { StatusOSRapido } from '@/components/shared/StatusOSRapido'
import { ChecklistEntradaForm } from '@/components/os/ChecklistEntradaForm'
import { OrcamentoOSSection } from '@/components/os/OrcamentoOSSection'
import { GarantiaOSSection } from '@/components/os/GarantiaOSSection'
import { QuilometragemOSSection } from '@/components/os/QuilometragemOSSection'
import { PagamentoOSSection } from '@/components/os/PagamentoOSSection'
import { ServicosOSSection } from '@/components/os/ServicosOSSection'
import { PecasOSUtilizadasSection } from '@/components/os/PecasOSUtilizadasSection'
import { ResumoFinanceiroOSSection } from '@/components/os/ResumoFinanceiroOSSection'
import { PagamentoOSSimples } from '@/components/os/PagamentoOSSimples'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { useAssinatura } from '@/context/AssinaturaContext'
import { AvisoLimitePlano } from '@/components/plano/AvisoLimitePlano'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { BotaoWhatsApp } from '@/components/comunicacao/BotaoWhatsApp'
import { CriarLembretesOSDialog } from '@/components/lembretes/CriarLembretesOSDialog'
import { OsVisualizacaoDialog } from '@/components/os/OsVisualizacaoDialog'
import { buildOsDocumentoViewModel, exportarOsPdf } from '@/services/os-pdf.service'
import { exportarReciboPdf } from '@/services/recibo-pdf.service'
import {
  criarInputLancamentoPagamento,
  listarPagamentosOS,
  patchCancelamentoPagamentosOS,
  type PagamentoOSInput,
} from '@/services/os-pagamento.service'
import { MSG } from '@/lib/mensagens-usuario'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { localCraftRepository } from '@/services/repository/local.repository'
import { marcarPularPersistenciaRemotaProxima } from '@/services/supabase-sync/persistencia-opcoes'
import {
  MENSAGEM_OS_FALHA_SALVAR,
  validarOsParaRegistrarPagamento,
  type OsSupabaseMeta,
} from '@/services/supabase-sync/payment-sync.helpers'
import {
  salvarOsComConfirmacaoSupabase,
} from '@/services/supabase-sync/service-order-save.service'
import {
  podeEditarPagamentoOS,
  podeExcluirPagamentoOS,
  podeRegistrarPagamentoOS,
  podeVerValoresFinanceirosOS,
} from '@/services/auth/permissions'
import { calcularVencimentoGarantia, criarChecklistVazio, normalizarChecklist } from '@/lib/os'
import { sincronizarTotaisOSServicos, servicoOSItemParaCatalogoInput } from '@/services/servico-catalogo.service'
import type { ServicoOSItem } from '@/types/servico-catalogo'
import { sincronizarValorPecasForm, verificarEstoqueInsuficiente } from '@/services/os-pecas.service'
import {
  validarFormularioOS,
  rolarParaPrimeiroErro,
  obterMensagemErroCampo,
  campoTemErro,
  removerErroCampo,
  CLASSE_CAMPO_INVALIDO,
  type ResultadoValidacaoOS,
  type CampoOSForm,
} from '@/lib/os-form-validation'
import { garantirChecklistPadrao } from '@/services/checklist-modelo.service'
import { HistoricoClienteOSDialog } from '@/components/os/HistoricoClienteOSDialog'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { filtrarOrdensServicoListagem } from '@/services/os-listagem.service'
import type { FiltrosOSListagem } from '@/services/os-listagem.service'
import { cn, formatarData, formatarMoeda } from '@/lib/utils'
import { STATUS_FINANCEIRO_OS } from '@/types/labels'
import { MensagemCampoErro } from '@/components/shared/MensagemCampoErro'
import type { ChecklistEntrada } from '@/types/checklist'
import type { Cliente, ModeloChecklist, OrdemServico, StatusOS } from '@/types'
import { OFFICE_ID, STATUS_OS, calcularValorTotalOS } from '@/types'

type FormOS = Omit<
  OrdemServico,
  'id' | 'oficina_id' | 'numero' | 'valor_total' | 'criado_em' | 'atualizado_em'
> & {
  checklist_entrada: ChecklistEntrada
}

const formBase: Omit<FormOS, 'checklist_entrada'> = {
  cliente_id: '',
  moto_id: '',
  defeito_relatado: '',
  diagnostico: '',
  servicos_executados: '',
  servicos_itens: [],
  pecas_utilizadas: [],
  valor_pecas: 0,
  valor_mao_obra: 0,
  valor_adicional: 0,
  desconto: 0,
  status: 'recebida',
  status_financeiro: undefined,
  vencimento_pagamento: undefined,
  observacoes_pagamento: undefined,
  ajuste_mao_obra: undefined,
}

function criarFormVazio(modelos: ModeloChecklist[], officeId: string): FormOS {
  return {
    ...formBase,
    checklist_entrada: criarChecklistVazio(modelos, officeId),
  }
}

export function OrdensServicoPage() {
  const { session } = useAuth()
  const { adicionarOS, atualizarOS, excluirOS, atualizarLancamento, adicionarLancamento, adicionarPeca, adicionarServicoCatalogo, recarregarDadosSupabase } = useCraft()
  const { ordens, clientes, motos, pecas, configuracao, lancamentos, modelosChecklist, servicosCatalogo } =
    useOficinaData()
  const officeId = configuracao.office_id ?? configuracao.oficina_id
  const modelosSeguros = useMemo(
    () => garantirChecklistPadrao(modelosChecklist, officeId),
    [modelosChecklist, officeId]
  )
  const { limiteAtingido, temRecurso } = useAssinatura()
  const [searchParams, setSearchParams] = useSearchParams()
  const papel = session?.user.papel ?? 'dono'
  const podeVerFinanceiro = podeVerValoresFinanceirosOS(papel)
  const podeRegistrarPagamento = podeRegistrarPagamentoOS(papel)
  const podeEditarPagamento = podeEditarPagamentoOS(papel)
  const podeExcluirPagamento = podeExcluirPagamentoOS(papel)
  const usuarioAtual = session?.user
    ? { id: session.user.id, nome: session.user.nome }
    : undefined
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar, salvando } = useSalvarAcao()
  const [busca, setBusca] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [filtros, setFiltros] = useState<Omit<FiltrosOSListagem, 'busca'>>({
    status: 'todos',
    statusFinanceiro: 'todos',
    clienteId: undefined,
    motoId: undefined,
    placa: '',
    dataInicio: '',
    dataFim: '',
    apenasAbertas: false,
    apenasFinalizadas: false,
    pagamentoPendente: false,
  })
  const [historicoCliente, setHistoricoCliente] = useState<Cliente | null>(null)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [dialogLembretesAberto, setDialogLembretesAberto] = useState(false)
  const [osParaLembretes, setOsParaLembretes] = useState<OrdemServico | null>(null)
  const [editando, setEditando] = useState<OrdemServico | null>(null)
  const [form, setForm] = useState<FormOS>(() => criarFormVazio([], OFFICE_ID))
  const [errosValidacao, setErrosValidacao] = useState<ResultadoValidacaoOS | null>(null)
  const [osVisualizando, setOsVisualizando] = useState<OrdemServico | null>(null)
  const [exportandoPdfId, setExportandoPdfId] = useState<string | null>(null)
  const [gerandoReciboId, setGerandoReciboId] = useState<string | null>(null)
  const [osSyncTick, setOsSyncTick] = useState(0)
  const [osSupabaseMeta, setOsSupabaseMeta] = useState<OsSupabaseMeta | null>(null)

  useEffect(() => {
    if (searchParams.get('novo') !== '1') return
    const clienteId = searchParams.get('cliente') ?? ''
    const motoId = searchParams.get('moto') ?? ''
    if (clienteId && !clientes.some((c) => c.id === clienteId)) return
    if (motoId && !motos.some((m) => m.id === motoId)) return
    if (limiteAtingido('os_mes')) return

    const motosCliente = motos.filter((m) => m.cliente_id === clienteId)
    const motoIdResolvido =
      motoId || (motosCliente.length === 1 ? motosCliente[0].id : '')
    const moto = motoIdResolvido ? motos.find((m) => m.id === motoIdResolvido) : undefined
    setEditando(null)
    setForm({
      ...criarFormVazio(modelosSeguros, officeId),
      cliente_id: clienteId,
      moto_id: motoIdResolvido,
      quilometragem_entrada: moto?.quilometragem,
    })
    setErrosValidacao(null)
    setDialogAberto(true)
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez via query string
  }, [searchParams.get('novo'), searchParams.get('cliente'), searchParams.get('moto')])

  useEffect(() => {
    const verId = searchParams.get('ver')
    const editarId = searchParams.get('editar')
    const pdfId = searchParams.get('pdf')
    if (!verId && !editarId && !pdfId) return

    if (editarId) {
      const os = ordens.find((o) => o.id === editarId)
      if (os) abrirEditar(os)
      setSearchParams({}, { replace: true })
      return
    }

    if (verId) {
      const os = ordens.find((o) => o.id === verId)
      if (os) setOsVisualizando(os)
      setSearchParams({}, { replace: true })
      return
    }

    if (pdfId) {
      const os = ordens.find((o) => o.id === pdfId)
      if (os) void exportarPdf(os)
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep link uma vez
  }, [searchParams.get('ver'), searchParams.get('editar'), searchParams.get('pdf'), ordens.length])

  const motosDoCliente = useMemo(
    () => motos.filter((m) => m.cliente_id === form.cliente_id),
    [motos, form.cliente_id]
  )

  const valorTotal = calcularValorTotalOS(
    form.valor_pecas,
    form.valor_mao_obra,
    form.desconto,
    form.valor_adicional ?? 0
  )
  function salvarServicoManualNoCatalogo(item: ServicoOSItem) {
    adicionarServicoCatalogo(servicoOSItemParaCatalogoInput(item))
    toast.sucesso('Serviço salvo no catálogo.')
  }

  const ordensFiltradas = useMemo(
    () =>
      filtrarOrdensServicoListagem(ordens, clientes, motos, lancamentos, {
        busca,
        ...filtros,
        status: filtros.status === 'todos' ? undefined : filtros.status,
        statusFinanceiro:
          filtros.statusFinanceiro === 'todos' ? undefined : filtros.statusFinanceiro,
        placa: filtros.placa || undefined,
        dataInicio: filtros.dataInicio || undefined,
        dataFim: filtros.dataFim || undefined,
      }),
    [ordens, clientes, motos, lancamentos, busca, filtros]
  )

  function limparErroCampo(campo: CampoOSForm) {
    setErrosValidacao((prev) => removerErroCampo(prev, campo))
  }

  function abrirNova() {
    if (limiteAtingido('os_mes')) return
    setEditando(null)
    setOsSupabaseMeta(null)
    setOsSyncTick(0)
    setForm(criarFormVazio(modelosSeguros, officeId))
    setErrosValidacao(null)
    setDialogAberto(true)
  }

  function abrirEditar(os: OrdemServico) {
    setEditando(os)
    setOsSupabaseMeta(null)
    setOsSyncTick(0)
    setForm({
      cliente_id: os.cliente_id,
      moto_id: os.moto_id,
      defeito_relatado: os.defeito_relatado,
      diagnostico: os.diagnostico,
      servicos_executados: os.servicos_executados,
      servicos_itens: os.servicos_itens ?? [],
      pecas_utilizadas: os.pecas_utilizadas,
      valor_pecas: os.valor_pecas,
      valor_mao_obra: os.valor_mao_obra,
      valor_adicional: os.valor_adicional ?? 0,
      desconto: os.desconto,
      status: os.status,
      checklist_entrada: normalizarChecklist(os.checklist_entrada, modelosSeguros, officeId),
      valor_estimado: os.valor_estimado,
      data_orcamento: os.data_orcamento,
      status_orcamento: os.status_orcamento,
      observacoes_orcamento: os.observacoes_orcamento,
      quilometragem_entrada: os.quilometragem_entrada,
      quilometragem_saida: os.quilometragem_saida,
      dias_garantia: os.dias_garantia,
      data_vencimento_garantia: os.data_vencimento_garantia,
      status_financeiro: os.status_financeiro,
      vencimento_pagamento: os.vencimento_pagamento,
      observacoes_pagamento: os.observacoes_pagamento,
      ajuste_mao_obra: os.ajuste_mao_obra,
    })
    setErrosValidacao(null)
    setDialogAberto(true)
  }

  function selecionarMoto(motoId: string) {
    const moto = motos.find((m) => m.id === motoId)
    setForm({
      ...form,
      moto_id: motoId,
      quilometragem_entrada: moto?.quilometragem ?? form.quilometragem_entrada,
    })
    limparErroCampo('moto_id')
    if (moto?.quilometragem !== undefined) {
      limparErroCampo('quilometragem_entrada')
    }
  }

  function prepararDadosSalvar(): FormOS {
    let dados = { ...form }
    dados.checklist_entrada = {
      ...dados.checklist_entrada!,
      observacoes_gerais: dados.checklist_entrada?.observacoes_gerais || undefined,
    }

    if (
      dados.dias_garantia &&
      dados.dias_garantia > 0 &&
      ['finalizada', 'entregue'].includes(dados.status) &&
      !dados.data_vencimento_garantia
    ) {
      const dataBase = editando?.atualizado_em ?? new Date().toISOString().slice(0, 10)
      dados.data_vencimento_garantia = calcularVencimentoGarantia(dataBase, dados.dias_garantia)
    }

    if (dados.servicos_itens?.length) {
      dados = sincronizarTotaisOSServicos(dados)
    }
    dados = sincronizarValorPecasForm(dados)

    return dados
  }

  async function confirmarSalvarComEstoque(dados: FormOS) {
    const alertas = verificarEstoqueInsuficiente(dados.pecas_utilizadas ?? [], pecas)
    const vaiFinalizar = ['finalizada', 'entregue'].includes(dados.status)
    const jaBaixado = editando?.estoque_baixado

    if (vaiFinalizar && !jaBaixado && alertas.length > 0) {
      const msg = alertas
        .map((a) => `${a.nome}: necessário ${a.necessario}, disponível ${a.disponivel}`)
        .join('\n')
      const ok = await confirmar({
        titulo: 'Estoque insuficiente',
        mensagem: `Estoque insuficiente para:\n${msg}\n\nDeseja finalizar mesmo assim? O estoque será baixado até zero.`,
        confirmarTexto: 'Finalizar mesmo assim',
      })
      if (!ok) return
    }

    void executar({
      acao: async () => {
        const res = await executarSalvarComSync(dados)
        if (!res) throw new Error(MSG.erroSalvar)
      },
      sucesso: '',
      erro: MSG.erroSalvar,
    })
  }

  async function executarSalvarComSync(
    dadosForm: FormOS,
    opcoes?: { pagamento?: PagamentoOSInput }
  ): Promise<{ os: OrdemServico; mensagem: string } | null> {
    if (dadosForm.ajuste_mao_obra?.ativo && !dadosForm.ajuste_mao_obra.motivo_texto?.trim()) {
      toast.atencao('Informe o motivo do ajuste manual de mão de obra.')
      return null
    }

    const eraNova = !editando
    const agoraFinalizada = ['finalizada', 'entregue'].includes(dadosForm.status)
    const osId = editando?.id

    if (dadosForm.status === 'cancelada' && osId) {
      for (const pagamento of listarPagamentosOS(osId, lancamentos)) {
        atualizarLancamento(pagamento.id, patchCancelamentoPagamentosOS())
      }
      dadosForm.status_financeiro = 'cancelado'
    }

    marcarPularPersistenciaRemotaProxima()

    let osSalva: OrdemServico

    if (editando) {
      atualizarOS(editando.id, dadosForm)
      osSalva = { ...editando, ...dadosForm, valor_total: valorTotal }
    } else {
      osSalva = adicionarOS(dadosForm)
    }

    const dbAtual = localCraftRepository.carregar(officeId)
    const modoSupabase = getCraftPersistenceMode() === 'supabase'
    const online = typeof navigator !== 'undefined' && navigator.onLine
    let mensagemSucesso: string = eraNova ? MSG.osSalva : MSG.osAlterada

    if (modoSupabase && online) {
      const resultado = await salvarOsComConfirmacaoSupabase(officeId, osSalva, dbAtual, {
        eraNova,
      })

      if (!resultado.ok) {
        toast.atencao(resultado.mensagem)
        return null
      }

      if (resultado.fallbackLocal) {
        toast.atencao(resultado.mensagem)
        setDialogAberto(false)
        setEditando(null)
        setOsSupabaseMeta(null)
        return { os: osSalva, mensagem: resultado.mensagem }
      }

      mensagemSucesso = resultado.mensagem

      if (resultado.service_order_id) {
        setOsSupabaseMeta({
          service_order_id: resultado.service_order_id,
          supabase_id: resultado.service_order_id,
        })
      }

      await recarregarDadosSupabase()

      if (opcoes?.pagamento) {
        const dbPosSync = localCraftRepository.carregar(officeId)
        const osAtualizada =
          dbPosSync.ordens_servico.find((o) => o.id === osSalva.id) ?? osSalva
        const validacao = await validarOsParaRegistrarPagamento(
          officeId,
          osAtualizada,
          dbPosSync,
          false
        )
        if (!validacao.ok) {
          toast.atencao(validacao.mensagem ?? MENSAGEM_OS_FALHA_SALVAR)
          return null
        }
        adicionarLancamento(
          criarInputLancamentoPagamento(osAtualizada, opcoes.pagamento, usuarioAtual)
        )
      }

      setDialogAberto(false)
      setEditando(null)
      setOsSupabaseMeta(null)
      setOsSyncTick(0)
      toast.sucesso(mensagemSucesso)
    } else {
      if (opcoes?.pagamento) {
        adicionarLancamento(
          criarInputLancamentoPagamento(osSalva, opcoes.pagamento, usuarioAtual)
        )
      }
      setDialogAberto(false)
      setEditando(null)
      setOsSupabaseMeta(null)
      toast.sucesso(mensagemSucesso)
    }

    if (agoraFinalizada && temRecurso('lembretes')) {
      setOsParaLembretes(osSalva)
      setDialogLembretesAberto(true)
    }

    return { os: osSalva, mensagem: mensagemSucesso }
  }

  async function handleSalvarOsEPagamento(pagamento: PagamentoOSInput): Promise<boolean> {
    const resultado = validarFormularioOS(form)
    if (!resultado.valido) {
      setErrosValidacao(resultado)
      rolarParaPrimeiroErro(resultado)
      toast.atencao('Verifique os campos obrigatórios da OS.')
      return false
    }
    setErrosValidacao(null)

    const dadosSalvar = prepararDadosSalvar()
    const alertas = verificarEstoqueInsuficiente(dadosSalvar.pecas_utilizadas ?? [], pecas)
    const vaiFinalizar = ['finalizada', 'entregue'].includes(dadosSalvar.status)
    const jaBaixado = editando?.estoque_baixado

    if (vaiFinalizar && !jaBaixado && alertas.length > 0) {
      const msg = alertas
        .map((a) => `${a.nome}: necessário ${a.necessario}, disponível ${a.disponivel}`)
        .join('\n')
      const ok = await confirmar({
        titulo: 'Estoque insuficiente',
        mensagem: `Estoque insuficiente para:\n${msg}\n\nDeseja finalizar mesmo assim? O estoque será baixado até zero.`,
        confirmarTexto: 'Finalizar mesmo assim',
      })
      if (!ok) return false
    }

    return (
      (await executar({
        acao: async () => {
          const res = await executarSalvarComSync(dadosSalvar, { pagamento })
          if (!res) throw new Error(MSG.erroSalvar)
        },
        sucesso: '',
        erro: MSG.erroSalvar,
      })) ?? false
    )
  }

  function salvar() {
    const resultado = validarFormularioOS(form)
    if (!resultado.valido) {
      setErrosValidacao(resultado)
      rolarParaPrimeiroErro(resultado)
      toast.atencao('Verifique os campos obrigatórios.')
      return
    }

    setErrosValidacao(null)
    void confirmarSalvarComEstoque(prepararDadosSalvar())
  }

  async function confirmarExclusao(os: OrdemServico) {
    const ok = await confirmar({
      titulo: 'Excluir OS',
      mensagem: `Tem certeza que deseja excluir a OS #${os.numero}?`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (ok) {
      excluirOS(os.id)
      toast.sucesso(MSG.excluido)
    }
  }

  function abrirVisualizacao(os: OrdemServico) {
    setOsVisualizando(os)
  }

  function dadosDocumento(os: OrdemServico | null) {
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
  }

  async function exportarPdf(os: OrdemServico) {
    if (!temRecurso('pdf_os')) {
      window.alert('Exportação PDF disponível a partir do plano Profissional.')
      return
    }
    const cliente = clientes.find((c) => c.id === os.cliente_id)
    const moto = motos.find((m) => m.id === os.moto_id)
    if (!cliente || !moto) {
      window.alert('Cliente ou moto não encontrados para esta OS.')
      return
    }

    setExportandoPdfId(os.id)
    try {
      await exportarOsPdf(
        os,
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
      setExportandoPdfId(null)
    }
  }

  async function gerarRecibo(os: OrdemServico, pagamentoId: string) {
    if (!temRecurso('pdf_os')) {
      window.alert('Geração de recibo disponível a partir do plano Profissional.')
      return
    }

    const cliente = clientes.find((c) => c.id === os.cliente_id)
    const moto = motos.find((m) => m.id === os.moto_id)
    const pagamento = listarPagamentosOS(os.id, lancamentos).find((p) => p.id === pagamentoId)

    if (!cliente || !moto) {
      window.alert('Cliente ou moto não encontrados para esta OS.')
      return
    }

    if (!pagamento?.pago) {
      window.alert('Selecione um pagamento recebido para gerar o recibo.')
      return
    }

    setGerandoReciboId(pagamentoId)
    try {
      await exportarReciboPdf(os, pagamento, cliente, moto, configuracao, lancamentos)
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Não foi possível gerar o recibo.'
      )
    } finally {
      setGerandoReciboId(null)
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Ordens de Serviço"
        descricao="Criação e acompanhamento de ordens de serviço"
        acoes={
          <Button
            onClick={abrirNova}
            disabled={clientes.length === 0 || limiteAtingido('os_mes')}
          >
            <Plus className="h-4 w-4" />
            Nova OS
          </Button>
        }
      />

      <AvisoLimitePlano tipo="os_mes" />

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <BuscaInput
              valor={busca}
              onChange={setBusca}
              placeholder="Buscar por cliente, telefone, placa, OS, serviço, data..."
              className="max-w-md flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltrosAbertos((v) => !v)}
            >
              <Filter className="h-4 w-4" />
              Filtros
            </Button>
          </div>

          {filtrosAbertos && (
            <div className="mb-4 grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1">
                <Label className="text-xs">Status OS</Label>
                <Select
                  value={filtros.status ?? 'todos'}
                  onValueChange={(v) =>
                    setFiltros({ ...filtros, status: v as FiltrosOSListagem['status'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {STATUS_OS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Status financeiro</Label>
                <Select
                  value={filtros.statusFinanceiro ?? 'todos'}
                  onValueChange={(v) =>
                    setFiltros({
                      ...filtros,
                      statusFinanceiro: v as FiltrosOSListagem['statusFinanceiro'],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {STATUS_FINANCEIRO_OS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Cliente</Label>
                <Select
                  value={filtros.clienteId ?? 'todos'}
                  onValueChange={(v) =>
                    setFiltros({ ...filtros, clienteId: v === 'todos' ? undefined : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Placa</Label>
                <Input
                  value={filtros.placa ?? ''}
                  onChange={(e) => setFiltros({ ...filtros, placa: e.target.value })}
                  placeholder="ABC1D23"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Data início</Label>
                <Input
                  type="date"
                  value={filtros.dataInicio ?? ''}
                  onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Data fim</Label>
                <Input
                  type="date"
                  value={filtros.dataFim ?? ''}
                  onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filtros.apenasAbertas ?? false}
                    onChange={(e) =>
                      setFiltros({ ...filtros, apenasAbertas: e.target.checked })
                    }
                  />
                  OS abertas
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filtros.apenasFinalizadas ?? false}
                    onChange={(e) =>
                      setFiltros({ ...filtros, apenasFinalizadas: e.target.checked })
                    }
                  />
                  OS finalizadas
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filtros.pagamentoPendente ?? false}
                    onChange={(e) =>
                      setFiltros({ ...filtros, pagamentoPendente: e.target.checked })
                    }
                  />
                  Pagamento pendente
                </label>
              </div>
            </div>
          )}

          <p className="mb-3 text-xs text-muted-foreground">
            {ordensFiltradas.length} ordem{ordensFiltradas.length !== 1 ? 'ns' : ''} encontrada
            {ordensFiltradas.length !== 1 ? 's' : ''}
          </p>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Abertura</TableHead>
                  <TableHead>Previsão</TableHead>
                  <TableHead>Finalização</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Moto / Placa</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Financeiro</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pendente</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordensFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground">
                      Nenhuma ordem de serviço encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  ordensFiltradas.map((item) => {
                    const os = item.os
                    const clienteOs = clientes.find((c) => c.id === os.cliente_id)
                    return (
                      <TableRow key={os.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          #{os.numero}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatarData(item.dataAbertura)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {item.dataPrevisao ? formatarData(item.dataPrevisao) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {item.dataFinalizacao ? formatarData(item.dataFinalizacao) : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{item.clienteNome}</div>
                          {item.clienteTelefone && (
                            <div className="text-xs text-muted-foreground">
                              {item.clienteTelefone}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{item.motoLabel}</div>
                          {item.motoPlaca && (
                            <div className="text-xs text-muted-foreground">{item.motoPlaca}</div>
                          )}
                        </TableCell>
                        <TableCell
                          className="max-w-[140px] truncate text-sm text-muted-foreground"
                          title={item.resumoServico}
                        >
                          {item.resumoServico}
                        </TableCell>
                        <TableCell>
                          <StatusOSRapido
                            status={os.status}
                            onAlterarStatus={(status) => atualizarOS(os.id, { status })}
                          />
                        </TableCell>
                        <TableCell>
                          {os.status_financeiro ? (
                            <Badge variant="secondary" className="text-xs">
                              {item.statusFinanceiroLabel}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatarMoeda(item.totalGeral)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {item.valorPendente > 0 ? (
                            <span className="text-amber-400">{formatarMoeda(item.valorPendente)}</span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {clienteOs && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Histórico do cliente"
                                onClick={() => setHistoricoCliente(clienteOs)}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                            )}
                            {clienteOs ? (
                              <BotaoWhatsApp
                                cliente={clienteOs}
                                moto={motos.find((m) => m.id === os.moto_id)}
                                os={os}
                              />
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => abrirVisualizacao(os)}
                              title="Visualizar OS"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => exportarPdf(os)}
                              disabled={exportandoPdfId === os.id}
                              title={temRecurso('pdf_os') ? 'Exportar PDF' : 'PDF — Profissional+'}
                            >
                              {exportandoPdfId === os.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileDown className="h-4 w-4" />
                              )}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => abrirEditar(os)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmarExclusao(os)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <HistoricoClienteOSDialog
        aberto={!!historicoCliente}
        onOpenChange={(open) => !open && setHistoricoCliente(null)}
        cliente={historicoCliente}
        ordens={ordens}
        motos={motos}
        lancamentos={lancamentos}
      />

      <Dialog
        open={dialogAberto}
        onOpenChange={(open) => {
          setDialogAberto(open)
          if (!open) {
            setErrosValidacao(null)
            setOsSupabaseMeta(null)
            setOsSyncTick(0)
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar OS #${editando.numero}` : 'Nova ordem de serviço'}</DialogTitle>
          </DialogHeader>

          {errosValidacao && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {errosValidacao.mensagemGeral}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div id="os-campo-cliente" className="grid gap-2">
              <Label>Cliente *</Label>
              <Select
                value={form.cliente_id}
                onValueChange={(v) => {
                  setForm({ ...form, cliente_id: v, moto_id: '' })
                  limparErroCampo('cliente_id')
                  limparErroCampo('moto_id')
                }}
              >
                <SelectTrigger
                  aria-invalid={campoTemErro(errosValidacao, 'cliente_id')}
                  className={cn(campoTemErro(errosValidacao, 'cliente_id') && CLASSE_CAMPO_INVALIDO)}
                >
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <MensagemCampoErro mensagem={obterMensagemErroCampo(errosValidacao, 'cliente_id')} />
            </div>
            <div id="os-campo-moto" className="grid gap-2">
              <Label>Moto *</Label>
              <Select
                value={form.moto_id}
                onValueChange={selecionarMoto}
                disabled={!form.cliente_id}
              >
                <SelectTrigger
                  aria-invalid={campoTemErro(errosValidacao, 'moto_id')}
                  className={cn(campoTemErro(errosValidacao, 'moto_id') && CLASSE_CAMPO_INVALIDO)}
                >
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {motosDoCliente.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.marca} {m.modelo} — {m.placa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <MensagemCampoErro mensagem={obterMensagemErroCampo(errosValidacao, 'moto_id')} />
            </div>

            {form.checklist_entrada && (
              <div className="sm:col-span-2">
                <ChecklistEntradaForm
                  value={form.checklist_entrada}
                  onChange={(checklist_entrada) => {
                    setForm({ ...form, checklist_entrada })
                    limparErroCampo('checklist')
                  }}
                  modelos={modelosSeguros}
                  officeId={officeId}
                  errosItens={errosValidacao?.errosChecklistItens ?? []}
                  temErroSecao={campoTemErro(errosValidacao, 'checklist')}
                  mensagemErroSecao={obterMensagemErroCampo(errosValidacao, 'checklist')}
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <QuilometragemOSSection
                entrada={form.quilometragem_entrada}
                saida={form.quilometragem_saida}
                erroEntrada={obterMensagemErroCampo(errosValidacao, 'quilometragem_entrada')}
                onChange={(km) => {
                  setForm({ ...form, ...km })
                  if (km.quilometragem_entrada !== undefined && !Number.isNaN(km.quilometragem_entrada)) {
                    limparErroCampo('quilometragem_entrada')
                  }
                }}
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="defeito">Defeito relatado *</Label>
              <Textarea
                id="defeito"
                value={form.defeito_relatado}
                aria-invalid={campoTemErro(errosValidacao, 'defeito_relatado')}
                className={cn(campoTemErro(errosValidacao, 'defeito_relatado') && CLASSE_CAMPO_INVALIDO)}
                onChange={(e) => {
                  setForm({ ...form, defeito_relatado: e.target.value })
                  if (e.target.value.trim()) limparErroCampo('defeito_relatado')
                }}
              />
              <MensagemCampoErro mensagem={obterMensagemErroCampo(errosValidacao, 'defeito_relatado')} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="diagnostico">Diagnóstico</Label>
              <Textarea
                id="diagnostico"
                value={form.diagnostico}
                onChange={(e) => setForm({ ...form, diagnostico: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <ServicosOSSection
                form={form}
                catalogo={servicosCatalogo}
                pecas={pecas}
                papel={papel}
                onChange={(patch) => setForm({ ...form, ...patch })}
                onSalvarServicoNoCatalogo={salvarServicoManualNoCatalogo}
              />
            </div>

            <div className="sm:col-span-2">
              <PecasOSUtilizadasSection
                form={form}
                pecasEstoque={pecas}
                papel={papel}
                onChange={(patch) => setForm({ ...form, ...patch })}
                onAdicionarAoEstoque={
                  temRecurso('estoque')
                    ? (input) =>
                        adicionarPeca({
                          nome: input.nome,
                          codigo: input.codigo,
                          marca: '—',
                          custo: input.preco_venda,
                          preco_venda: input.preco_venda,
                          quantidade: input.quantidade,
                          estoque_minimo: 5,
                          ativo: true,
                        })
                    : undefined
                }
              />
            </div>

            <div id="os-campo-status" className="grid gap-2">
              <Label>Status *</Label>
              <Select
                value={form.status}
                onValueChange={(v) => {
                  setForm({ ...form, status: v as StatusOS })
                  limparErroCampo('status')
                }}
              >
                <SelectTrigger
                  aria-invalid={campoTemErro(errosValidacao, 'status')}
                  className={cn(campoTemErro(errosValidacao, 'status') && CLASSE_CAMPO_INVALIDO)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <MensagemCampoErro mensagem={obterMensagemErroCampo(errosValidacao, 'status')} />
            </div>

            <div className="sm:col-span-2">
              <RecursoPlanoGate recurso="garantia">
                <GarantiaOSSection
                  status={form.status}
                  diasGarantia={form.dias_garantia}
                  dataVencimento={form.data_vencimento_garantia}
                  dataBase={editando?.atualizado_em ?? new Date().toISOString().slice(0, 10)}
                  onChange={(gar) => setForm({ ...form, ...gar })}
                />
              </RecursoPlanoGate>
            </div>

            <div className="sm:col-span-2">
              <OrcamentoOSSection
                dataOrcamento={form.data_orcamento}
                statusOrcamento={form.status_orcamento}
                observacoesOrcamento={form.observacoes_orcamento}
                onChange={(orc) => setForm({ ...form, ...orc })}
              />
            </div>

            {podeVerFinanceiro && (
              <div className="sm:col-span-2">
                <ResumoFinanceiroOSSection
                  form={form}
                  valorTotal={valorTotal}
                  os={editando}
                  lancamentos={lancamentos}
                  papel={papel}
                  onChange={(patch) => setForm({ ...form, ...patch })}
                />
              </div>
            )}

            {podeVerFinanceiro && (
              <div className="sm:col-span-2">
                {temRecurso('financeiro_completo') ? (
                  <PagamentoOSSection
                    os={editando}
                    valorTotal={valorTotal}
                    statusFinanceiro={form.status_financeiro}
                    vencimentoPagamento={form.vencimento_pagamento}
                    observacoesPagamento={form.observacoes_pagamento}
                    lancamentos={lancamentos}
                    oficina={configuracao}
                    cliente={clientes.find((c) => c.id === form.cliente_id) ?? null}
                    moto={motos.find((m) => m.id === form.moto_id) ?? null}
                    usuario={usuarioAtual}
                    podeRegistrar={podeRegistrarPagamento}
                    podeEditar={podeEditarPagamento}
                    podeExcluir={podeExcluirPagamento}
                    podeGerarRecibo={temRecurso('pdf_os')}
                    onChangeOs={(pag) => setForm({ ...form, ...pag })}
                    osSyncTick={osSyncTick}
                    osSupabaseMeta={osSupabaseMeta}
                    onSalvarOsEPagamento={handleSalvarOsEPagamento}
                    salvandoOs={salvando}
                  />
                ) : (
                  <PagamentoOSSimples
                    os={editando}
                    valorTotal={valorTotal}
                    lancamentos={lancamentos}
                  />
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="outline" onClick={() => setDialogAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <OsVisualizacaoDialog
        aberto={!!osVisualizando}
        onFechar={() => setOsVisualizando(null)}
        dados={dadosDocumento(osVisualizando)}
        pagamentosRecibo={
          osVisualizando ? listarPagamentosOS(osVisualizando.id, lancamentos) : []
        }
        podeExportarPdf={temRecurso('pdf_os')}
        podeGerarRecibo={temRecurso('pdf_os') && temRecurso('financeiro_completo')}
        exportandoPdf={!!osVisualizando && exportandoPdfId === osVisualizando.id}
        gerandoRecibo={!!gerandoReciboId}
        onExportarPdf={
          osVisualizando ? () => exportarPdf(osVisualizando) : undefined
        }
        onGerarRecibo={
          osVisualizando
            ? (pagamentoId) => gerarRecibo(osVisualizando, pagamentoId)
            : undefined
        }
      />

      <CriarLembretesOSDialog
        os={osParaLembretes}
        moto={osParaLembretes ? motos.find((m) => m.id === osParaLembretes.moto_id) ?? null : null}
        servicosCatalogo={servicosCatalogo}
        clienteNome={
          osParaLembretes
            ? clientes.find((c) => c.id === osParaLembretes.cliente_id)?.nome ?? 'Cliente'
            : ''
        }
        nomeOficina={configuracao.nome}
        aberto={dialogLembretesAberto}
        onFechar={() => {
          setDialogLembretesAberto(false)
          setOsParaLembretes(null)
        }}
      />
    </div>
  )
}
