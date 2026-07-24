import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/context/ToastContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { isUuidFormato } from '@/lib/local-id-uuid'
import {
  listarFotosOSComUrls,
  uploadFotoOS,
  type ServiceOrderPhotoComUrl,
  type TipoFotoOS,
} from '@/services/os/service-order-photos.service'

export interface FotosOSSectionProps {
  osId: string | undefined
  officeId: string | undefined
  /** Número da OS — ajuda a resolver o UUID remoto (office + number) */
  osNumero?: number
  podeAdicionar?: boolean
  online?: boolean
  createdBy?: string
  createdByName?: string
}

const MIME_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'] as const
const TAMANHO_MAX_BYTES = 10 * 1024 * 1024

const TIPOS_UPLOAD: { value: TipoFotoOS; label: string }[] = [
  { value: 'geral', label: 'Geral' },
  { value: 'entrada', label: 'Entrada' },
  { value: 'avaria', label: 'Avaria' },
  { value: 'peca_antiga', label: 'Peça antiga' },
  { value: 'peca_nova', label: 'Peça nova' },
  { value: 'servico', label: 'Serviço' },
  { value: 'entrega', label: 'Entrega' },
]

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

function validarArquivoFoto(file: File): string | null {
  const mime = (file.type || '').toLowerCase()
  if (!MIME_PERMITIDOS.includes(mime as (typeof MIME_PERMITIDOS)[number])) {
    return 'Formato não permitido. Use JPEG, PNG ou WebP.'
  }
  if (file.size <= 0) {
    return 'Arquivo inválido.'
  }
  if (file.size > TAMANHO_MAX_BYTES) {
    return 'A foto deve ter no máximo 10 MB.'
  }
  return null
}

export function FotosOSSection({
  osId,
  officeId,
  osNumero,
  podeAdicionar = false,
  online: onlineProp,
  createdBy,
  createdByName,
}: FotosOSSectionProps) {
  const onlineHook = useOnlineStatus()
  const online = onlineProp ?? onlineHook
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [fotos, setFotos] = useState<ServiceOrderPhotoComUrl[]>([])
  const [tipoFoto, setTipoFoto] = useState<TipoFotoOS>('geral')
  const [legenda, setLegenda] = useState('')

  const podeEnviar = Boolean(osId && officeId && online && podeAdicionar && !enviando)

  const carregarFotos = useCallback(async () => {
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
      osNumero,
    })

    if (!resultado.ok || !resultado.dados) {
      setFotos([])
      setErro(resultado.erro ?? 'Não foi possível carregar as fotos.')
      setCarregando(false)
      return
    }

    setFotos(resultado.dados)
    setCarregando(false)
  }, [osId, officeId, osNumero, online])

  useEffect(() => {
    void carregarFotos()
  }, [carregarFotos])

  async function handleArquivoSelecionado(fileList: FileList | null) {
    const file = fileList?.[0]
    if (inputRef.current) {
      inputRef.current.value = ''
    }

    if (!file) return

    if (!osId) {
      toast.atencao('Salve a OS antes de adicionar fotos.')
      return
    }
    if (!online) {
      toast.atencao('Fotos precisam de internet nesta versão.')
      return
    }
    if (!officeId) {
      toast.erro('Oficina não identificada.')
      return
    }
    if (!podeAdicionar) {
      toast.atencao('Você não tem permissão para adicionar fotos.')
      return
    }

    const erroValidacao = validarArquivoFoto(file)
    if (erroValidacao) {
      toast.atencao(erroValidacao)
      return
    }

    setEnviando(true)
    try {
      const createdByUuid =
        createdBy && isUuidFormato(createdBy) ? createdBy.trim() : undefined

      const resultado = await uploadFotoOS({
        officeId,
        serviceOrderId: osId,
        osNumero,
        file,
        fileName: file.name,
        contentType: file.type,
        caption: legenda.trim() || undefined,
        photoType: tipoFoto,
        createdBy: createdByUuid,
        createdByName: createdByName?.trim() || undefined,
        metadata: {
          mime_type: file.type,
          size: file.size,
          original_name: file.name,
        },
      })

      if (!resultado.ok) {
        toast.erro(resultado.erro ?? 'Não foi possível enviar a foto.')
        return
      }

      setLegenda('')
      setTipoFoto('geral')
      toast.sucesso('Foto adicionada com sucesso.')
      await carregarFotos()
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível enviar a foto.')
    } finally {
      setEnviando(false)
    }
  }

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
          disabled={!podeEnviar}
          title={
            !osId
              ? 'Salve a OS antes de adicionar fotos.'
              : !online
                ? 'Fotos precisam de internet nesta versão.'
                : !podeAdicionar
                  ? 'Sem permissão para adicionar fotos.'
                  : 'Adicionar foto da galeria ou câmera'
          }
          onClick={() => inputRef.current?.click()}
        >
          {enviando ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Camera className="mr-1.5 h-4 w-4" />
          )}
          {enviando ? 'Enviando…' : 'Adicionar foto'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={!podeEnviar}
          onChange={(e) => void handleArquivoSelecionado(e.target.files)}
        />
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

      {osId && online && !podeAdicionar && (
        <p className="text-xs text-muted-foreground">
          Sem permissão para adicionar fotos nesta OS.
        </p>
      )}

      {osId && online && officeId && podeAdicionar && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="foto-os-tipo">Tipo da foto</Label>
            <Select
              value={tipoFoto}
              onValueChange={(v) => setTipoFoto(v as TipoFotoOS)}
              disabled={enviando}
            >
              <SelectTrigger id="foto-os-tipo">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_UPLOAD.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="foto-os-legenda">Legenda (opcional)</Label>
            <Input
              id="foto-os-legenda"
              value={legenda}
              disabled={enviando}
              maxLength={200}
              placeholder="Ex.: farol esquerdo riscado"
              onChange={(e) => setLegenda(e.target.value)}
            />
          </div>
        </div>
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
