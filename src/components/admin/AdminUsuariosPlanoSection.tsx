import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ehAdminSistema } from '@/lib/craft-admin'
import {
  atualizarExtraUsersCountAdmin,
  type ResultadoAtualizarExtraUsers,
} from '@/services/admin/admin-extra-users.service'
import {
  mensagemOficinaAcimaLimiteUsuariosAdmin,
  resumoLimitesUsuariosOficina,
} from '@/services/assinatura/plano-features'
import { getLabelPlano, normalizarExtraUsersCount, type PlanoTier } from '@/types/plano'

interface AdminUsuariosPlanoSectionProps {
  officeId: string
  planoTier: PlanoTier
  extraUsersCount?: number
  usuariosAtivos: number
  onAtualizado?: (extraUsersCount: number) => void
}

export function AdminUsuariosPlanoSection({
  officeId,
  planoTier,
  extraUsersCount = 0,
  usuariosAtivos,
  onAtualizado,
}: AdminUsuariosPlanoSectionProps) {
  const { session } = useAuth()
  const { toast } = useToast()
  const usuario = session?.user
  const podeEditar = ehAdminSistema(usuario)

  const [extras, setExtras] = useState(String(normalizarExtraUsersCount(extraUsersCount)))
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setExtras(String(normalizarExtraUsersCount(extraUsersCount)))
  }, [extraUsersCount, officeId])

  const resumo = useMemo(
    () =>
      resumoLimitesUsuariosOficina(
        planoTier,
        normalizarExtraUsersCount(extras),
        usuariosAtivos
      ),
    [planoTier, extras, usuariosAtivos]
  )

  async function salvar() {
    if (!podeEditar) return
    const count = normalizarExtraUsersCount(extras)
    setSalvando(true)
    let resultado: ResultadoAtualizarExtraUsers
    try {
      resultado = await atualizarExtraUsersCountAdmin(officeId, count, usuario)
    } finally {
      setSalvando(false)
    }

    if (resultado.ok && resultado.extra_users_count !== undefined) {
      toast.sucesso(resultado.mensagem)
      setExtras(String(resultado.extra_users_count))
      onAtualizado?.(resultado.extra_users_count)
    } else {
      toast.erro(resultado.mensagem)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">Plano e limites de usuários</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Usuários extras são contratados manualmente — somente Admin Sistema pode alterar.
      </p>

      {resumo.acimaDoLimite && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {mensagemOficinaAcimaLimiteUsuariosAdmin()}
        </p>
      )}

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Plano atual</dt>
          <dd>{getLabelPlano(planoTier)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Limite base de usuários</dt>
          <dd>{resumo.maxBase}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Usuários extras contratados</dt>
          <dd>{resumo.extras}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Limite total de usuários</dt>
          <dd className="font-medium">{resumo.limiteTotal}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Usuários ativos atualmente</dt>
          <dd>{resumo.usuariosAtivos}</dd>
        </div>
      </dl>

      {podeEditar && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="admin-extra-users">Usuários extras (extra_users_count)</Label>
            <Input
              id="admin-extra-users"
              type="number"
              min={0}
              step={1}
              value={extras}
              onChange={(e) => setExtras(e.target.value)}
              disabled={salvando}
            />
          </div>
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar extras'}
          </Button>
        </div>
      )}
    </div>
  )
}
