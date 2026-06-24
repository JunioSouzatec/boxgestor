import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ehAdminSistema } from '@/lib/craft-admin'
import {
  atualizarTipoOficinaAdmin,
  type ResultadoAtualizarTipoOficina,
} from '@/services/admin/admin-tipo-oficina.service'
import {
  LABEL_TIPO_OFICINA,
  normalizarTipoOficina,
  TIPOS_OFICINA,
  type TipoOficina,
} from '@/types/tipo-oficina'

interface AdminTipoOficinaSectionProps {
  officeId: string
  tipoAtual?: TipoOficina
  onAtualizado?: (tipo: TipoOficina) => void
}

export function AdminTipoOficinaSection({
  officeId,
  tipoAtual,
  onAtualizado,
}: AdminTipoOficinaSectionProps) {
  const { session } = useAuth()
  const { toast } = useToast()
  const usuario = session?.user
  const podeEditar = ehAdminSistema(usuario)

  const [tipo, setTipo] = useState<TipoOficina>(normalizarTipoOficina(tipoAtual))
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!podeEditar) return
    setSalvando(true)
    let resultado: ResultadoAtualizarTipoOficina
    try {
      resultado = await atualizarTipoOficinaAdmin(officeId, tipo, usuario)
    } finally {
      setSalvando(false)
    }
    if (resultado.ok) {
      toast.sucesso(resultado.mensagem)
      onAtualizado?.(normalizarTipoOficina(resultado.tipo_oficina))
    } else {
      toast.erro(resultado.mensagem)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">Tipo de oficina</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Configuração comercial — somente Admin Sistema pode alterar.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="admin-tipo-oficina">Segmento</Label>
          <Select
            value={tipo}
            onValueChange={(v) => setTipo(normalizarTipoOficina(v))}
            disabled={!podeEditar || salvando}
          >
            <SelectTrigger id="admin-tipo-oficina">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_OFICINA.map((t) => (
                <SelectItem key={t} value={t}>
                  {LABEL_TIPO_OFICINA[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {podeEditar && (
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar tipo'}
          </Button>
        )}
      </div>
    </div>
  )
}
