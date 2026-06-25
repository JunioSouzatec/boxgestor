import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Loader2, Copy, X, KeyRound, UserX } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { ConvitePreparadoCard } from '@/components/usuarios/ConvitePreparadoCard'
import { CriarUsuarioInternoDialog } from '@/components/usuarios/CriarUsuarioInternoDialog'
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
  ehUltimoDonoAtivo,
  papeisDisponiveisParaAtribuir,
  podeGerenciarUsuario,
} from '@/services/auth/permissions'
import {
  copiarLinkConvite,
  type ConviteUsuario,
} from '@/services/auth/convites.service'
import { PAPEIS_CONVITE } from '@/services/auth/convites.service'
import { mensagemLimite, podeAdicionarUsuario } from '@/services/assinatura/plano-features'
import {
  formatarIdentificadorUsuario,
  officeSlugParaOficina,
} from '@/services/auth/internal-users.service'
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
  type UsuarioInternoInput,
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
}

function filtrarUsuarios(usuarios: AuthUser[], busca: string) {
  return usuarios.filter(
    (u) =>
      u.nome.toLowerCase().includes(busca.toLowerCase()) ||
      u.email.toLowerCase().includes(busca.toLowerCase()) ||
      (u.login_username?.toLowerCase().includes(busca.toLowerCase()) ?? false) ||
      getLabelPapel(u.papel).toLowerCase().includes(busca.toLowerCase())
  )
}

