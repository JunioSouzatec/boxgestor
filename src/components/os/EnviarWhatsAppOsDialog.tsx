import { useEffect, useMemo, useState } from 'react'
import { Copy, FileDown, Loader2, MessageCircle, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useOficinaData } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import {
  compartilharArquivoNativo,
  montarMensagemWhatsAppOs,
  suportaCompartilharArquivos,
} from '@/lib/whatsapp-os-mensagem'
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import { gerarOsPdfArquivo } from '@/services/os-pdf.service'
import { abrirWhatsAppWeb, resolverTelefoneWhatsAppCliente } from '@/services/comunicacao/whatsapp.service'
import { garantirChecklistPadrao } from '@/services/checklist-modelo.service'
import { formatarMoeda } from '@/lib/utils'
import type { Cliente, Moto, OrdemServico } from '@/types'
import { normalizarTipoOficina } from '@/types/tipo-oficina'

interface EnviarWhatsAppOsDialogProps {
  aberto: boolean
  onFechar: () => void
  os: OrdemServico
  cliente: Cliente
  moto: Moto
  exibirValores?: boolean
  podeExportarPdf?: boolean
  onOrcamentoEnviado?: () => void | Promise<void>
}

export function EnviarWhatsAppOsDialog({
  aberto,
  onFechar,
  os,
  cliente,
  moto,
  exibirValores = true,
  podeExportarPdf = true,
  onOrcamentoEnviado,
}: EnviarWhatsAppOsDialogProps) {
  const { configuracao, lancamentos, modelosChecklist } = useOficinaData()
  const { registrarContato } = useComunicacao()
  const { toast } = useToast()
  const officeId = configuracao.office_id ?? configuracao.oficina_id
  const tipoOficina = normalizarTipoOficina(configuracao.tipo_oficina)
  const modelosSeguros = useMemo(
    () => garantirChecklistPadrao(modelosChecklist, officeId, tipoOficina),
    [modelosChecklist, officeId, tipoOficina]
  )

  const ehOrcamento = ehDocumentoOrcamento(os)
  const valorFormatado = exibirValores
    ? formatarMoeda(calcularTotalGeralDeCampos(os))
    : undefined

  const mensagemInicial = useMemo(
    () =>
      montarMensagemWhatsAppOs({
        os,
        nomeCliente: cliente.nome,
        nomeOficina: configuracao.nome,
        veiculoLabel: `${moto.marca} ${moto.modelo}`,
        placa: moto.placa,
        valorFormatado,
      }),
    [os, cliente.nome, configuracao.nome, moto, valorFormatado]
  )

  const [mensagem, setMensagem] = useState(mensagemInicial)
  const [baixarPdfAntes, setBaixarPdfAntes] = useState(true)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [compartilhando, setCompartilhando] = useState(false)

  useEffect(() => {
    if (aberto) {
      setMensagem(mensagemInicial)
      setBaixarPdfAntes(true)
    }
  }, [aberto, mensagemInicial])

  const telefoneInfo = useMemo(() => {
    try {
      return resolverTelefoneWhatsAppCliente(cliente.telefone)
    } catch {
      return null
    }
  }, [cliente.telefone])

  const podeCompartilharPdf =
    podeExportarPdf && suportaCompartilharArquivos() && typeof File !== 'undefined'

  const ehMobile = useMemo(
    () => /Android|iPhone|iPad|iPod|Mobile/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    []
  )

  const avisoEnvio = ehMobile
    ? 'Em alguns celulares, o compartilhamento direto pode alterar a visualização do PDF. Se isso acontecer, use Baixar PDF e depois anexe o arquivo no WhatsApp.'
    : 'No computador, o WhatsApp Web não permite anexar PDF automaticamente. O sistema pode baixar o PDF e abrir a conversa com a mensagem pronta. Depois, anexe o PDF manualmente na conversa.'

  async function gerarPdf(): Promise<{ blob: Blob; filename: string } | null> {
    if (!podeExportarPdf) return null
    setGerandoPdf(true)
    try {
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

  function registrarEnvio() {
    registrarContato({
      cliente_id: cliente.id,
      cliente_nome: cliente.nome,
      tipo_mensagem: ehOrcamento ? 'envio_orcamento' : 'envio_os',
      ordem_servico_id: os.id,
      ordem_servico_numero: os.numero,
      mensagemCompleta: mensagem,
    })
    if (ehOrcamento && onOrcamentoEnviado) {
      void onOrcamentoEnviado()
    }
  }

  function validarTelefone(): boolean {
    try {
      resolverTelefoneWhatsAppCliente(cliente.telefone)
      return true
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Telefone inválido.')
      return false
    }
  }

  async function copiarMensagem() {
    try {
      await navigator.clipboard.writeText(mensagem)
      toast.sucesso('Mensagem copiada.')
    } catch {
      toast.erro('Não foi possível copiar a mensagem.')
    }
  }

  async function baixarPdf() {
    const pdf = await gerarPdf()
    if (!pdf) return
    const url = URL.createObjectURL(pdf.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = pdf.filename
    link.click()
    URL.revokeObjectURL(url)
    toast.sucesso('PDF baixado.')
  }

  async function abrirWhatsApp(comPdfBaixado = false) {
    if (!validarTelefone()) return

    if (baixarPdfAntes && podeExportarPdf && !comPdfBaixado) {
      const pdf = await gerarPdf()
      if (pdf) {
        const url = URL.createObjectURL(pdf.blob)
        const link = document.createElement('a')
        link.href = url
        link.download = pdf.filename
        link.click()
        URL.revokeObjectURL(url)
      }
    }

    try {
      abrirWhatsAppWeb(cliente.telefone, mensagem)
      registrarEnvio()
      onFechar()
      if (podeExportarPdf) {
        toast.info(
          'WhatsApp Web não anexa PDF automaticamente. Anexe o arquivo baixado na conversa, ou use Copiar mensagem se o texto não aparecer.'
        )
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Não foi possível abrir o WhatsApp.')
    }
  }

  async function compartilharPdf() {
    if (!validarTelefone()) return
    setCompartilhando(true)
    try {
      const pdf = await gerarPdf()
      if (!pdf) return
      const file = new File([pdf.blob], pdf.filename, { type: 'application/pdf' })
      const titulo = ehOrcamento ? `Orçamento #${os.numero}` : `Ordem de Serviço #${os.numero}`
      const compartilhou = await compartilharArquivoNativo({
        file,
        title: titulo,
        text: mensagem,
      })
      if (compartilhou) {
        registrarEnvio()
        onFechar()
        toast.sucesso('PDF compartilhado. Se a mensagem não aparecer, use Copiar mensagem e cole no WhatsApp.')
        return
      }
      toast.info('Compartilhamento nativo indisponível. Baixe o PDF e use Abrir WhatsApp com mensagem.')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      window.alert(err instanceof Error ? err.message : 'Não foi possível compartilhar o PDF.')
    } finally {
      setCompartilhando(false)
    }
  }

  const ocupado = gerandoPdf || compartilhando

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="flex max-h-[96dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar pelo WhatsApp</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto py-1">
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Cliente: </span>
              <span className="font-medium">{cliente.nome}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Número: </span>
              {telefoneInfo?.exibicao ?? cliente.telefone?.trim() ?? '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Tipo: </span>
              {ehOrcamento ? 'Orçamento' : 'Ordem de Serviço'}
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground">
            {avisoEnvio}
          </div>

          {ehMobile && podeExportarPdf && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs leading-relaxed">
              <p className="font-medium text-emerald-700 dark:text-emerald-400">Caminhos recomendados no celular</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
                <li>Baixar PDF</li>
                <li>Abrir WhatsApp com mensagem</li>
                <li>Anexar o PDF baixado na conversa</li>
              </ol>
              <p className="mt-2 text-muted-foreground">Ou use Copiar mensagem e cole no WhatsApp.</p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="mensagem-wa-os">Mensagem pronta</Label>
            <Textarea
              id="mensagem-wa-os"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={10}
              className="resize-y text-sm"
            />
          </div>

          {podeExportarPdf && (
            <div className="flex items-start gap-2">
              <input
                id="baixar-pdf-wa-os"
                type="checkbox"
                checked={baixarPdfAntes}
                onChange={(e) => setBaixarPdfAntes(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor="baixar-pdf-wa-os" className="cursor-pointer font-normal leading-snug">
                Baixar PDF antes de abrir WhatsApp
              </Label>
            </div>
          )}

          {!telefoneInfo && (
            <p className="text-sm text-destructive">Cliente sem WhatsApp cadastrado ou número inválido.</p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex w-full flex-col gap-2">
            {podeExportarPdf && (
              <Button
                variant={ehMobile ? 'default' : 'secondary'}
                onClick={() => void baixarPdf()}
                disabled={ocupado}
                className="gap-2 w-full"
              >
                {gerandoPdf && !compartilhando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Baixar PDF
              </Button>
            )}
            <Button
              className="gap-2 w-full bg-emerald-600 hover:bg-emerald-500"
              onClick={() => void abrirWhatsApp()}
              disabled={ocupado || !telefoneInfo}
            >
              <MessageCircle className="h-4 w-4" />
              Abrir WhatsApp com mensagem
            </Button>
            <Button
              variant={ehMobile ? 'default' : 'outline'}
              onClick={() => void copiarMensagem()}
              disabled={ocupado}
              className="gap-2 w-full"
            >
              <Copy className="h-4 w-4" />
              Copiar mensagem
            </Button>
            {podeCompartilharPdf && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void compartilharPdf()}
                disabled={ocupado || !telefoneInfo}
                className="gap-2 w-full text-muted-foreground"
              >
                {compartilhando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
                Compartilhar PDF pelo celular, se compatível
              </Button>
            )}
            <Button variant="outline" onClick={onFechar} disabled={ocupado} className="w-full">
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
