import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, EyeOff, ImageIcon, Loader2 } from 'lucide-react'
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
import { BotaoEnviarWhatsAppOs } from '@/components/os/BotaoEnviarWhatsAppOs'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { isUuidFormato } from '@/lib/local-id-uuid'
import { MSG } from '@/lib/mensagens-usuario'
import {
  cancelarFotoOsPendente,
  carregarFotosOsComPendentesLocais,
  ehFotoPendenteOffline,
  obterLabelBadgeFotoPendente,
  revogarObjectUrls,
  salvarFotoOsOffline,
} from '@/services/os/offline-service-order-photos.service'
import { atualizarContagemPendenciasAtivas } from '@/services/persistence-status.events'
import {
  atualizarIncluirFotoPdfOS,
  atualizarIncluirFotoPortalOS,
  emitirFotosOsAtualizadas,
  FOTOS_OS_ATUALIZADAS_EVENT,
  LIMITE_FOTOS_PDF_OS,
  obterBadgeContextoFoto,
  softDeleteFotoOS,
  uploadFotoOS,
  type FotosOsAtualizadasDetail,
  type ServiceOrderPhotoComUrl,
  type TipoFotoOS,
} from '@/services/os/service-order-photos.service'
import type { PapelUsuario } from '@/types/auth'
import type { Cliente, Moto, OrdemServico } from '@/types'