function TabelaUsuarios({
  usuarios,
  sessionUserId,
  todosUsuarios,
  modo,
  podeEditar,
  onEditar,
  onRedefinirSenha,
  onDesativar,
  onReativar,
}: {
  usuarios: AuthUser[]
  sessionUserId?: string
  todosUsuarios: AuthUser[]
  modo: 'ativos' | 'inativos'
  podeEditar: (u: AuthUser) => boolean
  onEditar: (u: AuthUser) => void
  onRedefinirSenha: (u: AuthUser) => void
  onDesativar: (u: AuthUser) => void
  onReativar: (u: AuthUser) => void
}) {
  if (usuarios.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {modo === 'ativos' ? 'Nenhum usuário ativo' : 'Nenhum usuário inativo'}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Usuário / E-mail</TableHead>
            <TableHead>Cargo</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Último acesso</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((usuario) => {
            const ehProprio = usuario.id === sessionUserId
            const ultimoDono = ehUltimoDonoAtivo(usuario, todosUsuarios)
            const podeDesativar =
              modo === 'ativos' &&
              podeEditar(usuario) &&
              !ehProprio &&
              !ultimoDono
            const podeReativar = modo === 'inativos' && podeEditar(usuario)

            return (
              <TableRow key={usuario.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {usuario.nome.charAt(0).toUpperCase()}
                    </div>
                    {usuario.nome}
                    {ehProprio && (
                      <Badge variant="outline" className="text-[10px]">
                        Você
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="block">{formatarIdentificadorUsuario(usuario)}</span>
                  {usuario.interno && (
                    <span className="block text-xs text-muted-foreground/80">{usuario.email}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{getLabelPapel(usuario.papel)}</Badge>
                </TableCell>
                <TableCell>
                  {usuario.interno ? (
                    <Badge variant="outline">Interno</Badge>
                  ) : (
                    <Badge variant="outline">E-mail</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {usuario.ativo ? (
                    <Badge variant="success">Ativo</Badge>
                  ) : (
                    <Badge variant="destructive">Inativo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {usuario.last_sign_in_at
                    ? formatarData(usuario.last_sign_in_at.slice(0, 10))
                    : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {modo === 'ativos' && podeEditar(usuario) && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEditar(usuario)}
                          title="Editar cargo"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {usuario.interno && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onRedefinirSenha(usuario)}
                            title="Redefinir senha"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        )}
                        {podeDesativar && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => onDesativar(usuario)}
                            title="Desativar"
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                    {podeReativar && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onReativar(usuario)}
                      >
                        Reativar
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export function UsuariosPage() {
  const {
    session,
    carregarUsuarios,
    prepararConvite,
    carregarConvitesPendentes,
    cancelarConvite,
    criarUsuarioInterno,
    redefinirSenhaInterno,
    atualizarUsuario,
    desativarUsuario,
    reativarUsuario,
  } = useAuth()
  const { assinatura, uso } = useAssinatura()
  const { configuracao } = useOficinaData()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const [busca, setBusca] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [dialogInternoAberto, setDialogInternoAberto] = useState(false)
  const [dialogConviteAberto, setDialogConviteAberto] = useState(false)
  const [dialogSenhaAberto, setDialogSenhaAberto] = useState(false)
  const [usuarioSenha, setUsuarioSenha] = useState<AuthUser | null>(null)
  const [novaSenhaInterna, setNovaSenhaInterna] = useState('')
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
  const codigoOficinaLogin = officeSlugParaOficina(
    session?.user.office_id ?? configuracao.office_id ?? '',
    nomeOficina
  )

  const recarregar = useCallback(async () => {
    setUsuarios(await carregarUsuarios())
    setConvites(await carregarConvitesPendentes())
  }, [carregarUsuarios, carregarConvitesPendentes])

  useEffect(() => {
    recarregar()
  }, [recarregar, session])

  const usuariosAtivos = filtrarUsuarios(usuarios.filter((u) => u.ativo), busca)
  const usuariosInativos = filtrarUsuarios(usuarios.filter((u) => !u.ativo), busca)

  const convitesFiltrados = convites.filter(
    (c) =>
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.email.toLowerCase().includes(busca.toLowerCase()) ||
      getLabelPapel(c.papel).toLowerCase().includes(busca.toLowerCase())
  )

  function abrirInterno() {
    if (!podeAdicionarUsuario(assinatura, uso)) {
      toast.atencao(mensagemLimite('usuarios'))
      return
    }
    setDialogInternoAberto(true)
  }

  async function salvarUsuarioInterno(input: UsuarioInternoInput) {
    if (!podeAdicionarUsuario(assinatura, uso)) {
      toast.atencao(mensagemLimite('usuarios'))
      return
    }
    setSalvando(true)
    try {
      await criarUsuarioInterno(input, nomeOficina)
      toast.sucesso(MSG.usuarioInternoCriado)
      setDialogInternoAberto(false)
      recarregar()
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível criar usuário interno.')
    } finally {
      setSalvando(false)
    }
  }

  function abrirRedefinirSenha(usuario: AuthUser) {
    setUsuarioSenha(usuario)
    setNovaSenhaInterna('')
    setDialogSenhaAberto(true)
  }

  async function confirmarRedefinirSenha() {
    if (!usuarioSenha || novaSenhaInterna.length < 6) {
      toast.atencao('Informe uma senha com pelo menos 6 caracteres.')
      return
    }
    setSalvando(true)
    try {
      await redefinirSenhaInterno(usuarioSenha.id, novaSenhaInterna, nomeOficina)
      toast.sucesso(MSG.senhaInternaRedefinida)
      setDialogSenhaAberto(false)
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.')
    } finally {
      setSalvando(false)
    }
  }

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
    if (!usuario.ativo) {
      toast.atencao(MSG.orientacaoNovoUsuario)
      return
    }
    setEditando(usuario)
    setForm({
      nome: usuario.nome,
      email: usuario.email,
      senha: '',
      papel: usuario.papel,
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

    if (
      editando.interno &&
      !editando.ativo &&
      form.nome.trim() !== editando.nome.trim()
    ) {
      toast.atencao(MSG.orientacaoNovoUsuario)
      return
    }

    setErro('')
    setSalvando(true)
    try {
      const patch: Partial<UsuarioInput> = {
        nome: form.nome,
        email: form.email,
        papel: form.papel,
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

  async function confirmarDesativacao(usuario: AuthUser) {
    if (!podeGerenciarUsuario(papelLogado, 'excluir', usuario)) return
    if (usuario.id === session?.user.id) {
      toast.atencao('Você não pode desativar sua própria conta.')
      return
    }
    if (ehUltimoDonoAtivo(usuario, usuarios)) {
      toast.atencao('Não é possível desativar o último dono ativo da oficina.')
      return
    }

    const ok = await confirmar({
      titulo: 'Desativar usuário',
      mensagem: `Desativar o usuário "${usuario.nome}"?\n\n${MSG.confirmarDesativarUsuario}`,
      confirmarTexto: 'Desativar',
      destrutivo: true,
    })
    if (!ok) return
    try {
      await desativarUsuario(usuario.id)
      recarregar()
      toast.sucesso(MSG.usuarioDesativado)
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Erro ao desativar.')
    }
  }

  async function handleReativar(usuario: AuthUser) {
    if (!podeGerenciarUsuario(papelLogado, 'ativar', usuario)) return
    try {
      await reativarUsuario(usuario.id)
      recarregar()
      toast.sucesso(MSG.usuarioReativado)
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Erro ao reativar.')
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
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={abrirInterno} disabled={!podeAdicionarUsuario(assinatura, uso)}>
                <Plus className="mr-2 h-4 w-4" />
                Criar usuário interno
              </Button>
              <Button onClick={abrirConvite} disabled={!podeAdicionarUsuario(assinatura, uso)}>
                <Plus className="mr-2 h-4 w-4" />
                Preparar convite
              </Button>
            </div>
          ) : undefined
        }
      />

      {!podeAdicionarUsuario(assinatura, uso) && <AvisoLimitePlano tipo="usuarios" />}

      <p className="mb-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        {MSG.conviteEnviarManualmente}{' '}
        <span className="block mt-1">{MSG.conviteSmtpFuturo}</span>
        <span className="block mt-2">
          Login interno: funcionários entram com usuário e senha. Código da oficina:{' '}
          <span className="font-mono text-foreground">{codigoOficinaLogin}</span>
        </span>
      </p>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BuscaInput
          valor={busca}
          onChange={setBusca}
          placeholder="Buscar por nome, usuário, e-mail ou cargo..."
          className="sm:max-w-md"
        />
        <Button
          variant={mostrarInativos ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setMostrarInativos((v) => !v)}
        >
          {mostrarInativos ? 'Ocultar inativos' : 'Mostrar inativos'}
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            Usuários ativos ({usuarios.filter((u) => u.ativo).length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TabelaUsuarios
            usuarios={usuariosAtivos}
            sessionUserId={session?.user.id}
            todosUsuarios={usuarios}
            modo="ativos"
            podeEditar={podeEditar}
            onEditar={abrirEditar}
            onRedefinirSenha={abrirRedefinirSenha}
            onDesativar={confirmarDesativacao}
            onReativar={handleReativar}
          />
        </CardContent>
      </Card>

      {mostrarInativos && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">
              Usuários inativos ({usuarios.filter((u) => !u.ativo).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Usuários inativos não contam no limite do plano e não podem acessar o sistema.
              Para uma nova pessoa, crie um novo usuário em vez de reaproveitar o antigo.
            </p>
            <TabelaUsuarios
              usuarios={usuariosInativos}
              sessionUserId={session?.user.id}
              todosUsuarios={usuarios}
              modo="inativos"
              podeEditar={podeEditar}
              onEditar={abrirEditar}
              onRedefinirSenha={abrirRedefinirSenha}
              onDesativar={confirmarDesativacao}
              onReativar={handleReativar}
            />
          </CardContent>
        </Card>
      )}

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
              <Label htmlFor="email-usuario">
                {editando?.interno ? 'E-mail técnico (somente leitura)' : 'E-mail'}
              </Label>
              <Input
                id="email-usuario"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                readOnly={editando?.interno === true}
                className={editando?.interno ? 'bg-muted' : undefined}
              />
            </div>
            {editando?.interno && editando.login_username && (
              <p className="text-xs text-muted-foreground">
                Login interno: <span className="font-mono">{editando.login_username}</span>
              </p>
            )}
            {!editando?.interno && (
              <div className="grid gap-2">
                <Label htmlFor="senha-usuario">Nova senha (opcional)</Label>
                <Input
                  id="senha-usuario"
                  type="password"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                />
              </div>
            )}
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

      <CriarUsuarioInternoDialog
        aberto={dialogInternoAberto}
        onOpenChange={setDialogInternoAberto}
        officeId={session?.user.office_id ?? configuracao.office_id ?? ''}
        nomeOficina={nomeOficina}
        papeisPermitidos={papeisPermitidosConvite}
        salvando={salvando}
        onSubmit={salvarUsuarioInterno}
      />

      <Dialog open={dialogSenhaAberto} onOpenChange={setDialogSenhaAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
          </DialogHeader>
          {usuarioSenha && (
            <div className="grid gap-4 py-2">
              <p className="text-sm text-muted-foreground">
                Nova senha temporária para{' '}
                <span className="font-medium text-foreground">{usuarioSenha.nome}</span>{' '}
                ({formatarIdentificadorUsuario(usuarioSenha)}).
              </p>
              <div className="grid gap-2">
                <Label htmlFor="nova-senha-interna">Nova senha temporária</Label>
                <Input
                  id="nova-senha-interna"
                  type="password"
                  value={novaSenhaInterna}
                  onChange={(e) => setNovaSenhaInterna(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button onClick={() => void confirmarRedefinirSenha()} className="w-full" disabled={salvando}>
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  'Redefinir senha'
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
