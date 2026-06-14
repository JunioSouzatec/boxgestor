import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, UserCog, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
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
import { useAuth } from '@/context/AuthContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import {
  papeisDisponiveisParaAtribuir,
  podeGerenciarUsuario,
} from '@/services/auth/permissions'
import { mensagemLimite, podeAdicionarUsuario } from '@/services/assinatura/plano-features'
import { AvisoLimitePlano } from '@/components/plano/AvisoLimitePlano'
import { MSG } from '@/lib/mensagens-usuario'
import {
  getLabelPapel,
  PAPEIS_USUARIO,
  type AuthUser,
  type PapelUsuario,
  type UsuarioInput,
} from '@/types/auth'

type FormUsuario = {
  nome: string
  email: string
  senha: string
  papel: PapelUsuario
  ativo: boolean
}

const formVazio: FormUsuario = {
  nome: '',
  email: '',
  senha: '',
  papel: 'mecanico',
  ativo: true,
}

export function UsuariosPage() {
  const { session, carregarUsuarios, criarUsuario, atualizarUsuario, excluirUsuario, modoAuth } =
    useAuth()
  const { uso, plano } = useAssinatura()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<AuthUser | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<FormUsuario>(formVazio)
  const [erro, setErro] = useState('')
  const [usuarios, setUsuarios] = useState<AuthUser[]>([])

  const papelLogado = session!.user.papel
  const papeisPermitidos = papeisDisponiveisParaAtribuir(papelLogado)

  const recarregar = useCallback(async () => {
    setUsuarios(await carregarUsuarios())
  }, [carregarUsuarios])

  useEffect(() => {
    recarregar()
  }, [recarregar, session])

  const usuariosFiltrados = usuarios.filter(
    (u) =>
      u.nome.toLowerCase().includes(busca.toLowerCase()) ||
      u.email.toLowerCase().includes(busca.toLowerCase()) ||
      getLabelPapel(u.papel).toLowerCase().includes(busca.toLowerCase())
  )

  function abrirNovo() {
    if (!podeAdicionarUsuario(plano, uso)) {
      toast.atencao(mensagemLimite('usuarios'))
      return
    }
    setEditando(null)
    setForm({ ...formVazio, papel: papeisPermitidos.includes('mecanico') ? 'mecanico' : papeisPermitidos[0] })
    setErro('')
    setDialogAberto(true)
  }

  function abrirEditar(usuario: AuthUser) {
    setEditando(usuario)
    setForm({
      nome: usuario.nome,
      email: usuario.email,
      senha: '',
      papel: usuario.papel,
      ativo: usuario.ativo,
    })
    setErro('')
    setDialogAberto(true)
  }

  async function salvar() {
    if (!form.nome.trim() || !form.email.trim()) {
      toast.atencao('Verifique os campos obrigatórios (nome e e-mail).')
      return
    }

    setErro('')
    setSalvando(true)
    try {
      if (editando) {
        const patch: Partial<UsuarioInput> = {
          nome: form.nome,
          email: form.email,
          papel: form.papel,
          ativo: form.ativo,
        }
        if (form.senha) patch.senha = form.senha
        await atualizarUsuario(editando.id, patch)
        toast.sucesso(MSG.usuarioAtualizado)
      } else {
        if (!podeAdicionarUsuario(plano, uso)) {
          toast.atencao(mensagemLimite('usuarios'))
          return
        }
        if (modoAuth !== 'supabase' && !form.senha) {
          setErro('Informe uma senha para o novo usuário.')
          toast.atencao('Informe uma senha para o novo usuário.')
          return
        }
        await criarUsuario({
          ...form,
          senha: form.senha || 'convite-pendente',
        })
        toast.sucesso('Usuário adicionado com sucesso.')
      }
      setDialogAberto(false)
      recarregar()
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Craft] Erro ao salvar usuário:', err)
      const msg = err instanceof Error ? err.message : 'Erro ao salvar usuário.'
      setErro(msg)
      toast.erro('Não foi possível salvar. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  async function alternarStatus(usuario: AuthUser) {
    if (!podeGerenciarUsuario(papelLogado, 'ativar', usuario)) return
    try {
      await atualizarUsuario(usuario.id, { ativo: !usuario.ativo })
      recarregar()
      toast.sucesso(MSG.usuarioAtualizado)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Craft] Erro ao alterar status:', err)
      toast.erro(err instanceof Error ? err.message : 'Erro ao alterar status.')
    }
  }

  async function confirmarExclusao(usuario: AuthUser) {
    if (!podeGerenciarUsuario(papelLogado, 'excluir', usuario)) return
    const ok = await confirmar({
      titulo: 'Excluir usuário',
      mensagem: `Tem certeza que deseja excluir o usuário "${usuario.nome}"? Esta ação não pode ser desfeita.`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (!ok) return
    try {
      await excluirUsuario(usuario.id)
      recarregar()
      toast.sucesso('Usuário excluído com sucesso.')
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Craft] Erro ao excluir usuário:', err)
      toast.erro(err instanceof Error ? err.message : 'Erro ao excluir usuário.')
    }
  }

  const podeEditar = (usuario: AuthUser) =>
    podeGerenciarUsuario(papelLogado, 'editar', usuario)

  return (
    <div>
      <PageHeader
        titulo="Usuários"
        descricao="Gerencie os membros da equipe e seus cargos"
        acoes={
          podeGerenciarUsuario(papelLogado, 'criar') ? (
            <Button onClick={abrirNovo} disabled={!podeAdicionarUsuario(plano, uso)}>
              <Plus className="mr-2 h-4 w-4" />
              {modoAuth === 'supabase' ? 'Preparar convite' : 'Adicionar usuário'}
            </Button>
          ) : undefined
        }
      />

      {!podeAdicionarUsuario(plano, uso) && (
        <AvisoLimitePlano tipo="usuarios" />
      )}

      {modoAuth === 'supabase' && (
        <p className="mb-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Modo Supabase Auth: usuários ativos vêm do perfil vinculado à oficina. Novos membros
          podem ser preparados como convite (e-mail + cargo) — envio automático de e-mail em
          versão futura.
        </p>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4">
            <BuscaInput
              valor={busca}
              onChange={setBusca}
              placeholder="Buscar por nome, e-mail ou cargo..."
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuariosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  usuariosFiltrados.map((usuario) => (
                    <TableRow key={usuario.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {usuario.nome.charAt(0).toUpperCase()}
                          </div>
                          {usuario.nome}
                          {usuario.id === session?.user.id && (
                            <Badge variant="outline" className="text-[10px]">
                              Você
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{usuario.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{getLabelPapel(usuario.papel)}</Badge>
                      </TableCell>
                      <TableCell>
                        {usuario.ativo ? (
                          <Badge variant="success">Ativo</Badge>
                        ) : (
                          <Badge variant="destructive">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {podeEditar(usuario) && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => abrirEditar(usuario)}
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => alternarStatus(usuario)}
                                title={usuario.ativo ? 'Desativar' : 'Ativar'}
                              >
                                <UserCog className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {podeGerenciarUsuario(papelLogado, 'excluir', usuario) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => confirmarExclusao(usuario)}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="nome-usuario">Nome completo</Label>
              <Input
                id="nome-usuario"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email-usuario">E-mail</Label>
              <Input
                id="email-usuario"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="senha-usuario">
                {editando ? 'Nova senha (opcional)' : 'Senha'}
              </Label>
              <Input
                id="senha-usuario"
                type="password"
                placeholder={editando ? 'Deixe em branco para manter' : 'Mínimo 6 caracteres'}
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label>Cargo / função</Label>
              <Select
                value={form.papel}
                onValueChange={(v) => setForm({ ...form, papel: v as PapelUsuario })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAPEIS_USUARIO.filter((p) => papeisPermitidos.includes(p.value)).map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="ativo-usuario"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="ativo-usuario" className="cursor-pointer">
                Usuário ativo
              </Label>
            </div>

            {erro && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}

            <Button onClick={salvar} className="w-full" disabled={salvando}>
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : editando ? (
                'Salvar alterações'
              ) : (
                'Adicionar usuário'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
