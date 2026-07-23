import { useEffect, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import {
  listarFotosOSComUrls,
  type ServiceOrderPhotoComUrl,
} from '@/services/os/service-order-photos.service'

export interface FotosOSSectionProps {
  osId: string | undefined
  officeId: string | undefined
  /** Reserva para upload futuro; nesta fase o botão fica desabilitado. */
  podeAdicionar?: boolean
  online?: boolean
}

const LABEL_TIPO_FOTO: Record<string, string> = {
  geral: 'Geral',
  entrada: 'Entrada',
  avaria: 'Avaria',
  peca_antiga: 'Peça antiga',
  peca_nova: 'Peça nova',
  servico: 'Serviço',
  entrega: 'Entrega',
  antes: 'Antes',
  depois: 'Depois',
}

function labelTipoFoto(tipo: string): string {
  const key = tipo.trim().toLowerCase()
  return LABEL_TIPO_FOTO[key] ?? tipo
}

function formatarDataHora(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function FotosOSSection({
  osId,
  officeId,
  podeAdicionar = false,
  online: onlineProp,
}: FotosOSSectionProps) {
  const onlineHook = useOnlineStatus()
  const online = onlineProp ?? onlineHook

  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [fotos, setFotos] = useState<ServiceOrderPhotoComUrl[]>([])

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      if (!osId || !officeId) {
        setFotos([])
        setErro(null)
        setCarregando(false)
        return
      }

      if (!online) {
        setFotos([])
        setErro(null)
        setCarregando(false)
        return
      }

      setCarregando(true)
      setErro(null)

      const resultado = await listarFotosOSComUrls({
        officeId,
        serviceOrderId: osId,
      })

      if (cancelado) return

      if (!resultado.ok || !resultado.dados) {
        setFotos([])
        setErro(resultado.erro ?? 'Não foi possível carregar as fotos.')
        setCarregando(false)
        return
      }

      setFotos(resultado.dados)
      setCarregando(false)
    }

    void carregar()
    return () => {
      cancelado = true
    }
  }, [osId, officeId, online])

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Fotos da OS</h4>
          <p className="text-xs text-muted-foreground">
            Registre imagens de entrada, avarias, peças e entrega do veículo.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled
          title={
            podeAdicionar
              ? 'Upload em breve'
              : 'Adicionar foto em breve (permissão será aplicada na próxima fase)'
          }
        >
          <Camera className="mr-1.5 h-4 w-4" />
          Adicionar foto em breve
        </Button>
      </div>

      {!osId && (
        <p className="text-xs text-muted-foreground">
          Salve a OS antes de adicionar fotos.
        </p>
      )}

      {osId && !online && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Fotos precisam de internet nesta versão.
        </p>
      )}

      {osId && online && !officeId && (
        <p className="text-xs text-muted-foreground">
          Oficina não identificada. Não foi possível carregar as fotos.
        </p>
      )}

      {osId && online && officeId && carregando && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando fotos…
        </div>
      )}

      {osId && online && officeId && !carregando && erro && (
        <p className="text-xs text-destructive">{erro}</p>
      )}

      {osId && online && officeId && !carregando && !erro && fotos.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma foto adicionada nesta OS.</p>
      )}

      {osId && online && officeId && !carregando && !erro && fotos.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fotos.map((foto) => {
            const quando = formatarDataHora(foto.created_at)
            return (
              <li
                key={foto.id}
                className="overflow-hidden rounded-lg border border-border bg-background"
              >
                <div className="aspect-[4/3] bg-muted/40">
                  {foto.signed_url ? (
                    <img
                      src={foto.signed_url}
                      alt={foto.caption?.trim() || labelTipoFoto(foto.photo_type)}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                      Não foi possível carregar esta foto.
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 p-3">
                  <Badge variant="secondary" className="text-[10px]">
                    {labelTipoFoto(foto.photo_type)}
                  </Badge>
                  {foto.caption?.trim() ? (
                    <p className="text-xs text-foreground line-clamp-2">{foto.caption.trim()}</p>
                  ) : null}
                  {quando ? (
                    <p className="text-[11px] text-muted-foreground">{quando}</p>
                  ) : null}
                  {foto.created_by_name?.trim() ? (
                    <p className="text-[11px] text-muted-foreground">
                      Por {foto.created_by_name.trim()}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
