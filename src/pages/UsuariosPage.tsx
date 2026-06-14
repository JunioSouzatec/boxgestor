import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, UserCog, Loader2, Copy, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { ConvitePreparadoCard } from '@/components/usuarios/ConvitePreparadoCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useOficinaData } from '@/context/CraftContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import {
  papeisDisponiveisParaAtribuir,
  podeGerenciarUsuario,
} from '@/services/auth/permissions'
import {
  copiarLinkConvite,
  type ConviteUsuario,
} from '@/services/auth/convites.service'
import { PAPEIS_CONVITE } from '@/services/auth/convites.service'
import { mensagemLimite, podeAdicionarUsuario } from '@/services/assinatura/plano-features'
import { AvisoLimitePlano } from '@/components/plano/AvisoLimitePlano'
import { MSG } from '@/lib/mensagens-usuario'
import { obterNomeExibidoOficina } from '@/lib/oficina-marca'
import { formatarData } from '@/lib/utils'
import {
  getLabelPapel,
  PAPEIS_USUARIO,
  type AuthUser,
  type PapelUsuario,
  type UsuarioInput,
} from '@/types/auth'

type FormConvite = {
  nome: string
  email: string
  papel: PapelUsuario
}

type FormUsuario = {
  nome: string
  email: string
  senha: string
  papel: PapelUsuario
  ativo: boolean
}

const formConviteVazio: FormConvite = {
  nome: '',
  email: '',
  papel: 'mecanico',
}

const formVazio: FormUsuario = {
  nome: '',
  email: '',
  senha: '',
  papel: 'mecanico',
  ativo: true,
}

