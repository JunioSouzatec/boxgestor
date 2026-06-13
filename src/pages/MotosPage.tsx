import { useState, useEffect } from 'react'
import { textoBuscaSeguro } from '@/lib/dados-legados'
import { Plus, Pencil, Trash2, History } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { GarantiaAtivaBadge } from '@/components/shared/StatusBadges'
import { MotoHistoricoDialog } from '@/components/motos/MotoHistoricoDialog'
import { obterGarantiaAtivaMoto } from '@/lib/os'
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
import { BotaoWhatsApp } from '@/components/comunicacao/BotaoWhatsApp'
import type { Moto } from '@/types'

type FormMoto = Omit<Moto, 'id' | 'oficina_id' | 'criado_em'>

const formVazio: FormMoto = {
  cliente_id: '',
  marca: '',
  modelo: '',
  ano: new Date().getFullYear(),
  placa: '',
  cor: '',
  quilometragem: 0,
  chassi: '',
  observacoes: '',
}

export function MotosPage() {
  const { adicionarMoto, atualizarMoto, excluirMoto } = useCraft()
  const { motos, clientes, ordens } = useOficinaData()
  const { limiteAtingido, temRecurso } = useAssinatura()
  const [searchParams, setSearchParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [historicoMoto, setHistoricoMoto] = useState<Moto | null>(null)
  const [editando, setEditando] = useState<Moto | null>(null)
  const [form, setForm] = useState<FormMoto>(formVazio)

  useEffect(() => {
    const clienteId = searchParams.get('cliente')
    if (!clienteId || !clientes.some((c) => c.id === clienteId)) return
    if (limiteAtingido('motos')) return
    setEditando(null)
    setForm({ ...formVazio, cliente_id: clienteId })
    setDialogAberto(true)
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez ao vir de outra tela
  }, [searchParams.get('cliente'), clientes.length])

  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'

  const motosFiltradas = motos.filter(
    (m) =>
      textoBuscaSeguro(m.placa).includes(busca.toLowerCase()) ||
      textoBuscaSeguro(m.marca).includes(busca.toLowerCase()) ||
      textoBuscaSeguro(m.modelo).includes(busca.toLowerCase()) ||
      getClienteNome(m.cliente_id).toLowerCase().includes(busca.toLowerCase())
  )

  function abrirNovo() {
    if (limiteAtingido('motos')) return
    setEditando(null)
    setForm(formVazio)
    setDialogAberto(true)
  }

  function abrirEditar(moto: Moto) {
    setEditando(moto)
    setForm({
      cliente_id: moto.cliente_id,
      marca: moto.marca,
      modelo: moto.modelo,
      ano: moto.ano,
      placa: moto.placa,
      cor: moto.cor,
      quilometragem: moto.quilometragem,
      chassi: moto.chassi ?? '',
      observacoes: moto.observacoes ?? '',
    })
    setDialogAberto(true)
  }

  function salvar() {
    if (!form.cliente_id || !form.marca.trim() || !form.modelo.trim() || !form.placa.trim()) return

    const dados = {
      ...form,
      chassi: form.chassi || undefined,
      observacoes: form.observacoes || undefined,
    }

    if (editando) {
      atualizarMoto(editando.id, dados)
    } else {
      adicionarMoto(dados)
    }
    setDialogAberto(false)
  }

  function confirmarExclusao(moto: Moto) {
    if (window.confirm(`Excluir a moto ${moto.marca} ${moto.modelo} (${moto.placa})?`)) {
      excluirMoto(moto.id)
    }
  }

  function abrirHistorico(moto: Moto) {
    if (!temRecurso('historico_avancado_moto')) {
      window.alert('Histórico avançado disponível no plano Premium. Acesse Planos para fazer upgrade.')
      return
    }
    setHistoricoMoto(moto)
  }

  return (
    <div>
      <PageHeader
        titulo="Motos"
        descricao="Motos cadastradas vinculadas aos clientes"
        acoes={
          <Button
            onClick={abrirNovo}
            disabled={clientes.length === 0 || limiteAtingido('motos')}
          >
            <Plus className="h-4 w-4" />
            Nova moto
          </Button>
        }
      />

      <AvisoLimitePlano tipo="motos" />

      <Card>
        <CardContent className="pt-6">
          <BuscaInput
            valor={busca}
            onChange={setBusca}
            placeholder="Buscar por placa, marca, modelo ou cliente..."
            className="mb-4 max-w-sm"
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Marca / Modelo</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Cor</TableHead>
                <TableHead>KM</TableHead>
                <TableHead>Garantia</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {motosFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Nenhuma moto encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                motosFiltradas.map((moto) => {
                  const emGarantia = obterGarantiaAtivaMoto(moto.id, ordens) !== null
                  return (
                  <TableRow key={moto.id}>
                    <TableCell>{getClienteNome(moto.cliente_id)}</TableCell>
                    <TableCell className="font-medium">
                      {moto.marca} {moto.modelo}
                    </TableCell>
                    <TableCell>{moto.ano}</TableCell>
                    <TableCell>{moto.placa}</TableCell>
                    <TableCell>{moto.cor}</TableCell>
                    <TableCell>{moto.quilometragem.toLocaleString('pt-BR')} km</TableCell>
                    <TableCell>
                      {emGarantia ? <GarantiaAtivaBadge /> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(() => {
                          const clienteMoto = clientes.find((c) => c.id === moto.cliente_id)
                          return clienteMoto ? (
                            <BotaoWhatsApp cliente={clienteMoto} moto={moto} />
                          ) : null
                        })()}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => abrirHistorico(moto)}
                          title={
                            temRecurso('historico_avancado_moto')
                              ? 'Histórico'
                              : 'Histórico — Premium'
                          }
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => abrirEditar(moto)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => confirmarExclusao(moto)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )})
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar moto' : 'Nova moto'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Cliente *</Label>
              <Select
                value={form.cliente_id}
                onValueChange={(v) => setForm({ ...form, cliente_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
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
              <Label htmlFor="marca">Marca *</Label>
              <Input
                id="marca"
                value={form.marca}
                onChange={(e) => setForm({ ...form, marca: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="modelo">Modelo *</Label>
              <Input
                id="modelo"
                value={form.modelo}
                onChange={(e) => setForm({ ...form, modelo: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ano">Ano</Label>
              <Input
                id="ano"
                type="number"
                value={form.ano}
                onChange={(e) => setForm({ ...form, ano: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="placa">Placa *</Label>
              <Input
                id="placa"
                value={form.placa}
                onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cor">Cor</Label>
              <Input
                id="cor"
                value={form.cor}
                onChange={(e) => setForm({ ...form, cor: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="km">Quilometragem</Label>
              <Input
                id="km"
                type="number"
                value={form.quilometragem}
                onChange={(e) => setForm({ ...form, quilometragem: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="chassi">Chassi</Label>
              <Input
                id="chassi"
                value={form.chassi}
                onChange={(e) => setForm({ ...form, chassi: e.target.value })}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
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

      {temRecurso('historico_avancado_moto') && (
        <MotoHistoricoDialog
          moto={historicoMoto}
          ordens={ordens}
          clientes={clientes}
          aberto={historicoMoto !== null}
          onFechar={() => setHistoricoMoto(null)}
        />
      )}
    </div>
  )
}