export interface FotosOSSectionProps {
  osId: string | undefined
  officeId: string | undefined
  /** Número da OS — ajuda a resolver o UUID remoto (office + number) */
  osNumero?: number
  podeAdicionar?: boolean
  online?: boolean
  createdBy?: string
  createdByName?: string
  /** Papel do usuário logado — usado na permissão de ocultar / PDF */
  userPapel?: PapelUsuario | string
  /** Admin Craft — pode gerenciar qualquer foto */
  ehAdminSistema?: boolean
  /**
   * Fonte única de fotos (pai). Quando informado, a seção não chama
   * listarFotosOSComUrls nem escuta o evento global.
   */
  fotos?: ServiceOrderPhotoComUrl[]
  onFotosChange?: (fotos: ServiceOrderPhotoComUrl[]) => void
  onRecarregarFotos?: (opcoes?: {
    osId?: string
    osNumero?: number
  }) => Promise<ServiceOrderPhotoComUrl[]>
  carregandoFotos?: boolean
  erroFotos?: string | null
  /**
   * OS nova: prepara rascunho (local/remoto) antes do upload.
   * Retorna a OS com id estável; null se não foi possível.
   */
  onPrepararOsParaFoto?: () => Promise<{ id: string; numero?: number } | null>
  /**
   * Quando informado (OS salva + cliente/moto), mostra “Enviar fotos ao cliente”
   * abrindo o modal já no tipo Fotos.
   */
  envioCliente?: {
    os: OrdemServico
    cliente: Cliente
    moto: Moto
  }
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

/**
 * Dono, admin, gerente — ou autor da própria foto.
 * Mesma regra para ocultar e para marcar/desmarcar include_in_pdf.
 */
function podeGerenciarFoto(
  foto: ServiceOrderPhotoComUrl,
  opts: {
    userId?: string
    userPapel?: string
    ehAdminSistema?: boolean
  }
): boolean {
  if (opts.ehAdminSistema) return true
  const papel = (opts.userPapel || '').toLowerCase()
  if (papel === 'dono' || papel === 'gerente' || papel === 'admin') return true
  if (
    opts.userId &&
    foto.created_by &&
    opts.userId.trim() === foto.created_by.trim()
  ) {
    return true
  }
  return false
}

export function FotosOSSection({
  osId,
  officeId,
  osNumero,
  podeAdicionar = false,
  online: onlineProp,
  createdBy,
  createdByName,
  userPapel,
  ehAdminSistema = false,
  fotos: fotosControladas,
  onFotosChange,
  onRecarregarFotos,
  carregandoFotos,
  erroFotos,
  onPrepararOsParaFoto,
  envioCliente,
}: FotosOSSectionProps) {
  const onlineHook = useOnlineStatus()
  const online = onlineProp ?? onlineHook
  const { toast } = useToast()
  const { confirmar } = useConfirmacao()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galeriaInputRef = useRef<HTMLInputElement>(null)

  const fotosCompartilhadas = fotosControladas !== undefined
  const [carregandoLocal, setCarregandoLocal] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [osIdEfetivo, setOsIdEfetivo] = useState<string | undefined>(osId)
  const [osNumeroEfetivo, setOsNumeroEfetivo] = useState<number | undefined>(osNumero)
  const [ocultandoId, setOcultandoId] = useState<string | null>(null)
  const [atualizandoPdfId, setAtualizandoPdfId] = useState<string | null>(null)
  const [atualizandoPortalId, setAtualizandoPortalId] = useState<string | null>(null)
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [fotosLocal, setFotosLocal] = useState<ServiceOrderPhotoComUrl[]>([])
  const [tipoFoto, setTipoFoto] = useState<TipoFotoOS>('geral')
  const [legenda, setLegenda] = useState('')
  const carregarFotosSeqRef = useRef(0)
  const objectUrlsLocaisRef = useRef<string[]>([])

  const fotos = fotosCompartilhadas ? fotosControladas : fotosLocal
  const carregando = fotosCompartilhadas ? Boolean(carregandoFotos) : carregandoLocal
  const erro = fotosCompartilhadas ? (erroFotos ?? null) : erroLocal
  const idOsAtual = osId ?? osIdEfetivo
  const numeroOsAtual = osNumero ?? osNumeroEfetivo

  useEffect(() => {
    setOsIdEfetivo(osId)
    setOsNumeroEfetivo(osNumero)
  }, [osId, osNumero])

  const setFotos = useCallback(
    (next: ServiceOrderPhotoComUrl[] | ((prev: ServiceOrderPhotoComUrl[]) => ServiceOrderPhotoComUrl[])) => {
      if (fotosCompartilhadas) {
        const valor = typeof next === 'function' ? next(fotosControladas) : next
        onFotosChange?.(valor)
        return
      }
      setFotosLocal(next)
    },
    [fotosCompartilhadas, fotosControladas, onFotosChange]
  )

  // Permite clicar mesmo sem osId se houver preparador de rascunho (online ou offline).
  const podeEnviar = Boolean(
    officeId &&
      podeAdicionar &&
      !enviando &&
      (idOsAtual || onPrepararOsParaFoto)
  )
  const fotosMarcadasPdf = fotos.filter((f) => f.include_in_pdf).length
  const limitePdfAtingido = fotosMarcadasPdf >= LIMITE_FOTOS_PDF_OS

  const carregarFotosLocal = useCallback(async () => {
    const seq = ++carregarFotosSeqRef.current
    const idCarregar = osId ?? osIdEfetivo

    if (!idCarregar || !officeId) {
      if (carregarFotosSeqRef.current !== seq) return
      revogarObjectUrls(objectUrlsLocaisRef.current)
      objectUrlsLocaisRef.current = []
      setFotosLocal([])
      setErroLocal(null)
      setCarregandoLocal(false)
      return
    }

    setCarregandoLocal(true)
    setErroLocal(null)

    const resultado = await carregarFotosOsComPendentesLocais({
      officeId,
      serviceOrderId: idCarregar,
      osNumero: osNumero ?? osNumeroEfetivo,
    })

    if (carregarFotosSeqRef.current !== seq) {
      if (resultado.ok && resultado.dados) {
        revogarObjectUrls(resultado.dados.objectUrls)
      }
      return
    }

    revogarObjectUrls(objectUrlsLocaisRef.current)
    objectUrlsLocaisRef.current = []

    if (!resultado.ok || !resultado.dados) {
      setFotosLocal([])
      setErroLocal(resultado.erro ?? 'Não foi possível carregar as fotos.')
      setCarregandoLocal(false)
      return
    }

    objectUrlsLocaisRef.current = resultado.dados.objectUrls
    setFotosLocal(resultado.dados.fotos)
    setErroLocal(
      resultado.dados.fotos.length === 0 && resultado.dados.erroRemoto
        ? resultado.dados.erroRemoto
        : null
    )
    setCarregandoLocal(false)
  }, [osId, osIdEfetivo, officeId, osNumero, osNumeroEfetivo])

  useEffect(() => {
    return () => {
      revogarObjectUrls(objectUrlsLocaisRef.current)
      objectUrlsLocaisRef.current = []
    }
  }, [])

  const carregarFotos = useCallback(
    async (opcoes?: { osId?: string; osNumero?: number }) => {
      if (onRecarregarFotos) {
        await onRecarregarFotos(opcoes)
        return
      }
      await carregarFotosLocal()
    },
    [onRecarregarFotos, carregarFotosLocal]
  )

  useEffect(() => {
    if (fotosCompartilhadas) return
    void carregarFotosLocal()
  }, [fotosCompartilhadas, carregarFotosLocal])

  useEffect(() => {
    if (fotosCompartilhadas) return
    const osIdAtual = osId?.trim()
    if (!osIdAtual) return

    function onFotosAtualizadas(ev: Event) {
      const detail = (ev as CustomEvent<FotosOsAtualizadasDetail>).detail
      const idEvento = detail?.serviceOrderId?.trim()
      if (!idEvento || idEvento !== osIdAtual) return
      void carregarFotosLocal()
    }

    window.addEventListener(FOTOS_OS_ATUALIZADAS_EVENT, onFotosAtualizadas)
    return () => {
      window.removeEventListener(FOTOS_OS_ATUALIZADAS_EVENT, onFotosAtualizadas)
    }
  }, [fotosCompartilhadas, osId, carregarFotosLocal])

  async function enviarUmaFoto(file: File, idOs: string, numeroOs: number | undefined) {
    const createdByUuid =
      createdBy && isUuidFormato(createdBy) ? createdBy.trim() : undefined

    // Offline (ou navigator offline): salva no aparelho — sem Storage nesta fase.
    if (!online) {
      const local = await salvarFotoOsOffline({
        officeId: officeId!,
        localOsId: idOs,
        osNumero: numeroOs,
        file,
        fileName: file.name,
        contentType: file.type,
        caption: legenda.trim() || undefined,
        photoType: tipoFoto,
        photoContext: 'os',
        createdBy: createdByUuid,
        createdByName: createdByName?.trim() || undefined,
      })
      if (!local.ok) {
        toast.erro(local.erro ?? 'Não foi possível salvar a foto neste aparelho.')
        return false
      }
      return true
    }

    const resultado = await uploadFotoOS({
      officeId: officeId!,
      serviceOrderId: idOs,
      osNumero: numeroOs,
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
      return false
    }
    return true
  }

  async function handleArquivoSelecionado(fileList: FileList | null) {
    const arquivos = fileList ? Array.from(fileList) : []
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (galeriaInputRef.current) galeriaInputRef.current.value = ''

    if (arquivos.length === 0) return
    if (!officeId) {
      toast.erro('Oficina não identificada.')
      return
    }
    if (!podeAdicionar) {
      toast.atencao('Você não tem permissão para adicionar fotos.')
      return
    }

    for (const file of arquivos) {
      const erroValidacao = validarArquivoFoto(file)
      if (erroValidacao) {
        toast.atencao(erroValidacao)
        return
      }
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
        toast.atencao('Salve a OS antes de adicionar fotos.')
        return
      }

      let okCount = 0
      for (const file of arquivos) {
        const ok = await enviarUmaFoto(file, idOs, numeroOs)
        if (!ok) break
        okCount += 1
      }

      if (okCount === 0) return

      setLegenda('')
      setTipoFoto('geral')
      if (!online) {
        toast.sucesso(
          okCount === 1
            ? MSG.fotoSalvaOfflinePendente
            : `${okCount} fotos salvas neste aparelho (envio quando houver internet).`
        )
        atualizarContagemPendenciasAtivas(officeId)
      } else {
        toast.sucesso(okCount === 1 ? 'Foto enviada.' : `${okCount} fotos enviadas.`)
      }
      await carregarFotos({ osId: idOs, osNumero: numeroOs })
      emitirFotosOsAtualizadas(idOs)
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível enviar a foto.')
    } finally {
      setEnviando(false)
    }
  }

  async function handleRemoverPendente(foto: ServiceOrderPhotoComUrl) {
    if (!ehFotoPendenteOffline(foto) || ocultandoId || atualizandoPdfId || atualizandoPortalId)
      return

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
      const resultado = await cancelarFotoOsPendente(
        foto.local_id || foto.id,
        officeId
      )
      if (!resultado.ok) {
        toast.erro(resultado.erro ?? 'Não foi possível remover a foto pendente.')
        return
      }
      toast.sucesso(MSG.fotoPendenteRemovida)
      await carregarFotos()
      const idEmitir = (osId ?? osIdEfetivo)?.trim()
      if (idEmitir) emitirFotosOsAtualizadas(idEmitir)
    } catch (err) {
      toast.erro(
        err instanceof Error ? err.message : 'Não foi possível remover a foto pendente.'
      )
    } finally {
      setOcultandoId(null)
    }
  }

