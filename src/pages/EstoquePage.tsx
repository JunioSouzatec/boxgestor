import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { EstoqueBadge } from '@/components/shared/StatusBadges'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Label } from '@/components/ui/label'
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
import { cn, formatarMoeda } from '@/lib/utils'
import type { Peca } from '@/types'

type FormPeca = Omit<Peca, 'id' | 'oficina_id'>

const formVazio: FormPeca = {
  nome: '',
  codigo: '',
  marca: '',
  custo: 0,
  preco_venda: 0,
  quantidade: 0,
  estoque_minimo: 5,
}

export function EstoquePage() {
  const { adicionarPeca, atualizarPeca, excluirPeca } = useCraft()
  const { pecas } = useOficinaData()
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<Peca | null>(null)
  const [form, setForm] = useState<FormPeca>(formVazio)

  const pecasFiltradas = pecas.filter(
    (p) =>
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busca.toLowerCase()) ||
      p.marca.toLowerCase().includes(busca.toLowerCase())
  )

  function abrirNova() {
    setEditando(null)
    setForm(formVazio)
    setDialogAberto(true)
  }

  function abrirEditar(peca: Peca) {
    setEditando(peca)
    setForm({
      nome: peca.nome,
      codigo: peca.codigo,
      marca: peca.marca,
      custo: peca.custo,
      preco_venda: peca.preco_venda,
      quantidade: peca.quantidade,
      estoque_minimo: peca.estoque_minimo,
    })
    setDialogAberto(true)
  }

  function salvar() {
    if (!form.nome.trim() || !form.codigo.trim()) return

    if (editando) {
      atualizarPeca(editando.id, form)
    } else {
      adicionarPeca(form)
    }
    setDialogAberto(false)
  }

  function confirmarExclusao(peca: Peca) {
    if (window.confirm(`Excluir a peça "${peca.nome}"?`)) {
      excluirPeca(peca.id)
    }
  }

  return (
    <RecursoPlanoGate recurso="estoque" pagina>
      <div>
      <PageHeader
        titulo="Estoque"
        descricao="Controle de peças e alertas de estoque baixo"
        acoes={
          <Button onClick={abrirNova}>
            <Plus className="h-4 w-4" />
            Nova peça
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <BuscaInput
            valor={busca}
            onChange={setBusca}
            placeholder="Buscar por nome, código ou marca..."
            className="mb-4 max-w-sm"
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Venda</TableHead>
                <TableHead>Qtd</TableHead>
                <TableHead>Mínimo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pecasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Nenhuma peça encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                pecasFiltradas.map((peca) => (
                  <TableRow
                    key={peca.id}
                    className={cn(
                      peca.quantidade <= peca.estoque_minimo && 'bg-amber-950/20'
                    )}
                  >
                    <TableCell className="font-medium">{peca.nome}</TableCell>
                    <TableCell>{peca.codigo}</TableCell>
                    <TableCell>{peca.marca}</TableCell>
                    <TableCell className="text-right">{formatarMoeda(peca.custo)}</TableCell>
                    <TableCell className="text-right">{formatarMoeda(peca.preco_venda)}</TableCell>
                    <TableCell>{peca.quantidade}</TableCell>
                    <TableCell>{peca.estoque_minimo}</TableCell>
                    <TableCell>
                      <EstoqueBadge quantidade={peca.quantidade} minimo={peca.estoque_minimo} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => abrirEditar(peca)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => confirmarExclusao(peca)}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar peça' : 'Nova peça'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="codigo">Código *</Label>
              <Input
                id="codigo"
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="marca">Marca</Label>
              <Input
                id="marca"
                value={form.marca}
                onChange={(e) => setForm({ ...form, marca: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="custo">Custo</Label>
              <MoneyInput
                id="custo"
                value={form.custo}
                onChange={(custo) => setForm({ ...form, custo })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="venda">Preço venda</Label>
              <MoneyInput
                id="venda"
                value={form.preco_venda}
                onChange={(preco_venda) => setForm({ ...form, preco_venda })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qtd">Quantidade</Label>
              <Input
                id="qtd"
                type="number"
                value={form.quantidade}
                onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="min">Estoque mínimo</Label>
              <Input
                id="min"
                type="number"
                value={form.estoque_minimo}
                onChange={(e) => setForm({ ...form, estoque_minimo: Number(e.target.value) })}
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
      </div>
    </RecursoPlanoGate>
  )
}
