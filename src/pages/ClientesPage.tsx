import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, UserCircle, Bike, ClipboardList, History, List, Loader2, Eye } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { FormularioMotoCliente } from '@/components/clientes/FormularioMotoCliente'
import { ClienteCadastroSucessoDialog } from '@/components/clientes/ClienteCadastroSucessoDialog'
import { ClienteOSDialog } from '@/components/clientes/ClienteOSDialog'
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
import { usePlanoEscrita } from '@/hooks/usePlanoEscrita'
import { AvisoLimitePlano } from '@/components/plano/AvisoLimitePlano'
import { RepararClientesDuplicadosCard } from '@/components/clientes/RepararClientesDuplicadosCard'
import { useBancoStatus } from '@/context/BancoStatusContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { BotaoWhatsApp } from '@/components/comunicacao/BotaoWhatsApp'
import { PaginacaoLista } from '@/components/shared/PaginacaoLista'
import { usePaginaLista } from '@/hooks/usePaginaLista'
import { formatarTelefone, cn } from '@/lib/utils'
import { mensagemLimite } from '@/services/assinatura/plano-features'
import { MSG } from '@/lib/mensagens-usuario'
import {
  formMotoClienteVazio,
  formMotoClienteParaInput,
  labelQuantidadeVeiculos,
  motoClienteTemAlgumCampo,
  validarFormMotoCliente,
  type FormMotoCliente,
} from '@/lib/moto-form'
import type { Cliente, Moto } from '@/types'

type FormCliente = Omit<Cliente, 'id' | 'oficina_id' | 'criado_em'>

const formVazio: FormCliente = {
  nome: '',
  telefone: '',
  cpf: '',
  endereco: '',
  observacoes: '',
}

interface SucessoCadastro {
  cliente: Cliente
  moto?: Moto
}