  async function handleIncluirPdfChange(
    foto: ServiceOrderPhotoComUrl,
    includeInPdf: boolean
  ) {
    if (!officeId || !online || atualizandoPdfId || atualizandoPortalId || ocultandoId) return
    if (ehFotoPendenteOffline(foto)) {
      toast.atencao(MSG.fotosPendentesPdfAviso)
      return
    }

    if (foto.deleted_at) {
      toast.atencao('Não é possível marcar foto ocultada para impressão.')
      return
    }

    if (
      !podeGerenciarFoto(foto, {
        userId: createdBy,
        userPapel,
        ehAdminSistema,
      })
    ) {
      toast.atencao('Você não tem permissão para alterar a preferência de impressão.')
      return
    }

    if (Boolean(foto.include_in_pdf) === includeInPdf) return

    if (includeInPdf) {
      const marcadas = fotos.filter((f) => f.include_in_pdf).length
      if (marcadas >= LIMITE_FOTOS_PDF_OS) {
        toast.atencao('O PDF da OS permite até 6 fotos nesta versão.')
        return
      }
    }

    const anterior = Boolean(foto.include_in_pdf)
    setAtualizandoPdfId(foto.id)
    setFotos((prev) =>
      prev.map((f) =>
        f.id === foto.id ? { ...f, include_in_pdf: includeInPdf } : f
      )
    )

    try {
      const resultado = await atualizarIncluirFotoPdfOS({
        officeId,
        photoId: foto.id,
        includeInPdf,
      })

      if (!resultado.ok) {
        setFotos((prev) =>
          prev.map((f) =>
            f.id === foto.id ? { ...f, include_in_pdf: anterior } : f
          )
        )
        toast.erro(resultado.erro ?? 'Não foi possível atualizar a preferência de impressão.')
        return
      }

      toast.sucesso('Preferência de impressão atualizada.')
    } catch (err) {
      setFotos((prev) =>
        prev.map((f) =>
          f.id === foto.id ? { ...f, include_in_pdf: anterior } : f
        )
      )
      toast.erro(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar a preferência de impressão.'
      )
    } finally {
      setAtualizandoPdfId(null)
    }
  }

