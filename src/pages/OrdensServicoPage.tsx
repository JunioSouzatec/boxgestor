import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, FileDown, Eye, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { StatusOSRapido } from '@/components/shared/StatusOSRapido'
import { StatusOrcamentoBadge } from '@/components/shared/StatusBadges'
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
import { useAssinatura } from '@/context/AssinaturaContext'
import { AvisoLimitePlano } from '@/components/plano/AvisoLimitePlano'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { BotaoWhatsApp } from '@/components/comunicacao/BotaoWhatsApp'
import { CriarLembretesOSDialog } from '@/components/lembretes/CriarLembretesOSDialog'
import { OsVisualizacaoDialog } from '@/components/os/OsVisualizacaoDialog'
import { buildOsDocumentoViewModel, exportarOsPdf } from '@/services/os-pdf.service'
import { exportarReciboPdf } from '@/services/recibo-pdf.service'
import {
  listarPagamentosOS,
  patchCancelamentoPagamentosOS,
} from '@/services/os-pagamento.service'
import {
  podeEditarPagamentoOS,
  podeExcluirPagamentoOS,
  podeRegistrarPagamentoOS,
  podeVerValoresFinanceirosOS,
} from '@/services/auth/permissions'
import { calcularVencimentoGarantia, criarChecklistVazio, normalizarChecklist } from '@/lib/os'
import { sincronizarTotaisOSServicos } from '@/services/servico-catalogo.service'
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
import { cn, formatarMoeda } from '@/lib/utils'
import { MensagemCampoErro } from '@/components/shared/MensagemCampoErro'
import type { ChecklistEntrada } from '@/types/checklist'
import type { ModeloChecklist, OrdemServico, StatusOS } from '@/types'
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
}

function criarFormVazio(modelos: ModeloChecklist[], officeId: string): FormOS {
  return {
    ...formBase,
    checklist_entrada: criarChecklistVazio(modelos, officeId),
  }
}

