import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, Upload } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { podeGerenciarEstoque } from '@/services/auth/permissions'
import { cn, formatarTelefone } from '@/lib/utils'
import type { Fornecedor, FornecedorInput } from '@/types'
import { ImportacaoCsvDialog } from '@/components/importacao/ImportacaoCsvDialog'
import {
  MODELO_CSV_FORNECEDORES,
  executarImportacaoFornecedores,
  parsearCsvFornecedores,
  type LinhaImportacaoFornecedor,
  type PoliticaDuplicadoImportacao,
} from '@/services/importacao-fornecedores.service'

type FormFornecedor = FornecedorInput

const formVazio: FormFornecedor = {
  nome: '',
  cnpj: '',
  telefone: '',
  whatsapp: '',
  email: '',
  endereco: '',
  cidade: '',
  estado: '',
  observacoes: '',
  ativo: true,
}

export function FornecedoresPage() {
  const { session } = useAuth()
  const { adicionarFornecedor, atualizarFornecedor, excluirFornecedor } = useCraft()
  const { fornecedores, configuracao } = useOficinaData()
  const papel = session?.user.papel ?? 'recepcao'
  const podeGerenciar = podeGerenciarEstoque(session?.user ?? papel, configuracao)
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar, salvando } = useSalvarAcao()

  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [dialogImportacao, setDialogImportacao] = useState(false)
  const [editando, setEditando] = useState<Fornecedor | null>(null)
  const [form, setForm] = useState<FormFornecedor>(formVazio)

  const fornecedoresFiltrados = fornecedores.filter(
    (f) =>
      f.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (f.cnpj?.includes(busca) ?? false) ||
      (f.cidade?.toLowerCase().includes(busca.toLowerCase()) ?? false)
  )

  function abrirNovo() {
    setEditando(null)
    setForm(formVazio)
    setDialogAberto(true)
  }

  function abrirEditar(fornecedor: Fornecedor) {
    setEditando(fornecedor)
    setForm({
      nome: fornecedor.nome,
      cnpj: fornecedor.cnpj ?? '',
      telefone: fornecedor.telefone ?? '',
      whatsapp: fornecedor.whatsapp ?? '',
      email: fornecedor.email ?? '',
      endereco: fornecedor.endereco ?? '',
      cidade: fornecedor.cidade ?? '',
      estado: fornecedor.estado ?? '',
      observacoes: fornecedor.observacoes ?? '',
      ativo: fornecedor.ativo,
    })
    setDialogAberto(true)
  }

  function salvar() {
    void executar({
      validar: () => (!form.nome.trim() ? 'Informe o nome do fornecedor.' : null),
      acao: () => {
        const dados: FornecedorInput = {
          ...form,
          nome: form.nome.trim(),
          cnpj: form.cnpj?.trim() || undefined,
          telefone: form.telefone?.trim() || undefined,
          whatsapp: form.whatsapp?.trim() || undefined,
          email: form.email?.trim() || undefined,
          endereco: form.endereco?.trim() || undefined,
          cidade: form.cidade?.trim() || undefined,
          estado: form.estado?.trim() || undefined,
          observacoes: form.observacoes?.trim() || undefined,
        }
        if (editando) {
          atualizarFornecedor(editando.id, dados)
        } else {
          adicionarFornecedor(dados)
        }
      },
      sucesso: editando ? 'Fornecedor salvo com sucesso.' : 'Fornecedor salvo com sucesso.',
      onSuccess: () => setDialogAberto(false),
    })
  }

  async function confirmarExclusao(fornecedor: Fornecedor) {
    const ok = await confirmar({
      titulo: 'Excluir fornecedor',
      mensagem: `Tem certeza que deseja excluir o fornecedor "${fornecedor.nome}"?`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (ok) {
      excluirFornecedor(fornecedor.id)
      toast.sucesso('Fornecedor excluído com sucesso.')
    }
  }

  function alternarAtivo(fornecedor: Fornecedor) {
    atualizarFornecedor(fornecedor.id, { ativo: !fornecedor.ativo })
  }

  return (
    <RecursoPlanoGate recurso="estoque" pagina>
      <div>
        <PageHeader
          titulo="Fornecedores"
          descricao="Cadastro de fornecedores de peças e produtos"
          acoes={
            podeGerenciar ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setDialogImportacao(true)}>
                  <Upload className="h-4 w-4" />
                  Importar fornecedores
                </Button>
                <Button onClick={abrirNovo}>
                  <Plus className="h-4 w-4" />
                  Novo fornecedor
                </Button>
              </div>
            ) : undefined
          }
        />

        <Card>
          <CardContent className="pt-6">
            <BuscaInput
              valor={busca}
              onChange={setBusca}
              placeholder="Buscar por nome, CNPJ ou cidade..."
              className="mb-4 max-w-sm"
            />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Status</TableHead>
                  {podeGerenciar && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {fornecedoresFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={podeGerenciar ? 6 : 5}
                      className="text-center text-muted-foreground"
                    >
                      Nenhum fornecedor encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  fornecedoresFiltrados.map((fornecedor) => (
                    <TableRow
                      key={fornecedor.id}
                      className={cn(!fornecedor.ativo && 'opacity-60')}
                    >
                      <TableCell className="font-medium">{fornecedor.nome}</TableCell>
                      <TableCell>{fornecedor.cnpj || '—'}</TableCell>
                      <TableCell>
                        {fornecedor.telefone ? formatarTelefone(fornecedor.telefone) : '—'}
                      </TableCell>
                      <TableCell>
                        {fornecedor.cidade
                          ? `${fornecedor.cidade}${fornecedor.estado ? `/${fornecedor.estado}` : ''}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={fornecedor.ativo ? 'default' : 'secondary'}>
                          {fornecedor.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      {podeGerenciar && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => alternarAtivo(fornecedor)}
                            >
                              {fornecedor.ativo ? 'Inativar' : 'Ativar'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => abrirEditar(fornecedor)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmarExclusao(fornecedor)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editando ? 'Editar fornecedor' : 'Novo fornecedor'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="nome">Nome do fornecedor *</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="endereco">Endereço</Label>
                <Input
                  id="endereco"
                  value={form.endereco}
                  onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cidade">Cidade</Label>
                <Input
                  id="cidade"
                  value={form.cidade}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="estado">Estado</Label>
                <Input
                  id="estado"
                  value={form.estado}
                  onChange={(e) => setForm({ ...form, estado: e.target.value })}
                  placeholder="UF"
                  maxLength={2}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={form.ativo ? 'ativo' : 'inativo'}
                  onValueChange={(v) => setForm({ ...form, ativo: v === 'ativo' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
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

        <ImportacaoCsvDialog<LinhaImportacaoFornecedor>
          aberto={dialogImportacao}
          onFechar={() => setDialogImportacao(false)}
          titulo="Importar fornecedores"
          descricao="Envie um arquivo CSV com fornecedores. Baixe o modelo, preencha e importe para a oficina atual."
          nomeModelo="modelo-fornecedores-boxgestor.csv"
          conteudoModelo={MODELO_CSV_FORNECEDORES}
          colunasPreview={[
            { key: 'nome', label: 'Nome', render: (i) => i.dados.nome },
            { key: 'cnpj', label: 'CNPJ/CPF', render: (i) => i.dados.cnpj ?? '—' },
            { key: 'tel', label: 'Telefone', render: (i) => i.dados.telefone ?? '—' },
            { key: 'cidade', label: 'Cidade', render: (i) => i.dados.cidade ?? '—' },
          ]}
          parsear={(texto) => parsearCsvFornecedores(texto, fornecedores)}
          onConfirmar={(linhas, politica: PoliticaDuplicadoImportacao) => {
            const resumo = executarImportacaoFornecedores(
              linhas,
              politica,
              adicionarFornecedor,
              atualizarFornecedor
            )
            toast.sucesso('Importação concluída com sucesso.')
            return resumo
          }}
        />
      </div>
    </RecursoPlanoGate>
  )
}
