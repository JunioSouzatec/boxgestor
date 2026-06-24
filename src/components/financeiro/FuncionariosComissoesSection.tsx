import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
} from '@/services/comissoes/comissoes.service'
import { podeGerenciarComissoesFuncionarios } from '@/services/auth/permissions'
import { formatarMoeda, getMesLocalAtual } from '@/lib/utils'
import {
  TIPOS_COMISSAO,
  obterComissoesConfig,
  type PerfilComissaoFuncionario,
  type PerfilComissaoFuncionarioInput,
  type TipoComissaoFuncionario,
} from '@/types/comissoes'
import { getLabelPapel, type AuthUser } from '@/types/auth'

type FormPerfil = PerfilComissaoFuncionarioInput & { id?: string }

const formVazio: FormPerfil = {
  nome: '',
  cargo: '',
  salario_fixo_mensal: 0,
  comissao_ativa: false,
  tipo_comissao: 'sem_comissao',
  percentual_comissao: 0,
  valor_fixo_por_os: 0,
  observacoes: '',
}

function cargoPadraoUsuario(user: AuthUser): string {
  return getLabelPapel(user.papel)
}

export function FuncionariosComissoesSection() {
  const { session, carregarUsuarios } = useAuth()
  const { salvarPerfilComissao, excluirPerfilComissao } = useCraft()
  const { perfisComissao, ordens, lancamentos, configuracao } = useOficinaData()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { verificarEscrita } = usePlanoEscrita()

  const [mesReferencia, setMesReferencia] = useState(getMesLocalAtual())
  const [dialogAberto, setDialogAberto] = useState(false)
  const [form, setForm] = useState<FormPerfil>(formVazio)
  const [usuarios, setUsuarios] = useState<AuthUser[]>([])

  const config = useMemo(() => obterComissoesConfig(configuracao), [configuracao])
  const podeGerenciar = podeGerenciarComissoesFuncionarios(session?.user)

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
          comissao: acc.comissao + r.total_comissao,
          pagar: acc.pagar + r.total_estimado_pagar,
        }),
        { os: 0, maoObra: 0, comissao: 0, pagar: 0 }
      ),
    [relatorio]
  )

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

    const payload: FormPerfil = {
      ...form,
      nome: form.nome.trim(),
      cargo: form.cargo.trim(),
      tipo_comissao: form.comissao_ativa ? form.tipo_comissao : 'sem_comissao',
      percentual_comissao:
        form.tipo_comissao === 'percentual_mao_obra' ? form.percentual_comissao : undefined,
      valor_fixo_por_os:
        form.tipo_comissao === 'valor_fixo_os' ? form.valor_fixo_por_os : undefined,
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
                        {p.tipo_comissao === 'percentual_mao_obra' &&
                          ` (${p.percentual_comissao ?? 0}%)`}
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
              Estimativa com base nas OS elegíveis e no campo responsável da OS.
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
                <TableHead>Salário fixo</TableHead>
                <TableHead className="text-center">Qtd. OS</TableHead>
                <TableHead className="text-right">Mão de obra</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-right">Total estimado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relatorio.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum funcionário cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                relatorio.map((r) => (
                  <TableRow key={r.perfil_id}>
                    <TableCell>
                      <p className="font-medium">{r.nome}</p>
                      <p className="text-xs text-muted-foreground">{r.cargo}</p>
                    </TableCell>
                    <TableCell>{formatarMoeda(r.salario_fixo)}</TableCell>
                    <TableCell className="text-center">{r.quantidade_os}</TableCell>
                    <TableCell className="text-right">{formatarMoeda(r.total_mao_obra)}</TableCell>
                    <TableCell className="text-right">{formatarMoeda(r.total_comissao)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatarMoeda(r.total_estimado_pagar)}
                    </TableCell>
                  </TableRow>
                ))
              )}
              {relatorio.length > 0 && (
                <TableRow className="bg-muted/30 font-medium">
                  <TableCell colSpan={2}>Totais</TableCell>
                  <TableCell className="text-center">{totaisRelatorio.os}</TableCell>
                  <TableCell className="text-right">{formatarMoeda(totaisRelatorio.maoObra)}</TableCell>
                  <TableCell className="text-right">{formatarMoeda(totaisRelatorio.comissao)}</TableCell>
                  <TableCell className="text-right">{formatarMoeda(totaisRelatorio.pagar)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

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

                {form.tipo_comissao === 'percentual_mao_obra' && (
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
