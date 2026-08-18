import { useEffect, useMemo, useState } from 'react'
import { Copy, Loader2, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatarDataBrasil, formatarMoeda } from '@/lib/utils'
import { getLabelPlano } from '@/types/plano'
import { formatarOfficeIdCurto } from '@/services/assinatura/office-admin.service'
import type { OficinaRegistro } from '@/services/assinatura/office-registry.service'
import { labelTipoOficina } from '@/types/tipo-oficina'
import {
  carregarRaioXOficinaAdmin,
  type AdminSupportPaymentRow,
  type AdminSupportRaioX,
} from '@/services/admin/admin-support.service'
import { useAdminMounted } from '@/hooks/useAdminMounted'
import { useToast } from '@/context/ToastContext'

interface AdminOficinaRaioXDialogProps {
  oficina: OficinaRegistro | null
  aberto: boolean
  onFechar: () => void
}

type FiltroPagamento =
  | 'todos'
  | 'pagos'
  | 'cancelados'
  | 'estornados'
  | 'sem_caixa'
  | 'origem_nao'

type FiltroCaixa =
  | 'todos'
  | 'entrada'
  | 'saida'
  | 'estorno'
  | 'ajuste'
  | 'manual'
  | 'os'
  | 'venda_balcao'

type FiltroEstoque = 'todos' | 'baixo' | 'zerado' | 'normal' | 'inativo'

type FiltroPortal =
  | 'todos'
  | 'pendentes'
  | 'aprovados'
  | 'aprovados_parcialmente'
  | 'recusados'
  | 'expirados'
  | 'convertidos'

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

function mensagemErroAmigavel(msg?: string | null): string {
  if (!msg?.trim()) return 'Não foi possível carregar esta aba. Tente atualizar o Raio-X.'
  if (/token|secret|service_role|jwt|password/i.test(msg)) {
    return 'Não foi possível carregar esta aba. Tente atualizar o Raio-X.'
  }
  if (msg.length > 160 || /PGRST|postgres|RPC|exception/i.test(msg)) {
    return 'Não foi possível carregar esta aba. Tente atualizar o Raio-X.'
  }
  return msg
}

function badgesPagamento(p: AdminSupportPaymentRow) {
  const itens: Array<{
    label: string
    variant: 'success' | 'destructive' | 'warning' | 'outline' | 'info'
  }> = []
  if (p.is_canceled) itens.push({ label: 'Cancelado', variant: 'destructive' })
  else if (p.is_refund_or_reversal) itens.push({ label: 'Estornado', variant: 'warning' })
  else itens.push({ label: 'Pago', variant: 'success' })
  if (!p.cash_session_id && !p.cash_movement_id) {
    itens.push({ label: 'Sem caixa vinculado', variant: 'outline' })
  }
  if (p.origem_texto === 'Origem não identificada') {
    itens.push({ label: 'Origem não identificada', variant: 'info' })
  }
  return itens
}

function incluiTexto(haystack: Array<string | number | null | undefined>, q: string): boolean {
  if (!q) return true
  const blob = haystack
    .filter((v) => v != null && String(v).trim())
    .join(' ')
    .toLowerCase()
  return blob.includes(q)
}

function ChipFiltro<T extends string>({
  valor,
  atual,
  onChange,
  label,
}: {
  valor: T
  atual: T
  onChange: (v: T) => void
  label: string
}) {
  const ativo = valor === atual
  return (
    <button
      type="button"
      onClick={() => onChange(valor)}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        ativo
          ? 'border-primary bg-primary/15 text-primary'
          : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
      }`}
    >
      {label}
    </button>
  )
}

function BarraBusca({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function CardDiagnostico({
  titulo,
  linhas,
  alerta,
}: {
  titulo: string
  linhas: string[]
  alerta?: boolean
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        alerta ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'
      }`}
    >
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      {linhas.map((l) => (
        <p key={l} className="text-sm break-words">
          {l}
        </p>
      ))}
    </div>
  )
}

