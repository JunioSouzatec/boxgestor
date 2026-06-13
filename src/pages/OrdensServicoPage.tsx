import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, FileDown, Eye, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { StatusOSRapido } from '@/components/shared/StatusOSRapido'
import { StatusOrcamentoBadge } from '@/components/shared/StatusBadges'
import { ChecklistEntradaForm } from '@/components/os/ChecklistEntradaForm'
import { OrcamentoOSSection } from '@/components/os/OrcamentoOSSection'
import { GarantiaOSSection } from '@/components/os/GarantiaOSSection'
import { QuilometragemOSSection } from '@/components/os/QuilometragemOSSection'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MoneyInput } from '@/components/shared/MoneyInput'
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
import { calcularVencimentoGarantia, criarChecklistVazio, normalizarChecklist } from '@/lib/os'
import { formatarMoeda } from '@/lib/utils'
import type { OrdemServico, PecaUtilizada, StatusOS } from '@/types'
import { STATUS_OS, calcularValorTotalOS } from '@/types'

type FormOS = Omit<
  OrdemServico,
  'id' | 'oficina_id' | 'numero' | 'valor_total' | 'criado_em' | 'atualizado_em'
>

const formVazio: FormOS = {
  cliente_id: '',
  moto_id: '',
  defeito_relatado: '',
  diagnostico: '',
  servicos_executados: '',
  pecas_utilizadas: [],
  valor_pecas: 0,
  valor_mao_obra: 0,
  desconto: 0,
  status: 'recebida',
  checklist_entrada: criarChecklistVazio(),
}

