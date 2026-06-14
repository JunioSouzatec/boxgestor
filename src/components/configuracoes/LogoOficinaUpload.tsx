import { useRef, useState } from 'react'
import { ImagePlus, Trash2, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { LogoOficina } from '@/components/oficina/LogoOficina'
import { useToast } from '@/context/ToastContext'

const MAX_LOGO_BYTES = 512 * 1024
const TIPOS_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

interface LogoOficinaUploadProps {
  logoUrl?: string
  nomeOficina: string
  onChange: (logoUrl: string | undefined) => void
}

function redimensionarImagem(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 400
        let { width, height } = img
        if (width > max || height > max) {
          const ratio = Math.min(max / width, max / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Não foi possível processar a imagem.'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

export function LogoOficinaUpload({ logoUrl, nomeOficina, onChange }: LogoOficinaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const [enviando, setEnviando] = useState(false)

  async function processarArquivo(file: File | undefined) {
    if (!file) return

    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      toast.atencao('Use PNG, JPG, WEBP ou SVG.')
      return
    }

    if (file.size > MAX_LOGO_BYTES && file.type !== 'image/svg+xml') {
      toast.atencao('A logo deve ter no máximo 512 KB.')
      return
    }

    setEnviando(true)
    try {
      const dataUrl =
        file.type === 'image/svg+xml'
          ? await file.text().then(
              (svg) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
            )
          : await redimensionarImagem(file)
      onChange(dataUrl)
      toast.sucesso('Logo salva com sucesso.')
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Craft] Erro ao enviar logo:', err)
      toast.erro(err instanceof Error ? err.message : 'Erro ao enviar logo.')
    } finally {
      setEnviando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function abrirSeletor() {
    inputRef.current?.click()
  }

  return (
    <div className="grid gap-3">
      <Label>Logo da oficina</Label>
      <p className="text-xs text-muted-foreground">
        Exibida na OS e no PDF. Salva localmente (base64); preparado para Supabase Storage.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <LogoOficina logoUrl={logoUrl} nome={nomeOficina} tamanho="lg" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={abrirSeletor} disabled={enviando}>
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : logoUrl ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Trocar logo
              </>
            ) : (
              <>
                <ImagePlus className="h-4 w-4" />
                Enviar logo
              </>
            )}
          </Button>
          {logoUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(undefined)}
            >
              <Trash2 className="h-4 w-4" />
              Remover logo
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => processarArquivo(e.target.files?.[0])}
      />
    </div>
  )
}
