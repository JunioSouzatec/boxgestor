import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { AgendamentosDiaPanel } from '@/components/agenda/AgendamentosDiaPanel'
import { CalendarioMensal } from '@/components/agenda/CalendarioMensal'
import { StatusAgendamentoBadge } from '@/components/shared/StatusBadges'
import { obterNumeroOSAgendamento } from '@/lib/agendamento'
import { contarAgendamentosPorDia, formatarDataISO } from '@/lib/calendario'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { formatarData } from '@/lib/utils'
import type { Agendamento, StatusAgendamento } from '@/types'
import { STATUS_AGENDAMENTO } from '@/types'

type FormAgendamento = Omit<Agendamento, 'id' | 'oficina_id'>

const formVazio: FormAgendamento = {
  data: formatarDataISO(new Date()),
  horario: '09:00',
  cliente_id: '',
  moto_id: '',
  servico: '',
  status: 'agendado',
  observacoes: '',
}

export function AgendaPage() {
  const { adicionarAgendamento, atualizarAgendamento, excluirAgendamento } = useCraft()
  const { agendamentos, clientes, motos, ordens } = useOficinaData()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<Agendamento | null>(null)
  const [form, setForm] = useState<FormAgendamento>(formVazio)
  const [filtroData, setFiltroData] = useState('')
  const [mesReferencia, setMesReferencia] = useState(() => new Date())
  const [diaSelecionado, setDiaSelecionado] = useState(() => formatarDataISO(new Date()))

  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'
  const getMotoLabel = (id: string) => {
    const m = motos.find((mo) => mo.id === id)
    return m ? `${m.marca} ${m.modelo} (${m.placa})` : '—'
  }

  const motosDoCliente = useMemo(
    () => motos.filter((m) => m.cliente_id === form.cliente_id),
    [motos, form.cliente_id]
  )

  const contagemPorDia = useMemo(
    () => contarAgendamentosPorDia(agendamentos),
    [agendamentos]
  )

  const agendamentosFiltrados = agendamentos
    .filter((a) => !filtroData || a.data === filtroData)
    .sort((a, b) => {
      const cmpData = a.data.localeCompare(b.data)
      return cmpData !== 0 ? cmpData : a.horario.localeCompare(b.horario)
    })

  function abrirNovo(data?: string) {
    setEditando(null)
    setForm({
      ...formVazio,
      data: data ?? diaSelecionado,
    })
    setDialogAberto(true)
  }

  function abrirEditar(ag: Agendamento) {
    setEditando(ag)
    setForm({
      data: ag.data,
      horario: ag.horario,
      cliente_id: ag.cliente_id,
      moto_id: ag.moto_id,
      servico: ag.servico,
      status: ag.status,
      observacoes: ag.observacoes ?? '',
      ordem_servico_id: ag.ordem_servico_id,
    })
    setDialogAberto(true)
  }

  function salvar() {
    if (!form.cliente_id || !form.moto_id || !form.servico.trim()) return

    const dados = {
      ...form,
      observacoes: form.observacoes || undefined,
      ordem_servico_id: form.ordem_servico_id || undefined,
    }

    if (editando) {
      atualizarAgendamento(editando.id, dados)
    } else {
      adicionarAgendamento(dados)
    }
    setDialogAberto(false)
  }

  function confirmarExclusao(ag: Agendamento) {
    if (window.confirm('Excluir este agendamento?')) {
      excluirAgendamento(ag.id)
    }
  }

  function selecionarDia(data: string) {
    setDiaSelecionado(data)
    const [ano, mes] = data.split('-').map(Number)
    setMesReferencia(new Date(ano, mes - 1, 1))
  }

  return (
    <RecursoPlanoGate recurso="agenda" pagina>
      <div>
      <PageHeader
        titulo="Agenda"
        descricao="Calendário de serviços e agendamentos"
        acoes={
          <Button onClick={() => abrirNovo()} disabled={clientes.length === 0}>
            <Plus className="h-4 w-4" />
            Novo agendamento
          </Button>
        }
      />

      <Tabs defaultValue="calendario">
        <TabsList className="mb-4">
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
          <TabsTrigger value="lista">Lista</TabsTrigger>
        </TabsList>

        <TabsContent value="calendario">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <CalendarioMensal
                  mesReferencia={mesReferencia}
                  onMesChange={setMesReferencia}
                  diaSelecionado={diaSelecionado}
                  onSelecionarDia={selecionarDia}
                  contagemPorDia={contagemPorDia}
                />
              </CardContent>
            </Card>

            <AgendamentosDiaPanel
              data={diaSelecionado}
              agendamentos={agendamentos}
              clientes={clientes}
              motos={motos}
              ordens={ordens}
              onEditar={abrirEditar}
              onExcluir={confirmarExclusao}
            />
          </div>
        </TabsContent>

        <TabsContent value="lista">
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 flex flex-wrap items-end gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="filtro-data">Filtrar por data</Label>
                  <Input
                    id="filtro-data"
                    type="date"
                    value={filtroData}
                    onChange={(e) => setFiltroData(e.target.value)}
                    className="w-auto"
                  />
                </div>
                {filtroData && (
                  <Button variant="outline" size="sm" onClick={() => setFiltroData('')}>
                    Limpar filtro
                  </Button>
                )}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Moto</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agendamentosFiltrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        Nenhum agendamento encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    agendamentosFiltrados.map((ag) => {
                      const numeroOS = obterNumeroOSAgendamento(ag, ordens)
                      return (
                        <TableRow key={ag.id}>
                          <TableCell>{formatarData(ag.data)}</TableCell>
                          <TableCell className="font-medium">{ag.horario}</TableCell>
                          <TableCell>{getClienteNome(ag.cliente_id)}</TableCell>
                          <TableCell>{getMotoLabel(ag.moto_id)}</TableCell>
                          <TableCell>{ag.servico}</TableCell>
                          <TableCell>
                            {numeroOS !== null ? (
                              <span className="font-medium text-primary">#{numeroOS}</span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusAgendamentoBadge status={ag.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => abrirEditar(ag)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => confirmarExclusao(ag)}
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar agendamento' : 'Novo agendamento'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="data">Data</Label>
                <Input
                  id="data"
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="hora">Horário</Label>
                <Input
                  id="hora"
                  type="time"
                  value={form.horario}
                  onChange={(e) => setForm({ ...form, horario: e.target.value })}
                />
              </div>
            </div>
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
                onValueChange={(v) => setForm({ ...form, moto_id: v })}
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
            <div className="grid gap-2">
              <Label htmlFor="servico">Serviço *</Label>
              <Input
                id="servico"
                value={form.servico}
                onChange={(e) => setForm({ ...form, servico: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as StatusAgendamento })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_AGENDAMENTO.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </RecursoPlanoGate>
  )
}
