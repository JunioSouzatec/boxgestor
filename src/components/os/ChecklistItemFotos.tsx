import { useRef, useState } from 'react'
import { Camera, EyeOff, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { isUuidFormato } from '@/lib/local-id-uuid'
import { MSG } from '@/lib/mensagens-usuario'
import {
  cancelarFotoOsPendente,
  ehFotoPendenteOffline,
  salvarFotoOsOffline,
} from '@/services/os/offline-service-order-photos.service'
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
  if (ehFotoPendenteOffline(foto)) return true
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
  onAlterou: (ctx?: { osId?: string; osNumero?: number }) => void
  /**
   * Quando false, só chama onAlterou (pai compartilha fotos e recarrega uma vez).
   * Default true para compatibilidade.
   */
  emitirEventoGlobal?: boolean
  /** OS nova: prepara rascunho antes do upload. */
  onPrepararOsParaFoto?: () => Promise<{ id: string; numero?: number } | null>
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
  onPrepararOsParaFoto,
}: ChecklistItemFotosProps) {
  const { toast } = useToast()
  const { confirmar } = useConfirmacao()
  const onlineStatus = useOnlineStatus()
  const online = onlineStatus
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [ocultandoId, setOcultandoId] = useState<string | null>(null)
  const [osIdEfetivo, setOsIdEfetivo] = useState(osId)
  const [osNumeroEfetivo, setOsNumeroEfetivo] = useState(osNumero)

  const qtd = fotos.length
  const idOsAtual = osId ?? osIdEfetivo
  const numeroOsAtual = osNumero ?? osNumeroEfetivo

  async function handleArquivo(file: File | undefined) {
    if (!file) return
    if (!officeId) {
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
      let idOs = idOsAtual
      let numeroOs = numeroOsAtual

      if (!idOs && onPrepararOsParaFoto) {
        const rascunho = await onPrepararOsParaFoto()
        idOs = rascunho?.id
        numeroOs = rascunho?.numero ?? numeroOs
        if (idOs) {
          setOsIdEfetivo(idOs)
          setOsNumeroEfetivo(numeroOs)
        }
      }

      if (!idOs) {
        toast.atencao('Salve a OS antes de anexar fotos ao checklist.')
        return
      }

      if (!online) {
        const local = await salvarFotoOsOffline({
          officeId,
          localOsId: idOs,
          osNumero: numeroOs,
          file,
          fileName: file.name,
          contentType: file.type,
          checklistItemId: itemId,
          checklistItemLabel: itemNome,
          photoContext: 'checklist',
          photoType: 'entrada',
          createdBy:
            createdBy && isUuidFormato(createdBy) ? createdBy.trim() : undefined,
          createdByName,
        })
        if (!local.ok) {
          toast.erro(local.erro ?? 'Não foi possível salvar a foto neste aparelho.')
          return
        }
        toast.sucesso(MSG.fotoSalvaOfflinePendente)
        const ctxOs = { osId: idOs, osNumero: numeroOs }
        onAlterou(ctxOs)
        if (emitirEventoGlobal) emitirFotosOsAtualizadas(idOs)
        return
      }

      const resultado = await enviarFotoChecklistItem({
        officeId,
        serviceOrderId: idOs,
        osNumero: numeroOs,
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
      onAlterou({ osId: idOs, osNumero: numeroOs })
      if (emitirEventoGlobal) emitirFotosOsAtualizadas(idOs)
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível enviar a foto.')
    } finally {
      setEnviando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemoverPendente(foto: ServiceOrderPhotoComUrl) {
    if (!ehFotoPendenteOffline(foto) || ocultandoId) return

    const ok = await confirmar({
      titulo: 'Cancelar envio',
      mensagem:
        'Remover esta foto pendente deste aparelho?\nEla ainda não foi enviada ao servidor.',
      confirmarTexto: 'Remover',
      cancelarTexto: 'Manter',
    })
    if (!ok) return

    setOcultandoId(foto.id)
    try {
      const resultado = await cancelarFotoOsPendente(foto.local_id || foto.id)
      if (!resultado.ok) {
        toast.erro(resultado.erro ?? 'Não foi possível remover a foto pendente.')
        return
      }
      toast.sucesso(MSG.fotoPendenteRemovida)
      const idEmitir = (osId ?? osIdEfetivo)?.trim()
      onAlterou(idEmitir ? { osId: idEmitir, osNumero: numeroOsAtual } : undefined)
      if (emitirEventoGlobal && idEmitir) emitirFotosOsAtualizadas(idEmitir)
    } catch (err) {
      toast.erro(
        err instanceof Error ? err.message : 'Não foi possível remover a foto pendente.'
      )
    } finally {
      setOcultandoId(null)
    }
  }

  async function handleOcultar(foto: ServiceOrderPhotoComUrl) {
    if (ehFotoPendenteOffline(foto)) {
      await handleRemoverPendente(foto)
      return
    }

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
      onAlterou(osId ? { osId, osNumero } : undefined)
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
          {!online && fotoObrigatoria && qtd > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              {MSG.fotoSalvaOfflinePendente}
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
            title={
              !online
                ? 'Salva a foto neste aparelho (envio quando houver internet)'
                : 'Adicionar foto'
            }
            onClick={() => {
              inputRef.current?.click()
            }}
          >
            {enviando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            {enviando ? (online ? 'Enviando…' : 'Salvando…') : 'Adicionar foto'}
          </Button>
        </div>
      </div>

      {fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fotos.map((foto) => {
            const pendente = ehFotoPendenteOffline(foto)
            return (
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
                {pendente ? (
                  <Badge className="absolute left-0 top-0 max-w-full truncate rounded-none rounded-br bg-amber-600 px-1 py-0 text-[8px] text-white hover:bg-amber-600">
                    Pendente
                  </Badge>
                ) : null}
                {podeOcultarFoto(foto, {
                  userId: createdBy,
                  userPapel,
                  ehAdminSistema,
                }) && (
                  <button
                    type="button"
                    title={pendente ? 'Remover foto pendente' : 'Ocultar foto'}
                    className="absolute bottom-0 right-0 rounded-tl bg-background/90 p-0.5 text-muted-foreground hover:text-destructive"
                    disabled={ocultandoId === foto.id || (!pendente && !online)}
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
            )
          })}
        </div>
      )}
    </div>
  )
}
