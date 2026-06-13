import { useState } from 'react'
import { Plus, Pencil, Trash2, UserCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
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
import { formatarTelefone } from '@/lib/utils'
import type { Cliente } from '@/types'

type FormCliente = Omit<Cliente, 'id' | 'oficina_id' | 'criado_em'>

const formVazio: FormCliente = {
  nome: '',
  telefone: '',
  cpf: '',
  endereco: '',
  observacoes: '',
}

export function ClientesPage() {
  const { adicionarCliente, atualizarCliente, excluirCliente } = useCraft()
  const { clientes } = useOficinaData()
  const { limiteAtingido, temRecurso } = useAssinatura()
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormCliente>(formVazio)

  const clientesFiltrados = clientes.filter(
    (c) =>
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.telefone.includes(busca) ||
      (c.cpf?.includes(busca) ?? false)
  )

  function abrirNovo() {
    if (limiteAtingido('clientes')) return
    setEditando(null)
    setForm(formVazio)
    setDialogAberto(true)
  }

  function abrirEditar(cliente: Cliente) {
    setEditando(cliente)
    setForm({
      nome: cliente.nome,
      telefone: cliente.telefone,
      cpf: cliente.cpf ?? '',
      endereco: cliente.endereco,
      observacoes: cliente.observacoes ?? '',
    })
    setDialogAberto(true)
  }

  function salvar() {
    if (!form.nome.trim() || !form.telefone.trim()) return

    const dados = {
      ...form,
      cpf: form.cpf || undefined,
      observacoes: form.observacoes || undefined,
    }

    if (editando) {
      atualizarCliente(editando.id, dados)
    } else {
      adicionarCliente(dados)
    }
    setDialogAberto(false)
  }

  function confirmarExclusao(cliente: Cliente) {
    if (window.confirm(`Excluir o cliente "${cliente.nome}"?`)) {
      excluirCliente(cliente.id)
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Clientes"
        descricao="Gerencie os clientes da oficina"
        acoes={
          <Button onClick={abrirNovo} disabled={limiteAtingido('clientes')}>
            <Plus className="h-4 w-4" />
            Novo cliente
          </Button>
        }
      />

      <AvisoLimitePlano tipo="clientes" />

      <Card>
        <CardContent className="pt-6">
          <BuscaInput
            valor={busca}
            onChange={setBusca}
            placeholder="Buscar por nome, telefone ou CPF..."
            className="mb-4 max-w-sm"
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhum cliente encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                clientesFiltrados.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell className="font-medium">{cliente.nome}</TableCell>
                    <TableCell>{formatarTelefone(cliente.telefone)}</TableCell>
                    <TableCell>{cliente.cpf ?? '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{cliente.endereco}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <BotaoWhatsApp cliente={cliente} />
                        {temRecurso('portal_cliente') && (
                          <Button variant="ghost" size="icon" asChild title="Portal do Cliente">
                            <Link to={`/portal-cliente/${cliente.id}`}>
                              <UserCircle className="h-4 w-4 text-primary" />
                            </Link>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => abrirEditar(cliente)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => confirmarExclusao(cliente)}
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
            <DialogTitle>{editando ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="telefone">Telefone *</Label>
              <Input
                id="telefone"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Input
                id="endereco"
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
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
  )
}
