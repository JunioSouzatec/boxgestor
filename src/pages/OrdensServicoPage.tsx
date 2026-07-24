import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { usePlanoEscrita } from '@/hooks/usePlanoEscrita'
import { useViewportMobile } from '@/hooks/useViewportMobile'
import { Plus, Pencil, Trash2, FileDown, Eye, Loader2, History, Filter, Wallet, Receipt } from 'lucide-react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useAutorizacaoValores } from '@/context/AutorizacaoValoresContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { DatasCicloOSSection } from '@/components/os/DatasCicloOSSection'
import { FechamentoOSSection } from '@/components/os/FechamentoOSSection'
import { ChecklistEntradaForm } from '@/components/os/ChecklistEntradaForm'
import { FotosOSSection } from '@/components/os/FotosOSSection'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import {
  ModoDocumentoOSSection,
  aplicarModoDocumentoNoForm,
} from '@/components/os/ModoDocumentoOSSection'
import { QuilometragemOSSection } from '@/components/os/QuilometragemOSSection'
import { PagamentoOSSection } from '@/components/os/PagamentoOSSection'
import { ServicosOSSection, type ServicosOSOnChange } from '@/components/os/ServicosOSSection'
import { PecasOSUtilizadasSection } from '@/components/os/PecasOSUtilizadasSection'
import { ResumoFinanceiroOSSection } from '@/components/os/ResumoFinanceiroOSSection'
import { HistoricoEventosOSSection } from '@/components/os/HistoricoEventosOSSection'
import { ResponsavelOSSelect } from '@/components/os/ResponsavelOSSelect'
import {
  criarEventoAlteracaoStatusOS,
  criarEventoAlteracaoValorOS,
  criarEventoAtribuicaoResponsavelOS,
  deduplicarHistoricoEventos,
  mesclarHistoricoEventos,
  responsavelOSMudou,
} from '@/services/os-historico.service'
import { resolverSnapshotComissaoOS } from '@/services/comissoes/comissao-os-snapshot.service'
import { PagamentoOSSimples } from '@/components/os/PagamentoOSSimples'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { useAssinatura } from '@/context/AssinaturaContext'
import { mensagemLimite } from '@/services/assinatura/plano-features'
import { AvisoLimitePlano } from '@/components/plano/AvisoLimitePlano'
import { BotaoEnviarWhatsAppOs } from '@/components/os/BotaoEnviarWhatsAppOs'
import { ListagemStatusDocumento } from '@/components/os/ListagemStatusDocumento'
import { OrcamentoOSSection } from '@/components/os/OrcamentoOSSection'
import { OrcamentoFluxoAcoes } from '@/components/os/OrcamentoFluxoAcoes'
import {
  BotaoVerOsGerada,
  OrcamentoConvertidoListagemInfo,
} from '@/components/os/OrcamentoConvertidoListagem'
import { orcamentoEstaConvertido } from '@/lib/orcamento-fluxo'
import { CriarLembretesOSDialog } from '@/components/lembretes/CriarLembretesOSDialog'
import { PaginacaoLista } from '@/components/shared/PaginacaoLista'
import { usePaginaLista } from '@/hooks/usePaginaLista'
import { exportarOsPdf } from '@/services/os-pdf.service'
import { exportarReciboPdf } from '@/services/recibo-pdf.service'
import {
  criarInputLancamentoPagamento,
  encontrarPossivelDuplicidadePagamentoOs,
  validarValorPagamentoOs,
  listarPagamentosOS,
  patchCancelamentoPagamentosOS,
  type PagamentoOSInput,
} from '@/services/os-pagamento.service'
import { MSG } from '@/lib/mensagens-usuario'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { reservarProximoNumeroOsSupabase } from '@/services/os-numbering-rpc.service'
import { marcarPularPersistenciaRemotaProxima, iniciarOperacaoSalvamentoExplicito, finalizarOperacaoSalvamentoExplicito } from '@/services/supabase-sync/persistencia-opcoes'
import {
  obterUltimoLancamentoOs,
  sincronizarPagamentoNoSupabase,
} from '@/services/supabase-sync/os-payment-save-flow.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  pullEstoqueDoSupabase,
  estoqueModoSupabase,
} from '@/services/estoque/estoque-sync.service'
import { resolverAlertasDaOsCancelada } from '@/services/comunicacao/alertas-comunicacao.service'
import { cancelarMensagensAgendadasDaOs } from '@/services/comunicacao/mensagens-agendadas.service'
import {
  calcularResumoFinanceiroOS,
  calcularTotalGeralDeCampos,
  calcularValorPagoOS,
  extrairCamposTotaisOS,
  sugerirStatusFinanceiro,
  validarTotalOsComPagamentos,
  type OpcoesResumoFinanceiroOS,
  type ResumoFinanceiroOS,
} from '@/services/os-financeiro.service'
import {
  MENSAGEM_OS_FALHA_SALVAR,
  validarOsParaRegistrarPagamento,
  type OsSupabaseMeta,
} from '@/services/supabase-sync/payment-sync.helpers'
import {
  salvarOsComConfirmacaoSupabase,
} from '@/services/supabase-sync/service-order-save.service'
import {
  filtrarOrdensPorPermissaoUsuario,
  podeAtribuirResponsavelOS,
  podeEditarPagamentoOS,
  podeExcluirPagamentoOS,
  podePreencherChecklist,
  podeRegistrarPagamentoOS,
  podeRegistrarPagamentoComPinOS,
  podeVerSecaoPagamentoOS,
  podeVerValoresFinanceirosOS,
} from '@/services/auth/permissions'
import { osModoEhCompleta } from '@/lib/os-modo'
import { converterOrcamentoEmOSComSync } from '@/services/os/orcamento-conversao.service'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import {
  FILTROS_TIPO_DOCUMENTO,
  patchAprovarOrcamento,
  patchRecusarOrcamento,
  podeConverterOrcamentoEmOS,
  type FiltroTipoDocumentoOS,
} from '@/lib/orcamento-fluxo'
import { prevenirFechamentoDialogPorPortal } from '@/lib/radix-portal'
import { setDialogOsAberto } from '@/lib/ui-interaction'
import { logDevAbrirVisualizacaoOs, rotaVisualizarOs } from '@/lib/rota-os'
import { calcularVencimentoGarantia, criarChecklistVazio, normalizarChecklist } from '@/lib/os'
import { sincronizarTotaisOSServicos, servicoOSItemParaCatalogoInput } from '@/services/servico-catalogo.service'
import type { ServicoOSItem } from '@/types/servico-catalogo'
import { sincronizarValorPecasForm, verificarEstoqueParaBaixaOS } from '@/services/os-pecas.service'
import { dataHojeLocal } from '@/services/os-datas.service'
import {
  mensagemConfirmacaoStatus,
  patchAoMudarStatus,
  precisaConfirmarMudancaStatus,
  statusExigeBaixaEstoque,
  tituloConfirmacaoStatus,
} from '@/services/os-status.service'
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
import {
  aplicarModeloAoChecklist,
  checklistPossuiRespostas,
  obterModeloChecklistParaVeiculo,
} from '@/services/checklist-modelo.service'
import type { TipoOficina } from '@/types/tipo-oficina'
import { normalizarTipoOficina } from '@/types/tipo-oficina'
import { HistoricoClienteOSDialog } from '@/components/os/HistoricoClienteOSDialog'
import { BuscaPlacaOsSection } from '@/components/os/BuscaPlacaOsSection'
import { MotoHistoricoDialog } from '@/components/motos/MotoHistoricoDialog'
import { CondicaoFinanceiraOSBadge, StatusOSBadge } from '@/components/shared/StatusBadges'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  filtrarOrdensServicoListagem,
  montarItemListagemOS,
  type FiltrosOSListagem,
} from '@/services/os-listagem.service'
import { detectarNumerosOsDuplicados } from '@/services/os-numbering.service'
import { buscarIdsOsPorNumeroNoSupabase } from '@/services/os-busca-supabase.service'
import { cn, formatarData, formatarMoeda } from '@/lib/utils'
import { STATUS_FINANCEIRO_OS, getLabelStatusOS } from '@/types/labels'
import { FiltroAtivoBanner } from '@/components/shared/FiltroAtivoBanner'
import { MensagemCampoErro } from '@/components/shared/MensagemCampoErro'
import type { ChecklistEntrada } from '@/types/checklist'
import type { Cliente, LancamentoFinanceiro, ModeloChecklist, Moto, OrdemServico, StatusOS } from '@/types'
import { OFFICE_ID, STATUS_OS, calcularValorTotalOS, listarStatusOSSelecionaveis } from '@/types'

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
  data_previsao: undefined,
  data_saida: undefined,
  modo_documento: 'os',
  responsavel: undefined,
  responsavel_id: undefined,
}

function criarFormVazio(
  modelos: ModeloChecklist[],
  officeId: string,
  tipoOficina: TipoOficina
): FormOS {
  return {
    ...formBase,
    data_entrada: dataHojeLocal(),
    checklist_entrada: criarChecklistVazio(modelos, officeId, tipoOficina),
  }
}

