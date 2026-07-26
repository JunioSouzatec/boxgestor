import { useRef, useState } from 'react'
import { Camera, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { isUuidFormato } from '@/lib/local-id-uuid'
import {
  emitirFotosOsAtualizadas,
  enviarFotoChecklistItem,
  softDeleteFotoOS,
  type ServiceOrderPhotoComUrl,
} from '@/services/os/service-order-photos.service'
import type { PapelUsuario } from '@/types/auth'

const MIME_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'] as const
const TAMANHO_MAX_BYTES = 10 * 1024 * 1024

function podeOcultarFoto(
  foto: ServiceOrderPhotoComUrl,
  opts: { userId?: string; userPapel?: string; ehAdminSistema?: boolean }
): boolean {
  if (opts.ehAdminSistema) return true
  const papel = (opts.userPapel ?? '').toLowerCase()
  if (papel === 'dono' || papel === 'gerente' || papel === 'admin') return true
  if (opts.userId && foto.created_by && opts.userId === foto.created_by) return true
  return false
}

function validarArquivo(file: File): string | null {
  const mime = (file.type || '').toLowerCase()
  if (!MIME_PERMITIDOS.includes(mime as (typeof MIME_PERMITIDOS)[number])) {
    return 'Formato não permitido. Use JPEG, PNG ou WebP.'
  }
  if (file.size <= 0) return 'Arquivo inválido.'
  if (file.size > TAMANHO_MAX_BYTES) return 'A foto deve ter no máximo 10 MB.'
  return null
}

export interface ChecklistItemFotosProps {
  itemId: string
  itemNome: string
  fotoObrigatoria: boolean
  fotos: ServiceOrderPhotoComUrl[]
  osId?: string
  osNumero?: number
  officeId?: string
  podeAdicionar?: boolean
  createdBy?: string
  createdByName?: string
  userPapel?: PapelUsuario | string
  ehAdminSistema?: boolean
  onAlterou: () => void
  /**
   * Quando false, só chama onAlterou (pai compartilha fotos e recarrega uma vez).
   * Default true para compatibilidade.
   */
  emitirEventoGlobal?: boolean
}

export function ChecklistItemFotos({
  itemId,
  itemNome,
  fotoObrigatoria,
  fotos,
  osId,
  osNumero,
  officeId,
  podeAdicionar = true,
  createdBy,
  createdByName,
  userPapel,
  ehAdminSistema,
  onAlterou,
  emitirEventoGlobal = true,
}: ChecklistItemFotosProps) {
  const { toast } = useToast()
  const { confirmar } = useConfirmacao()
  const onlineStatus = useOnlineStatus()
  const online = onlineStatus
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [ocultandoId, setOcultandoId] = useState<string | null>(null)

  const qtd = fotos.length

  async function handleArquivo(file: File | undefined) {
    if (!file) return
    if (!online) {
      toast.atencao(
        'Envio de fotos precisa de internet. Tente novamente quando estiver online.'
      )
      return
    }
    if (!osId || !officeId) {
      toast.atencao('Salve a OS antes de anexar fotos ao checklist.')
      return
    }
    if (!podeAdicionar) {
      toast.atencao('Você não tem permissão para anexar fotos.')
      return
    }

    const erroArquivo = validarArquivo(file)
    if (erroArquivo) {
      toast.atencao(erroArquivo)
      return
    }

    setEnviando(true)
    try {
      const resultado = await enviarFotoChecklistItem({
        officeId,
        serviceOrderId: osId,
        osNumero,
        file,
        fileName: file.name,
        contentType: file.type,
        checklistItemId: itemId,
        checklistItemLabel: itemNome,
        createdBy,
        createdByName,
        preferirIncluirNoPdf: fotoObrigatoria,
      })

      if (!resultado.ok || !resultado.dados) {
        toast.erro(resultado.erro ?? 'Não foi possível enviar a foto.')
        return
      }

      if (resultado.dados.aviso_limite_pdf) {
        toast.atencao(resultado.dados.aviso_limite_pdf)
      } else if (resultado.dados.include_in_pdf) {
        toast.sucesso('Foto do checklist adicionada e marcada para o PDF.')
      } else {
        toast.sucesso('Foto do checklist adicionada.')
      }
      onAlterou()
      if (emitirEventoGlobal) emitirFotosOsAtualizadas(osId)
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível enviar a foto.')
    } finally {
      setEnviando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleOcultar(foto: ServiceOrderPhotoComUrl) {
    if (!officeId || !online || ocultandoId) return
    if (
      !podeOcultarFoto(foto, {
        userId: createdBy,
        userPapel,
        ehAdminSistema,
      })
    ) {
      toast.atencao('Você não tem permissão para ocultar esta foto.')
      return
    }

    const ok = await confirmar({
      titulo: 'Ocultar foto',
      mensagem: 'Ocultar esta foto do item do checklist?',
      confirmarTexto: 'Ocultar',
      cancelarTexto: 'Cancelar',
    })
    if (!ok) return

    setOcultandoId(foto.id)
    try {
      const resultado = await softDeleteFotoOS({
        officeId,
        fotoId: foto.id,
        deletedBy:
          createdBy && isUuidFormato(createdBy) ? createdBy.trim() : undefined,
        deletedByName: createdByName,
        deletedReason: 'Ocultada no checklist',
      })
      if (!resultado.ok) {
        toast.erro(resultado.erro ?? 'Não foi possível ocultar a foto.')
        return
      }
      toast.sucesso('Foto ocultada.')
      onAlterou()
      if (emitirEventoGlobal && osId) emitirFotosOsAtualizadas(osId)
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível ocultar a foto.')
    } finally {
      setOcultandoId(null)
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-dashed border-border/80 bg-background/50 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-foreground">
            Fotos: {qtd}
            {fotoObrigatoria && (
              <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Foto obrigatória
              </span>
            )}
          </p>
          {fotoObrigatoria && qtd === 0 && (
            <p className="text-[11px] text-destructive">
              Este item exige pelo menos uma foto.
            </p>
          )}
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void handleArquivo(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={enviando || !podeAdicionar}
            onClick={() => {
              if (!online) {
                toast.atencao(
                  'Envio de fotos precisa de internet. Tente novamente quando estiver online.'
                )
                return
              }
              if (!osId) {
                toast.atencao('Salve a OS antes de anexar fotos ao checklist.')
                return
              }
              inputRef.current?.click()
            }}
          >
            {enviando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            Adicionar foto
          </Button>
        </div>
      </div>

      {fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fotos.map((foto) => (
            <div
              key={foto.id}
              className="relative h-14 w-14 overflow-hidden rounded border border-border bg-muted"
            >
              {foto.signed_url ? (
                <img
                  src={foto.signed_url}
                  alt={itemNome}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground">
                  —
                </div>
              )}
              {podeOcultarFoto(foto, {
                userId: createdBy,
                userPapel,
                ehAdminSistema,
              }) && (
                <button
                  type="button"
                  title="Ocultar foto"
                  className="absolute bottom-0 right-0 rounded-tl bg-background/90 p-0.5 text-muted-foreground hover:text-destructive"
                  disabled={ocultandoId === foto.id}
                  onClick={() => void handleOcultar(foto)}
                >
                  {ocultandoId === foto.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
