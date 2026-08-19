/**
 * Galeria read-only de fotos liberadas no portal público (A3).
 * Só renderiza fotos do payload (já filtradas pela Edge).
 */
import { useState } from 'react'
import { ImageIcon, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PublicQuoteApprovalPayload } from '@/types/approval-link'

type PortalPhoto = NonNullable<PublicQuoteApprovalPayload['photos']>[number]

function formatarDataCurta(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function PortalFotosPublicasSection({
  photos,
}: {
  photos?: PublicQuoteApprovalPayload['photos']
}) {
  const lista = Array.isArray(photos) ? photos.filter((p) => p?.signed_url) : []
  const [expiradas, setExpiradas] = useState<Record<string, boolean>>({})

  if (lista.length === 0) return null

  const algumaExpirada = lista.some((p) => expiradas[p.id])

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Fotos do serviço</h2>
      </div>

      {algumaExpirada ? (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
          <p>
            As fotos expiraram por segurança. Atualize a página para carregar novamente.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Atualizar página
          </Button>
        </div>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {lista.map((foto: PortalPhoto) => {
          const dataFmt = formatarDataCurta(foto.created_at)
          const falhou = Boolean(expiradas[foto.id])
          return (
            <li
              key={foto.id}
              className="overflow-hidden rounded-lg border border-border bg-background"
            >
              <div className="relative aspect-[4/3] bg-muted/40">
                {falhou ? (
                  <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                    Foto indisponível. Atualize a página.
                  </div>
                ) : (
                  <img
                    src={foto.signed_url}
                    alt={foto.caption?.trim() || 'Foto do serviço'}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={() =>
                      setExpiradas((prev) => ({ ...prev, [foto.id]: true }))
                    }
                  />
                )}
              </div>
              <div className="space-y-0.5 p-2.5">
                {foto.caption?.trim() ? (
                  <p className="line-clamp-2 text-xs text-foreground">{foto.caption.trim()}</p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  {[foto.type, dataFmt].filter(Boolean).join(' · ') ||
                    'Foto liberada pela oficina'}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
