import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Label } from '@/components/ui/label'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/context/AuthContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { usePlanoEscrita } from '@/hooks/usePlanoEscrita'
import { ComissoesConfigCard } from '@/components/financeiro/ComissoesConfigCard'
import {
  calcularRelatorioComissoesMes,
  labelTipoComissao,
  listarOsComissaoFuncionario,
} from '@/services/comissoes/comissoes.service'
import { podeGerenciarComissoesFuncionarios } from '@/services/auth/permissions'
import { formatarData, formatarMoeda, getMesLocalAtual } from '@/lib/utils'
import {
  TIPOS_COMISSAO,
  obterComissoesConfig,
  tipoUsaMaoObra,
  tipoUsaPecas,
  type DetalheOsComissao,
  type PagamentoComissaoFolha,
  type PerfilComissaoFuncionario,
  type PerfilComissaoFuncionarioInput,
  type ResumoComissaoMensalFuncionario,
  type StatusComissaoFolha,
  type TipoComissaoFuncionario,
} from '@/types/comissoes'
import { useAssinatura } from '@/context/AssinaturaContext'
import { ehAdminSistema } from '@/lib/craft-admin'
import {
  carregarPagamentosComissao,
  derivarStatusComissaoFolha,
  diferencaComissaoPendente,
  pagamentoComissaoDisponivel,
  registrarPagamentoComissao,
} from '@/services/comissoes/comissao-pagamento-folha.service'
import type { OrdemServico } from '@/types/ordem-servico'
import { getLabelPapel, type AuthUser } from '@/types/auth'

function formatarPercentualRegra(perfil: PerfilComissaoFuncionario): string {
  if (!perfil.comissao_ativa || perfil.tipo_comissao === 'sem_comissao') return '—'
  if (perfil.tipo_comissao === 'valor_fixo_os') {
    return formatarMoeda(perfil.valor_fixo_por_os ?? 0) + ' por OS'
  }
  const partes: string[] = []
  if (tipoUsaMaoObra(perfil.tipo_comissao)) {
    partes.push(`MO ${perfil.percentual_comissao ?? 0}%`)
  }
  if (tipoUsaPecas(perfil.tipo_comissao)) {
    partes.push(`Peças ${perfil.percentual_comissao_pecas ?? 0}%`)
  }
  return partes.join(' · ') || '—'
}

function formatarPercentualDetalhe(
  d: DetalheOsComissao,
  os: OrdemServico | undefined,
  perfil: PerfilComissaoFuncionario
): string {
  const snap = d.usou_snapshot ? os?.comissao_snapshot : undefined
  const tipo = d.tipo_comissao ?? perfil.tipo_comissao
  if (tipo === 'valor_fixo_os') {
    const fixo = snap?.valor_fixo_os ?? perfil.valor_fixo_por_os ?? 0
    return formatarMoeda(fixo) + ' fixo'
  }
  if (tipo === 'sem_comissao') return '—'
  const partes: string[] = []
  if (tipoUsaMaoObra(tipo)) {
    partes.push(`MO ${snap?.percentual_mao_obra ?? perfil.percentual_comissao ?? d.percentual_aplicado ?? 0}%`)
  }
  if (tipoUsaPecas(tipo)) {
    partes.push(`Peças ${snap?.percentual_pecas ?? perfil.percentual_comissao_pecas ?? 0}%`)
  }
  return partes.join(' · ') || (d.percentual_aplicado != null ? `${d.percentual_aplicado}%` : '—')
}

function resumoServicosOs(os: OrdemServico | undefined): string {
  if (!os) return '—'
  const itens = os.servicos_itens ?? []
  if (itens.length > 0) {
    const nomes = itens.map((s) => s.nome?.trim()).filter(Boolean)
    if (nomes.length === 0) return '—'
    if (nomes.length <= 2) return nomes.join(', ')
    return `${nomes.slice(0, 2).join(', ')} +${nomes.length - 2}`
  }
  const texto = os.servicos_executados?.trim()
  if (!texto) return '—'
  return texto.length > 60 ? `${texto.slice(0, 57)}…` : texto
}

