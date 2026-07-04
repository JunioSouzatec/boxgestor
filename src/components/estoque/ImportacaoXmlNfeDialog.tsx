import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileUp, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { resolverOfficeIdHistoricoXml } from '@/services/importacao-xml-nfe-historico.storage'
import {
  executarImportacaoXmlNfe,
  montarPreviewImportacaoXmlNfe,
  MSG_IMPORTACAO_SUCESSO,
  MSG_NOTA_JA_IMPORTADA,
  MSG_XML_INVALIDO,
  type AcaoImportacaoXmlNfe,
  type PreviewImportacaoXmlNfe,
} from '@/services/importacao-xml-nfe.service'
import type { Fornecedor, FornecedorInput, Peca, PecaInput } from '@/types'

interface ImportacaoXmlNfeDialogProps {
  aberto: boolean
  onFechar: () => void
  officeId: string | null | undefined
  pecas: Peca[]
  fornecedores: Fornecedor[]
  adicionarPeca: (p: PecaInput) => Peca
  atualizarPeca: (id: string, p: Partial<PecaInput>) => void
  adicionarFornecedor: (f: FornecedorInput) => Fornecedor
  onSucesso: (mensagem: string) => void
  onErro: (mensagem: string) => void
}

const ROTULO_ACAO: Record<AcaoImportacaoXmlNfe, string> = {
  criar: 'Criar novo item',
  atualizar: 'Atualizar item existente',
  ignorar: 'Ignorar',
}