  async function handleIncluirPortalChange(
    foto: ServiceOrderPhotoComUrl,
    includeInPortal: boolean
  ) {
    if (ehFotoPendenteOffline(foto)) {
      toast.atencao(
        'Envie a foto primeiro. Só depois é possível liberar no portal do cliente.'
      )
      return
    }

    if (!officeId || !online || atualizandoPdfId || atualizandoPortalId || ocultandoId) return

    if (foto.deleted_at) {
      toast.atencao('Não é possível marcar foto ocultada para o portal.')
      return
    }

    if (
      !podeGerenciarFoto(foto, {
        userId: createdBy,
        userPapel,
        ehAdminSistema,
      })
    ) {
      toast.atencao('Você não tem permissão para alterar a visibilidade no portal.')
      return
    }

    if (Boolean(foto.include_in_portal) === includeInPortal) return

    const anterior = Boolean(foto.include_in_portal)
    setAtualizandoPortalId(foto.id)
    setFotos((prev) =>
      prev.map((f) =>
        f.id === foto.id ? { ...f, include_in_portal: includeInPortal } : f
      )
    )

    try {
      const resultado = await atualizarIncluirFotoPortalOS({
        officeId,
        photoId: foto.id,
        includeInPortal,
      })

      if (!resultado.ok) {
        setFotos((prev) =>
          prev.map((f) =>
            f.id === foto.id ? { ...f, include_in_portal: anterior } : f
          )
        )
        toast.erro(resultado.erro ?? 'Não foi possível atualizar a visibilidade no portal.')
        return
      }

      toast.sucesso(
        includeInPortal
          ? 'Foto liberada no portal do cliente.'
          : 'Foto removida do portal do cliente.'
      )
    } catch (err) {
      setFotos((prev) =>
        prev.map((f) =>
          f.id === foto.id ? { ...f, include_in_portal: anterior } : f
        )
      )
      toast.erro(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar a visibilidade no portal.'
      )
    } finally {
      setAtualizandoPortalId(null)
    }
  }

