import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { officeSlugParaOficina } from '@/services/auth/internal-users.service'
import { gerarEmailInterno, normalizarLoginInterno } from '@/lib/internal-user'
import { PAPEIS_USUARIO, type PapelUsuario, type UsuarioInternoInput } from '@/types/auth'

const formVazio: UsuarioInternoInput = {
  nome: '',
  login_username: '',
  senha: '',
  papel: 'mecanico',
  ativo: true,
}

interface Props {
  aberto: boolean
  onOpenChange: (open: boolean) => void
  officeId: string
  nomeOficina: string
  papeisPermitidos: PapelUsuario[]
  salvando: boolean
  onSubmit: (input: UsuarioInternoInput) => Promise<void>
}

export function CriarUsuarioInternoDialog({
  aberto,
  onOpenChange,
  officeId,
  nomeOficina,
  papeisPermitidos,
  salvando,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<UsuarioInternoInput>(formVazio)
  const officeSlug = officeSlugParaOficina(officeId, nomeOficina)
  const emailPreview = form.login_username.trim()
    ? gerarEmailInterno(normalizarLoginInterno(form.login_username), officeSlug)
    : `usuario@${officeSlug}.boxgestor.local`

  async function handleSubmit() {
    await onSubmit(form)
    setForm({
      ...formVazio,
      papel: papeisPermitidos.includes('mecanico') ? 'mecanico' : papeisPermitidos[0],
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar usuário interno</DialogTitle>
          <DialogDescription>
            Acesso com usuário e senha, sem e-mail pessoal. O login usa autenticação segura do
            Supabase com e-mail técnico interno.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <p>
              Código da oficina (login interno):{' '}
              <span className="font-mono text-foreground">{officeSlug}</span>
            </p>
            <p className="mt-1">
              E-mail técnico gerado: <span className="font-mono text-foreground">{emailPreview}</span>
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nome-interno">Nome do funcionário</Label>
            <Input
              id="nome-interno"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="login-interno">Usuário / login</Label>
            <Input
              id="login-interno"
              value={form.login_username}
              onChange={(e) => setForm({ ...form, login_username: e.target.value })}
              placeholder="mecanico01"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="senha-interno">Senha temporária</Label>
            <Input
              id="senha-interno"
              type="password"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              autoComplete="new-password"
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

          <Button onClick={() => void handleSubmit()} className="w-full" disabled={salvando}>
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando…
              </>
            ) : (
              'Criar usuário interno'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