export function UsuariosPage() {
  const {
    session,
    carregarUsuarios,
    prepararConvite,
    carregarConvitesPendentes,
    cancelarConvite,
    atualizarUsuario,
    excluirUsuario,
  } = useAuth()
  const { assinatura, uso } = useAssinatura()
  const { configuracao } = useOficinaData()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const [busca, setBusca] = useState('')
  const [dialogConviteAberto, setDialogConviteAberto] = useState(false)
  const [dialogEditarAberto, setDialogEditarAberto] = useState(false)
  const [convitePreparado, setConvitePreparado] = useState<ConviteUsuario | null>(null)
  const [editando, setEditando] = useState<AuthUser | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [formConvite, setFormConvite] = useState<FormConvite>(formConviteVazio)
  const [form, setForm] = useState<FormUsuario>(formVazio)
  const [erro, setErro] = useState('')
  const [usuarios, setUsuarios] = useState<AuthUser[]>([])
  const [convites, setConvites] = useState<ConviteUsuario[]>([])

  const papelLogado = session!.user.papel
  const papeisPermitidosConvite = PAPEIS_CONVITE.filter((p) =>
    papeisDisponiveisParaAtribuir(papelLogado).includes(p)
  )
  const papeisPermitidos = papeisDisponiveisParaAtribuir(papelLogado)
  const nomeOficina = obterNomeExibidoOficina(configuracao)

  const recarregar = useCallback(async () => {
    setUsuarios(await carregarUsuarios())
    setConvites(await carregarConvitesPendentes())
  }, [carregarUsuarios, carregarConvitesPendentes])

  useEffect(() => {
    recarregar()
  }, [recarregar, session])

  const usuariosFiltrados = usuarios.filter(
    (u) =>
      u.nome.toLowerCase().includes(busca.toLowerCase()) ||
      u.email.toLowerCase().includes(busca.toLowerCase()) ||
      getLabelPapel(u.papel).toLowerCase().includes(busca.toLowerCase())
  )

  const convitesFiltrados = convites.filter(
    (c) =>
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.email.toLowerCase().includes(busca.toLowerCase()) ||
      getLabelPapel(c.papel).toLowerCase().includes(busca.toLowerCase())
  )

  function abrirConvite() {
    if (!podeAdicionarUsuario(assinatura, uso)) {
      toast.atencao(mensagemLimite('usuarios'))
      return
    }
    setFormConvite({
      ...formConviteVazio,
      papel: papeisPermitidosConvite.includes('mecanico')
        ? 'mecanico'
        : papeisPermitidosConvite[0],
    })
    setConvitePreparado(null)
    setErro('')
    setDialogConviteAberto(true)
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
    setDialogEditarAberto(true)
  }

  async function prepararConviteSubmit() {
    if (!formConvite.nome.trim() || !formConvite.email.trim()) {
      toast.atencao('Informe nome e e-mail do funcionário.')
      return
    }
    if (!podeAdicionarUsuario(assinatura, uso)) {
      toast.atencao(mensagemLimite('usuarios'))
      return
    }

    setErro('')
    setSalvando(true)
    try {
      const convite = await prepararConvite(formConvite, nomeOficina)
      setConvitePreparado(convite)
      toast.sucesso(MSG.convitePreparado)
      recarregar()
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Craft] Erro ao preparar convite:', err)
      const msg = err instanceof Error ? err.message : 'Não foi possível preparar o convite.'
      setErro(msg)
      toast.erro('Não foi possível preparar o convite.')
    } finally {
      setSalvando(false)
    }
  }

  async function copiarLink(token: string) {
    const ok = await copiarLinkConvite(token)
    if (ok) toast.sucesso(MSG.linkCopiado)
    else toast.atencao('Não foi possível copiar. Selecione o link manualmente.')
  }

  async function handleCancelarConvite(convite: ConviteUsuario) {
    const ok = await confirmar({
      titulo: 'Cancelar convite',
      mensagem: `Cancelar o convite para ${convite.nome}?`,
      confirmarTexto: 'Cancelar convite',
      destrutivo: true,
    })
    if (!ok) return
    try {
      await cancelarConvite(convite.id)
      toast.sucesso(MSG.conviteCancelado)
      recarregar()
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível cancelar.')
    }
  }

  async function salvarEdicao() {
    if (!editando || !form.nome.trim() || !form.email.trim()) {
      toast.atencao('Verifique os campos obrigatórios.')
      return
    }

    setErro('')
    setSalvando(true)
    try {
      const patch: Partial<UsuarioInput> = {
        nome: form.nome,
        email: form.email,
        papel: form.papel,
        ativo: form.ativo,
      }
      if (form.senha) patch.senha = form.senha
      await atualizarUsuario(editando.id, patch)
      toast.sucesso(MSG.usuarioAtualizado)
      setDialogEditarAberto(false)
      recarregar()
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Craft] Erro ao salvar usuário:', err)
      setErro(err instanceof Error ? err.message : 'Erro ao salvar.')
      toast.erro('Não foi possível salvar.')
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
      toast.erro(err instanceof Error ? err.message : 'Erro ao alterar status.')
    }
  }

  async function confirmarExclusao(usuario: AuthUser) {
    if (!podeGerenciarUsuario(papelLogado, 'excluir', usuario)) return
    const ok = await confirmar({
      titulo: 'Excluir usuário',
      mensagem: `Excluir o usuário "${usuario.nome}"?`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (!ok) return
    try {
      await excluirUsuario(usuario.id)
      recarregar()
      toast.sucesso('Usuário excluído com sucesso.')
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Erro ao excluir.')
    }
  }

  const podeEditar = (usuario: AuthUser) =>
    podeGerenciarUsuario(papelLogado, 'editar', usuario)

  return (
    <div>
      <PageHeader
        titulo="Usuários"
        descricao="Equipe da oficina e convites pendentes"
        acoes={
          podeGerenciarUsuario(papelLogado, 'criar') ? (
            <Button onClick={abrirConvite} disabled={!podeAdicionarUsuario(assinatura, uso)}>
              <Plus className="mr-2 h-4 w-4" />
              Preparar convite
            </Button>
          ) : undefined
        }
      />

      {!podeAdicionarUsuario(assinatura, uso) && <AvisoLimitePlano tipo="usuarios" />}

      <p className="mb-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        {MSG.conviteEnviarManualmente}{' '}
        <span className="block mt-1">{MSG.conviteSmtpFuturo}</span>
      </p>

      <div className="mb-4">
        <BuscaInput
          valor={busca}
          onChange={setBusca}
          placeholder="Buscar por nome, e-mail ou cargo..."
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Usuários ativos</CardTitle>
        </CardHeader>
        <CardContent>
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
                      Nenhum usuário ativo
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Convites pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          {convitesFiltrados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum convite pendente
            </p>
          ) : (
            <div className="space-y-3">
              {convitesFiltrados.map((convite) => (
                <div
                  key={convite.id}
                  className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{convite.nome}</p>
                    <p className="text-sm text-muted-foreground">{convite.email}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge variant="secondary">{getLabelPapel(convite.papel)}</Badge>
                      <Badge variant="outline">Convite pendente</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatarData(convite.criado_em.slice(0, 10))}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => copiarLink(convite.token)}
                    >
                      <Copy className="h-4 w-4" />
                      Copiar link
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => handleCancelarConvite(convite)}
                      title="Cancelar convite"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogConviteAberto}
        onOpenChange={(open) => {
          setDialogConviteAberto(open)
          if (!open) setConvitePreparado(null)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Preparar convite</DialogTitle>
          </DialogHeader>

          {convitePreparado ? (
            <div className="space-y-4">
              <ConvitePreparadoCard
                convite={convitePreparado}
                onCopiar={() => copiarLink(convitePreparado.token)}
              />
              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  setConvitePreparado(null)
                  setDialogConviteAberto(false)
                }}
              >
                Fechar
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="nome-convite">Nome do funcionário</Label>
                <Input
                  id="nome-convite"
                  value={formConvite.nome}
                  onChange={(e) => setFormConvite({ ...formConvite, nome: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email-convite">E-mail</Label>
                <Input
                  id="email-convite"
                  type="email"
                  value={formConvite.email}
                  onChange={(e) => setFormConvite({ ...formConvite, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Cargo</Label>
                <Select
                  value={formConvite.papel}
                  onValueChange={(v) =>
                    setFormConvite({ ...formConvite, papel: v as PapelUsuario })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPEIS_USUARIO.filter((p) => papeisPermitidosConvite.includes(p.value)).map(
                      (p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              {erro && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {erro}
                </p>
              )}

              <Button onClick={prepararConviteSubmit} className="w-full" disabled={salvando}>
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparando…
                  </>
                ) : (
                  'Gerar link de convite'
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogEditarAberto} onOpenChange={setDialogEditarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
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
              <Label htmlFor="senha-usuario">Nova senha (opcional)</Label>
              <Input
                id="senha-usuario"
                type="password"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Cargo</Label>
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
            {erro && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}
            <Button onClick={salvarEdicao} className="w-full" disabled={salvando}>
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Salvar alterações'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