export function ClientesPage() {
  const { adicionarClienteComMotoOpcional, atualizarCliente, excluirCliente } = useCraft()
  const { clientes, motos, ordens, lancamentos } = useOficinaData()
  const { limiteAtingido, temRecurso } = useAssinatura()
  const { verificarEscrita } = usePlanoEscrita()
  const { emFallbackLocal, ultimoAviso } = useBancoStatus()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar, salvando } = useSalvarAcao()
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormCliente>(formVazio)
  const [cadastrarMotoJunto, setCadastrarMotoJunto] = useState(false)
  const [formMoto, setFormMoto] = useState<FormMotoCliente>(formMotoClienteVazio)
  const [erroMoto, setErroMoto] = useState<string | null>(null)
  const [sucessoCadastro, setSucessoCadastro] = useState<SucessoCadastro | null>(null)
  const [clienteOsDialog, setClienteOsDialog] = useState<Cliente | null>(null)
  const termos = useTermosOficina()
  const labelMotosCliente = (q: number) =>
    labelQuantidadeVeiculos(q, termos.palavraVeiculo, termos.veiculos)

  const contagemMotosPorCliente = useMemo(() => {
    const map: Record<string, number> = {}
    for (const moto of motos) {
      map[moto.cliente_id] = (map[moto.cliente_id] ?? 0) + 1
    }
    return map
  }, [motos])

  const clientesFiltrados = useMemo(
    () =>
      clientes.filter(
        (c) =>
          c.nome.toLowerCase().includes(busca.toLowerCase()) ||
          c.telefone.includes(busca) ||
          (c.cpf?.includes(busca) ?? false)
      ),
    [clientes, busca]
  )

  const paginacao = usePaginaLista(clientesFiltrados, 50, busca)

  function resetFormularioMoto() {
    setFormMoto(formMotoClienteVazio())
    setErroMoto(null)
  }

  function abrirNovo() {
    if (!verificarEscrita()) return
    if (limiteAtingido('clientes')) {
      toast.atencao(mensagemLimite('clientes'))
      return
    }
    setEditando(null)
    setForm(formVazio)
    setCadastrarMotoJunto(false)
    resetFormularioMoto()
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
    setCadastrarMotoJunto(false)
    resetFormularioMoto()
    setDialogAberto(true)
  }

  function salvar() {
    if (!verificarEscrita()) return
    void executar({
      validar: () => {
        if (!form.nome.trim() || !form.telefone.trim()) {
          return 'Verifique os campos obrigatórios (nome e telefone).'
        }
        if (!editando && cadastrarMotoJunto && motoClienteTemAlgumCampo(formMoto)) {
          const erro = validarFormMotoCliente(formMoto)
          if (erro) {
            setErroMoto(erro)
            return erro
          }
          if (limiteAtingido('motos')) return mensagemLimite('motos')
        }
        return null
      },
      acao: () => {
        const dados = {
          ...form,
          cpf: form.cpf || undefined,
          observacoes: form.observacoes || undefined,
        }

        if (editando) {
          atualizarCliente(editando.id, dados)
          return
        }

        let motoPayload = null
        if (cadastrarMotoJunto && motoClienteTemAlgumCampo(formMoto)) {
          motoPayload = {
            ...formMotoClienteParaInput(formMoto, ''),
            cliente_id: '',
          }
        }

        const { cliente, moto } = adicionarClienteComMotoOpcional(dados, motoPayload)
        setSucessoCadastro({ cliente, moto })
      },
      sucesso: editando
        ? MSG.alterado
        : cadastrarMotoJunto && motoClienteTemAlgumCampo(formMoto)
          ? MSG.salvo
          : MSG.clienteSalvo,
      onSuccess: () => setDialogAberto(false),
    })
  }

  async function confirmarExclusao(cliente: Cliente) {
    const ok = await confirmar({
      titulo: 'Excluir cliente',
      mensagem: `Tem certeza que deseja excluir o cliente "${cliente.nome}"?`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (ok) {
      excluirCliente(cliente.id)
      toast.sucesso(MSG.excluido)
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

      {emFallbackLocal && ultimoAviso && (
        <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          {ultimoAviso}
        </p>
      )}

      <div className="mb-4">
        <RepararClientesDuplicadosCard />
      </div>

      <Card>
        <CardContent className="pt-6">
          <BuscaInput
            valor={busca}
            onChange={setBusca}
            placeholder="Buscar por nome, telefone ou CPF..."
            className="mb-4 max-w-sm"
          />

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Motos</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum cliente encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                paginacao.itensPagina.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/clientes/${cliente.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {cliente.nome}
                      </Link>
                      <p className="text-xs font-normal text-muted-foreground sm:hidden">
                        {labelMotosCliente(contagemMotosPorCliente[cliente.id] ?? 0)}
                      </p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {labelMotosCliente(contagemMotosPorCliente[cliente.id] ?? 0)}
                    </TableCell>
                    <TableCell>{formatarTelefone(cliente.telefone)}</TableCell>
                    <TableCell>{cliente.cpf ?? '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{cliente.endereco}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="hidden md:inline-flex gap-1 text-xs h-8"
                          onClick={() => setClienteOsDialog(cliente)}
                        >
                          <List className="h-3.5 w-3.5" />
                          Ver OS
                        </Button>
                        <Button variant="ghost" size="icon" className="md:hidden" title="Ver OS" onClick={() => setClienteOsDialog(cliente)}>
                          <List className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" asChild title="Nova OS">
                          <Link to={`/ordens-servico?novo=1&cliente=${cliente.id}`}>
                            <ClipboardList className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild title="Ver motos">
                          <Link to={`/motos?cliente=${cliente.id}`}>
                            <Bike className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild title="Histórico / detalhe">
                          <Link to={`/clientes/${cliente.id}`}>
                            <History className="h-4 w-4" />
                          </Link>
                        </Button>
                        <BotaoWhatsApp cliente={cliente} />
                        <Button variant="ghost" size="icon" asChild title="Ver cliente">
                          <Link to={`/clientes/${cliente.id}`}>
                            <UserCircle className="h-4 w-4 text-primary" />
                          </Link>
                        </Button>
                        {temRecurso('portal_cliente') && (
                          <Button variant="ghost" size="icon" asChild title="Portal do Cliente">
                            <Link to={`/portal-cliente/${cliente.id}`}>
                              <UserCircle className="h-4 w-4 text-muted-foreground" />
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

          <div className="md:hidden space-y-3">
            {paginacao.itensPagina.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
            ) : (
              paginacao.itensPagina.map((cliente) => (
                <Card key={cliente.id}>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <Link
                        to={`/clientes/${cliente.id}`}
                        className="text-base font-semibold hover:text-primary hover:underline"
                      >
                        {cliente.nome}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {formatarTelefone(cliente.telefone)}
                        {' · '}
                        {labelMotosCliente(contagemMotosPorCliente[cliente.id] ?? 0)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="lg" className="h-11" asChild>
                        <Link to={`/ordens-servico?novo=1&cliente=${cliente.id}`}>
                          <ClipboardList className="mr-2 h-4 w-4" />
                          Nova OS
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="lg"
                        className="h-11"
                        onClick={() => setClienteOsDialog(cliente)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Ver OS
                      </Button>
                      <Button variant="outline" size="lg" className="h-11 col-span-2" asChild>
                        <Link to={`/clientes/${cliente.id}`}>
                          <History className="mr-2 h-4 w-4" />
                          Histórico
                        </Link>
                      </Button>
                      <div className="col-span-2">
                        <BotaoWhatsApp cliente={cliente} className="w-full h-11" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <PaginacaoLista
            pagina={paginacao.pagina}
            totalPaginas={paginacao.totalPaginas}
            total={paginacao.total}
            tamanhoPagina={paginacao.tamanhoPagina}
            onPaginaChange={paginacao.irPagina}
          />
        </CardContent>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
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

            {!editando && (
              <>
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors',
                    cadastrarMotoJunto && 'border-primary/40 bg-primary/5'
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-border accent-primary"
                    checked={cadastrarMotoJunto}
                    onChange={(e) => {
                      setCadastrarMotoJunto(e.target.checked)
                      if (!e.target.checked) resetFormularioMoto()
                    }}
                  />
                  <span className="space-y-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Bike className="h-4 w-4 text-primary" />
                      Cadastrar {termos.palavraVeiculo} junto com o cliente
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Ideal quando o cliente já chega com o {termos.palavraVeiculo} na oficina.
                    </span>
                  </span>
                </label>

                {cadastrarMotoJunto && (
                  <div className="rounded-md border border-border bg-muted/10 p-4 space-y-3">
                    <p className="text-sm font-medium">{termos.dadosVeiculo}</p>
                    <FormularioMotoCliente form={formMoto} onChange={setFormMoto} />
                    {erroMoto && (
                      <p className="text-sm text-destructive" role="alert">
                        {erroMoto}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {sucessoCadastro && (
        <ClienteCadastroSucessoDialog
          aberto={sucessoCadastro !== null}
          onFechar={() => setSucessoCadastro(null)}
          cliente={sucessoCadastro.cliente}
          moto={sucessoCadastro.moto}
        />
      )}

      <ClienteOSDialog
        aberto={clienteOsDialog !== null}
        onOpenChange={(open) => !open && setClienteOsDialog(null)}
        cliente={clienteOsDialog}
        ordens={ordens}
        motos={motos}
        lancamentos={lancamentos}
      />
    </div>
  )
}
