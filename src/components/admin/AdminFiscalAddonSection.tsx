import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ehAdminSistema } from '@/lib/craft-admin'
import {
  atualizarModuloFiscalAdicionalAdmin,
} from '@/services/admin/admin-fiscal-addon.service'
import {
  AVISO_CUSTOS_EXTERNOS_FISCAL,
  PRECO_MODULO_FISCAL_LABEL,
} from '@/types/plano'

interface AdminFiscalAddonSectionProps {
  officeId: string
  ativo?: boolean
  onAtualizado?: (ativo: boolean) => void
}

export function AdminFiscalAddonSection({
  officeId,
  ativo = false,
  onAtualizado,
}: AdminFiscalAddonSectionProps) {
  const { session } = useAuth()
  const { toast } = useToast()
  const podeEditar = ehAdminSistema(session?.user)

  const [ligado, setLigado] = useState(ativo === true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setLigado(ativo === true)
  }, [ativo, officeId])

  async function salvar(proximo: boolean) {
    if (!podeEditar) return
    setSalvando(true)
    try {
      const resultado = await atualizarModuloFiscalAdicionalAdmin(
        officeId,
        proximo,
        session?.user
      )
      if (resultado.ok) {
        toast.sucesso(resultado.mensagem)
        setLigado(proximo)
        onAtualizado?.(proximo)
      } else {
        toast.erro(resultado.mensagem)
      }
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">Módulo Fiscal adicional</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Adicional pago ({PRECO_MODULO_FISCAL_LABEL} por oficina). Não incluso em nenhum plano.
        Somente Admin Sistema altera.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{AVISO_CUSTOS_EXTERNOS_FISCAL}</p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label>Status comercial</Label>
          <p className="text-sm font-medium">{ligado ? 'Ativo' : 'Inativo'}</p>
        </div>
        {podeEditar && (
          <Button
            type="button"
            variant={ligado ? 'outline' : 'default'}
            disabled={salvando}
            onClick={() => void salvar(!ligado)}
          >
            {salvando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : ligado ? (
              'Desativar adicional'
            ) : (
              'Ativar adicional'
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