export function OrdensServicoPage() {
  const { session } = useAuth()
  const { adicionarOS, atualizarOS, excluirOS, atualizarLancamento, adicionarPeca } = useCraft()
  const { ordens, clientes, motos, pecas, configuracao, lancamentos, modelosChecklist, servicosCatalogo } =
    useOficinaData()
  const officeId = configuracao.office_id ?? configuracao.oficina_id
  const modelosSeguros = useMemo(
    () => garantirChecklistPadrao(modelosChecklist, officeId),
    [modelosChecklist, officeId]
  )
  const { limiteAtingido, temRecurso } = useAssinatura()
  const papel = session?.user.papel ?? 'dono'
  const podeVerFinanceiro = podeVerValoresFinanceirosOS(papel)
  const podeRegistrarPagamento = podeRegistrarPagamentoOS(papel)
  const podeEditarPagamento = podeEditarPagamentoOS(papel)
  const podeExcluirPagamento = podeExcluirPagamentoOS(papel)
  const usuarioAtual = session?.user
    ? { id: session.user.id, nome: session.user.nome }
    : undefined
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [dialogLembretesAberto, setDialogLembretesAberto] = useState(false)
  const [osParaLembretes, setOsParaLembretes] = useState<OrdemServico | null>(null)
  const [editando, setEditando] = useState<OrdemServico | null>(null)
  const [form, setForm] = useState<FormOS>(() => criarFormVazio([], OFFICE_ID))
  const [errosValidacao, setErrosValidacao] = useState<ResultadoValidacaoOS | null>(null)
  const [osVisualizando, setOsVisualizando] = useState<OrdemServico | null>(null)
  const [exportandoPdfId, setExportandoPdfId] = useState<string | null>(null)
  const [gerandoReciboId, setGerandoReciboId] = useState<string | null>(null)

  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'
  const getMotoLabel = (id: string) => {
    const m = motos.find((mo) => mo.id === id)
    return m ? `${m.marca} ${m.modelo} (${m.placa})` : '—'
  }

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
  const usaServicosCatalogo = (form.servicos_itens?.length ?? 0) > 0

  const ordensFiltradas = ordens.filter(
    (o) =>
      String(o.numero).includes(busca) ||
      getClienteNome(o.cliente_id).toLowerCase().includes(busca.toLowerCase()) ||
      getMotoLabel(o.moto_id).toLowerCase().includes(busca.toLowerCase())
  )

  function limparErroCampo(campo: CampoOSForm) {
    setErrosValidacao((prev) => removerErroCampo(prev, campo))
  }

  function abrirNova() {
    if (limiteAtingido('os_mes')) return
    setEditando(null)
    setForm(criarFormVazio(modelosSeguros, officeId))
    setErrosValidacao(null)
    setDialogAberto(true)
  }

  function abrirEditar(os: OrdemServico) {
    setEditando(os)
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
      quilometragem_entrada: os.quilometragem_entrada,
      quilometragem_saida: os.quilometragem_saida,
      dias_garantia: os.dias_garantia,
      data_vencimento_garantia: os.data_vencimento_garantia,
      status_financeiro: os.status_financeiro,
      vencimento_pagamento: os.vencimento_pagamento,
      observacoes_pagamento: os.observacoes_pagamento,
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

  function confirmarSalvarComEstoque(dados: FormOS) {
    const alertas = verificarEstoqueInsuficiente(dados.pecas_utilizadas ?? [], pecas)
    const vaiFinalizar = ['finalizada', 'entregue'].includes(dados.status)
    const jaBaixado = editando?.estoque_baixado

    if (vaiFinalizar && !jaBaixado && alertas.length > 0) {
      const msg = alertas
        .map((a) => `${a.nome}: necessário ${a.necessario}, disponível ${a.disponivel}`)
        .join('\n')
      if (
        !window.confirm(
          `Estoque insuficiente para:\n${msg}\n\nDeseja finalizar mesmo assim? O estoque será baixado até zero.`
        )
      ) {
        return
      }
    }
    executarSalvar(dados)
  }

  function executarSalvar(dados: FormOS) {
    const agoraFinalizada = ['finalizada', 'entregue'].includes(dados.status)
    const osId = editando?.id

    if (dados.status === 'cancelada' && osId) {
      for (const pagamento of listarPagamentosOS(osId, lancamentos)) {
        atualizarLancamento(pagamento.id, patchCancelamentoPagamentosOS())
      }
      dados.status_financeiro = 'cancelado'
    }

    let osSalva: OrdemServico

    if (editando) {
      atualizarOS(editando.id, dados)
      osSalva = { ...editando, ...dados }
    } else {
      osSalva = adicionarOS(dados)
    }

    setDialogAberto(false)

    if (agoraFinalizada && temRecurso('lembretes')) {
      setOsParaLembretes(osSalva)
      setDialogLembretesAberto(true)
    }
  }

  function salvar() {
    const resultado = validarFormularioOS(form)
    if (!resultado.valido) {
      setErrosValidacao(resultado)
      rolarParaPrimeiroErro(resultado)
      return
    }

    setErrosValidacao(null)
    confirmarSalvarComEstoque(prepararDadosSalvar())
  }

  function confirmarExclusao(os: OrdemServico) {
    if (window.confirm(`Excluir a OS #${os.numero}?`)) {
      excluirOS(os.id)
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
      await exportarReciboPdf(os, pagamento, cliente, moto, configuracao)
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
          <BuscaInput
            valor={busca}
            onChange={setBusca}
            placeholder="Buscar por número, cliente ou moto..."
            className="mb-4 max-w-sm"
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OS</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Moto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Orçamento</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordensFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhuma ordem de serviço encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                [...ordensFiltradas]
                  .sort((a, b) => b.numero - a.numero)
                  .map((os) => (
                    <TableRow key={os.id}>
                      <TableCell className="font-medium">#{os.numero}</TableCell>
                      <TableCell>{getClienteNome(os.cliente_id)}</TableCell>
                      <TableCell>{getMotoLabel(os.moto_id)}</TableCell>
                      <TableCell>
                        <StatusOSRapido
                          status={os.status}
                          onAlterarStatus={(status) => atualizarOS(os.id, { status })}
                        />
                      </TableCell>
                      <TableCell>
                        {os.status_orcamento ? (
                          <StatusOrcamentoBadge status={os.status_orcamento} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatarMoeda(os.valor_total)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {(() => {
                            const clienteOs = clientes.find((c) => c.id === os.cliente_id)
                            const motoOs = motos.find((m) => m.id === os.moto_id)
                            return clienteOs ? (
                              <BotaoWhatsApp cliente={clienteOs} moto={motoOs} os={os} />
                            ) : null
                          })()}
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
                  ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={dialogAberto}
        onOpenChange={(open) => {
          setDialogAberto(open)
          if (!open) setErrosValidacao(null)
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

            <div className="sm:col-span-2">
              <OrcamentoOSSection
                valorEstimado={form.valor_estimado}
                dataOrcamento={form.data_orcamento}
                statusOrcamento={form.status_orcamento}
                onChange={(orc) => setForm({ ...form, ...orc })}
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
                        })
                    : undefined
                }
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
                  maoObraAutomatica={usaServicosCatalogo}
                  onChange={(patch) => setForm({ ...form, ...patch })}
                />
              </div>
            )}

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
              <Button onClick={salvar}>Salvar</Button>
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