type FormPerfil = PerfilComissaoFuncionarioInput & { id?: string }

const formVazio: FormPerfil = {
  nome: '',
  cargo: '',
  salario_fixo_mensal: 0,
  comissao_ativa: false,
  tipo_comissao: 'sem_comissao',
  percentual_comissao: 0,
  percentual_comissao_pecas: 0,
  valor_fixo_por_os: 0,
  observacoes: '',
}

function cargoPadraoUsuario(user: AuthUser): string {
  return getLabelPapel(user.papel)
}

export function FuncionariosComissoesSection() {
  const { session, carregarUsuarios } = useAuth()
  const { salvarPerfilComissao, excluirPerfilComissao, oficinaId } = useCraft()
  const { perfisComissao, ordens, lancamentos, configuracao, clientes } = useOficinaData()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { verificarEscrita } = usePlanoEscrita()
  const { temRecurso } = useAssinatura()

  const [mesReferencia, setMesReferencia] = useState(getMesLocalAtual())
  const [dialogAberto, setDialogAberto] = useState(false)
  const [form, setForm] = useState<FormPerfil>(formVazio)
  const [usuarios, setUsuarios] = useState<AuthUser[]>([])
  const [detalhePerfilId, setDetalhePerfilId] = useState<string | null>(null)
  const [pagamentosComissao, setPagamentosComissao] = useState<PagamentoComissaoFolha[]>([])
  const [pagarResumo, setPagarResumo] = useState<ResumoComissaoMensalFuncionario | null>(null)
  const [obsPagamento, setObsPagamento] = useState('')
  const [salvandoPagamento, setSalvandoPagamento] = useState(false)

  const config = useMemo(() => obterComissoesConfig(configuracao), [configuracao])
  const podeGerenciar = podeGerenciarComissoesFuncionarios(session?.user)

  // Recurso avançado (RC2 Fase 2): baixa de comissão em folha — exclusivo premium.
  const recursoComissaoFolha = temRecurso('comissao_folha')
  // Somente dono/admin registram a baixa (RLS também exige owner/admin).
  const ehDonoOuAdmin = session?.user?.papel === 'dono' || ehAdminSistema(session?.user)
  const podePagarComissao = recursoComissaoFolha && ehDonoOuAdmin && pagamentoComissaoDisponivel()

  const pagamentosPorChave = useMemo(() => {
    const map = new Map<string, PagamentoComissaoFolha>()
    for (const p of pagamentosComissao) {
      if (p.canceled_at) continue
      map.set(`${p.employee_local_id}:${p.competence_month}`, p)
    }
    return map
  }, [pagamentosComissao])

  const recarregarPagamentos = useCallback(async () => {
    if (!pagamentoComissaoDisponivel()) {
      setPagamentosComissao([])
      return
    }
    const lista = await carregarPagamentosComissao(oficinaId)
    setPagamentosComissao(lista)
  }, [oficinaId])

  useEffect(() => {
    if (!podeGerenciar) return
    void recarregarPagamentos()
  }, [podeGerenciar, recarregarPagamentos])

  function statusComissaoDaLinha(r: ResumoComissaoMensalFuncionario): {
    pagamento?: PagamentoComissaoFolha
    status: StatusComissaoFolha
    diferenca: number
  } {
    const pagamento = pagamentosPorChave.get(`${r.perfil_id}:${mesReferencia}`)
    return {
      pagamento,
      status: derivarStatusComissaoFolha(r.total_comissao, pagamento),
      diferenca: diferencaComissaoPendente(r.total_comissao, pagamento),
    }
  }

  function abrirPagarComissao(r: ResumoComissaoMensalFuncionario) {
    setObsPagamento('')
    setPagarResumo(r)
  }

  async function confirmarPagarComissao() {
    if (!pagarResumo) return
    setSalvandoPagamento(true)
    const resultado = await registrarPagamentoComissao(
      oficinaId,
      {
        perfil_id: pagarResumo.perfil_id,
        employee_name: pagarResumo.nome,
        competence_month: mesReferencia,
        salary_amount: pagarResumo.salario_fixo,
        commission_amount: pagarResumo.total_comissao,
        total_amount: pagarResumo.total_estimado_pagar,
        notes: obsPagamento.trim() || undefined,
      },
      { id: session?.user?.id, nome: session?.user?.nome }
    )
    setSalvandoPagamento(false)

    if (resultado.ok) {
      toast.sucesso('Comissão marcada como paga em folha.')
      setPagarResumo(null)
      setObsPagamento('')
      await recarregarPagamentos()
      return
    }
    if (resultado.duplicado) {
      toast.atencao('Já existe uma baixa registrada para este funcionário neste mês.')
      setPagarResumo(null)
      setObsPagamento('')
      await recarregarPagamentos()
      return
    }
    toast.erro(resultado.erro ?? 'Não foi possível registrar o pagamento da comissão.')
  }

  const relatorio = useMemo(
    () => calcularRelatorioComissoesMes(perfisComissao, ordens, lancamentos, mesReferencia, config),
    [perfisComissao, ordens, lancamentos, mesReferencia, config]
  )

  const totaisRelatorio = useMemo(
    () =>
      relatorio.reduce(
        (acc, r) => ({
          os: acc.os + r.quantidade_os,
          maoObra: acc.maoObra + r.total_mao_obra,
          pecas: acc.pecas + r.total_pecas,
          comissao: acc.comissao + r.total_comissao,
          salario: acc.salario + r.salario_fixo,
          custo: acc.custo + r.total_estimado_pagar,
        }),
        { os: 0, maoObra: 0, pecas: 0, comissao: 0, salario: 0, custo: 0 }
      ),
    [relatorio]
  )

  const clientesPorId = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of clientes) map.set(c.id, c.nome)
    return map
  }, [clientes])

  const ordensPorId = useMemo(() => {
    const map = new Map<string, OrdemServico>()
    for (const os of ordens) map.set(os.id, os)
    return map
  }, [ordens])

  const perfilDetalhe = useMemo(
    () => (detalhePerfilId ? perfisComissao.find((p) => p.id === detalhePerfilId) : undefined),
    [detalhePerfilId, perfisComissao]
  )

  const resumoDetalhe = useMemo(
    () => (detalhePerfilId ? relatorio.find((r) => r.perfil_id === detalhePerfilId) : undefined),
    [detalhePerfilId, relatorio]
  )

  const osDetalhe = useMemo(() => {
    if (!perfilDetalhe) return [] as DetalheOsComissao[]
    return listarOsComissaoFuncionario(
      perfilDetalhe,
      ordens,
      lancamentos,
      mesReferencia,
      config
    )
  }, [perfilDetalhe, ordens, lancamentos, mesReferencia, config])

  function abrirDetalheComissao(resumo: ResumoComissaoMensalFuncionario) {
    setDetalhePerfilId(resumo.perfil_id)
  }

  async function abrirNovo() {
    const lista = usuarios.length ? usuarios : await carregarUsuarios()
    setUsuarios(lista)
    setForm(formVazio)
    setDialogAberto(true)
  }

  function abrirEditar(perfil: PerfilComissaoFuncionario) {
    setForm({
      id: perfil.id,
      usuario_id: perfil.usuario_id,
      nome: perfil.nome,
      cargo: perfil.cargo,
      salario_fixo_mensal: perfil.salario_fixo_mensal,
      comissao_ativa: perfil.comissao_ativa,
      tipo_comissao: perfil.tipo_comissao,
      percentual_comissao: perfil.percentual_comissao ?? 0,
      percentual_comissao_pecas: perfil.percentual_comissao_pecas ?? 0,
      valor_fixo_por_os: perfil.valor_fixo_por_os ?? 0,
      observacoes: perfil.observacoes ?? '',
    })
    setDialogAberto(true)
  }

  function vincularUsuario(usuarioId: string) {
    const user = usuarios.find((u) => u.id === usuarioId)
    if (!user) return
    setForm((prev) => ({
      ...prev,
      usuario_id: user.id,
      nome: user.nome,
      cargo: cargoPadraoUsuario(user),
    }))
  }

  function salvar() {
    if (!verificarEscrita()) return
    if (!form.nome.trim()) {
      toast.atencao('Informe o nome do funcionário.')
      return
    }
    if (!form.cargo.trim()) {
      toast.atencao('Informe o cargo.')
      return
    }

    const tipo = form.comissao_ativa ? form.tipo_comissao : 'sem_comissao'
    const payload: FormPerfil = {
      ...form,
      nome: form.nome.trim(),
      cargo: form.cargo.trim(),
      tipo_comissao: tipo,
      percentual_comissao: tipoUsaMaoObra(tipo) ? form.percentual_comissao : undefined,
      percentual_comissao_pecas: tipoUsaPecas(tipo) ? form.percentual_comissao_pecas : undefined,
      valor_fixo_por_os: tipo === 'valor_fixo_os' ? form.valor_fixo_por_os : undefined,
      observacoes: form.observacoes?.trim() || undefined,
    }

    salvarPerfilComissao(payload)
    toast.sucesso('Cadastro financeiro salvo.')
    setDialogAberto(false)
  }

  async function confirmarExclusao(perfil: PerfilComissaoFuncionario) {
    const ok = await confirmar({
      titulo: 'Excluir cadastro financeiro',
      mensagem: `Remover salário/comissão de ${perfil.nome}?`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (ok) {
      excluirPerfilComissao(perfil.id)
      toast.sucesso('Cadastro removido.')
    }
  }

  if (!podeGerenciar) return null

  return (
    <div className="space-y-6">
      <ComissoesConfigCard />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Funcionários e Comissões</h3>
          <p className="text-sm text-muted-foreground">
            Salário fixo e comissão — dados internos, visíveis somente no Financeiro.
          </p>
        </div>
        <Button onClick={() => void abrirNovo()}>
          <Plus className="mr-2 h-4 w-4" />
          Cadastrar funcionário
        </Button>
      </div>

      {perfisComissao.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum funcionário com cadastro financeiro. Vincule usuários da oficina ou cadastre manualmente.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Salário fixo</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perfisComissao.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell>{p.cargo}</TableCell>
                  <TableCell>{formatarMoeda(p.salario_fixo_mensal)}</TableCell>
                  <TableCell>
                    {!p.comissao_ativa || p.tipo_comissao === 'sem_comissao' ? (
                      <Badge variant="secondary">Inativa</Badge>
                    ) : (
                      <span className="text-sm">
                        {labelTipoComissao(p.tipo_comissao)}
                        {tipoUsaMaoObra(p.tipo_comissao) &&
                          ` MO ${p.percentual_comissao ?? 0}%`}
                        {tipoUsaPecas(p.tipo_comissao) &&
                          ` Peças ${p.percentual_comissao_pecas ?? 0}%`}
                        {p.tipo_comissao === 'valor_fixo_os' &&
                          ` (${formatarMoeda(p.valor_fixo_por_os ?? 0)})`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => abrirEditar(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void confirmarExclusao(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Comissões do mês</h3>
            <p className="text-sm text-muted-foreground">
              Clique no funcionário para ver regra aplicada, base e detalhe por OS.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mes-comissao">Mês de referência</Label>
            <Input
              id="mes-comissao"
              type="month"
              value={mesReferencia}
              onChange={(e) => setMesReferencia(e.target.value)}
              className="w-[180px]"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead className="text-center">Qtd. OS</TableHead>
                <TableHead className="text-right">Mão de obra</TableHead>
                <TableHead className="text-right">Peças</TableHead>
                <TableHead className="text-right">Salário fixo</TableHead>
                <TableHead className="text-right">Comissão prevista</TableHead>
                <TableHead className="text-right">Custo total funcionário</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relatorio.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Nenhum funcionário cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                relatorio.map((r) => {
                  const { pagamento, status, diferenca } = statusComissaoDaLinha(r)
                  return (
                    <TableRow
                      key={r.perfil_id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => abrirDetalheComissao(r)}
                    >
                      <TableCell>
                        <p className="font-medium text-primary underline-offset-2 hover:underline">
                          {r.nome}
                        </p>
                        <p className="text-xs text-muted-foreground">{r.cargo}</p>
                      </TableCell>
                      <TableCell className="text-center">{r.quantidade_os}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(r.total_mao_obra)}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(r.total_pecas)}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(r.salario_fixo)}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(r.total_comissao)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatarMoeda(r.total_estimado_pagar)}
                      </TableCell>
                      <TableCell className="text-center">
                        {status === 'pago' ? (
                          <Badge variant="success">Pago</Badge>
                        ) : status === 'diferenca_pendente' ? (
                          <Badge variant="warning" title={`Diferença não baixada: ${formatarMoeda(diferenca)}`}>
                            Diferença pendente
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {podePagarComissao ? (
                          status === 'pago' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => abrirDetalheComissao(r)}
                            >
                              Ver pagamento
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => abrirPagarComissao(r)}
                            >
                              <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-400" />
                              {status === 'diferenca_pendente' ? 'Baixar diferença' : 'Marcar como paga'}
                            </Button>
                          )
                        ) : !recursoComissaoFolha && ehDonoOuAdmin ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                            title="Baixa de comissão em folha disponível no plano Premium"
                          >
                            <Lock className="h-3 w-3" />
                            Premium
                          </span>
                        ) : pagamento ? (
                          <Button variant="ghost" size="sm" onClick={() => abrirDetalheComissao(r)}>
                            Ver pagamento
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
              {relatorio.length > 0 && (
                <TableRow className="bg-muted/30 font-medium">
                  <TableCell>Totais</TableCell>
                  <TableCell className="text-center">{totaisRelatorio.os}</TableCell>
                  <TableCell className="text-right">{formatarMoeda(totaisRelatorio.maoObra)}</TableCell>
                  <TableCell className="text-right">{formatarMoeda(totaisRelatorio.pecas)}</TableCell>
                  <TableCell className="text-right">{formatarMoeda(totaisRelatorio.salario)}</TableCell>
                  <TableCell className="text-right">{formatarMoeda(totaisRelatorio.comissao)}</TableCell>
                  <TableCell className="text-right">{formatarMoeda(totaisRelatorio.custo)}</TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={Boolean(detalhePerfilId)}
        onOpenChange={(open) => {
          if (!open) setDetalhePerfilId(null)
        }}
      >
        <DialogContent className="flex max-h-[96dvh] w-full flex-col gap-0 overflow-hidden p-0 max-lg:h-[96dvh] max-lg:max-h-[96dvh] max-lg:rounded-t-2xl lg:max-h-[90dvh] lg:w-[min(90vw,1180px)] lg:max-w-[min(90vw,1180px)]">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 py-4 pr-12 sm:px-6">
            <DialogTitle className="text-left text-lg sm:text-xl">
              Detalhe de comissão — {perfilDetalhe?.nome ?? 'Funcionário'}
            </DialogTitle>
            <p className="text-left text-xs text-muted-foreground sm:text-sm">
              Resumo do mês e lista de OS elegíveis. OS com regra congelada mantêm o percentual da
              época.
            </p>
          </DialogHeader>

          {perfilDetalhe && resumoDetalhe && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-3.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Regra aplicada
                  </p>
                  <p className="mt-1.5 text-sm font-semibold leading-snug">
                    {perfilDetalhe.comissao_ativa && perfilDetalhe.tipo_comissao !== 'sem_comissao'
                      ? 'Comissão ativa'
                      : 'Comissão inativa'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatarPercentualRegra(perfilDetalhe)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-3.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Tipo de comissão
                  </p>
                  <p className="mt-1.5 text-sm font-semibold leading-snug">
                    {labelTipoComissao(perfilDetalhe.tipo_comissao)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-3.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Base mão de obra
                  </p>
                  <p className="mt-1.5 text-sm font-semibold tabular-nums">
                    {formatarMoeda(resumoDetalhe.total_mao_obra)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-3.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Base peças
                  </p>
                  <p className="mt-1.5 text-sm font-semibold tabular-nums">
                    {formatarMoeda(resumoDetalhe.total_pecas)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-3.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Comissão prevista
                  </p>
                  <p className="mt-1.5 text-sm font-semibold tabular-nums text-primary">
                    {formatarMoeda(resumoDetalhe.total_comissao)}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl border border-border bg-muted/20 p-3 sm:p-3.5 md:col-span-1 xl:col-span-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Custo total funcionário
                  </p>
                  <p className="mt-1.5 text-sm font-semibold tabular-nums">
                    {formatarMoeda(resumoDetalhe.total_estimado_pagar)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Salário {formatarMoeda(resumoDetalhe.salario_fixo)} + comissão{' '}
                    {formatarMoeda(resumoDetalhe.total_comissao)}
                  </p>
                </div>
              </div>

              {(() => {
                const infoStatus = statusComissaoDaLinha(resumoDetalhe)
                const pag = infoStatus.pagamento
                return (
                  <div className="rounded-xl border border-border p-3.5 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Comissão em folha</span>
                        {infoStatus.status === 'pago' ? (
                          <Badge variant="success">Pago</Badge>
                        ) : infoStatus.status === 'diferenca_pendente' ? (
                          <Badge variant="warning">Diferença pendente</Badge>
                        ) : (
                          <Badge variant="secondary">Pendente</Badge>
                        )}
                      </div>
                      {podePagarComissao && infoStatus.status !== 'pago' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDetalhePerfilId(null)
                            abrirPagarComissao(resumoDetalhe)
                          }}
                        >
                          <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-400" />
                          {infoStatus.status === 'diferenca_pendente'
                            ? 'Baixar diferença'
                            : 'Marcar como paga'}
                        </Button>
                      )}
                    </div>

                    {pag ? (
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Data do pagamento</dt>
                          <dd>{formatarData(pag.paid_at)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Registrado por</dt>
                          <dd>{pag.paid_by_name ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Comissão paga</dt>
                          <dd className="tabular-nums">{formatarMoeda(pag.commission_amount)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Total registrado</dt>
                          <dd className="tabular-nums">{formatarMoeda(pag.total_amount)}</dd>
                        </div>
                        {infoStatus.status === 'diferenca_pendente' && (
                          <div className="col-span-2 sm:col-span-4">
                            <dt className="text-[11px] text-muted-foreground">Diferença ainda não baixada</dt>
                            <dd className="tabular-nums text-amber-500">
                              {formatarMoeda(infoStatus.diferenca)}
                            </dd>
                          </div>
                        )}
                        {pag.notes && (
                          <div className="col-span-2 sm:col-span-4">
                            <dt className="text-[11px] text-muted-foreground">Observação</dt>
                            <dd className="leading-snug">{pag.notes}</dd>
                          </div>
                        )}
                      </dl>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Comissão ainda não baixada em folha nesta competência. O dono/admin marca
                        como paga junto com o salário — o sistema não paga automaticamente.
                      </p>
                    )}
                  </div>
                )
              })()}

              {osDetalhe.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhuma OS elegível neste mês.
                </div>
              ) : (
                <>
                  {/* Mobile / tablet: cards por OS */}
                  <div className="space-y-3 lg:hidden">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      OS do período ({osDetalhe.length})
                    </p>
                    {osDetalhe.map((d) => {
                      const os = ordensPorId.get(d.os_id)
                      const clienteNome = os
                        ? clientesPorId.get(os.cliente_id) ?? '—'
                        : '—'
                      const responsavel =
                        os?.comissao_snapshot?.responsavel_nome ??
                        os?.responsavel ??
                        perfilDetalhe.nome
                      return (
                        <article
                          key={d.os_id}
                          className="rounded-xl border border-border bg-card p-3.5 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-base font-semibold">OS #{d.numero}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatarData(d.data_referencia)}
                              </p>
                            </div>
                            {d.usou_snapshot && (
                              <Badge variant="secondary" className="shrink-0 text-[10px]">
                                Regra congelada
                              </Badge>
                            )}
                          </div>

                          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
                            <div className="col-span-2">
                              <dt className="text-[11px] text-muted-foreground">Cliente</dt>
                              <dd className="font-medium">{clienteNome}</dd>
                            </div>
                            <div className="col-span-2">
                              <dt className="text-[11px] text-muted-foreground">Serviço</dt>
                              <dd className="leading-snug">{resumoServicosOs(os)}</dd>
                            </div>
                            <div className="col-span-2">
                              <dt className="text-[11px] text-muted-foreground">Responsável</dt>
                              <dd>{responsavel}</dd>
                            </div>
                            <div>
                              <dt className="text-[11px] text-muted-foreground">Mão de obra</dt>
                              <dd className="tabular-nums">{formatarMoeda(d.mao_obra)}</dd>
                            </div>
                            <div>
                              <dt className="text-[11px] text-muted-foreground">Peças</dt>
                              <dd className="tabular-nums">{formatarMoeda(d.pecas)}</dd>
                            </div>
                            <div>
                              <dt className="text-[11px] text-muted-foreground">% aplicado</dt>
                              <dd className="text-xs leading-snug">
                                {formatarPercentualDetalhe(d, os, perfilDetalhe)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[11px] text-muted-foreground">Comissão gerada</dt>
                              <dd className="font-semibold tabular-nums text-primary">
                                {formatarMoeda(d.comissao)}
                              </dd>
                            </div>
                          </dl>
                        </article>
                      )
                    })}
                  </div>

                  {/* Desktop: tabela larga, sem corte de colunas importantes */}
                  <div className="hidden min-h-0 flex-1 flex-col lg:flex">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      OS do período ({osDetalhe.length})
                    </p>
                    <div className="overflow-auto rounded-xl border border-border">
                      <Table className="w-full min-w-[920px]">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="whitespace-nowrap">OS / Data</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead className="min-w-[160px]">Serviço</TableHead>
                            <TableHead>Responsável</TableHead>
                            <TableHead className="whitespace-nowrap text-right">Mão de obra</TableHead>
                            <TableHead className="whitespace-nowrap text-right">Peças</TableHead>
                            <TableHead className="whitespace-nowrap">% aplicado</TableHead>
                            <TableHead className="whitespace-nowrap text-right">Comissão</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {osDetalhe.map((d) => {
                            const os = ordensPorId.get(d.os_id)
                            const clienteNome = os
                              ? clientesPorId.get(os.cliente_id) ?? '—'
                              : '—'
                            const responsavel =
                              os?.comissao_snapshot?.responsavel_nome ??
                              os?.responsavel ??
                              perfilDetalhe.nome
                            return (
                              <TableRow key={d.os_id}>
                                <TableCell className="align-top">
                                  <p className="font-medium">#{d.numero}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatarData(d.data_referencia)}
                                  </p>
                                  {d.usou_snapshot && (
                                    <Badge
                                      variant="secondary"
                                      className="mt-1 text-[10px] font-normal"
                                    >
                                      Regra congelada
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="align-top text-sm">{clienteNome}</TableCell>
                                <TableCell className="align-top text-sm leading-snug">
                                  {resumoServicosOs(os)}
                                </TableCell>
                                <TableCell className="align-top text-sm">{responsavel}</TableCell>
                                <TableCell className="align-top text-right tabular-nums">
                                  {formatarMoeda(d.mao_obra)}
                                </TableCell>
                                <TableCell className="align-top text-right tabular-nums">
                                  {formatarMoeda(d.pecas)}
                                </TableCell>
                                <TableCell className="align-top text-sm leading-snug">
                                  {formatarPercentualDetalhe(d, os, perfilDetalhe)}
                                </TableCell>
                                <TableCell className="align-top text-right font-medium tabular-nums">
                                  {formatarMoeda(d.comissao)}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pagarResumo)}
        onOpenChange={(open) => {
          if (!open && !salvandoPagamento) {
            setPagarResumo(null)
            setObsPagamento('')
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar pagamento de comissão?</DialogTitle>
          </DialogHeader>
          {pagarResumo && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Confirme que esta comissão será paga junto com a folha/salário do funcionário. O
                sistema apenas registra a baixa — não paga automaticamente e não movimenta caixa.
              </p>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-[11px] text-muted-foreground">Funcionário</dt>
                  <dd className="font-medium">{pagarResumo.nome}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Competência</dt>
                  <dd>{mesReferencia}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Salário fixo</dt>
                  <dd className="tabular-nums">{formatarMoeda(pagarResumo.salario_fixo)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Comissão</dt>
                  <dd className="tabular-nums">{formatarMoeda(pagarResumo.total_comissao)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Total</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatarMoeda(pagarResumo.total_estimado_pagar)}
                  </dd>
                </div>
              </dl>

              <div className="grid gap-2">
                <Label htmlFor="obs-pagamento-comissao">Observação (opcional)</Label>
                <Textarea
                  id="obs-pagamento-comissao"
                  rows={3}
                  value={obsPagamento}
                  onChange={(e) => setObsPagamento(e.target.value)}
                  placeholder="Ex.: pago junto com a folha de julho."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPagarResumo(null)
                    setObsPagamento('')
                  }}
                  disabled={salvandoPagamento}
                >
                  Cancelar
                </Button>
                <Button onClick={() => void confirmarPagarComissao()} disabled={salvandoPagamento}>
                  {salvandoPagamento ? 'Registrando...' : 'Confirmar pagamento'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastro financeiro do funcionário</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {usuarios.length > 0 && (
              <div className="grid gap-2">
                <Label>Vincular usuário da oficina (opcional)</Label>
                <Select
                  value={form.usuario_id ?? '__manual__'}
                  onValueChange={(v) =>
                    v === '__manual__'
                      ? setForm((prev) => ({ ...prev, usuario_id: undefined }))
                      : vincularUsuario(v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">Cadastro manual</SelectItem>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome} ({getLabelPapel(u.papel)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="nome-func">Nome *</Label>
              <Input
                id="nome-func"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cargo-func">Cargo *</Label>
              <Input
                id="cargo-func"
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="salario-func">Salário fixo mensal</Label>
              <MoneyInput
                id="salario-func"
                value={form.salario_fixo_mensal}
                onChange={(v) => setForm({ ...form, salario_fixo_mensal: v })}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="comissao-ativa"
                type="checkbox"
                checked={form.comissao_ativa}
                onChange={(e) =>
                  setForm({
                    ...form,
                    comissao_ativa: e.target.checked,
                    tipo_comissao: e.target.checked ? form.tipo_comissao : 'sem_comissao',
                  })
                }
              />
              <Label htmlFor="comissao-ativa">Comissão ativa</Label>
            </div>

            {form.comissao_ativa && (
              <>
                <div className="grid gap-2">
                  <Label>Tipo de comissão</Label>
                  <Select
                    value={form.tipo_comissao}
                    onValueChange={(v) =>
                      setForm({ ...form, tipo_comissao: v as TipoComissaoFuncionario })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_COMISSAO.filter((t) => t.value !== 'sem_comissao').map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {tipoUsaMaoObra(form.tipo_comissao) && (
                  <div className="grid gap-2">
                    <Label htmlFor="pct-comissao">Percentual sobre mão de obra (%)</Label>
                    <Input
                      id="pct-comissao"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={form.percentual_comissao ?? 0}
                      onChange={(e) =>
                        setForm({ ...form, percentual_comissao: Number(e.target.value) })
                      }
                    />
                  </div>
                )}

                {tipoUsaPecas(form.tipo_comissao) && (
                  <div className="grid gap-2">
                    <Label htmlFor="pct-comissao-pecas">Percentual sobre peças (%)</Label>
                    <Input
                      id="pct-comissao-pecas"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={form.percentual_comissao_pecas ?? 0}
                      onChange={(e) =>
                        setForm({ ...form, percentual_comissao_pecas: Number(e.target.value) })
                      }
                    />
                  </div>
                )}

                {form.tipo_comissao === 'valor_fixo_os' && (
                  <div className="grid gap-2">
                    <Label htmlFor="fixo-os">Valor fixo por OS</Label>
                    <MoneyInput
                      id="fixo-os"
                      value={form.valor_fixo_por_os ?? 0}
                      onChange={(v) => setForm({ ...form, valor_fixo_por_os: v })}
                    />
                  </div>
                )}
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="obs-func">Observações</Label>
              <Textarea
                id="obs-func"
                rows={3}
                value={form.observacoes ?? ''}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>

            <Button onClick={salvar}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