export function OrdensServicoPage() {
  const { session } = useAuth()
  const { adicionarOS, atualizarOS, excluirOS, atualizarLancamento, adicionarLancamento, adicionarPeca, adicionarServicoCatalogo, aplicarDatabase } = useCraft()
  const { ordens, clientes, motos, pecas, configuracao, lancamentos, modelosChecklist, servicosCatalogo, perfisComissao } =
    useOficinaData()
  const officeId = configuracao.office_id ?? configuracao.oficina_id
  const tipoOficina = normalizarTipoOficina(configuracao.tipo_oficina)
  const termos = useTermosOficina()
  const modoOsCompleta = osModoEhCompleta(configuracao.preferencias)
  const modelosSeguros = useMemo(
    () =>
      garantirChecklistPadrao(
        modelosChecklist,
        officeId,
        tipoOficina
      ),
    [modelosChecklist, officeId, tipoOficina]
  )
  const { limiteAtingido, temRecurso } = useAssinatura()
  const { verificarEscrita } = usePlanoEscrita()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const user = session?.user
  const { solicitarAutorizacao, limparAutorizacao } = useAutorizacaoValores()
  const { toast } = useToast()
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

  const podeVerFinanceiro = podeVerValoresFinanceirosOS(user ?? 'dono', configuracao)
  const podeRegistrarPagamento = podeRegistrarPagamentoOS(user ?? 'dono', configuracao)
  const podeAtribuirResponsavel = podeAtribuirResponsavelOS(user ?? null, configuracao)
  const podeRegistrarPagamentoComPin = podeRegistrarPagamentoComPinOS(user ?? 'dono', configuracao)
  const podeVerSecaoPagamento = podeVerSecaoPagamentoOS(user ?? 'dono', configuracao)
  const podeEditarPagamento = podeEditarPagamentoOS(user ?? 'dono', configuracao)
  const podeExcluirPagamento = podeExcluirPagamentoOS(user ?? 'dono', configuracao)
  const usuarioAtual = session?.user
    ? { id: session.user.id, nome: session.user.nome }
    : undefined
  const { confirmar } = useConfirmacao()
  const { executar, salvando } = useSalvarAcao()
  const [busca, setBusca] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [filtros, setFiltros] = useState<Omit<FiltrosOSListagem, 'busca'>>({
    status: 'todos',
    statusFinanceiro: 'todos',
    tipoDocumento: 'todos',
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
  const [historicoMotoPlaca, setHistoricoMotoPlaca] = useState<Moto | null>(null)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [abaOsMobile, setAbaOsMobile] = useState('dados')
  const isMobileOs = useViewportMobile()
  const mostrarAbaOs = (aba: string) => !isMobileOs || abaOsMobile === aba

  useEffect(() => {
    setDialogOsAberto(dialogAberto)
    return () => setDialogOsAberto(false)
  }, [dialogAberto])

  // RC1: hidratar estoque remoto ao abrir OS (evita lista 4×6 no celular)
  useEffect(() => {
    if (!estoqueModoSupabase()) return
    void pullEstoqueDoSupabase(officeId)
  }, [officeId])

  const [dialogLembretesAberto, setDialogLembretesAberto] = useState(false)
  const [osParaLembretes, setOsParaLembretes] = useState<OrdemServico | null>(null)
  const [editando, setEditando] = useState<OrdemServico | null>(null)
  const [form, setForm] = useState<FormOS>(() => criarFormVazio([], OFFICE_ID, 'motos'))
  const [errosValidacao, setErrosValidacao] = useState<ResultadoValidacaoOS | null>(null)
  const [exportandoPdfId, setExportandoPdfId] = useState<string | null>(null)
  const [gerandoReciboId, setGerandoReciboId] = useState<string | null>(null)
  const [osSyncTick, setOsSyncTick] = useState(0)
  const [osSupabaseMeta, setOsSupabaseMeta] = useState<OsSupabaseMeta | null>(null)
  const [pagamentoForm, setPagamentoForm] = useState<PagamentoOSInput>({
    valor: 0,
    forma_pagamento: 'pix',
    data: dataHojeLocal(),
    observacao: '',
    parcelas: 1,
  })
  const [pagamentoPreenchido, setPagamentoPreenchido] = useState(false)
  const [dialogBaseline, setDialogBaseline] = useState('')
  const [faseSalvamento, setFaseSalvamento] = useState<'idle' | 'os' | 'pagamento'>('idle')
  const [idsBuscaRemota, setIdsBuscaRemota] = useState<string[]>([])
  const ignorarFechamentoDialogRef = useRef(false)

  const registrarAlteracaoValorOs = useCallback(
    (campo: string, valorAnterior: number, valorNovo: number, detalhe?: string) => {
      if (user?.papel !== 'mecanico') return
      if (Math.abs(valorAnterior - valorNovo) < 0.009) return
      const evento = criarEventoAlteracaoValorOS({
        campo,
        valorAnterior,
        valorNovo,
        usuario: user ? { id: user.id, nome: user.nome } : undefined,
        autorizadoPin: true,
        detalhe,
      })
      setForm((prev) => ({
        ...prev,
        historico_eventos: deduplicarHistoricoEventos([
          ...(prev.historico_eventos ?? []),
          evento,
        ]),
      }))
    },
    [user]
  )

  function snapshotDialogEstado(f: FormOS, pag: PagamentoOSInput | null): string {
    return JSON.stringify({
      form: f,
      pagamentoValor: pag?.valor ?? 0,
      pagamentoForma: pag?.forma_pagamento ?? '',
      pagamentoData: pag?.data ?? '',
    })
  }

  function resetarEstadoDialogo() {
    limparAutorizacao()
    setErrosValidacao(null)
    setOsSupabaseMeta(null)
    setOsSyncTick(0)
    setPagamentoForm({
      valor: 0,
      forma_pagamento: 'pix',
      data: dataHojeLocal(),
      observacao: '',
      parcelas: 1,
    })
    setPagamentoPreenchido(false)
    setFaseSalvamento('idle')
  }

  function temAlteracoesNaoSalvas(): boolean {
    const pagAtual = pagamentoPreenchido ? pagamentoForm : null
    return snapshotDialogEstado(form, pagAtual) !== dialogBaseline
  }

  async function tentarFecharDialog() {
    if (ignorarFechamentoDialogRef.current) return

    if (!temAlteracoesNaoSalvas()) {
      setDialogAberto(false)
      setEditando(null)
      resetarEstadoDialogo()
      return
    }

    ignorarFechamentoDialogRef.current = true
    const ok = await confirmar({
      titulo: MSG.alteracoesNaoSalvasTitulo,
      mensagem: MSG.alteracoesNaoSalvasMensagem,
      confirmarTexto: MSG.sairSemSalvar,
      cancelarTexto: MSG.continuarEditando,
      destrutivo: true,
    })
    ignorarFechamentoDialogRef.current = false

    if (ok) {
      setDialogAberto(false)
      setEditando(null)
      resetarEstadoDialogo()
    } else {
      setDialogAberto(true)
      ignorarFechamentoDialogRef.current = true
      window.setTimeout(() => {
        ignorarFechamentoDialogRef.current = false
      }, 400)
    }
  }

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
    let formInicial = {
      ...criarFormVazio(modelosSeguros, officeId, tipoOficina),
      cliente_id: clienteId,
      moto_id: motoIdResolvido,
      quilometragem_entrada: moto?.quilometragem,
    }
    if (moto && modoOsCompleta) {
      const modelo = obterModeloChecklistParaVeiculo(
        modelosSeguros,
        moto.tipo_veiculo,
        tipoOficina,
        officeId
      )
      formInicial = {
        ...formInicial,
        checklist_entrada: aplicarModeloAoChecklist(
          formInicial.checklist_entrada,
          modelo,
          false,
          modelosSeguros,
          officeId,
          tipoOficina
        ),
      }
    }
    setEditando(null)
    setForm(formInicial)
    resetarEstadoDialogo()
    setDialogBaseline(snapshotDialogEstado(formInicial, null))
    setErrosValidacao(null)
    setDialogAberto(true)
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez via query string
  }, [searchParams.get('novo'), searchParams.get('cliente'), searchParams.get('moto')])

  useEffect(() => {
    const abertas = searchParams.get('abertas')
    const statusParam = searchParams.get('status')
    const pendentes = searchParams.get('pendentes')
    const pagamentoParam = searchParams.get('pagamento')
    const apenasFinalizadas = searchParams.get('apenasFinalizadas')
    if (abertas === '1') {
      setFiltros((f) => ({ ...f, pagamentoPendente: false, apenasAbertas: true }))
      setFiltrosAbertos(true)
      setSearchParams({}, { replace: true })
      return
    }
    if (pendentes === '1' || pagamentoParam === 'pendente') {
      setFiltros((f) => ({ ...f, pagamentoPendente: true, apenasAbertas: false }))
      setFiltrosAbertos(true)
      setSearchParams({ pagamento: 'pendente' }, { replace: true })
      return
    }
    if (apenasFinalizadas === '1') {
      setFiltros((f) => ({ ...f, apenasFinalizadas: true }))
      setFiltrosAbertos(true)
      setSearchParams({}, { replace: true })
      return
    }
    if (statusParam && statusParam !== 'todos') {
      const status =
        statusParam === 'em_andamento' ? ('em_servico' as const) : (statusParam as FiltrosOSListagem['status'])
      setFiltros((f) => ({ ...f, status }))
      setFiltrosAbertos(true)
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez via query string
  }, [searchParams.get('abertas'), searchParams.get('status'), searchParams.get('pendentes'), searchParams.get('pagamento'), searchParams.get('apenasFinalizadas')])

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
      logDevAbrirVisualizacaoOs(verId)
      navigate(rotaVisualizarOs({ id: verId }), { replace: true })
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

  const ordensVisiveis = useMemo(
    () => filtrarOrdensPorPermissaoUsuario(ordens, user ?? null, configuracao),
    [ordens, user, configuracao]
  )

  const ordensFiltradas = useMemo(() => {
    let lista = filtrarOrdensServicoListagem(ordensVisiveis, clientes, motos, lancamentos, {
      busca,
      ...filtros,
      status: filtros.status === 'todos' ? undefined : filtros.status,
      statusFinanceiro:
        filtros.statusFinanceiro === 'todos' ? undefined : filtros.statusFinanceiro,
      placa: filtros.placa || undefined,
      dataInicio: filtros.dataInicio || undefined,
      dataFim: filtros.dataFim || undefined,
    })

    const numeroBusca = parseInt(busca.trim().replace(/^#/, ''), 10)
    if (Number.isFinite(numeroBusca) && idsBuscaRemota.length > 0) {
      const idsNaLista = new Set(lista.map((item) => item.os.id))
      for (const os of ordensVisiveis) {
        if (idsBuscaRemota.includes(os.id) && !idsNaLista.has(os.id)) {
          lista = [...lista, montarItemListagemOS(os, clientes, motos, lancamentos)]
        }
      }
      lista.sort((a, b) => b.os.numero - a.os.numero)
    }

    return lista
  }, [ordensVisiveis, clientes, motos, lancamentos, busca, filtros, idsBuscaRemota])

  const numerosOsDuplicados = useMemo(
    () => new Set(detectarNumerosOsDuplicados(ordens).map((g) => g.numero)),
    [ordens]
  )

  useEffect(() => {
    const numero = parseInt(busca.trim().replace(/^#/, ''), 10)
    if (!Number.isFinite(numero) || getCraftPersistenceMode() !== 'supabase') {
      setIdsBuscaRemota([])
      return
    }
    let cancelado = false
    void buscarIdsOsPorNumeroNoSupabase(officeId, numero).then((ids) => {
      if (!cancelado) setIdsBuscaRemota(ids)
    })
    return () => {
      cancelado = true
    }
  }, [busca, officeId])

  const paginacaoOrdens = usePaginaLista(
    ordensFiltradas,
    50,
    `${busca}-${JSON.stringify(filtros)}`
  )

  function limparErroCampo(campo: CampoOSForm) {
    setErrosValidacao((prev) => removerErroCampo(prev, campo))
  }

  function abrirNova() {
    if (!verificarEscrita()) return
    if (limiteAtingido('os_mes')) {
      toast.atencao(mensagemLimite('os_mes'))
      return
    }
    setEditando(null)
    const formVazio = criarFormVazio(modelosSeguros, officeId, tipoOficina)
    setForm(formVazio)
    setOsSupabaseMeta(null)
    setOsSyncTick(0)
    resetarEstadoDialogo()
    setDialogBaseline(snapshotDialogEstado(formVazio, null))
    setErrosValidacao(null)
    setAbaOsMobile('dados')
    setDialogAberto(true)
  }

  function abrirEditar(os: OrdemServico) {
    setEditando(os)
    setOsSupabaseMeta(null)
    setOsSyncTick(0)
    resetarEstadoDialogo()
    const formCarregado: FormOS = {
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
      checklist_entrada: normalizarChecklist(os.checklist_entrada, modelosSeguros, officeId, tipoOficina),
      valor_estimado: os.valor_estimado,
      data_orcamento: os.data_orcamento,
      status_orcamento: os.status_orcamento,
      observacoes_orcamento: os.observacoes_orcamento,
      quilometragem_entrada: os.quilometragem_entrada,
      quilometragem_saida: os.quilometragem_saida,
      dias_garantia: os.dias_garantia,
      data_vencimento_garantia: os.data_vencimento_garantia,
      data_entrada: os.data_entrada ?? os.criado_em?.slice(0, 10) ?? dataHojeLocal(),
      data_previsao: os.data_previsao,
      data_saida: os.data_saida,
      status_financeiro: os.status_financeiro,
      vencimento_pagamento: os.vencimento_pagamento,
      observacoes_pagamento: os.observacoes_pagamento,
      ajuste_mao_obra: os.ajuste_mao_obra,
      modo_documento: os.modo_documento ?? 'os',
      responsavel: os.responsavel,
      responsavel_id: os.responsavel_id,
      criado_por_id: os.criado_por_id,
      criado_por_nome: os.criado_por_nome,
      historico_eventos: deduplicarHistoricoEventos(os.historico_eventos ?? []),
    }
    setForm(formCarregado)
    setDialogBaseline(snapshotDialogEstado(formCarregado, null))
    setErrosValidacao(null)
    setAbaOsMobile('dados')
    setDialogAberto(true)
  }

  function aplicarChecklistDoVeiculo(moto: Moto | undefined, motoId: string) {
    setForm((f) => {
      const base = {
        ...f,
        moto_id: motoId,
        quilometragem_entrada: moto?.quilometragem ?? f.quilometragem_entrada,
      }
      if (!modoOsCompleta || !moto || checklistPossuiRespostas(f.checklist_entrada)) {
        return base
      }
      const modelo = obterModeloChecklistParaVeiculo(
        modelosSeguros,
        moto.tipo_veiculo,
        tipoOficina,
        officeId
      )
      return {
        ...base,
        checklist_entrada: aplicarModeloAoChecklist(
          f.checklist_entrada ?? criarChecklistVazio(modelosSeguros, officeId, tipoOficina),
          modelo,
          false,
          modelosSeguros,
          officeId,
          tipoOficina
        ),
      }
    })
  }

  function selecionarMoto(motoId: string) {
    const moto = motos.find((m) => m.id === motoId)
    aplicarChecklistDoVeiculo(moto, motoId)
    limparErroCampo('moto_id')
    if (moto?.quilometragem !== undefined) {
      limparErroCampo('quilometragem_entrada')
    }
  }

  function usarVeiculoDoHistoricoPlaca(moto: Moto) {
    setForm((f) => {
      const parcial = {
        ...f,
        cliente_id: moto.cliente_id,
        moto_id: moto.id,
        quilometragem_entrada: moto.quilometragem ?? f.quilometragem_entrada,
      }
      if (!modoOsCompleta || checklistPossuiRespostas(f.checklist_entrada)) {
        return parcial
      }
      const modelo = obterModeloChecklistParaVeiculo(
        modelosSeguros,
        moto.tipo_veiculo,
        tipoOficina,
        officeId
      )
      return {
        ...parcial,
        checklist_entrada: aplicarModeloAoChecklist(
          f.checklist_entrada ?? criarChecklistVazio(modelosSeguros, officeId, tipoOficina),
          modelo,
          false,
          modelosSeguros,
          officeId,
          tipoOficina
        ),
      }
    })
    limparErroCampo('cliente_id')
    limparErroCampo('moto_id')
    if (moto.quilometragem !== undefined) {
      limparErroCampo('quilometragem_entrada')
    }
  }

  function filtrarListaPorPlaca(placa: string) {
    setDialogAberto(false)
    setFiltros((prev) => ({ ...prev, placa, tipoDocumento: 'todos' }))
    setFiltrosAbertos(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
      const dataBase = editando?.atualizado_em ?? dataHojeLocal()
      dados.data_vencimento_garantia = calcularVencimentoGarantia(dataBase, dados.dias_garantia)
    }

    if (dados.servicos_itens?.length) {
      dados = sincronizarTotaisOSServicos(dados)
    }
    dados = sincronizarValorPecasForm(dados)

    return dados
  }

  const atualizarFormServicosOS: ServicosOSOnChange = (update) => {
    setForm((f) => {
      const patch = typeof update === 'function' ? update(f) : update
      return { ...f, ...patch }
    })
  }

  function validarTotalOsAntesSalvar(dados: FormOS): boolean {
    if (!editando?.id) return true
    const validacao = validarTotalOsComPagamentos(
      editando,
      extrairCamposTotaisOS(dados),
      lancamentos
    )
    if (!validacao.ok) {
      toast.atencao(MSG.osTotalMenorQuePago)
      return false
    }
    return true
  }

  function validarEstoqueAntesSalvar(dados: FormOS): boolean {
    if (ehDocumentoOrcamento(dados)) return true
    const vaiBaixar = statusExigeBaixaEstoque(dados.status) && !editando?.estoque_baixado
    const vaiAjustar =
      !!editando?.estoque_baixado && statusExigeBaixaEstoque(dados.status)

    if (!vaiBaixar && !vaiAjustar) return true

    const alertas = verificarEstoqueParaBaixaOS(
      dados.pecas_utilizadas ?? [],
      pecas,
      editando ?? undefined,
      { vaiBaixar }
    )

    if (alertas.length > 0) {
      toast.atencao(MSG.estoqueInsuficiente)
      return false
    }
    return true
  }

  /**
   * RC2 Fase 3A — bloqueio de entrega/finalização com saldo pendente.
   * Só atua para oficinas premium com recurso os_bloqueio_saldo. Reaproveita
   * calcularResumoFinanceiroOS (mesmo cálculo da tela). Retorna o resumo quando
   * deve bloquear, ou null quando pode prosseguir.
   */
  function avaliarBloqueioSaldoEntrega(
    os: Parameters<typeof calcularResumoFinanceiroOS>[0],
    novoStatus: StatusOS,
    opcoesResumo?: OpcoesResumoFinanceiroOS
  ): ResumoFinanceiroOS | null {
    if (!temRecurso('os_bloqueio_saldo')) return null
    if (novoStatus !== 'entregue' && novoStatus !== 'finalizada') return null
    if (os.status === 'cancelada') return null
    const resumo = calcularResumoFinanceiroOS(os, lancamentos, opcoesResumo)
    if (resumo.totalGeral <= 0) return null
    if (resumo.valorPendente <= 0.009) return null
    return resumo
  }

  function montarMensagemSaldoPendente(resumo: {
    totalGeral: number
    valorPago: number
    valorPendente: number
  }): string {
    return [
      'Registre o pagamento restante antes de entregar/finalizar.',
      '',
      `Total da OS: ${formatarMoeda(resumo.totalGeral)}`,
      `Valor pago: ${formatarMoeda(resumo.valorPago)}`,
      `Saldo pendente: ${formatarMoeda(resumo.valorPendente)}`,
    ].join('\n')
  }

  /**
   * RC2 Fase 3A.1 — bloqueio no salvar (cobre OS nova e edição).
   * Calcula o saldo PROJETADO considerando: total atual da OS, pagamentos já
   * persistidos (apenas OS existente) e o pagamento informado no formulário
   * (contado só quando marcado como pago/recebido — 'fiado' não quita).
   * Retorna { total, pago, pendente } quando deve bloquear; null quando pode salvar.
   */
  function avaliarBloqueioSaldoNoSalvar(
    dados: FormOS,
    pagamento?: PagamentoOSInput
  ): { totalGeral: number; valorPago: number; valorPendente: number } | null {
    if (!temRecurso('os_bloqueio_saldo')) return null
    if (dados.status !== 'entregue' && dados.status !== 'finalizada') return null

    const camposTotais = extrairCamposTotaisOS(dados)
    const totalGeral = calcularTotalGeralDeCampos(camposTotais)
    if (totalGeral <= 0) return null

    const pagoExistente = editando ? calcularValorPagoOS(editando, lancamentos) : 0
    const pagamentoQuita = pagamento
      ? (pagamento.pago ?? pagamento.forma_pagamento !== 'fiado')
      : false
    const pagoAgora = pagamentoQuita ? Math.max(0, pagamento?.valor ?? 0) : 0

    const valorPago = pagoExistente + pagoAgora
    const valorPendente = Math.max(0, totalGeral - valorPago)
    if (valorPendente <= 0.009) return null

    return { totalGeral, valorPago, valorPendente }
  }

  async function mudarStatusNoFormulario(novoStatus: StatusOS) {
    const anterior = form.status
    if (anterior === novoStatus) return

    // RC2 Fase 3A (premium os_bloqueio_saldo): impede entregar/finalizar OS existente
    // com saldo pendente. Reaproveita o cálculo financeiro da própria tela.
    if (editando) {
      const bloqueio = avaliarBloqueioSaldoEntrega(
        { ...editando, status: anterior },
        novoStatus,
        { totalGeral: valorTotal }
      )
      if (bloqueio) {
        const irPagar = await confirmar({
          titulo: 'Esta OS ainda possui saldo pendente',
          mensagem: montarMensagemSaldoPendente(bloqueio),
          confirmarTexto: 'Ir para pagamento',
          cancelarTexto: 'Fechar',
        })
        if (irPagar) setAbaOsMobile('pagamento')
        return
      }
    }

    if (precisaConfirmarMudancaStatus(anterior, novoStatus)) {
      const ok = await confirmar({
        titulo: tituloConfirmacaoStatus(novoStatus),
        mensagem: mensagemConfirmacaoStatus(anterior, novoStatus),
        confirmarTexto: 'Confirmar',
        cancelarTexto: 'Cancelar',
      })
      if (!ok) {
        toast.atencao(MSG.acaoCancelada)
        return
      }
    }

    const patch = patchAoMudarStatus(novoStatus, form.data_saida)
    const eventoStatus = criarEventoAlteracaoStatusOS({
      statusAnteriorLabel: getLabelStatusOS(anterior),
      statusNovoLabel: getLabelStatusOS(novoStatus),
      usuario: user ? { id: user.id, nome: user.nome } : undefined,
    })
    setForm({
      ...form,
      ...patch,
      ...(novoStatus === 'cancelada' ? { status_financeiro: 'cancelado' } : {}),
      historico_eventos: deduplicarHistoricoEventos([
        ...(form.historico_eventos ?? []),
        eventoStatus,
      ]),
    })
    limparErroCampo('status')
  }

  async function alterarStatusNaLista(os: OrdemServico, novoStatus: StatusOS) {
    if (ehDocumentoOrcamento(os)) return
    if (os.status === novoStatus) return

    // RC2 Fase 3A (premium os_bloqueio_saldo): impede entregar/finalizar com saldo pendente.
    const bloqueio = avaliarBloqueioSaldoEntrega(os, novoStatus)
    if (bloqueio) {
      const irPagar = await confirmar({
        titulo: 'Esta OS ainda possui saldo pendente',
        mensagem: montarMensagemSaldoPendente(bloqueio),
        confirmarTexto: 'Ir para pagamento',
        cancelarTexto: 'Fechar',
      })
      if (irPagar) {
        abrirEditar(os)
        setAbaOsMobile('pagamento')
      }
      return
    }

    if (precisaConfirmarMudancaStatus(os.status, novoStatus)) {
      const ok = await confirmar({
        titulo: tituloConfirmacaoStatus(novoStatus),
        mensagem: mensagemConfirmacaoStatus(os.status, novoStatus),
        confirmarTexto: 'Confirmar',
        cancelarTexto: 'Cancelar',
      })
      if (!ok) {
        toast.atencao(MSG.acaoCancelada)
        return
      }
    }

    const eventoStatus = criarEventoAlteracaoStatusOS({
      statusAnteriorLabel: getLabelStatusOS(os.status),
      statusNovoLabel: getLabelStatusOS(novoStatus),
      usuario: user ? { id: user.id, nome: user.nome } : undefined,
    })

    const patch: Partial<OrdemServico> = {
      ...patchAoMudarStatus(novoStatus, os.data_saida),
      ...(novoStatus === 'cancelada' ? { status_financeiro: 'cancelado' } : {}),
      historico_eventos: mesclarHistoricoEventos(os.historico_eventos, [eventoStatus]),
    }

    const vaiBaixar = statusExigeBaixaEstoque(novoStatus) && !os.estoque_baixado
    if (vaiBaixar) {
      const alertas = verificarEstoqueParaBaixaOS(
        os.pecas_utilizadas ?? [],
        pecas,
        os,
        { vaiBaixar: true }
      )
      if (alertas.length > 0) {
        toast.atencao(MSG.estoqueInsuficiente)
        return
      }
    }

    void executar({
      acao: async () => {
        iniciarOperacaoSalvamentoExplicito()
        try {
          if (novoStatus === 'cancelada') {
            for (const pagamento of listarPagamentosOS(os, lancamentos)) {
              atualizarLancamento(pagamento.id, patchCancelamentoPagamentosOS())
            }
          }

          marcarPularPersistenciaRemotaProxima()
          const modoSupabase = getCraftPersistenceMode() === 'supabase'
          const online = typeof navigator !== 'undefined' && navigator.onLine
          if (modoSupabase && online) {
            try {
              // Pull only — nunca push quantity stale antes de cancelar/salvar
              await pullEstoqueDoSupabase(officeId)
            } catch {
              /* segue */
            }
          }
          // Await: cancelamento deve reconciliar demanda vazia na RPC ANTES do sucesso
          await atualizarOS(os.id, patch)

          if (novoStatus === 'cancelada') {
            cancelarMensagensAgendadasDaOs(officeId, os)
            void resolverAlertasDaOsCancelada(officeId, os)
          }

          const dbAtual = localCraftRepository.carregar(officeId)
          const osSalva = dbAtual.ordens_servico.find((o) => o.id === os.id)

          if (modoSupabase && online && osSalva) {
            const resultado = await salvarOsComConfirmacaoSupabase(officeId, osSalva, dbAtual)
            if (!resultado.ok) throw new Error(resultado.mensagem)
          }

          return MSG.statusAlterado
        } finally {
          finalizarOperacaoSalvamentoExplicito()
        }
      },
      sucesso: MSG.statusAlterado,
    })
  }

  async function aprovarOrcamentoNaLista(ordem: OrdemServico) {
    void executar({
      acao: async () => {
        await atualizarOS(ordem.id, patchAprovarOrcamento())
      },
      sucesso: 'Orçamento aprovado.',
    })
  }

  async function recusarOrcamentoNaLista(ordem: OrdemServico) {
    void executar({
      acao: async () => {
        await atualizarOS(ordem.id, patchRecusarOrcamento())
      },
      sucesso: 'Orçamento marcado como recusado.',
    })
  }

  async function converterOrcamentoNaLista(ordem: OrdemServico) {
    if (!podeConverterOrcamentoEmOS(ordem)) return
    void executar({
      acao: async () => {
        const resultado = await converterOrcamentoEmOSComSync(ordem, {
          officeId,
          responsavel: ordem.responsavel?.trim() || session?.user?.nome,
          responsavel_id: ordem.responsavel_id?.trim() || session?.user?.id,
        })
        if (getCraftPersistenceMode() === 'supabase' && typeof navigator !== 'undefined' && navigator.onLine) {
          marcarPularPersistenciaRemotaProxima()
        }
        aplicarDatabase(resultado.db)
        return `Orçamento #${ordem.numero} convertido em OS #${resultado.novaOs.numero}.`
      },
    })
  }

  async function confirmarSalvarComEstoque(dados: FormOS) {
    if (!validarTotalOsAntesSalvar(dados)) return
    if (!validarEstoqueAntesSalvar(dados)) return

    // RC2 Fase 3A.1: bloqueia salvar OS entregue/finalizada com saldo pendente (premium).
    const bloqueioSaldo = avaliarBloqueioSaldoNoSalvar(dados)
    if (bloqueioSaldo) {
      const irPagar = await confirmar({
        titulo: 'Esta OS ainda possui saldo pendente',
        mensagem: montarMensagemSaldoPendente(bloqueioSaldo),
        confirmarTexto: 'Ir para pagamento',
        cancelarTexto: 'Fechar',
      })
      if (irPagar) setAbaOsMobile('pagamento')
      return
    }

    void executar({
      acao: () => executarSalvarComSync(dados),
      erro: MSG.erroSalvar,
    })
  }

  async function registrarPagamentoComConfirmacao(
    os: OrdemServico,
    pagamento: PagamentoOSInput,
    lancamentosLista: LancamentoFinanceiro[],
    exigeValidacaoSupabase: boolean
  ): Promise<'ok' | 'cancelado' | 'invalido'> {
    if (exigeValidacaoSupabase) {
      const dbValidacao = localCraftRepository.carregar(officeId)
      const validacao = await validarOsParaRegistrarPagamento(
        officeId,
        os,
        dbValidacao,
        false
      )
      if (!validacao.ok) {
        toast.atencao(validacao.mensagem ?? MENSAGEM_OS_FALHA_SALVAR)
        return 'invalido'
      }
    }

    const resumoOs = calcularResumoFinanceiroOS(os, lancamentosLista, {
      totalGeral: os.valor_total,
    })
    const validacaoValor = validarValorPagamentoOs(pagamento.valor, resumoOs.valorPendente)
    if (!validacaoValor.ok) {
      toast.atencao(validacaoValor.mensagem)
      return 'invalido'
    }

    const duplicado = encontrarPossivelDuplicidadePagamentoOs(
      os.id,
      pagamento,
      lancamentosLista
    )
    if (duplicado) {
      const ok = await confirmar({
        titulo: MSG.possivelDuplicidadePagamentoTitulo,
        mensagem: MSG.possivelDuplicidadePagamentoMensagem,
        confirmarTexto: MSG.possivelDuplicidadeConfirmar,
        cancelarTexto: 'Cancelar',
      })
      if (!ok) {
        toast.atencao(MSG.pagamentoCancelado)
        return 'cancelado'
      }
    }

    marcarPularPersistenciaRemotaProxima()
    adicionarLancamento(criarInputLancamentoPagamento(os, pagamento, usuarioAtual))
    const dbPos = localCraftRepository.carregar(officeId)
    const lancamentosAtualizados = dbPos.lancamentos
    const novoResumo = calcularResumoFinanceiroOS(os, lancamentosAtualizados, {
      totalGeral: os.valor_total,
    })
    const status = sugerirStatusFinanceiro(novoResumo.totalGeral, novoResumo.valorPago, os.status)
    marcarPularPersistenciaRemotaProxima()
    atualizarOS(os.id, { status_financeiro: status })
    return 'ok'
  }

  async function executarSalvarComSync(
    dadosForm: FormOS,
    opcoes?: { pagamento?: PagamentoOSInput }
  ): Promise<string> {
    let dadosNormalizados: FormOS = {
      ...dadosForm,
      historico_eventos: deduplicarHistoricoEventos(dadosForm.historico_eventos),
    }

    if (responsavelOSMudou(editando, dadosNormalizados)) {
      const eventoResp = criarEventoAtribuicaoResponsavelOS({
        responsavelAnterior: editando?.responsavel,
        responsavelNovo: dadosNormalizados.responsavel,
        usuario: user ? { id: user.id, nome: user.nome } : undefined,
      })
      dadosNormalizados = {
        ...dadosNormalizados,
        historico_eventos: mesclarHistoricoEventos(dadosNormalizados.historico_eventos, [
          eventoResp,
        ]),
      }
    }

    // Congela o snapshot da regra de comissão (não recalcula OS antigas quando a config muda).
    const snapshotComissao = resolverSnapshotComissaoOS(
      {
        responsavel_id: dadosNormalizados.responsavel_id,
        responsavel: dadosNormalizados.responsavel,
        valor_mao_obra: dadosNormalizados.valor_mao_obra,
        valor_pecas: dadosNormalizados.valor_pecas,
        comissao_snapshot: editando?.comissao_snapshot ?? dadosNormalizados.comissao_snapshot,
      },
      editando ?? null,
      perfisComissao
    )
    dadosNormalizados = { ...dadosNormalizados, comissao_snapshot: snapshotComissao }

    if (dadosNormalizados.ajuste_mao_obra?.ativo && !dadosNormalizados.ajuste_mao_obra.motivo_texto?.trim()) {
      throw new Error('Informe o motivo do ajuste manual de mão de obra.')
    }

    iniciarOperacaoSalvamentoExplicito()
    setFaseSalvamento('os')
    try {
      const eraNova = !editando
      const agoraFinalizada = ['finalizada', 'entregue'].includes(dadosNormalizados.status)
      const osId = editando?.id

      if (dadosNormalizados.status === 'cancelada' && osId && editando) {
        for (const pagamento of listarPagamentosOS(editando, lancamentos)) {
          atualizarLancamento(pagamento.id, patchCancelamentoPagamentosOS())
        }
        dadosNormalizados.status_financeiro = 'cancelado'
        cancelarMensagensAgendadasDaOs(officeId, editando)
        void resolverAlertasDaOsCancelada(officeId, editando)
      }

      marcarPularPersistenciaRemotaProxima()

      let osSalva: OrdemServico

      // Puxa movimentos remotas antes do delta — evita 2ª baixa no celular/PC
      const modoSupabasePre = getCraftPersistenceMode() === 'supabase'
      const onlinePre = typeof navigator !== 'undefined' && navigator.onLine
      if (modoSupabasePre && onlinePre) {
        try {
          await pullEstoqueDoSupabase(officeId)
        } catch {
          /* offline/erro: segue com baseline local */
        }
      }

      if (editando) {
        await atualizarOS(editando.id, dadosNormalizados)
        const dbPos = localCraftRepository.carregar(officeId)
        osSalva =
          dbPos.ordens_servico.find((o) => o.id === editando.id) ?? {
            ...editando,
            ...dadosNormalizados,
            valor_total: valorTotal,
          }
      } else {
        const modoSupabaseNovo = getCraftPersistenceMode() === 'supabase'
        const onlineNovo = typeof navigator !== 'undefined' && navigator.onLine

        if (modoSupabaseNovo && !onlineNovo) {
          throw new Error(MSG.semConexao)
        }

        let numeroReservado: number
        if (modoSupabaseNovo) {
          numeroReservado = await reservarProximoNumeroOsSupabase(officeId)
        } else {
          const dbPre = localCraftRepository.carregar(officeId)
          const { resolverProximoNumeroOsDisponivel } = await import(
            '@/services/os-numbering.service'
          )
          numeroReservado = resolverProximoNumeroOsDisponivel(dbPre)
        }

        osSalva = await adicionarOS(dadosNormalizados, { numero: numeroReservado })
      }

      const dbAtual = localCraftRepository.carregar(officeId)
      const modoSupabase = getCraftPersistenceMode() === 'supabase'
      const online = typeof navigator !== 'undefined' && navigator.onLine

      function reverterOsNovaLocal() {
        if (eraNova) excluirOS(osSalva.id)
      }

      function manterOsSalvaNoDialogo() {
        limparAutorizacao()
        setEditando(osSalva)
        setOsSyncTick((t) => t + 1)
      }

      function fecharDialogOsSalva() {
        setDialogAberto(false)
        setEditando(null)
        resetarEstadoDialogo()
        setDialogBaseline('')
      }

      if (modoSupabase && online) {
        const resultado = await salvarOsComConfirmacaoSupabase(officeId, osSalva, dbAtual, {
          eraNova,
        })

        if (!resultado.ok || !resultado.confirmadoSupabase) {
          reverterOsNovaLocal()
          throw new Error(
            opcoes?.pagamento
              ? MSG.osNaoSalvaPagamentoNaoRegistrado
              : (resultado.mensagem || MSG.erroSalvar)
          )
        }

        if (resultado.fallbackLocal) {
          if (opcoes?.pagamento) {
            reverterOsNovaLocal()
            throw new Error(MSG.osNaoSalvaPagamentoNaoRegistrado)
          }
          fecharDialogOsSalva()
          return resultado.mensagem
        }

        if (opcoes?.pagamento && !resultado.service_order_id) {
          reverterOsNovaLocal()
          throw new Error(MSG.osNaoSalvaPagamentoNaoRegistrado)
        }

        if (resultado.service_order_id) {
          setOsSupabaseMeta({
            service_order_id: resultado.service_order_id,
            supabase_id: resultado.service_order_id,
          })
        }

        if (opcoes?.pagamento) {
          setFaseSalvamento('pagamento')
          const idsLancamentosAntes = new Set(dbAtual.lancamentos.map((l) => l.id))
          marcarPularPersistenciaRemotaProxima()
          const osParaPagamento = { ...osSalva, valor_total: valorTotal }

          const resultadoPag = await registrarPagamentoComConfirmacao(
            osParaPagamento,
            opcoes.pagamento,
            localCraftRepository.carregar(officeId).lancamentos,
            true
          )

          if (resultadoPag === 'invalido') {
            manterOsSalvaNoDialogo()
            throw new Error(MSG.erroSalvar)
          }
          if (resultadoPag === 'cancelado') throw new Error(MSG.pagamentoCancelado)

          const dbPosPag = localCraftRepository.carregar(officeId)
          const novoLancamento = obterUltimoLancamentoOs(
            dbPosPag.lancamentos,
            osSalva.id,
            idsLancamentosAntes
          )

          if (!novoLancamento) {
            manterOsSalvaNoDialogo()
            throw new Error(MSG.erroSalvar)
          }

          marcarPularPersistenciaRemotaProxima()
          const syncPag = await sincronizarPagamentoNoSupabase(officeId, novoLancamento.id)
          if (!syncPag.ok) {
            manterOsSalvaNoDialogo()
            throw new Error(syncPag.mensagem)
          }

          fecharDialogOsSalva()
          if (agoraFinalizada && temRecurso('lembretes')) {
            setOsParaLembretes(osSalva)
            setDialogLembretesAberto(true)
          }
          return syncPag.offline ? syncPag.mensagem : MSG.osEPagamentoRegistrados
        }

        fecharDialogOsSalva()
        if (agoraFinalizada && temRecurso('lembretes')) {
          setOsParaLembretes(osSalva)
          setDialogLembretesAberto(true)
        }
        return resultado.mensagem
      }

      if (modoSupabase && !online && opcoes?.pagamento && eraNova) {
        reverterOsNovaLocal()
        throw new Error(MSG.osNaoSalvaPagamentoNaoRegistrado)
      }

      const mensagemLocal = online ? MSG.osSalva : MSG.semConexao

      if (opcoes?.pagamento) {
        setFaseSalvamento('pagamento')
        marcarPularPersistenciaRemotaProxima()
        const resultadoPag = await registrarPagamentoComConfirmacao(
          osSalva,
          opcoes.pagamento,
          dbAtual.lancamentos,
          false
        )
        if (resultadoPag === 'invalido') {
          manterOsSalvaNoDialogo()
          throw new Error(MSG.erroSalvar)
        }
        if (resultadoPag === 'cancelado') throw new Error(MSG.pagamentoCancelado)

        fecharDialogOsSalva()
        if (agoraFinalizada && temRecurso('lembretes')) {
          setOsParaLembretes(osSalva)
          setDialogLembretesAberto(true)
        }
        return modoSupabase && !online ? MSG.semConexao : MSG.osEPagamentoRegistrados
      }

      fecharDialogOsSalva()
      if (agoraFinalizada && temRecurso('lembretes')) {
        setOsParaLembretes(osSalva)
        setDialogLembretesAberto(true)
      }
      return mensagemLocal
    } finally {
      setFaseSalvamento('idle')
      finalizarOperacaoSalvamentoExplicito()
    }
  }

  async function handleSalvarOsEPagamento(pagamento: PagamentoOSInput): Promise<boolean> {
    if (!verificarEscrita()) return false
    const resultado = validarFormularioOS(form)
    if (!resultado.valido) {
      setErrosValidacao(resultado)
      rolarParaPrimeiroErro(resultado)
      toast.atencao('Verifique os campos obrigatórios da OS.')
      return false
    }
    setErrosValidacao(null)

    const dadosSalvar = prepararDadosSalvar()
    if (!validarTotalOsAntesSalvar(dadosSalvar)) return false
    if (!validarEstoqueAntesSalvar(dadosSalvar)) return false

    // RC2 Fase 3A.1: bloqueia salvar entregue/finalizada com saldo pendente (premium),
    // considerando o pagamento informado no formulário (saldo projetado).
    const bloqueioSaldo = avaliarBloqueioSaldoNoSalvar(dadosSalvar, pagamento)
    if (bloqueioSaldo) {
      const irPagar = await confirmar({
        titulo: 'Esta OS ainda possui saldo pendente',
        mensagem: montarMensagemSaldoPendente(bloqueioSaldo),
        confirmarTexto: 'Ir para pagamento',
        cancelarTexto: 'Fechar',
      })
      if (irPagar) setAbaOsMobile('pagamento')
      return false
    }

    return (
      (await executar({
        acao: () => executarSalvarComSync(dadosSalvar, { pagamento }),
        erro: MSG.erroSalvar,
      })) ?? false
    )
  }

  function salvarPrincipal() {
    if (!verificarEscrita()) return
    const resultado = validarFormularioOS(form)
    if (!resultado.valido) {
      setErrosValidacao(resultado)
      rolarParaPrimeiroErro(resultado)
      toast.atencao('Verifique os campos obrigatórios.')
      return
    }
    setErrosValidacao(null)

    if (pagamentoPreenchido && podeRegistrarPagamento) {
      void handleSalvarOsEPagamento(pagamentoForm)
      return
    }

    void confirmarSalvarComEstoque(prepararDadosSalvar())
  }

  const labelBotaoPrincipal = useMemo(() => {
    if (faseSalvamento === 'os') return MSG.salvandoOs
    if (faseSalvamento === 'pagamento') return MSG.registrandoPagamento
    if (salvando) return 'Salvando…'
    if (pagamentoPreenchido && podeRegistrarPagamento) return 'Salvar OS e registrar pagamento'
    return 'Salvar OS'
  }, [faseSalvamento, pagamentoPreenchido, podeRegistrarPagamento, salvando])

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
    logDevAbrirVisualizacaoOs(os.id)
    navigate(rotaVisualizarOs(os))
  }

  async function exportarPdf(os: OrdemServico) {
    if (!temRecurso('pdf_os')) {
      window.alert('Exportação PDF disponível a partir do plano Profissional.')
      return
    }
    const cliente = clientes.find((c) => c.id === os.cliente_id)
    const moto = motos.find((m) => m.id === os.moto_id)
    if (!cliente || !moto) {
      window.alert(`Cliente ou ${termos.palavraVeiculo} não encontrados para esta OS.`)
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
    const pagamento = listarPagamentosOS(os, lancamentos).find((p) => p.id === pagamentoId)

    if (!cliente || !moto) {
      window.alert(`Cliente ou ${termos.palavraVeiculo} não encontrados para esta OS.`)
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
            Nova OS / Orçamento
          </Button>
        }
      />

      <AvisoLimitePlano tipo="os_mes" />

      {filtros.pagamentoPendente && (
        <FiltroAtivoBanner
          mensagem={`Exibindo apenas ordens de serviço com saldo pendente de pagamento (${ordensFiltradas.length} ${ordensFiltradas.length === 1 ? 'OS' : 'OS'}).`}
          onLimpar={() => {
            setFiltros((f) => ({ ...f, pagamentoPendente: false }))
            setSearchParams({}, { replace: true })
          }}
        />
      )}

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
              <div className="grid gap-1 sm:col-span-2 lg:col-span-4">
                <Label className="text-xs">Tipo de documento</Label>
                <Select
                  value={filtros.tipoDocumento ?? 'todos'}
                  onValueChange={(v) =>
                    setFiltros({ ...filtros, tipoDocumento: v as FiltroTipoDocumentoOS })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTROS_TIPO_DOCUMENTO.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            {paginacaoOrdens.itensPagina.length !== ordensFiltradas.length &&
              ` — exibindo ${paginacaoOrdens.itensPagina.length} na página`}
            {numerosOsDuplicados.size > 0 && (
              <span className="text-amber-600 dark:text-amber-300">
                {' '}
                · Atenção: {numerosOsDuplicados.size} número
                {numerosOsDuplicados.size !== 1 ? 's' : ''} duplicado
                {numerosOsDuplicados.size !== 1 ? 's' : ''} (use Admin → Auditar numeração)
              </span>
            )}
          </p>

          <div className="overflow-x-auto hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Previsão</TableHead>
                  <TableHead>Saída</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>{termos.veiculo} / Placa</TableHead>
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
                  paginacaoOrdens.itensPagina.map((item) => {
                    const os = item.os
                    const clienteOs = clientes.find((c) => c.id === os.cliente_id)
                    return (
                      <TableRow key={os.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          #{os.numero}
                          {ehDocumentoOrcamento(os) && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              Orçamento
                            </Badge>
                          )}
                          {numerosOsDuplicados.has(os.numero) && (
                            <span
                              className="ml-1 text-[10px] font-normal text-amber-600 dark:text-amber-300"
                              title="Número duplicado — verifique no Admin"
                            >
                              dup.
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatarData(item.dataEntrada)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {item.dataPrevisao ? formatarData(item.dataPrevisao) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {item.dataSaida ? formatarData(item.dataSaida) : '—'}
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
                          {item.criadoPorNome && (
                            <span className="block text-[11px] text-muted-foreground/80 truncate">
                              Aberta por {item.criadoPorNome}
                            </span>
                          )}
                          {os.responsavel?.trim() && (
                            <span className="block text-[11px] text-muted-foreground/80 truncate">
                              Resp.: {os.responsavel.trim()}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {orcamentoEstaConvertido(os) ? (
                            <OrcamentoConvertidoListagemInfo os={os} ordens={ordens} />
                          ) : (
                            <ListagemStatusDocumento
                              os={os}
                              onAlterarStatusOS={(status) => void alterarStatusNaLista(os, status)}
                              premium={temRecurso('os_bloqueio_saldo')}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {item.exibirFinanceiro ? (
                            <CondicaoFinanceiraOSBadge
                              statusFinanceiro={item.statusFinanceiro}
                              valorPendente={item.valorPendente}
                            />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatarMoeda(item.totalGeral)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {item.exibirFinanceiro ? (
                            item.valorPendente > 0 ? (
                              <span className="text-amber-400">
                                {formatarMoeda(item.valorPendente)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                {formatarMoeda(0)}
                              </span>
                            )
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            {orcamentoEstaConvertido(os) && (
                              <BotaoVerOsGerada os={os} ordens={ordens} />
                            )}
                            {!orcamentoEstaConvertido(os) && ehDocumentoOrcamento(os) && (
                              <OrcamentoFluxoAcoes
                                os={os}
                                onAprovar={() => aprovarOrcamentoNaLista(os)}
                                onRecusar={() => recusarOrcamentoNaLista(os)}
                                onConverter={() => converterOrcamentoNaLista(os)}
                                compact
                              />
                            )}
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
                            {clienteOs && (() => {
                              const motoOs = motos.find((m) => m.id === os.moto_id)
                              if (!motoOs) return null
                              return (
                                <BotaoEnviarWhatsAppOs
                                  os={os}
                                  cliente={clienteOs}
                                  moto={motoOs}
                                  variant="icon"
                                  exibirValores={item.exibirFinanceiro || ehDocumentoOrcamento(os)}
                                />
                              )
                            })()}
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              title="Ver OS"
                            >
                              <Link
                                to={rotaVisualizarOs(os)}
                                onClick={() => logDevAbrirVisualizacaoOs(os.id)}
                                aria-label="Ver ordem de serviço"
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
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
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => abrirEditar(os)}
                              title="Editar OS"
                              aria-label="Editar ordem de serviço"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmarExclusao(os)}
                              title="Excluir OS"
                              aria-label="Excluir ordem de serviço"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            <PaginacaoLista
              pagina={paginacaoOrdens.pagina}
              totalPaginas={paginacaoOrdens.totalPaginas}
              total={paginacaoOrdens.total}
              tamanhoPagina={paginacaoOrdens.tamanhoPagina}
              onPaginaChange={paginacaoOrdens.irPagina}
            />
          </div>

          <div className="md:hidden space-y-3">
            {paginacaoOrdens.itensPagina.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma ordem de serviço encontrada.
              </p>
            ) : (
              paginacaoOrdens.itensPagina.map((item) => {
                const os = item.os
                const clienteOs = clientes.find((c) => c.id === os.cliente_id)
                return (
                  <Card key={os.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-lg font-semibold flex items-center gap-2">
                            {ehDocumentoOrcamento(os) ? 'Orçamento' : 'OS'} #{os.numero}
                            {ehDocumentoOrcamento(os) && (
                              <Badge variant="secondary" className="text-[10px]">
                                Orçamento
                              </Badge>
                            )}
                          </p>
                          <p className="text-sm font-medium">{item.clienteNome}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.motoLabel}
                            {item.motoPlaca ? ` · ${item.motoPlaca}` : ''}
                          </p>
                          {os.responsavel?.trim() && (
                            <p className="text-xs text-muted-foreground">
                              Resp.: {os.responsavel.trim()}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {orcamentoEstaConvertido(os) ? (
                            <OrcamentoConvertidoListagemInfo os={os} ordens={ordens} compact />
                          ) : (
                            <ListagemStatusDocumento
                              os={os}
                              onAlterarStatusOS={(status) => void alterarStatusNaLista(os, status)}
                              premium={temRecurso('os_bloqueio_saldo')}
                            />
                          )}
                          {item.exibirFinanceiro && (
                            <CondicaoFinanceiraOSBadge
                              statusFinanceiro={item.statusFinanceiro}
                              valorPendente={item.valorPendente}
                            />
                          )}
                        </div>
                      </div>
                      {orcamentoEstaConvertido(os) && (
                        <BotaoVerOsGerada os={os} ordens={ordens} className="w-full" />
                      )}
                      {!orcamentoEstaConvertido(os) && ehDocumentoOrcamento(os) && (
                        <OrcamentoFluxoAcoes
                          os={os}
                          onAprovar={() => aprovarOrcamentoNaLista(os)}
                          onRecusar={() => recusarOrcamentoNaLista(os)}
                          onConverter={() => converterOrcamentoNaLista(os)}
                          compact
                        />
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Entrada: {formatarData(item.dataEntrada)}</span>
                        {(item.exibirFinanceiro || ehDocumentoOrcamento(os)) && (
                          <span className="font-medium">{formatarMoeda(item.totalGeral)}</span>
                        )}
                        {item.exibirFinanceiro && item.valorPendente > 0 && (
                          <span className="text-amber-400 text-xs">
                            Saldo: {formatarMoeda(item.valorPendente)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="lg"
                          className="h-11"
                          asChild
                        >
                          <Link
                            to={rotaVisualizarOs(os)}
                            onClick={() => logDevAbrirVisualizacaoOs(os.id)}
                            aria-label="Ver ordem de serviço"
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Ver
                          </Link>
                        </Button>
                        <Button variant="outline" size="lg" className="h-11" onClick={() => abrirEditar(os)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </Button>
                        {(podeRegistrarPagamento || podeRegistrarPagamentoComPin) && item.exibirFinanceiro && (
                          <Button
                            variant="outline"
                            size="lg"
                            className="h-11"
                            onClick={() => abrirEditar(os)}
                          >
                            <Wallet className="mr-2 h-4 w-4" />
                            Pagamento
                          </Button>
                        )}
                        {temRecurso('pdf_os') && item.exibirFinanceiro && (
                          <Button
                            variant="outline"
                            size="lg"
                            className="h-11"
                            disabled={!!gerandoReciboId}
                            onClick={() => {
                              const pagamento = listarPagamentosOS(os, lancamentos).find((p) => p.pago)
                              if (pagamento) {
                                void gerarRecibo(os, pagamento.id)
                              } else {
                                abrirVisualizacao(os)
                              }
                            }}
                          >
                            {gerandoReciboId ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Receipt className="mr-2 h-4 w-4" />
                            )}
                            Recibo
                          </Button>
                        )}
                        {clienteOs && (() => {
                          const motoOs = motos.find((m) => m.id === os.moto_id)
                          if (!motoOs) return null
                          return (
                            <div className="col-span-2">
                              <BotaoEnviarWhatsAppOs
                                os={os}
                                cliente={clienteOs}
                                moto={motoOs}
                                className="w-full h-11"
                                exibirValores={item.exibirFinanceiro}
                              />
                            </div>
                          )
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
            <PaginacaoLista
              pagina={paginacaoOrdens.pagina}
              totalPaginas={paginacaoOrdens.totalPaginas}
              total={paginacaoOrdens.total}
              tamanhoPagina={paginacaoOrdens.tamanhoPagina}
              onPaginaChange={paginacaoOrdens.irPagina}
            />
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

      <MotoHistoricoDialog
        moto={historicoMotoPlaca}
        ordens={ordens}
        clientes={clientes}
        aberto={!!historicoMotoPlaca}
        onFechar={() => setHistoricoMotoPlaca(null)}
      />

      {dialogAberto && (
      <Dialog
        open
        onOpenChange={(open) => {
          if (open) {
            setDialogAberto(true)
            return
          }
          void tentarFecharDialog()
        }}
      >
        <DialogContent
          className="max-w-3xl w-full max-lg:max-w-none overflow-x-hidden"
          onPointerDownOutside={prevenirFechamentoDialogPorPortal}
          onInteractOutside={prevenirFechamentoDialogPorPortal}
        >
          <DialogHeader>
            <DialogTitle>
              {editando
                ? ehDocumentoOrcamento(editando)
                  ? `Editar orçamento #${editando.numero}`
                  : `Editar OS #${editando.numero}`
                : form.modo_documento === 'orcamento'
                  ? 'Novo orçamento'
                  : 'Nova ordem de serviço'}
            </DialogTitle>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status atual:</span>
                <StatusOSBadge status={form.status} />
                <span className="text-sm text-muted-foreground">{getLabelStatusOS(form.status)}</span>
              </div>
              {editando && (() => {
                const clienteEdit = clientes.find((c) => c.id === editando.cliente_id)
                const motoEdit = motos.find((m) => m.id === editando.moto_id)
                if (!clienteEdit || !motoEdit) return null
                return (
                  <BotaoEnviarWhatsAppOs
                    os={editando}
                    cliente={clienteEdit}
                    moto={motoEdit}
                    exibirValores={podeVerFinanceiro}
                  />
                )
              })()}
            </div>
          </DialogHeader>

          {errosValidacao && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {errosValidacao.mensagemGeral}
            </div>
          )}

          {isMobileOs && (
            <Tabs value={abaOsMobile} onValueChange={setAbaOsMobile} className="w-full min-w-0">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="dados" className="flex-1 min-w-[4.5rem]">
                  Dados
                </TabsTrigger>
                <TabsTrigger value="servicos" className="flex-1 min-w-[4.5rem]">
                  Serviços
                </TabsTrigger>
                <TabsTrigger value="pecas" className="flex-1 min-w-[4.5rem]">
                  Peças
                </TabsTrigger>
                <TabsTrigger value="pagamento" className="flex-1 min-w-[4.5rem]">
                  Pagamento
                </TabsTrigger>
                <TabsTrigger value="historico" className="flex-1 min-w-[4.5rem]">
                  Histórico
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <div className="grid gap-4 sm:grid-cols-2 min-w-0 overflow-x-hidden">
            {mostrarAbaOs('dados') && (
              <>
            <div className="sm:col-span-2">
              <ModoDocumentoOSSection
                modo={form.modo_documento ?? 'os'}
                onChange={(modo) => setForm((f) => aplicarModoDocumentoNoForm(f, modo))}
                desabilitado={Boolean(editando)}
              />
            </div>
            {ehDocumentoOrcamento(form) && (
              <div className="sm:col-span-2">
                <OrcamentoOSSection
                  dataOrcamento={form.data_orcamento}
                  dataValidade={form.data_previsao}
                  statusOrcamento={form.status_orcamento}
                  observacoesOrcamento={form.observacoes_orcamento}
                  osParaAcoes={editando ?? undefined}
                  onChange={(patch) => setForm({ ...form, ...patch })}
                  onAprovar={
                    editando
                      ? () => aprovarOrcamentoNaLista(editando)
                      : undefined
                  }
                  onRecusar={
                    editando
                      ? () => recusarOrcamentoNaLista(editando)
                      : undefined
                  }
                  onConverter={
                    editando
                      ? () => converterOrcamentoNaLista(editando)
                      : undefined
                  }
                  acoesDesabilitadas={salvando}
                />
              </div>
            )}
            <div id="os-campo-cliente" className="grid gap-2 min-w-0">
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
            <div id="os-campo-moto" className="grid gap-2 min-w-0">
              <Label>{termos.veiculo} *</Label>
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

            {/* Logo após cliente/moto e antes da busca por placa — visível na aba Dados no mobile */}
            <ResponsavelOSSelect
              responsavelId={form.responsavel_id}
              responsavelNome={form.responsavel}
              disabled={!podeAtribuirResponsavel}
              onChange={(valor) =>
                setForm((f) => ({
                  ...f,
                  responsavel_id: valor.responsavel_id,
                  responsavel: valor.responsavel,
                }))
              }
            />

            <div className="col-span-full min-w-0">
              <BuscaPlacaOsSection
                key={editando?.id ?? 'nova-os'}
                motos={motos}
                clientes={clientes}
                ordens={ordens}
                motoSelecionadaId={form.moto_id || undefined}
                exibirFinanceiro={podeVerFinanceiro}
                labelVeiculo={termos.veiculo.toLowerCase()}
                onUsarVeiculo={usarVeiculoDoHistoricoPlaca}
                onVerHistoricoCompleto={setHistoricoMotoPlaca}
                onFiltrarPorPlaca={filtrarListaPorPlaca}
              />
            </div>

            {modoOsCompleta && (
            <div className="sm:col-span-2">
              <DatasCicloOSSection
                dataEntrada={form.data_entrada ?? dataHojeLocal()}
                dataPrevisao={form.data_previsao}
                dataSaida={form.data_saida}
                onChange={(patch) => setForm({ ...form, ...patch })}
              />
            </div>
            )}

            {modoOsCompleta && form.checklist_entrada && (
              <div className="sm:col-span-2">
                <ChecklistEntradaForm
                  value={form.checklist_entrada}
                  onChange={(checklist_entrada) => {
                    setForm((f) => ({ ...f, checklist_entrada }))
                    limparErroCampo('checklist')
                  }}
                  modelos={modelosSeguros}
                  officeId={officeId}
                  tipoOficina={tipoOficina}
                  errosItens={errosValidacao?.errosChecklistItens ?? []}
                  temErroSecao={campoTemErro(errosValidacao, 'checklist')}
                  mensagemErroSecao={obterMensagemErroCampo(errosValidacao, 'checklist')}
                />
              </div>
            )}

            {modoOsCompleta && (
              <div className="sm:col-span-2">
                <RecursoPlanoGate recurso="fotos_antes_depois">
                  <FotosOSSection
                    osId={editando?.id}
                    osNumero={editando?.numero}
                    officeId={officeId}
                    podeAdicionar={podePreencherChecklist(user, configuracao)}
                    createdBy={user?.id}
                    createdByName={user?.nome}
                  />
                </RecursoPlanoGate>
              </div>
            )}

            {modoOsCompleta && (
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
            )}

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
            {modoOsCompleta && (
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="diagnostico">Diagnóstico</Label>
              <Textarea
                id="diagnostico"
                value={form.diagnostico}
                onChange={(e) => setForm({ ...form, diagnostico: e.target.value })}
              />
            </div>
            )}
              </>
            )}

            {mostrarAbaOs('servicos') && (
            <div className="sm:col-span-2 min-w-0">
              <ServicosOSSection
                form={form}
                catalogo={servicosCatalogo}
                pecas={pecas}
                user={user ?? null}
                configuracao={configuracao}
                onSolicitarAutorizacaoPin={solicitarPinValores}
                onRegistrarAlteracaoValor={registrarAlteracaoValorOs}
                onChange={atualizarFormServicosOS}
                onSalvarServicoNoCatalogo={salvarServicoManualNoCatalogo}
              />
            </div>
            )}

            {mostrarAbaOs('pecas') && (
            <div className="sm:col-span-2 min-w-0">
              <PecasOSUtilizadasSection
                form={form}
                pecasEstoque={pecas}
                user={user ?? null}
                configuracao={configuracao}
                onSolicitarAutorizacaoPin={solicitarPinValores}
                onRegistrarAlteracaoValor={registrarAlteracaoValorOs}
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
            )}

            {mostrarAbaOs('pagamento') && (
              <>
            {podeVerFinanceiro && (
              <div className="sm:col-span-2 min-w-0">
                <ResumoFinanceiroOSSection
                  form={form}
                  valorTotal={valorTotal}
                  os={editando}
                  lancamentos={lancamentos}
                  user={user ?? null}
                  configuracao={configuracao}
                  onSolicitarAutorizacaoPin={solicitarPinValores}
                  onRegistrarAlteracaoValor={registrarAlteracaoValorOs}
                  pecasEstoque={pecas}
                  onChange={(patch) => setForm({ ...form, ...patch })}
                />
              </div>
            )}

            {podeVerSecaoPagamento && !ehDocumentoOrcamento(editando ?? form) && (
              <div className="sm:col-span-2 min-w-0">
                {temRecurso('financeiro_completo') || podeRegistrarPagamentoComPin ? (
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
                    podeRegistrarComPin={podeRegistrarPagamentoComPin}
                    onSolicitarAutorizacaoPin={solicitarPinValores}
                    onRegistrarHistoricoOs={(evento) =>
                      setForm((prev) => ({
                        ...prev,
                        historico_eventos: deduplicarHistoricoEventos([
                          ...(prev.historico_eventos ?? []),
                          evento,
                        ]),
                      }))
                    }
                    podeEditar={podeEditarPagamento}
                    podeExcluir={podeExcluirPagamento}
                    podeGerarRecibo={temRecurso('pdf_os') && podeRegistrarPagamento}
                    onChangeOs={(pag) => setForm({ ...form, ...pag })}
                    osSyncTick={osSyncTick}
                    osSupabaseMeta={osSupabaseMeta}
                    onSalvarOsEPagamento={handleSalvarOsEPagamento}
                    salvandoOs={salvando}
                    osNova={!editando}
                    faseSalvamento={faseSalvamento}
                    onPagamentoFormChange={(pag, preenchido) => {
                      setPagamentoForm(pag)
                      setPagamentoPreenchido(preenchido)
                    }}
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
              </>
            )}

            {mostrarAbaOs('historico') && (
            <div className="sm:col-span-2 min-w-0">
              <HistoricoEventosOSSection
                eventos={deduplicarHistoricoEventos(
                  form.historico_eventos ?? editando?.historico_eventos ?? []
                )}
                compact
              />
            </div>
            )}

            <div className="sm:col-span-2 min-w-0">
            <FechamentoOSSection
              modoCompleto={modoOsCompleta}
              form={form}
              dataBaseGarantia={editando?.atualizado_em ?? dataHojeLocal()}
              errosValidacao={errosValidacao}
              opcoesStatus={listarStatusOSSelecionaveis({
                premium: temRecurso('os_bloqueio_saldo'),
                statusAtual: form.status,
              })}
              onMudarStatus={(status) => void mudarStatusNoFormulario(status)}
              onChange={(patch) => setForm({ ...form, ...patch })}
              acoes={
                <>
                  <Button variant="outline" onClick={() => void tentarFecharDialog()} disabled={salvando}>
                    Cancelar
                  </Button>
                  <Button onClick={salvarPrincipal} disabled={salvando || faseSalvamento !== 'idle'}>
                    {salvando || faseSalvamento !== 'idle' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {labelBotaoPrincipal}
                      </>
                    ) : (
                      labelBotaoPrincipal
                    )}
                  </Button>
                </>
              }
            />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

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
