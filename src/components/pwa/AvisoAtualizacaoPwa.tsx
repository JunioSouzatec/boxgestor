import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { recarregarPwaComNovaVersao } from '@/lib/pwa-update'

export function AvisoAtualizacaoPwa() {
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const handler = () => setVisivel(true)
    window.addEventListener('craft:pwa-update', handler)
    return () => window.removeEventListener('craft:pwa-update', handler)
  }, [])

  if (!visivel) return null

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-4 right-4 z-[100] mx-auto flex max-w-lg flex-col gap-3 rounded-lg border border-primary/40 bg-background p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-medium">Nova versão disponível</p>
        <p className="text-sm text-muted-foreground">
          Atualize para usar a versão mais recente do app.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={() => setVisivel(false)}>
          Depois
        </Button>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => {
            recarregarPwaComNovaVersao()
            setVisivel(false)
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>
    </div>
  )
}