  async function handleOcultarFoto(foto: ServiceOrderPhotoComUrl) {
    if (ehFotoPendenteOffline(foto)) {
      await handleRemoverPendente(foto)
      return
    }

    if (!officeId || !online || ocultandoId || atualizandoPdfId || atualizandoPortalId) return

    if (
      !podeGerenciarFoto(foto, {
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
      mensagem:
        'Ocultar esta foto da OS?\nA foto sairá da galeria, mas ficará registrada no sistema.',
      confirmarTexto: 'Ocultar',
      cancelarTexto: 'Cancelar',
    })
    if (!ok) return

    setOcultandoId(foto.id)
    try {
      const deletedByUuid =
        createdBy && isUuidFormato(createdBy) ? createdBy.trim() : undefined

      const resultado = await softDeleteFotoOS({
        officeId,
        fotoId: foto.id,
        deletedBy: deletedByUuid,
        deletedByName: createdByName?.trim() || undefined,
        deletedReason: 'Ocultada pelo usuário',
      })

      if (!resultado.ok) {
        toast.erro(resultado.erro ?? 'Não foi possível ocultar a foto.')
        return
      }

      toast.sucesso('Foto ocultada da OS.')
      await carregarFotos()
      if (!fotosCompartilhadas && osId) emitirFotosOsAtualizadas(osId)
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível ocultar a foto.')
    } finally {
      setOcultandoId(null)
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
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="min-h-11 w-full gap-2 sm:min-h-9 sm:w-auto"
            disabled={!podeEnviar}
            title={
              !podeAdicionar
                ? 'Sem permissão para adicionar fotos.'
                : !idOsAtual && onPrepararOsParaFoto
                  ? 'Salva um rascunho da OS e abre a câmera'
                  : !idOsAtual
                    ? 'Salve a OS antes de adicionar fotos.'
                    : 'Abrir câmera do celular'
            }
            onClick={() => cameraInputRef.current?.click()}
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {enviando ? (online ? 'Enviando…' : 'Salvando…') : 'Tirar foto'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 w-full gap-2 sm:min-h-9 sm:w-auto"
            disabled={!podeEnviar}
            title="Escolher fotos da galeria"
            onClick={() => galeriaInputRef.current?.click()}
          >
            <ImageIcon className="h-4 w-4" />
            Escolher da galeria
          </Button>
          {envioCliente && idOsAtual ? (
            <BotaoEnviarWhatsAppOs
              os={envioCliente.os}
              cliente={envioCliente.cliente}
              moto={envioCliente.moto}
              tipoInicial="fotos"
              rotulo="Enviar fotos ao cliente"
              className="min-h-11 w-full sm:min-h-9 sm:w-auto"
            />
          ) : null}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={!podeEnviar}
            onChange={(e) => void handleArquivoSelecionado(e.target.files)}
          />
          <input
            ref={galeriaInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            disabled={!podeEnviar}
            onChange={(e) => void handleArquivoSelecionado(e.target.files)}
          />
        </div>
      </div>

      {!idOsAtual && onPrepararOsParaFoto && (
        <p className="text-xs text-muted-foreground">
          Ao adicionar a primeira foto, um rascunho da OS será salvo automaticamente.
        </p>
      )}

      {!idOsAtual && !onPrepararOsParaFoto && (
        <p className="text-xs text-muted-foreground">
          Salve a OS antes de adicionar fotos.
        </p>
      )}

      {idOsAtual && !online && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Sem internet: fotos ficam neste aparelho e serão enviadas depois. {MSG.fotosPendentesPdfAviso}
        </p>
      )}

      {idOsAtual && !podeAdicionar && (
        <p className="text-xs text-muted-foreground">
          Sem permissão para adicionar fotos nesta OS.
        </p>
      )}

      {(idOsAtual || onPrepararOsParaFoto) && officeId && podeAdicionar && (
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

      {idOsAtual && !officeId && (
        <p className="text-xs text-muted-foreground">
          Oficina não identificada. Não foi possível carregar as fotos.
        </p>
      )}

      {idOsAtual && officeId && carregando && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando fotos…
        </div>
      )}

      {idOsAtual && officeId && !carregando && erro && (
        <p className="text-xs text-destructive">{erro}</p>
      )}

      {idOsAtual && officeId && !carregando && !erro && fotos.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma foto adicionada nesta OS.</p>
      )}

      {idOsAtual && officeId && !carregando && fotos.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              Até {LIMITE_FOTOS_PDF_OS} fotos marcadas podem entrar no PDF da OS.
              {' '}
              {MSG.fotosPendentesPdfAviso}
            </p>
            <p
              className={`text-[11px] font-medium ${
                limitePdfAtingido ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'
              }`}
            >
              Fotos marcadas para PDF: {fotosMarcadasPdf}/{LIMITE_FOTOS_PDF_OS}
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fotos.map((foto) => {
              const quando = formatarDataHora(foto.created_at)
              const pendente = ehFotoPendenteOffline(foto)
              const podeGerenciar =
                pendente ||
                (online &&
                  podeGerenciarFoto(foto, {
                    userId: createdBy,
                    userPapel,
                    ehAdminSistema,
                  }))
              const estaOcultando = ocultandoId === foto.id
              const estaAtualizandoPdf = atualizandoPdfId === foto.id
              const estaAtualizandoPortal = atualizandoPortalId === foto.id
              const ocupado = Boolean(ocultandoId || atualizandoPdfId || atualizandoPortalId)
              const marcadaPdf = Boolean(foto.include_in_pdf)
              const marcadaPortal = Boolean(foto.include_in_portal)
              const noLimiteNaoMarcada = !marcadaPdf && limitePdfAtingido
              const badgeContexto = obterBadgeContextoFoto(foto)

              return (
                <li
                  key={foto.id}
                  className="overflow-hidden rounded-lg border border-border bg-background"
                >
                  <div className="relative aspect-[4/3] bg-muted/40">
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
                    {pendente ? (
                      <Badge
                        className={`absolute left-2 top-2 text-[10px] text-white ${
                          obterLabelBadgeFotoPendente(foto) === 'Falha no envio'
                            ? 'bg-destructive hover:bg-destructive'
                            : obterLabelBadgeFotoPendente(foto) === 'Enviando...'
                              ? 'bg-sky-600 hover:bg-sky-600'
                              : 'bg-amber-600 hover:bg-amber-600'
                        }`}
                      >
                        {obterLabelBadgeFotoPendente(foto) ?? 'Pendente de envio'}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="space-y-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap gap-1">
                        <Badge
                          variant={badgeContexto === 'OS' ? 'secondary' : 'outline'}
                          className="max-w-full truncate text-[10px]"
                        >
                          {badgeContexto}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {labelTipoFoto(foto.photo_type)}
                        </Badge>
                        {marcadaPortal ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-600/40 text-[10px] text-emerald-700 dark:text-emerald-400"
                          >
                            Portal do cliente
                          </Badge>
                        ) : null}
                      </div>
                      {podeGerenciar || estaOcultando ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                          disabled={ocupado || (!pendente && !online)}
                          title={
                            pendente
                              ? 'Remover foto pendente deste aparelho'
                              : 'Ocultar foto da galeria (não apaga o arquivo)'
                          }
                          onClick={() => void handleOcultarFoto(foto)}
                        >
                          {estaOcultando ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <EyeOff className="mr-1 h-3 w-3" />
                          )}
                          {estaOcultando
                            ? pendente
                              ? 'Removendo…'
                              : 'Ocultando…'
                            : pendente
                              ? 'Remover'
                              : 'Ocultar'}
                        </Button>
                      ) : null}
                    </div>
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
                    {podeGerenciar && !pendente ? (
                      <label
                        className={`mt-1 flex items-start gap-2 text-[11px] text-muted-foreground ${
                          ocupado || !online
                            ? 'opacity-60'
                            : noLimiteNaoMarcada
                              ? 'cursor-pointer opacity-70'
                              : 'cursor-pointer'
                        }`}
                        title={
                          noLimiteNaoMarcada
                            ? 'Limite de 6 fotos no PDF atingido. Desmarque outra para incluir esta.'
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border"
                          checked={marcadaPdf}
                          disabled={ocupado || !online}
                          onChange={(e) =>
                            void handleIncluirPdfChange(foto, e.target.checked)
                          }
                        />
                        <span className="leading-snug">
                          {estaAtualizandoPdf
                            ? 'Atualizando impressão…'
                            : 'Incluir na impressão/PDF'}
                        </span>
                      </label>
                    ) : null}
                    {podeGerenciar && !pendente ? (
                      <label
                        className={`mt-1 flex items-start gap-2 text-[11px] text-muted-foreground ${
                          ocupado || !online ? 'opacity-60' : 'cursor-pointer'
                        }`}
                        title="Independente do PDF. Só fotos marcadas aparecem no portal público."
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border"
                          checked={marcadaPortal}
                          disabled={ocupado || !online}
                          onChange={(e) =>
                            void handleIncluirPortalChange(foto, e.target.checked)
                          }
                        />
                        <span className="leading-snug">
                          {estaAtualizandoPortal
                            ? 'Atualizando portal…'
                            : 'Visível no portal do cliente'}
                        </span>
                      </label>
                    ) : null}
                    {podeGerenciar && !pendente ? (
                      <p className="mt-0.5 pl-5 text-[10px] leading-snug text-muted-foreground/90">
                        Será exibida no link público enviado ao cliente (/portal). Fotos não
                        marcadas continuam internas — não aparecem na Central do Cliente.
                      </p>
                    ) : null}
                    {pendente ? (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        {MSG.fotosPendentesPdfAviso}
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
