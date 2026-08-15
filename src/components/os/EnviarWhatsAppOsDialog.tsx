import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  FileDown,
  Link2,
  Loader2,
  MessageCircle,
  Share2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/context/AuthContext'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useOficinaData } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { obterTermosOficina } from '@/lib/termos-oficina'
import { formatarMoeda } from '@/lib/utils'
import {
  compartilharArquivosNativos,
  montarDetalheHistoricoEnvioCliente,
  montarMensagemEnvioCliente,
  suportaCompartilharArquivos,
  tipoEnvioPadraoParaOs,
  type TipoEnvioCliente,
} from '@/lib/whatsapp-os-mensagem'
import { obterStatusOrcamentoEfetivo, orcamentoEstaConvertido } from '@/lib/orcamento-fluxo'
import { clienteJaRespondeuAprovacao } from '@/services/orcamento/aprovacao-cliente.service'
import { aprovacaoLinkPublicoBackendAtivo } from '@/services/orcamento/aprovacao-link-publico.flags'
import { criarApprovalLinkPublico } from '@/services/orcamento/aprovacao-link-publico.service'
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import { listarPagamentosOS } from '@/services/os-pagamento.service'
import { gerarOsPdfArquivo } from '@/services/os-pdf.service'
import { gerarReciboPdfArquivo } from '@/services/recibo-pdf.service'
import { garantirChecklistPadrao } from '@/services/checklist-modelo.service'
import { carregarFotosOsComPendentesLocais } from '@/services/os/offline-service-order-photos.service'
import type { ServiceOrderPhotoComUrl } from '@/services/os/service-order-photos.service'
import {
  abrirWhatsAppWeb,
  resolverTelefoneWhatsAppCliente,
} from '@/services/comunicacao/whatsapp.service'
import { getLabelStatusOS } from '@/types/labels'
import { normalizarTipoOficina } from '@/types/tipo-oficina'
import type { Cliente, Moto, OrdemServico } from '@/types'

export interface DetalheMarcarEnvioCliente {
  tipo: TipoEnvioCliente
  detalheHistorico: string
  mensagem: string
  incluiuLink: boolean
  pdfDisponibilizado: boolean
  fotosSelecionadas: number
  compartilhouNativo: boolean
}

interface EnviarWhatsAppOsDialogProps {
  aberto: boolean
  onFechar: () => void
  os: OrdemServico
  cliente: Cliente
  moto: Moto
  exibirValores?: boolean
  podeExportarPdf?: boolean
  onMarcarComoEnviado?: (detalhe: DetalheMarcarEnvioCliente) => void | Promise<void>
  /** @deprecated Preferir onMarcarComoEnviado */
  onOrcamentoEnviado?: () => void | Promise<void>
}

const OPCOES_TIPO: { value: TipoEnvioCliente; label: string }[] = [
  { value: 'orcamento', label: 'Orçamento' },
  { value: 'os', label: 'OS' },
  { value: 'veiculo_pronto', label: 'Veículo pronto' },
  { value: 'fotos', label: 'Fotos' },
  { value: 'recibo', label: 'Recibo' },
]

function baixarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function EnviarWhatsAppOsDialog({
  aberto,
  onFechar,
  os,
  cliente,
  moto,
  exibirValores = true,
  podeExportarPdf = true,
  onMarcarComoEnviado,
  onOrcamentoEnviado,
}: EnviarWhatsAppOsDialogProps) {
  const { session } = useAuth()
  const { configuracao, lancamentos, modelosChecklist } = useOficinaData()
  const { registrarContato } = useComunicacao()
  const { toast } = useToast()
  const officeId = configuracao.office_id ?? configuracao.oficina_id
  const tipoOficina = normalizarTipoOficina(configuracao.tipo_oficina)
  const termos = obterTermosOficina(tipoOficina)

  const modelosSeguros = useMemo(
    () => garantirChecklistPadrao(modelosChecklist, officeId, tipoOficina),
    [modelosChecklist, officeId, tipoOficina]
  )

  const ehOrcamento = ehDocumentoOrcamento(os)
  const convertido = orcamentoEstaConvertido(os)
  const jaRespondeu = clienteJaRespondeuAprovacao(os)
  const statusOrc = obterStatusOrcamentoEfetivo(os)
  const linkBackendAtivo = aprovacaoLinkPublicoBackendAtivo()

  const valorFormatado = exibirValores
    ? formatarMoeda(calcularTotalGeralDeCampos(os))
    : undefined

  const veiculoLabel = `${moto.marca} ${moto.modelo}`.trim()
  const pagamentosPagos = useMemo(
    () => listarPagamentosOS(os, lancamentos).filter((p) => p.pago),
    [os, lancamentos]
  )
  const temRecibo = pagamentosPagos.length > 0

  const [tipoEnvio, setTipoEnvio] = useState<TipoEnvioCliente>(() => tipoEnvioPadraoParaOs(os))
  const [observacao, setObservacao] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [mensagemEditada, setMensagemEditada] = useState(false)
  /** URL do link seguro só em memória — nunca em craft_meta. */
  const [linkUrlMemoria, setLinkUrlMemoria] = useState<string | null>(null)
  const [gerandoLink, setGerandoLink] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [compartilhando, setCompartilhando] = useState(false)
  const [marcandoEnviado, setMarcandoEnviado] = useState(false)
  const [marcadoNestaSessao, setMarcadoNestaSessao] = useState(false)
  const [mostrarExtras, setMostrarExtras] = useState(false)
  const [fotos, setFotos] = useState<ServiceOrderPhotoComUrl[]>([])
  const [fotosSelecionadas, setFotosSelecionadas] = useState<Set<string>>(new Set())
  const [carregandoFotos, setCarregandoFotos] = useState(false)
  const [pdfDisponibilizado, setPdfDisponibilizado] = useState(false)
  const [compartilhouNativo, setCompartilhouNativo] = useState(false)
  const marcandoRef = useRef(false)

  const ehMobile = useMemo(
    () =>
      /Android|iPhone|iPad|iPod|Mobile/i.test(
        typeof navigator !== 'undefined' ? navigator.userAgent : ''
      ),
    []
  )

  const telefoneInfo = useMemo(() => {
    try {
      return resolverTelefoneWhatsAppCliente(cliente.telefone)
    } catch {
      return null
    }
  }, [cliente.telefone])

  const podeUsarLink =
    ehOrcamento && !convertido && !jaRespondeu && statusOrc !== 'convertido'

  const podePdfTipo =
    podeExportarPdf &&
    (tipoEnvio === 'orcamento' ||
      tipoEnvio === 'os' ||
      tipoEnvio === 'recibo' ||
      tipoEnvio === 'link_aprovacao')

  const opcoesTipoVisiveis = useMemo(() => {
    return OPCOES_TIPO.filter((op) => {
      if (op.value === 'orcamento') return ehOrcamento
      if (op.value === 'os') return !ehOrcamento
      if (op.value === 'recibo') return temRecibo && !ehOrcamento
      return true
    }).map((op) =>
      op.value === 'veiculo_pronto' ? { ...op, label: `${termos.veiculo} pronto` } : op
    )
  }, [ehOrcamento, temRecibo, termos.veiculo])

  const montarMensagemAtual = useCallback(
    (opts?: { link?: string | null; obs?: string; tipo?: TipoEnvioCliente }) => {
      const tipo = opts?.tipo ?? tipoEnvio
      const link =
        opts?.link !== undefined
          ? opts.link
          : podeUsarLink
            ? linkUrlMemoria
            : null
      return montarMensagemEnvioCliente({
        tipo,
        nomeCliente: cliente.nome,
        veiculoLabel,
        placa: moto.placa,
        tipoOficina,
        linkAprovacao: link,
        observacao: opts?.obs ?? observacao,
        nomeOficina: configuracao.nome,
        numero: os.numero,
        valorFormatado:
          tipo === 'orcamento' || tipo === 'os' || tipo === 'link_aprovacao'
            ? valorFormatado
            : undefined,
        statusLabel: tipo === 'os' ? getLabelStatusOS(os.status) : undefined,
      })
    },
    [
      tipoEnvio,
      podeUsarLink,
      linkUrlMemoria,
      cliente.nome,
      veiculoLabel,
      moto.placa,
      tipoOficina,
      observacao,
      configuracao.nome,
      os.numero,
      os.status,
      valorFormatado,
    ]
  )

  useEffect(() => {
    if (!aberto) return
    const padrao = tipoEnvioPadraoParaOs(os)
    setTipoEnvio(padrao)
    setObservacao('')
    setMensagemEditada(false)
    setLinkUrlMemoria(null)
    setMarcadoNestaSessao(false)
    setMostrarExtras(padrao === 'fotos')
    setFotosSelecionadas(new Set())
    setPdfDisponibilizado(false)
    setCompartilhouNativo(false)
    setMensagem(
      montarMensagemEnvioCliente({
        tipo: padrao,
        nomeCliente: cliente.nome,
        veiculoLabel,
        placa: moto.placa,
        tipoOficina,
        nomeOficina: configuracao.nome,
        numero: os.numero,
        valorFormatado,
        statusLabel: padrao === 'os' ? getLabelStatusOS(os.status) : undefined,
      })
    )
  }, [aberto, os.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aberto || mensagemEditada) return
    setMensagem(montarMensagemAtual())
  }, [aberto, mensagemEditada, tipoEnvio, linkUrlMemoria, observacao, montarMensagemAtual])

  useEffect(() => {
    if (!aberto || !mostrarExtras) return
    let cancelado = false
    setCarregandoFotos(true)
    void carregarFotosOsComPendentesLocais({
      officeId,
      serviceOrderId: os.id,
      osNumero: os.numero,
    })
      .then((resultado) => {
        if (cancelado) return
        const lista = resultado.ok && resultado.dados ? resultado.dados.fotos : []
        setFotos(lista)
        setFotosSelecionadas(new Set(lista.map((f) => f.id)))
      })
      .finally(() => {
        if (!cancelado) setCarregandoFotos(false)
      })
    return () => {
      cancelado = true
    }
  }, [aberto, mostrarExtras, officeId, os.id, os.numero])

  async function gerarLinkSeguro() {
    if (!podeUsarLink || !linkBackendAtivo || convertido) return
    setGerandoLink(true)
    try {
      const r = await criarApprovalLinkPublico({
        serviceOrderId: os.id,
        serviceOrderNumber: os.numero,
        validityDays: 7,
      })
      if (!r.ok || !r.url) {
        window.alert(r.erro || 'Não foi possível gerar o link seguro.')
        return
      }
      setLinkUrlMemoria(r.url)
      setMensagemEditada(false)
      toast.sucesso('Link gerado e incluído na mensagem (só nesta tela).')
    } finally {
      setGerandoLink(false)
    }
  }

  async function gerarPdfAtual(): Promise<{ blob: Blob; filename: string } | null> {
    if (!podePdfTipo) return null
    setGerandoPdf(true)
    try {
      if (tipoEnvio === 'recibo') {
        const pagamento = pagamentosPagos[pagamentosPagos.length - 1]
        if (!pagamento) {
          toast.erro('Não há recibo disponível para esta OS.')
          return null
        }
        return await gerarReciboPdfArquivo(
          os,
          pagamento,
          cliente,
          moto,
          configuracao,
          lancamentos
        )
      }
      return await gerarOsPdfArquivo(
        os,
        cliente,
        moto,
        configuracao,
        lancamentos,
        modelosSeguros,
        officeId
      )
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : 'Não foi possível gerar o PDF.')
      return null
    } finally {
      setGerandoPdf(false)
    }
  }

  async function baixarPdf() {
    const pdf = await gerarPdfAtual()
    if (!pdf) return
    baixarBlob(pdf.blob, pdf.filename)
    setPdfDisponibilizado(true)
    toast.sucesso('PDF baixado. Anexe manualmente no WhatsApp se quiser.')
  }

  async function baixarFotosSelecionadas() {
    const selecionadas = fotos.filter((f) => fotosSelecionadas.has(f.id) && f.signed_url)
    if (selecionadas.length === 0) {
      toast.info('Nenhuma foto selecionada com arquivo disponível.')
      return
    }
    for (const foto of selecionadas) {
      try {
        const resp = await fetch(foto.signed_url!)
        const blob = await resp.blob()
        const ext = blob.type.includes('png') ? 'png' : 'jpg'
        baixarBlob(blob, `os-${os.numero}-foto-${foto.id.slice(0, 8)}.${ext}`)
      } catch {
        // continua
      }
    }
    toast.sucesso('Fotos baixadas. Anexe manualmente no WhatsApp.')
  }

  async function copiarMensagem() {
    try {
      await navigator.clipboard.writeText(mensagem)
      toast.sucesso('Mensagem copiada.')
    } catch {
      toast.erro('Não foi possível copiar a mensagem.')
    }
  }

  /** Só abre WhatsApp — síncrono, sem baixar PDF/fotos. */
  function abrirWhatsApp() {
    try {
      abrirWhatsAppWeb(telefoneInfo ? cliente.telefone : null, mensagem)
      toast.info(
        telefoneInfo
          ? 'WhatsApp aberto com a mensagem pronta. PDF/fotos não são anexados automaticamente.'
          : 'WhatsApp aberto com a mensagem. Escolha o contato — o cliente não tem telefone válido no cadastro.'
      )
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Não foi possível abrir o WhatsApp.')
    }
  }

  async function compartilharFotosNativo() {
    const selecionadas = fotos.filter((f) => fotosSelecionadas.has(f.id) && f.signed_url)
    if (selecionadas.length === 0) {
      toast.info('Selecione ao menos uma foto para compartilhar.')
      return
    }
    if (!suportaCompartilharArquivos()) {
      toast.info(
        'Este aparelho/navegador não permitiu compartilhar fotos. Baixe as fotos e anexe manualmente.'
      )
      return
    }

    setCompartilhando(true)
    try {
      const files: File[] = []
      for (const foto of selecionadas) {
        try {
          const resp = await fetch(foto.signed_url!)
          const blob = await resp.blob()
          const mime = blob.type || 'image/jpeg'
          const ext = mime.includes('png') ? 'png' : 'jpg'
          files.push(
            new File([blob], `os-${os.numero}-foto-${foto.id.slice(0, 8)}.${ext}`, {
              type: mime,
            })
          )
        } catch {
          // ignora
        }
      }
      if (files.length === 0) {
        toast.info('Não foi possível carregar as fotos. Baixe e anexe manualmente.')
        return
      }
      const compartilhou = await compartilharArquivosNativos({
        files,
        title: `Fotos OS #${os.numero}`,
        text: mensagem,
      })
      if (compartilhou) {
        setCompartilhouNativo(true)
        toast.sucesso(
          'Menu nativo aberto. Escolha o WhatsApp. Isso não marca como enviado.'
        )
        return
      }
      toast.info(
        'Este aparelho/navegador não permitiu compartilhar fotos. Baixe as fotos e anexe manualmente.'
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.info(
        'Este aparelho/navegador não permitiu compartilhar fotos. Baixe as fotos e anexe manualmente.'
      )
    } finally {
      setCompartilhando(false)
    }
  }

  async function marcarComoEnviado() {
    if (marcadoNestaSessao || marcandoRef.current) {
      toast.info('Este envio já foi marcado nesta sessão.')
      return
    }
    marcandoRef.current = true
    setMarcandoEnviado(true)
    try {
      const qtdFotos = mostrarExtras ? fotosSelecionadas.size : 0
      const detalheHistorico = montarDetalheHistoricoEnvioCliente({
        tipo: tipoEnvio,
        canal: 'WhatsApp manual',
        incluiuLink: Boolean(linkUrlMemoria && podeUsarLink),
        pdfDisponibilizado,
        fotosSelecionadas: qtdFotos,
        compartilhouNativo,
        observacao,
        mensagemPreview: mensagem,
      })

      registrarContato({
        cliente_id: cliente.id,
        cliente_nome: cliente.nome,
        tipo_mensagem:
          tipoEnvio === 'orcamento' || tipoEnvio === 'link_aprovacao'
            ? 'envio_orcamento'
            : 'envio_os',
        ordem_servico_id: os.id,
        ordem_servico_numero: os.numero,
        mensagemCompleta: mensagem.replace(/https?:\/\/\S+/gi, '[link]'),
        responsavel_nome: session?.user?.nome,
      })

      await onMarcarComoEnviado?.({
        tipo: tipoEnvio,
        detalheHistorico,
        mensagem,
        incluiuLink: Boolean(linkUrlMemoria && podeUsarLink),
        pdfDisponibilizado,
        fotosSelecionadas: qtdFotos,
        compartilhouNativo,
      })

      if (ehOrcamento && onOrcamentoEnviado) {
        await onOrcamentoEnviado()
      }

      setMarcadoNestaSessao(true)
      toast.sucesso('Marcado como enviado e registrado no histórico.')
    } finally {
      marcandoRef.current = false
      setMarcandoEnviado(false)
    }
  }

  function alternarFoto(id: string) {
    setFotosSelecionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const ocupado = gerandoPdf || compartilhando || gerandoLink || marcandoEnviado
  const podeCompartilharFotos =
    ehMobile && mostrarExtras && fotosSelecionadas.size > 0

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="flex max-h-[96dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar ao cliente</DialogTitle>
          <DialogDescription className="text-left text-xs sm:text-sm">
            Envie a mensagem pronta pelo WhatsApp. PDF e fotos podem ser baixados e anexados
            manualmente.
            {ehOrcamento ? (
              <>
                {' '}
                <span className="font-medium text-emerald-300">
                  Use o link de aprovação para o cliente conferir e aprovar sem precisar anexar PDF.
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto overflow-x-hidden py-1">
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Cliente: </span>
              <span className="font-medium">{cliente.nome}</span>
            </p>
            <p>
              <span className="text-muted-foreground">WhatsApp: </span>
              {telefoneInfo?.exibicao ?? (
                <span className="text-amber-300">sem número — você escolhe o contato</span>
              )}
            </p>
            <p>
              <span className="text-muted-foreground">{termos.veiculo}: </span>
              {veiculoLabel} — {moto.placa}
            </p>
          </div>

          <div className="rounded-lg border border-sky-500/35 bg-sky-950/30 p-3 text-xs leading-relaxed text-sky-50">
            Sem API de WhatsApp, o envio de PDF e fotos é manual. A mensagem e o link abrem prontos.
          </div>

          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">Tipo (opcional)</Label>
            <div className="flex flex-wrap gap-1.5">
              {opcoesTipoVisiveis.map((op) => (
                <button
                  key={op.value}
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    setTipoEnvio(op.value)
                    setMensagemEditada(false)
                    if (op.value === 'fotos') setMostrarExtras(true)
                  }}
                  className={`min-h-9 rounded-md border px-2.5 py-1.5 text-xs ${
                    tipoEnvio === op.value
                      ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-100'
                      : 'border-border bg-background'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          {ehOrcamento && !convertido && (
            <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-950/20 p-3">
              {jaRespondeu ? (
                <p className="text-xs text-muted-foreground">
                  Cliente já respondeu — não gerar novo link automaticamente.
                </p>
              ) : linkBackendAtivo ? (
                <>
                  <p className="text-xs text-emerald-100">
                    {linkUrlMemoria
                      ? 'Link de aprovação incluído na mensagem.'
                      : 'Gere o link para o cliente aprovar pelo celular — sem anexar PDF.'}
                  </p>
                  <Button
                    type="button"
                    variant={linkUrlMemoria ? 'outline' : 'default'}
                    size="sm"
                    className="w-full gap-2"
                    disabled={ocupado || !podeUsarLink}
                    onClick={() => void gerarLinkSeguro()}
                  >
                    {gerandoLink ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    {linkUrlMemoria ? 'Gerar novo link de aprovação' : 'Gerar link de aprovação'}
                  </Button>
                </>
              ) : (
                <p className="text-xs text-amber-200">Link público temporariamente indisponível.</p>
              )}
            </div>
          )}

          {convertido && ehOrcamento && (
            <p className="text-xs text-violet-200">
              Este orçamento já foi convertido em OS. Não é possível gerar novo link aqui.
            </p>
          )}

          <div className="grid gap-2">
            <Label htmlFor="mensagem-envio-cliente">Mensagem pronta</Label>
            <Textarea
              id="mensagem-envio-cliente"
              value={mensagem}
              onChange={(e) => {
                setMensagem(e.target.value)
                setMensagemEditada(true)
              }}
              rows={7}
              className="resize-y text-sm"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="obs-envio-cliente">Observação (opcional)</Label>
            <Textarea
              id="obs-envio-cliente"
              value={observacao}
              onChange={(e) => {
                setObservacao(e.target.value)
                setMensagemEditada(false)
              }}
              rows={2}
              className="resize-y text-sm"
              placeholder="Texto extra no final da mensagem…"
            />
          </div>

          <button
            type="button"
            className="text-left text-xs text-muted-foreground underline underline-offset-2"
            onClick={() => setMostrarExtras((v) => !v)}
          >
            {mostrarExtras ? 'Ocultar PDF e fotos' : 'PDF e fotos (opcional)'}
          </button>

          {mostrarExtras && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <p className="text-[11px] text-muted-foreground">
                Se quiser, baixe o PDF e anexe manualmente. No computador, anexe as fotos
                manualmente se desejar.
              </p>
              {podePdfTipo && (
                <Button
                  variant="secondary"
                  onClick={() => void baixarPdf()}
                  disabled={ocupado}
                  className="w-full gap-2"
                >
                  {gerandoPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  Baixar PDF
                </Button>
              )}

              {carregandoFotos ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando fotos…
                </p>
              ) : fotos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma foto nesta OS.</p>
              ) : (
                <ul className="grid max-h-48 gap-2 overflow-y-auto">
                  {fotos.map((foto) => (
                    <li key={foto.id} className="flex min-w-0 items-center gap-2">
                      <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-primary"
                          checked={fotosSelecionadas.has(foto.id)}
                          onChange={() => alternarFoto(foto.id)}
                        />
                        {foto.signed_url ? (
                          <img
                            src={foto.signed_url}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted text-[10px]">
                            —
                          </span>
                        )}
                        <span className="min-w-0 truncate text-xs">
                          {foto.caption?.trim() || foto.photo_type || foto.id.slice(0, 8)}
                        </span>
                      </label>
                      {foto.signed_url ? (
                        <a
                          href={foto.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-xs text-emerald-400 underline underline-offset-2"
                        >
                          Abrir
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {fotosSelecionadas.size > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => void baixarFotosSelecionadas()}
                  disabled={ocupado}
                  className="w-full gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Baixar fotos
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Button
            type="button"
            className="min-h-12 w-full gap-2 bg-emerald-600 text-base hover:bg-emerald-500"
            onClick={abrirWhatsApp}
            disabled={ocupado || !mensagem.trim()}
          >
            <MessageCircle className="h-5 w-5" />
            Abrir WhatsApp com mensagem pronta
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => void copiarMensagem()}
            disabled={ocupado || !mensagem.trim()}
            className="min-h-11 w-full gap-2"
          >
            <Copy className="h-4 w-4" />
            Copiar mensagem
          </Button>

          {podeCompartilharFotos && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void compartilharFotosNativo()}
              disabled={ocupado}
              className="min-h-11 w-full gap-2"
            >
              {compartilhando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              Compartilhar fotos no celular
            </Button>
          )}

          {!mostrarExtras && podePdfTipo && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void baixarPdf()}
              disabled={ocupado}
              className="w-full gap-2 text-muted-foreground"
            >
              {gerandoPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              Baixar PDF (opcional)
            </Button>
          )}

          <Button
            type="button"
            variant="default"
            onClick={() => void marcarComoEnviado()}
            disabled={ocupado || marcadoNestaSessao}
            className="min-h-11 w-full gap-2"
          >
            {marcandoEnviado ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {marcadoNestaSessao ? 'Já marcado como enviado' : 'Marcar como enviado'}
          </Button>

          <Button type="button" variant="outline" onClick={onFechar} disabled={ocupado} className="w-full">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