export function OrdensServicoPage() {
  const { adicionarOS, atualizarOS, excluirOS } = useCraft()
  const { ordens, clientes, motos, pecas, configuracao, lancamentos } = useOficinaData()
  const { limiteAtingido, temRecurso } = useAssinatura()
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [dialogLembretesAberto, setDialogLembretesAberto] = useState(false)
  const [osParaLembretes, setOsParaLembretes] = useState<OrdemServico | null>(null)
  const [editando, setEditando] = useState<OrdemServico | null>(null)
  const [form, setForm] = useState<FormOS>(formVazio)
  const [osVisualizando, setOsVisualizando] = useState<OrdemServico | null>(null)
  const [exportandoPdfId, setExportandoPdfId] = useState<string | null>(null)

  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'
  const getMotoLabel = (id: string) => {
    const m = motos.find((mo) => mo.id === id)
    return m ? `${m.marca} ${m.modelo} (${m.placa})` : '—'
  }

  const motosDoCliente = useMemo(
    () => motos.filter((m) => m.cliente_id === form.cliente_id),
    [motos, form.cliente_id]
  )

  const valorTotal = calcularValorTotalOS(form.valor_pecas, form.valor_mao_obra, form.desconto)

  const ordensFiltradas = ordens.filter(
    (o) =>
      String(o.numero).includes(busca) ||
      getClienteNome(o.cliente_id).toLowerCase().includes(busca.toLowerCase()) ||
      getMotoLabel(o.moto_id).toLowerCase().includes(busca.toLowerCase())
  )

  function abrirNova() {
    if (limiteAtingido('os_mes')) return
    setEditando(null)
    setForm(formVazio)
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
      pecas_utilizadas: os.pecas_utilizadas,
      valor_pecas: os.valor_pecas,
      valor_mao_obra: os.valor_mao_obra,
      desconto: os.desconto,
      status: os.status,
      checklist_entrada: normalizarChecklist(os.checklist_entrada),
      valor_estimado: os.valor_estimado,
      data_orcamento: os.data_orcamento,
      status_orcamento: os.status_orcamento,
      quilometragem_entrada: os.quilometragem_entrada,
      quilometragem_saida: os.quilometragem_saida,
      dias_garantia: os.dias_garantia,
      data_vencimento_garantia: os.data_vencimento_garantia,
    })
    setDialogAberto(true)
  }

  function selecionarMoto(motoId: string) {
    const moto = motos.find((m) => m.id === motoId)
    setForm({
      ...form,
      moto_id: motoId,
      quilometragem_entrada: moto?.quilometragem ?? form.quilometragem_entrada,
    })
  }

  function prepararDadosSalvar(): FormOS {
    const dados = { ...form }
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

    return dados
  }

  function adicionarPecaUtilizada(pecaId: string) {
    const peca = pecas.find((p) => p.id === pecaId)
    if (!peca) return

    const existente = form.pecas_utilizadas.find((p) => p.peca_id === pecaId)
    let novasPecas: PecaUtilizada[]

    if (existente) {
      novasPecas = form.pecas_utilizadas.map((p) =>
        p.peca_id === pecaId
          ? { ...p, quantidade: p.quantidade + 1 }
          : p
      )
    } else {
      novasPecas = [
        ...form.pecas_utilizadas,
        {
          peca_id: peca.id,
          nome: peca.nome,
          quantidade: 1,
          valor_unitario: peca.preco_venda,
        },
      ]
    }

    const valorPecas = novasPecas.reduce(
      (acc, p) => acc + p.quantidade * p.valor_unitario,
      0
    )
    setForm({ ...form, pecas_utilizadas: novasPecas, valor_pecas: valorPecas })
  }

  function removerPecaUtilizada(pecaId: string) {
    const novasPecas = form.pecas_utilizadas.filter((p) => p.peca_id !== pecaId)
    const valorPecas = novasPecas.reduce(
      (acc, p) => acc + p.quantidade * p.valor_unitario,
      0
    )
    setForm({ ...form, pecas_utilizadas: novasPecas, valor_pecas: valorPecas })
  }

  function salvar() {
    if (!form.cliente_id || !form.moto_id || !form.defeito_relatado.trim()) return

    const dados = prepararDadosSalvar()
    const agoraFinalizada = ['finalizada', 'entregue'].includes(dados.status)

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
    return buildOsDocumentoViewModel(os, cliente, moto, configuracao, lancamentos)
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
      await exportarOsPdf(os, cliente, moto, configuracao, lancamentos)
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Não foi possível gerar o PDF da ordem de serviço.'
      )
    } finally {
      setExportandoPdfId(null)
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

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar OS #${editando.numero}` : 'Nova ordem de serviço'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Cliente *</Label>
              <Select
                value={form.cliente_id}
                onValueChange={(v) => setForm({ ...form, cliente_id: v, moto_id: '' })}
              >
                <SelectTrigger>
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
            </div>
            <div className="grid gap-2">
              <Label>Moto *</Label>
              <Select
                value={form.moto_id}
                onValueChange={selecionarMoto}
                disabled={!form.cliente_id}
              >
                <SelectTrigger>
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
            </div>

            {form.checklist_entrada && (
              <div className="sm:col-span-2">
                <ChecklistEntradaForm
                  value={form.checklist_entrada}
                  onChange={(checklist_entrada) => setForm({ ...form, checklist_entrada })}
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <QuilometragemOSSection
                entrada={form.quilometragem_entrada}
                saida={form.quilometragem_saida}
                onChange={(km) => setForm({ ...form, ...km })}
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
                onChange={(e) => setForm({ ...form, defeito_relatado: e.target.value })}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="diagnostico">Diagnóstico</Label>
              <Textarea
                id="diagnostico"
                value={form.diagnostico}
                onChange={(e) => setForm({ ...form, diagnostico: e.target.value })}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="servicos">Serviços executados</Label>
              <Textarea
                id="servicos"
                value={form.servicos_executados}
                onChange={(e) => setForm({ ...form, servicos_executados: e.target.value })}
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label>Peças utilizadas</Label>
              <Select onValueChange={adicionarPecaUtilizada}>
                <SelectTrigger>
                  <SelectValue placeholder="Adicionar peça do estoque" />
                </SelectTrigger>
                <SelectContent>
                  {pecas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} — {formatarMoeda(p.preco_venda)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.pecas_utilizadas.length > 0 && (
                <div className="rounded-md border border-border p-3 space-y-2">
                  {form.pecas_utilizadas.map((p) => (
                    <div key={p.peca_id} className="flex items-center justify-between text-sm">
                      <span>
                        {p.nome} x{p.quantidade} — {formatarMoeda(p.quantidade * p.valor_unitario)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removerPecaUtilizada(p.peca_id)}
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pecas">Valor peças</Label>
              <MoneyInput
                id="pecas"
                value={form.valor_pecas}
                onChange={(valor_pecas) => setForm({ ...form, valor_pecas })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mao_obra">Mão de obra</Label>
              <MoneyInput
                id="mao_obra"
                value={form.valor_mao_obra}
                onChange={(valor_mao_obra) => setForm({ ...form, valor_mao_obra })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="desconto">Desconto</Label>
              <MoneyInput
                id="desconto"
                value={form.desconto}
                onChange={(desconto) => setForm({ ...form, desconto })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as StatusOS })}
              >
                <SelectTrigger>
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

            <div className="sm:col-span-2 rounded-lg bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">Valor total</p>
              <p className="text-2xl font-bold text-primary">{formatarMoeda(valorTotal)}</p>
            </div>

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
        podeExportarPdf={temRecurso('pdf_os')}
        exportandoPdf={!!osVisualizando && exportandoPdfId === osVisualizando.id}
        onExportarPdf={
          osVisualizando ? () => exportarPdf(osVisualizando) : undefined
        }
      />

      <CriarLembretesOSDialog
        os={osParaLembretes}
        moto={osParaLembretes ? motos.find((m) => m.id === osParaLembretes.moto_id) ?? null : null}
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