export function AdminOficinaRaioXDialog({
  oficina,
  aberto,
  onFechar,
}: AdminOficinaRaioXDialogProps) {
  const { toast } = useToast()
  const { iniciarOperacao, operacaoAtiva } = useAdminMounted()
  const [dados, setDados] = useState<AdminSupportRaioX | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState('resumo')
  const [copiando, setCopiando] = useState(false)

  const [buscaPag, setBuscaPag] = useState('')
  const [filtroPag, setFiltroPag] = useState<FiltroPagamento>('todos')
  const [buscaCaixa, setBuscaCaixa] = useState('')
  const [filtroCaixa, setFiltroCaixa] = useState<FiltroCaixa>('todos')
  const [buscaEstoque, setBuscaEstoque] = useState('')
  const [filtroEstoque, setFiltroEstoque] = useState<FiltroEstoque>('todos')
  const [buscaPortal, setBuscaPortal] = useState('')
  const [filtroPortal, setFiltroPortal] = useState<FiltroPortal>('todos')
  const [buscaSaude, setBuscaSaude] = useState('')
  const [filtroSaudeModulo, setFiltroSaudeModulo] = useState('todos')

  function resetFiltros() {
    setBuscaPag('')
    setFiltroPag('todos')
    setBuscaCaixa('')
    setFiltroCaixa('todos')
    setBuscaEstoque('')
    setFiltroEstoque('todos')
    setBuscaPortal('')
    setFiltroPortal('todos')
    setBuscaSaude('')
    setFiltroSaudeModulo('todos')
  }

  async function carregar() {
    if (!oficina) return
    const seq = iniciarOperacao()
    setCarregando(true)
    setErro(null)
    try {
      const raioX = await carregarRaioXOficinaAdmin(oficina)
      if (!operacaoAtiva(seq)) return
      setDados(raioX)
    } catch (e) {
      if (!operacaoAtiva(seq)) return
      setDados(null)
      const raw = e instanceof Error ? e.message : ''
      if (import.meta.env.DEV && raw) console.warn('[Admin Raio-X] falha ao carregar')
      setErro(mensagemErroAmigavel(raw))
    } finally {
      if (operacaoAtiva(seq)) setCarregando(false)
    }
  }

  useEffect(() => {
    if (!aberto || !oficina) {
      setDados(null)
      setErro(null)
      setAba('resumo')
      resetFiltros()
      return
    }
    resetFiltros()
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega ao abrir/trocar oficina
  }, [aberto, oficina?.office_id])

  const st = oficina ? badgeStatusOficina(oficina.status) : null

  const pagamentosFiltrados = useMemo(() => {
    if (!dados) return []
    const q = buscaPag.trim().toLowerCase()
    return dados.pagamentos.filter((p) => {
      if (filtroPag === 'pagos' && (p.is_canceled || p.is_refund_or_reversal)) return false
      if (filtroPag === 'cancelados' && !p.is_canceled) return false
      if (filtroPag === 'estornados' && !p.is_refund_or_reversal) return false
      if (
        filtroPag === 'sem_caixa' &&
        (p.cash_session_id || p.cash_movement_id)
      ) {
        return false
      }
      if (
        filtroPag === 'origem_nao' &&
        p.origem_texto !== 'Origem não identificada'
      ) {
        return false
      }
      return incluiTexto(
        [
          p.customer_name,
          p.vehicle_name,
          p.vehicle_plate,
          p.service_order_number,
          p.payment_method,
          p.received_by_name,
          p.origem_texto,
          p.status,
        ],
        q
      )
    })
  }, [dados, buscaPag, filtroPag])

  const movimentosCaixaFiltrados = useMemo(() => {
    if (!dados?.caixa) return []
    const q = buscaCaixa.trim().toLowerCase()
    return dados.caixa.movimentos.filter((m) => {
      const origem = (m.origem_texto || '').toLowerCase()
      const fluxo = (m.tipo_fluxo || m.movement_type || '').toLowerCase()
      if (filtroCaixa === 'entrada' && fluxo !== 'entrada') return false
      if (filtroCaixa === 'saida' && fluxo !== 'saida') return false
      if (filtroCaixa === 'estorno' && !origem.includes('estorno') && fluxo !== 'refund') {
        return false
      }
      if (filtroCaixa === 'ajuste' && !origem.includes('ajuste') && fluxo !== 'ajuste') {
        return false
      }
      if (filtroCaixa === 'manual' && !origem.includes('manual')) return false
      if (filtroCaixa === 'os' && !origem.includes('os') && !origem.includes('pagamento')) {
        return false
      }
      if (filtroCaixa === 'venda_balcao' && !origem.includes('balcão') && !origem.includes('balcao')) {
        return false
      }
      return incluiTexto(
        [
          m.descricao,
          m.origem_texto,
          m.created_by_name,
          m.service_order_number,
          m.customer_name,
          m.vehicle_name,
          m.payment_method,
          m.tipo_fluxo,
          m.movement_type,
        ],
        q
      )
    })
  }, [dados, buscaCaixa, filtroCaixa])

  const itensEstoqueFiltrados = useMemo(() => {
    if (!dados?.estoque) return []
    const q = buscaEstoque.trim().toLowerCase()
    return dados.estoque.itens_criticos.filter((i) => {
      if (filtroEstoque !== 'todos' && i.status !== filtroEstoque) return false
      return incluiTexto([i.name, i.code, i.status], q)
    })
  }, [dados, buscaEstoque, filtroEstoque])

  const movEstoqueFiltrados = useMemo(() => {
    if (!dados?.estoque) return []
    const q = buscaEstoque.trim().toLowerCase()
    return dados.estoque.movimentos.filter((m) =>
      incluiTexto(
        [m.item_name, m.item_code, m.origem_texto, m.user_name, m.service_order_number, m.reason],
        q
      )
    )
  }, [dados, buscaEstoque])

  const linksPortalFiltrados = useMemo(() => {
    if (!dados?.portal) return []
    const q = buscaPortal.trim().toLowerCase()
    return dados.portal.links.filter((l) => {
      if (filtroPortal === 'pendentes' && l.status !== 'pendente') return false
      if (filtroPortal === 'aprovados' && l.status !== 'aprovado') return false
      if (
        filtroPortal === 'aprovados_parcialmente' &&
        l.status !== 'aprovado_parcialmente'
      ) {
        return false
      }
      if (filtroPortal === 'recusados' && l.status !== 'recusado') return false
      if (filtroPortal === 'expirados' && l.status !== 'expirado') return false
      if (filtroPortal === 'convertidos' && !l.convertido) return false
      return incluiTexto(
        [
          l.customer_name,
          l.vehicle_name,
          l.vehicle_plate,
          l.orcamento_numero,
          l.status,
          l.tipo_resposta,
          l.converted_os_number,
        ],
        q
      )
    })
  }, [dados, buscaPortal, filtroPortal])

  const eventosSaudeFiltrados = useMemo(() => {
    if (!dados?.saude) return []
    const q = buscaSaude.trim().toLowerCase()
    return dados.saude.eventos_recentes.filter((ev) => {
      if (filtroSaudeModulo !== 'todos') {
        const mod = ev.modulo.toLowerCase()
        const alvo = filtroSaudeModulo.toLowerCase()
        if (!mod.includes(alvo) && alvo !== mod) return false
      }
      return incluiTexto([ev.descricao, ev.modulo, ev.referencia, ev.usuario], q)
    })
  }, [dados, buscaSaude, filtroSaudeModulo])

  const pagSemCaixa = useMemo(() => {
    if (!dados) return 0
    return dados.pagamentos.filter((p) => !p.cash_session_id && !p.cash_movement_id).length
  }, [dados])

  const textoResumoSuporte = useMemo(() => {
    if (!dados || !oficina) return ''
    const alertas = [
      ...(dados.saude?.alertas.map((a) => a.titulo) ?? []),
      ...(dados.caixa?.alertas.pagamentos_sem_movimento_caixa
        ? [`${dados.caixa.alertas.pagamentos_sem_movimento_caixa} pagamentos sem caixa`]
        : []),
      ...(dados.caixa?.alertas.caixa_aberto_ha_mais_de_24h ? ['Caixa aberto > 24h'] : []),
      ...(dados.portal?.alertas.pendentes_expirados
        ? [`${dados.portal.alertas.pendentes_expirados} aprovação(ões) pendente/expirada`]
        : []),
    ]
    const linhas = [
      `Oficina: ${dados.detalhes.nome}`,
      `Código: ${formatarOfficeIdCurto(dados.detalhes.office_id)}`,
      `Plano: ${getLabelPlano(dados.detalhes.plan_tier)}`,
      `Status: ${st?.label ?? '—'}`,
      `Tipo: ${dados.tipo_oficina ? labelTipoOficina(dados.tipo_oficina) : '—'}`,
      `Última atividade: ${
        dados.saude?.ultima_atividade_geral?.data_hora
          ? `${formatarDataBrasil(dados.saude.ultima_atividade_geral.data_hora)}${
              dados.saude.ultima_atividade_geral.modulo
                ? ` (${dados.saude.ultima_atividade_geral.modulo})`
                : ''
            }`
          : 'sem dados'
      }`,
      `Caixa: ${dados.caixa?.tem_caixa_aberto ? 'aberto' : dados.caixa ? 'fechado/sem aberto' : 'sem dados'}`,
      `Estoque crítico: baixo ${dados.estoque?.resumo.estoque_baixo ?? '—'} · zerados ${
        dados.estoque?.resumo.zerados ?? '—'
      }`,
      `Portal: pendentes ${dados.portal?.resumo.pendentes ?? '—'} · aprovados ${
        dados.portal?.resumo.aprovados ?? '—'
      } · recusados ${dados.portal?.resumo.recusados ?? '—'}`,
      `Alertas: ${alertas.length ? alertas.join('; ') : 'nenhum'}`,
      'Obs.: Pendências locais offline não são visíveis pelo servidor.',
    ]
    return linhas.join('\n')
  }, [dados, oficina, st?.label])

  async function copiarResumo() {
    if (!textoResumoSuporte) return
    setCopiando(true)
    try {
      await navigator.clipboard.writeText(textoResumoSuporte)
      toast.sucesso('Resumo copiado para a área de transferência.')
    } catch {
      toast.erro('Não foi possível copiar o resumo.')
    } finally {
      setCopiando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-2 border-b border-border px-3 py-3 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="break-words text-base sm:text-lg">
                Raio-X — {oficina?.nome ?? 'Oficina'}
              </DialogTitle>
              <DialogDescription className="break-words text-xs sm:text-sm">
                Código {oficina ? formatarOfficeIdCurto(oficina.office_id) : '—'}
                {oficina ? ` · ${getLabelPlano(oficina.plano)}` : ''}
                {dados?.tipo_oficina
                  ? ` · ${labelTipoOficina(dados.tipo_oficina)}`
                  : ''}
              </DialogDescription>
              {dados?.saude?.ultima_atividade_geral?.data_hora ? (
                <p className="text-xs text-muted-foreground break-words">
                  Última atividade:{' '}
                  {formatarDataBrasil(dados.saude.ultima_atividade_geral.data_hora)}
                  {dados.saude.ultima_atividade_geral.modulo
                    ? ` · ${dados.saude.ultima_atividade_geral.modulo}`
                    : ''}
                </p>
              ) : carregando ? (
                <p className="text-xs text-muted-foreground">Carregando última atividade…</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <ShieldAlert className="h-3.5 w-3.5" />
                Somente leitura
              </Badge>
              {st ? <Badge variant={st.variant}>{st.label}</Badge> : null}
              {dados?.saude?.alertas.length ? (
                <Badge variant="warning">{dados.saude.alertas.length} alerta(s)</Badge>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={carregando || !oficina}
                onClick={() => void carregar()}
              >
                {carregando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-6">
          {carregando && !dados ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando Raio-X…
            </div>
          ) : erro && !dados ? (
            <p className="text-sm text-destructive">{erro}</p>
          ) : dados ? (
            <Tabs value={aba} onValueChange={setAba} className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Diagnóstico rápido</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <CardDiagnostico
                    titulo="Pagamentos"
                    alerta={pagSemCaixa > 0}
                    linhas={[
                      `${dados.pagamentos.length} listado(s)`,
                      pagSemCaixa > 0 ? `${pagSemCaixa} sem caixa` : 'Sem alerta de caixa',
                    ]}
                  />
                  <CardDiagnostico
                    titulo="Caixa"
                    alerta={Boolean(
                      dados.caixa?.alertas.caixa_aberto_ha_mais_de_24h ||
                        dados.caixa?.alertas.ultimo_fechado_com_divergencia
                    )}
                    linhas={
                      dados.caixa
                        ? [
                            dados.caixa.tem_caixa_aberto ? 'Aberto' : 'Sem caixa aberto',
                            dados.caixa.alertas.pagamentos_sem_movimento_caixa
                              ? `${dados.caixa.alertas.pagamentos_sem_movimento_caixa} pag. sem mov.`
                              : 'Sem alerta principal',
                          ]
                        : [dados.erro_caixa ? 'Erro ao carregar' : 'Sem dados']
                    }
                  />
                  <CardDiagnostico
                    titulo="Estoque"
                    alerta={Boolean(
                      (dados.estoque?.resumo.estoque_baixo ?? 0) > 0 ||
                        (dados.estoque?.resumo.zerados ?? 0) > 0
                    )}
                    linhas={
                      dados.estoque
                        ? [
                            `Baixo: ${dados.estoque.resumo.estoque_baixo}`,
                            `Zerados: ${dados.estoque.resumo.zerados}`,
                          ]
                        : [dados.erro_estoque ? 'Erro ao carregar' : 'Sem dados']
                    }
                  />
                  <CardDiagnostico
                    titulo="Portal/Aprovações"
                    alerta={(dados.portal?.resumo.pendentes ?? 0) > 0}
                    linhas={
                      dados.portal
                        ? [
                            `Pendentes: ${dados.portal.resumo.pendentes}`,
                            `Aprovados: ${dados.portal.resumo.aprovados} · Recusados: ${dados.portal.resumo.recusados}`,
                          ]
                        : [dados.erro_portal ? 'Erro ao carregar' : 'Sem dados']
                    }
                  />
                  <CardDiagnostico
                    titulo="Saúde / Sync"
                    alerta={(dados.saude?.alertas.length ?? 0) > 0}
                    linhas={
                      dados.saude
                        ? [
                            dados.saude.ultima_atividade_geral?.data_hora
                              ? formatarDataBrasil(
                                  dados.saude.ultima_atividade_geral.data_hora
                                )
                              : 'Sem atividade',
                            `${dados.saude.alertas.length} alerta(s)`,
                          ]
                        : [dados.erro_saude ? 'Erro ao carregar' : 'Sem dados']
                    }
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border px-3 py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Resumo para suporte</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!textoResumoSuporte || copiando}
                    onClick={() => void copiarResumo()}
                  >
                    {copiando ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Copiar resumo
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                  {textoResumoSuporte || 'Sem dados'}
                </pre>
              </div>

              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 overflow-x-hidden">
                <TabsTrigger value="resumo" className="shrink-0">
                  Resumo
                </TabsTrigger>
                <TabsTrigger value="usuarios" className="shrink-0">
                  Usuários
                </TabsTrigger>
                <TabsTrigger value="os" className="shrink-0">
                  OS
                </TabsTrigger>
                <TabsTrigger value="pagamentos" className="shrink-0">
                  Pagamentos
                </TabsTrigger>
                <TabsTrigger value="caixa" className="shrink-0">
                  Caixa
                </TabsTrigger>
                <TabsTrigger value="estoque" className="shrink-0">
                  Estoque
                </TabsTrigger>
                <TabsTrigger value="portal" className="shrink-0">
                  Portal/Aprovações
                </TabsTrigger>
                <TabsTrigger value="sync" className="shrink-0">
                  Saúde / Sync
                </TabsTrigger>
              </TabsList>

              <TabsContent value="resumo" className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Campo label="Nome" valor={dados.detalhes.nome} />
                  <Campo
                    label="Código"
                    valor={formatarOfficeIdCurto(dados.detalhes.office_id)}
                  />
                  <Campo label="Status" valor={st?.label ?? '—'} />
                  <Campo label="Plano" valor={getLabelPlano(dados.detalhes.plan_tier)} />
                  <Campo
                    label="Trial / vencimento"
                    valor={
                      dados.detalhes.trial_fim
                        ? formatarDataBrasil(dados.detalhes.trial_fim)
                        : '—'
                    }
                  />
                  <Campo
                    label="Tipo"
                    valor={
                      dados.tipo_oficina ? labelTipoOficina(dados.tipo_oficina) : '—'
                    }
                  />
                  <Campo
                    label="Fiscal adicional"
                    valor={dados.fiscal_adicional ? 'Ativo' : 'Não'}
                  />
                  <Campo
                    label="Criada em"
                    valor={
                      dados.detalhes.criado_em
                        ? formatarDataBrasil(dados.detalhes.criado_em)
                        : '—'
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Totulo label="Clientes" valor={dados.detalhes.totais.clientes} />
                  <Totulo label="Veículos" valor={dados.detalhes.totais.motos} />
                  <Totulo label="OS" valor={dados.detalhes.totais.ordens} />
                  <Totulo label="Pagamentos" valor={dados.detalhes.totais.pagamentos} />
                  <Totulo label="Itens estoque" valor={dados.detalhes.totais.pecas} />
                </div>
              </TabsContent>

              <TabsContent value="usuarios" className="space-y-2">
                {dados.usuarios.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {dados.usuarios.map((u) => (
                      <li key={u.id} className="px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium break-words">{u.nome}</span>
                          <Badge variant="outline">{u.papel}</Badge>
                          <Badge variant={u.ativo ? 'success' : 'warning'}>
                            {u.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground break-all">{u.email}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="os" className="space-y-2">
                {dados.ordens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma OS encontrada.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {dados.ordens.map((o) => (
                      <li
                        key={o.id}
                        className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium break-words">{o.titulo}</p>
                          {o.subtitulo ? (
                            <p className="text-xs text-muted-foreground break-words">
                              {o.subtitulo}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                          {o.valor ? <p>{o.valor}</p> : null}
                          {o.data ? <p>{formatarDataBrasil(o.data)}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="pagamentos" className="space-y-3">
                {dados.erro_pagamentos ? (
                  <p className="text-sm text-destructive">
                    {mensagemErroAmigavel(dados.erro_pagamentos)}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2">
                  <BarraBusca
                    value={buscaPag}
                    onChange={setBuscaPag}
                    placeholder="Buscar cliente, veículo, placa, OS, método…"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ['todos', 'Todos'],
                        ['pagos', 'Pagos'],
                        ['cancelados', 'Cancelados'],
                        ['estornados', 'Estornados'],
                        ['sem_caixa', 'Sem caixa'],
                        ['origem_nao', 'Origem não id.'],
                      ] as Array<[FiltroPagamento, string]>
                    ).map(([v, l]) => (
                      <ChipFiltro
                        key={v}
                        valor={v}
                        atual={filtroPag}
                        onChange={setFiltroPag}
                        label={l}
                      />
                    ))}
                  </div>
                </div>
                {dados.pagamentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum pagamento encontrado para esta oficina.
                  </p>
                ) : pagamentosFiltrados.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum pagamento corresponde aos filtros.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pagamentosFiltrados.map((p) => (
                      <li
                        key={p.payment_id}
                        className="rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium break-words">
                              {formatarMoeda(p.amount)}
                              {p.payment_method ? (
                                <span className="ml-2 font-normal text-muted-foreground">
                                  · {p.payment_method}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {p.payment_created_at
                                ? formatarDataBrasil(p.payment_created_at)
                                : p.payment_date
                                  ? formatarDataBrasil(p.payment_date)
                                  : '—'}
                            </p>
                          </div>
                          <div className="flex max-w-full flex-wrap gap-1">
                            {badgesPagamento(p).map((b) => (
                              <Badge key={b.label} variant={b.variant}>
                                {b.label}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                          <p className="break-words">Origem: {p.origem_texto}</p>
                          <p className="break-words">Cliente: {p.customer_name || '—'}</p>
                          <p className="break-words">
                            Veículo: {p.vehicle_name || '—'}
                            {p.vehicle_plate ? ` · ${p.vehicle_plate}` : ''}
                          </p>
                          <p className="break-words">Recebido por: {p.received_by_name || '—'}</p>
                          <p>
                            Caixa:{' '}
                            {p.cash_session_id
                              ? `${p.cash_session_status ?? 'session'} (${p.cash_session_id.slice(0, 8)}…)`
                              : '—'}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="caixa" className="space-y-3">
                {dados.erro_caixa ? (
                  <p className="text-sm text-destructive">
                    {mensagemErroAmigavel(dados.erro_caixa)}
                  </p>
                ) : null}
                {!dados.caixa ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum movimento de caixa encontrado.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Campo
                        label="Caixa aberto?"
                        valor={dados.caixa.tem_caixa_aberto ? 'Sim' : 'Não'}
                      />
                      {dados.caixa.sessao_aberta ? (
                        <>
                          <Campo
                            label="Aberto por"
                            valor={dados.caixa.sessao_aberta.opened_by_name || '—'}
                          />
                          <Campo
                            label="Entradas"
                            valor={formatarMoeda(
                              Number(dados.caixa.sessao_aberta.entradas ?? 0)
                            )}
                          />
                          <Campo
                            label="Saídas"
                            valor={formatarMoeda(
                              Number(dados.caixa.sessao_aberta.saidas ?? 0)
                            )}
                          />
                        </>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2">
                      <BarraBusca
                        value={buscaCaixa}
                        onChange={setBuscaCaixa}
                        placeholder="Buscar descrição, origem, usuário, OS…"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            ['todos', 'Todos'],
                            ['entrada', 'Entrada'],
                            ['saida', 'Saída'],
                            ['estorno', 'Estorno'],
                            ['ajuste', 'Ajuste'],
                            ['manual', 'Manual'],
                            ['os', 'OS'],
                            ['venda_balcao', 'Venda balcão'],
                          ] as Array<[FiltroCaixa, string]>
                        ).map(([v, l]) => (
                          <ChipFiltro
                            key={v}
                            valor={v}
                            atual={filtroCaixa}
                            onChange={setFiltroCaixa}
                            label={l}
                          />
                        ))}
                      </div>
                    </div>
                    {dados.caixa.movimentos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum movimento de caixa encontrado.
                      </p>
                    ) : movimentosCaixaFiltrados.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum movimento corresponde aos filtros.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {movimentosCaixaFiltrados.map((m) => (
                          <li
                            key={m.movement_id}
                            className="rounded-lg border border-border px-3 py-2 text-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium break-words">
                                  {formatarMoeda(m.amount)}
                                  {m.payment_method ? (
                                    <span className="ml-2 font-normal text-muted-foreground">
                                      · {m.payment_method}
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {m.created_at ? formatarDataBrasil(m.created_at) : '—'}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant="outline">
                                  {m.tipo_fluxo || m.movement_type || '—'}
                                </Badge>
                                <Badge variant="info">{m.origem_texto}</Badge>
                              </div>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground break-words">
                              {m.descricao ? `${m.descricao} · ` : ''}
                              OS{' '}
                              {m.service_order_number != null
                                ? `#${m.service_order_number}`
                                : '—'}
                              {m.created_by_name ? ` · ${m.created_by_name}` : ''}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="estoque" className="space-y-3">
                {dados.erro_estoque ? (
                  <p className="text-sm text-destructive">
                    {mensagemErroAmigavel(dados.erro_estoque)}
                  </p>
                ) : null}
                {!dados.estoque ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum item crítico de estoque.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Totulo label="Itens" valor={dados.estoque.resumo.total_itens} />
                      <Totulo label="Baixo" valor={dados.estoque.resumo.estoque_baixo} />
                      <Totulo label="Zerados" valor={dados.estoque.resumo.zerados} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <BarraBusca
                        value={buscaEstoque}
                        onChange={setBuscaEstoque}
                        placeholder="Buscar peça ou código…"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            ['todos', 'Todos'],
                            ['baixo', 'Baixo'],
                            ['zerado', 'Zerado'],
                            ['normal', 'Normal'],
                            ['inativo', 'Inativo'],
                          ] as Array<[FiltroEstoque, string]>
                        ).map(([v, l]) => (
                          <ChipFiltro
                            key={v}
                            valor={v}
                            atual={filtroEstoque}
                            onChange={setFiltroEstoque}
                            label={l}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium">Itens críticos</p>
                      {itensEstoqueFiltrados.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhum item crítico de estoque.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border rounded-lg border border-border">
                          {itensEstoqueFiltrados.map((i) => (
                            <li
                              key={i.item_id}
                              className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="font-medium break-words">{i.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {i.code ? `SKU ${i.code} · ` : ''}
                                  Qtd {i.quantity} · Mín {i.minimum_stock}
                                </p>
                              </div>
                              <Badge
                                variant={
                                  i.status === 'zerado'
                                    ? 'destructive'
                                    : i.status === 'baixo'
                                      ? 'warning'
                                      : 'outline'
                                }
                              >
                                {i.status}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium">Movimentações recentes</p>
                      {movEstoqueFiltrados.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma movimentação recente encontrada.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {movEstoqueFiltrados.map((m) => (
                            <li
                              key={m.movement_id}
                              className="rounded-lg border border-border px-3 py-2 text-sm"
                            >
                              <p className="font-medium break-words">
                                {m.item_name || 'Peça'} · qtd {m.quantity}
                              </p>
                              <p className="text-xs text-muted-foreground break-words">
                                {m.origem_texto}
                                {m.service_order_number != null
                                  ? ` · OS #${m.service_order_number}`
                                  : ''}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="portal" className="space-y-3">
                {dados.erro_portal ? (
                  <p className="text-sm text-destructive">
                    {mensagemErroAmigavel(dados.erro_portal)}
                  </p>
                ) : null}
                {!dados.portal ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum link de aprovação encontrado.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Totulo label="Pendentes" valor={dados.portal.resumo.pendentes} />
                      <Totulo label="Aprovados" valor={dados.portal.resumo.aprovados} />
                      <Totulo
                        label="Parciais"
                        valor={dados.portal.resumo.aprovados_parcialmente}
                      />
                      <Totulo label="Recusados" valor={dados.portal.resumo.recusados} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <BarraBusca
                        value={buscaPortal}
                        onChange={setBuscaPortal}
                        placeholder="Buscar cliente, veículo, orçamento, status…"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            ['todos', 'Todos'],
                            ['pendentes', 'Pendentes'],
                            ['aprovados', 'Aprovados'],
                            ['aprovados_parcialmente', 'Parciais'],
                            ['recusados', 'Recusados'],
                            ['expirados', 'Expirados'],
                            ['convertidos', 'Convertidos'],
                          ] as Array<[FiltroPortal, string]>
                        ).map(([v, l]) => (
                          <ChipFiltro
                            key={v}
                            valor={v}
                            atual={filtroPortal}
                            onChange={setFiltroPortal}
                            label={l}
                          />
                        ))}
                      </div>
                    </div>
                    {dados.portal.links.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum link de aprovação encontrado.
                      </p>
                    ) : linksPortalFiltrados.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum link corresponde aos filtros.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {linksPortalFiltrados.map((l) => (
                          <li
                            key={l.approval_link_id}
                            className="rounded-lg border border-border px-3 py-2 text-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium break-words">
                                  Orçamento #{l.orcamento_numero ?? '—'}
                                </p>
                                <p className="text-xs text-muted-foreground break-words">
                                  {l.customer_name || '—'}
                                  {l.vehicle_plate ? ` · ${l.vehicle_plate}` : ''}
                                </p>
                              </div>
                              <Badge
                                variant={
                                  l.status === 'aprovado' ||
                                  l.status === 'aprovado_parcialmente'
                                    ? 'success'
                                    : l.status === 'recusado' || l.status === 'revogado'
                                      ? 'destructive'
                                      : l.status === 'expirado'
                                        ? 'warning'
                                        : 'outline'
                                }
                              >
                                {l.status}
                              </Badge>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Tokens e links com token não são exibidos nesta tela.
                    </p>
                  </>
                )}
              </TabsContent>

              <TabsContent value="sync" className="space-y-3">
                {dados.erro_saude ? (
                  <p className="text-sm text-destructive">
                    {mensagemErroAmigavel(dados.erro_saude)}
                  </p>
                ) : null}
                {!dados.saude ? (
                  <p className="text-sm text-muted-foreground">
                    Não há eventos recentes observáveis pelo servidor.
                  </p>
                ) : (
                  <>
                    <div className="rounded-lg border border-border px-3 py-3 space-y-1">
                      <p className="text-sm font-medium">Última atividade observada</p>
                      {dados.saude.ultima_atividade_geral?.data_hora ? (
                        <p className="text-sm break-words">
                          {formatarDataBrasil(dados.saude.ultima_atividade_geral.data_hora)}
                          {dados.saude.ultima_atividade_geral.modulo
                            ? ` · ${dados.saude.ultima_atividade_geral.modulo}`
                            : ''}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Sem atividade observada.</p>
                      )}
                    </div>

                    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">Limitação do diagnóstico</p>
                      <p className="mt-1 break-words">{dados.saude.limitacoes.texto}</p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <BarraBusca
                        value={buscaSaude}
                        onChange={setBuscaSaude}
                        placeholder="Buscar em eventos recentes…"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          'todos',
                          'OS',
                          'Clientes',
                          'Veículos',
                          'Pagamentos',
                          'Caixa',
                          'Estoque',
                          'Portal',
                          'Fotos',
                          'Comunicação',
                        ].map((v) => (
                          <ChipFiltro
                            key={v}
                            valor={v}
                            atual={filtroSaudeModulo}
                            onChange={setFiltroSaudeModulo}
                            label={v === 'todos' ? 'Todos' : v}
                          />
                        ))}
                      </div>
                    </div>

                    {dados.saude.alertas.length > 0 ? (
                      <ul className="space-y-2">
                        {dados.saude.alertas.map((a) => (
                          <li
                            key={a.codigo}
                            className="rounded-lg border border-border px-3 py-2 text-sm"
                          >
                            <Badge variant={a.nivel === 'atencao' ? 'warning' : 'info'}>
                              {a.nivel}
                            </Badge>
                            <p className="mt-1 font-medium break-words">{a.titulo}</p>
                            <p className="text-xs text-muted-foreground break-words">
                              {a.detalhe}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div>
                      <p className="mb-2 text-sm font-medium">Eventos recentes observados</p>
                      {eventosSaudeFiltrados.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Não há eventos recentes observáveis pelo servidor.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {eventosSaudeFiltrados.map((ev, idx) => (
                            <li
                              key={`${ev.modulo}-${ev.data_hora ?? idx}-${idx}`}
                              className="rounded-lg border border-border px-3 py-2 text-sm"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-medium break-words">{ev.descricao}</p>
                                  <p className="text-xs text-muted-foreground break-words">
                                    {ev.data_hora
                                      ? formatarDataBrasil(ev.data_hora)
                                      : '—'}
                                    {ev.referencia ? ` · ${ev.referencia}` : ''}
                                  </p>
                                </div>
                                <Badge variant="outline">{ev.modulo}</Badge>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{valor}</p>
    </div>
  )
}

function Totulo({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2 text-center">
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