function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function ImportacaoXmlNfeDialog({
  aberto,
  onFechar,
  officeId,
  pecas,
  fornecedores,
  adicionarPeca,
  atualizarPeca,
  adicionarFornecedor,
  onSucesso,
  onErro,
}: ImportacaoXmlNfeDialogProps) {
  const officeIdResolvido = useMemo(() => resolverOfficeIdHistoricoXml(officeId), [officeId])
  const inputRef = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [preview, setPreview] = useState<PreviewImportacaoXmlNfe | null>(null)
  const [criarFornecedor, setCriarFornecedor] = useState(false)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [aguardandoConfirmacaoDuplicata, setAguardandoConfirmacaoDuplicata] = useState(false)

  function fechar() {
    setPreview(null)
    setNomeArquivo(null)
    setErroLeitura(null)
    setCriarFornecedor(false)
    setAguardandoConfirmacaoDuplicata(false)
    if (inputRef.current) inputRef.current.value = ''
    onFechar()
  }

  async function lerArquivo(arquivo: File | null) {
    if (!arquivo) return
    setLendo(true)
    setErroLeitura(null)
    setPreview(null)
    setAguardandoConfirmacaoDuplicata(false)
    setNomeArquivo(arquivo.name)
    if (inputRef.current) inputRef.current.value = ''
    try {
      const texto = await arquivo.text()
      const montado = montarPreviewImportacaoXmlNfe(
        texto,
        pecas,
        fornecedores,
        officeIdResolvido
      )
      setPreview(montado)
      setCriarFornecedor(
        montado.fornecedor.sugerirCriar && !montado.fornecedor.fornecedorExistente
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : MSG_XML_INVALIDO
      setErroLeitura(msg)
    } finally {
      setLendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function alterarAcao(indice: number, acao: AcaoImportacaoXmlNfe) {
    if (!preview) return
    setPreview({
      ...preview,
      itens: preview.itens.map((item, i) => (i === indice ? { ...item, acao } : item)),
    })
  }

  function executarImportacao(confirmouDuplicata = false) {
    if (!preview) return

    if (preview.duplicidade.jaImportada && !confirmouDuplicata) {
      setAguardandoConfirmacaoDuplicata(true)
      return
    }

    setImportando(true)
    try {
      executarImportacaoXmlNfe(
        preview,
        pecas,
        {
          criarFornecedor,
          fornecedorId: preview.fornecedor.fornecedorId,
          officeId: officeIdResolvido,
          confirmouDuplicata,
        },
        adicionarPeca,
        atualizarPeca,
        adicionarFornecedor
      )
      onSucesso(MSG_IMPORTACAO_SUCESSO)
      fechar()
    } catch (err) {
      if (err instanceof Error && err.message === 'CONFIRMACAO_DUPLICATA_OBRIGATORIA') {
        setAguardandoConfirmacaoDuplicata(true)
        return
      }
      onErro(MSG_XML_INVALIDO)
    } finally {
      setImportando(false)
    }
  }

  function solicitarConfirmacao() {
    executarImportacao(false)
  }

  function cancelarConfirmacaoDuplicata() {
    setAguardandoConfirmacaoDuplicata(false)
  }

  const itensParaImportar = preview?.itens.filter((i) => i.acao !== 'ignorar').length ?? 0
  const registroAnterior = preview?.duplicidade.registroAnterior
  const notaJaImportada = preview?.duplicidade.jaImportada ?? false

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && fechar()}>
      <DialogContent className="flex max-h-[90dvh] w-[min(95vw,1100px)] max-w-none flex-col gap-0 overflow-hidden p-0 max-lg:inset-x-2 max-lg:w-[calc(100vw-1rem)] max-lg:max-h-[95dvh] lg:max-w-none">
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-border px-4 py-4 pr-12 sm:px-6">
          <DialogTitle>Importar XML de Nota Fiscal</DialogTitle>
          <DialogDescription>
            Selecione o XML da NF-e. O arquivo é lido apenas neste dispositivo — nada é enviado ao
            servidor. Revise os itens antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={lendo || importando}
              >
                {lendo ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Selecionar XML
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xml,text/xml,application/xml"
                className="hidden"
                onChange={(e) => void lerArquivo(e.target.files?.[0] ?? null)}
              />
              {nomeArquivo && (
                <span className="min-w-0 max-w-full truncate text-sm text-muted-foreground sm:max-w-md">
                  {nomeArquivo}
                </span>
              )}
            </div>

            {erroLeitura && (
              <p className="text-sm text-destructive" role="alert">
                {erroLeitura}
              </p>
            )}

            {!preview && !erroLeitura && !lendo && (
              <p className="text-sm text-muted-foreground">
                Envie um arquivo XML de NF-e para visualizar os produtos antes de importar.
              </p>
            )}

            {preview && (
              <>
                {notaJaImportada && (
                  <div
                    className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm"
                    role="alert"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="min-w-0 flex-1 space-y-3">
                        <p className="font-medium leading-snug text-amber-900 dark:text-amber-100">
                          {MSG_NOTA_JA_IMPORTADA}
                        </p>
                        <div className="grid gap-2 text-amber-900/90 dark:text-amber-100/90 sm:grid-cols-2">
                          <p className="min-w-0 break-words">
                            <span className="text-amber-800/70 dark:text-amber-200/70">Nota: </span>
                            {preview.nota.numero ?? registroAnterior?.numero ?? '—'}
                            {preview.nota.serie || registroAnterior?.serie
                              ? ` / Série ${preview.nota.serie ?? registroAnterior?.serie}`
                              : ''}
                          </p>
                          <p className="min-w-0 break-words">
                            <span className="text-amber-800/70 dark:text-amber-200/70">
                              Fornecedor:{' '}
                            </span>
                            {preview.fornecedor.nome ?? registroAnterior?.nomeFornecedor ?? '—'}
                          </p>
                          {registroAnterior && (
                            <>
                              <p>
                                <span className="text-amber-800/70 dark:text-amber-200/70">
                                  Importação anterior:{' '}
                                </span>
                                {formatarDataHora(registroAnterior.importadoEm)}
                              </p>
                              <p>
                                <span className="text-amber-800/70 dark:text-amber-200/70">
                                  Vezes importada:{' '}
                                </span>
                                {registroAnterior.vezesImportada}
                              </p>
                            </>
                          )}
                          <p>
                            <span className="text-amber-800/70 dark:text-amber-200/70">
                              Valor total:{' '}
                            </span>
                            {preview.nota.valorTotal != null
                              ? formatarMoeda(preview.nota.valorTotal)
                              : registroAnterior?.valorTotal != null
                                ? formatarMoeda(registroAnterior.valorTotal)
                                : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <p className="min-w-0 break-words">
                    <span className="text-muted-foreground">Nota: </span>
                    {preview.nota.numero ?? '—'}
                    {preview.nota.serie ? ` / Série ${preview.nota.serie}` : ''}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Emissão: </span>
                    {preview.nota.dataEmissao ? formatarData(preview.nota.dataEmissao) : '—'}
                  </p>
                  <p className="min-w-0 break-words sm:col-span-2 lg:col-span-1">
                    <span className="text-muted-foreground">Fornecedor: </span>
                    {preview.fornecedor.nome ?? '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">CNPJ: </span>
                    {preview.fornecedor.cnpj ?? '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Valor total: </span>
                    {preview.nota.valorTotal != null ? formatarMoeda(preview.nota.valorTotal) : '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Produtos: </span>
                    {preview.itens.length}
                  </p>
                </div>

                {preview.fornecedor.sugerirCriar && !preview.fornecedor.fornecedorExistente && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={criarFornecedor}
                        onChange={(e) => setCriarFornecedor(e.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
                        disabled={aguardandoConfirmacaoDuplicata}
                      />
                      <span className="min-w-0 break-words">
                        Criar fornecedor <strong>{preview.fornecedor.nome}</strong>
                        {preview.fornecedor.cnpj ? ` (${preview.fornecedor.cnpj})` : ''} ao confirmar
                        a importação
                      </span>
                    </label>
                  </div>
                )}

                {preview.fornecedor.fornecedorExistente && (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    Fornecedor identificado no cadastro e será vinculado aos itens.
                  </p>
                )}

                <div className="-mx-1 overflow-x-auto rounded-md border border-border">
                  <Table className="min-w-[960px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">Descrição</TableHead>
                        <TableHead className="min-w-[88px]">Código</TableHead>
                        <TableHead className="min-w-[100px]">EAN</TableHead>
                        <TableHead className="min-w-[72px]">NCM</TableHead>
                        <TableHead className="min-w-[64px]">CFOP</TableHead>
                        <TableHead className="min-w-[48px]">Un.</TableHead>
                        <TableHead className="min-w-[56px] text-right">Qtd</TableHead>
                        <TableHead className="min-w-[88px] text-right">Custo un.</TableHead>
                        <TableHead className="min-w-[80px] text-right">Total</TableHead>
                        <TableHead className="min-w-[168px]">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.itens.map((item, idx) => (
                        <TableRow key={`${item.produto.codigo}-${idx}`}>
                          <TableCell className="max-w-[220px]">
                            <div
                              className="truncate font-medium"
                              title={item.produto.descricao}
                            >
                              {item.produto.descricao}
                            </div>
                            {item.pecaExistenteNome && item.acao === 'atualizar' && (
                              <p
                                className="truncate text-xs text-muted-foreground"
                                title={item.pecaExistenteNome}
                              >
                                → {item.pecaExistenteNome}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {item.produto.codigo}
                          </TableCell>
                          <TableCell className="max-w-[120px] truncate text-xs" title={item.produto.codigoBarras}>
                            {item.produto.codigoBarras ?? '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {item.produto.ncm ?? '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {item.produto.cfop ?? '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {item.produto.unidade}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm">
                            {item.produto.quantidade}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm">
                            {formatarMoeda(item.produto.custoUnitario)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm">
                            {formatarMoeda(item.produto.valorTotal)}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={item.acao}
                              onValueChange={(v) => alterarAcao(idx, v as AcaoImportacaoXmlNfe)}
                              disabled={aguardandoConfirmacaoDuplicata || importando}
                            >
                              <SelectTrigger className="h-8 w-full min-w-[152px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(ROTULO_ACAO) as AcaoImportacaoXmlNfe[]).map((a) => (
                                  <SelectItem key={a} value={a}>
                                    {ROTULO_ACAO[a]}
                                    {a === item.acaoSugerida && a !== 'ignorar' ? ' (sugerido)' : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {item.acaoSugerida !== item.acao && (
                              <Badge variant="outline" className="mt-1 max-w-full truncate text-[10px]">
                                Sugerido: {ROTULO_ACAO[item.acaoSugerida]}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {aguardandoConfirmacaoDuplicata && (
                  <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-4">
                    <p className="text-sm font-medium">{MSG_NOTA_JA_IMPORTADA}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Deseja continuar mesmo assim? Isso pode somar novamente as quantidades no
                      estoque.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {preview && (
          <div className="shrink-0 border-t border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
            {aguardandoConfirmacaoDuplicata ? (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={cancelarConfirmacaoDuplicata}
                  disabled={importando}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={importando}
                  onClick={() => executarImportacao(true)}
                >
                  {importando ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="mr-2 h-4 w-4" />
                  )}
                  Importar mesmo assim
                </Button>
              </div>
            ) : (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={fechar}
                  disabled={importando}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={importando || itensParaImportar === 0}
                  onClick={solicitarConfirmacao}
                >
                  {importando ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="mr-2 h-4 w-4" />
                  )}
                  {notaJaImportada
                    ? 'Revisar e confirmar importação'
                    : `Confirmar importação (${itensParaImportar})`}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
