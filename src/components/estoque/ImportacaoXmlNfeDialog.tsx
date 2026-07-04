import { useRef, useState } from 'react'
import { FileUp, Loader2, Upload } from 'lucide-react'
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
import {
  executarImportacaoXmlNfe,
  montarPreviewImportacaoXmlNfe,
  MSG_IMPORTACAO_SUCESSO,
  MSG_XML_INVALIDO,
  type AcaoImportacaoXmlNfe,
  type PreviewImportacaoXmlNfe,
} from '@/services/importacao-xml-nfe.service'
import type { Fornecedor, FornecedorInput, Peca, PecaInput } from '@/types'

interface ImportacaoXmlNfeDialogProps {
  aberto: boolean
  onFechar: () => void
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

export function ImportacaoXmlNfeDialog({
  aberto,
  onFechar,
  pecas,
  fornecedores,
  adicionarPeca,
  atualizarPeca,
  adicionarFornecedor,
  onSucesso,
  onErro,
}: ImportacaoXmlNfeDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [preview, setPreview] = useState<PreviewImportacaoXmlNfe | null>(null)
  const [criarFornecedor, setCriarFornecedor] = useState(false)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)

  function fechar() {
    setPreview(null)
    setNomeArquivo(null)
    setErroLeitura(null)
    setCriarFornecedor(false)
    if (inputRef.current) inputRef.current.value = ''
    onFechar()
  }

  async function lerArquivo(arquivo: File | null) {
    if (!arquivo) return
    setLendo(true)
    setErroLeitura(null)
    setPreview(null)
    setNomeArquivo(arquivo.name)
    try {
      const texto = await arquivo.text()
      const montado = montarPreviewImportacaoXmlNfe(texto, pecas, fornecedores)
      setPreview(montado)
      setCriarFornecedor(
        montado.fornecedor.sugerirCriar && !montado.fornecedor.fornecedorExistente
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : MSG_XML_INVALIDO
      setErroLeitura(msg)
    } finally {
      setLendo(false)
    }
  }

  function alterarAcao(indice: number, acao: AcaoImportacaoXmlNfe) {
    if (!preview) return
    setPreview({
      ...preview,
      itens: preview.itens.map((item, i) => (i === indice ? { ...item, acao } : item)),
    })
  }

  function confirmarImportacao() {
    if (!preview) return
    setImportando(true)
    try {
      executarImportacaoXmlNfe(
        preview,
        pecas,
        {
          criarFornecedor,
          fornecedorId: preview.fornecedor.fornecedorId,
        },
        adicionarPeca,
        atualizarPeca,
        adicionarFornecedor
      )
      onSucesso(MSG_IMPORTACAO_SUCESSO)
      fechar()
    } catch {
      onErro(MSG_XML_INVALIDO)
    } finally {
      setImportando(false)
    }
  }

  const itensParaImportar = preview?.itens.filter((i) => i.acao !== 'ignorar').length ?? 0

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && fechar()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar XML de Nota Fiscal</DialogTitle>
          <DialogDescription>
            Selecione o XML da NF-e. O arquivo é lido apenas neste dispositivo — nada é enviado ao
            servidor. Revise os itens antes de confirmar.
          </DialogDescription>
        </DialogHeader>

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
            <span className="text-sm text-muted-foreground truncate max-w-[240px]">{nomeArquivo}</span>
          )}
        </div>

        {erroLeitura && (
          <p className="text-sm text-destructive" role="alert">
            {erroLeitura}
          </p>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm grid gap-2 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Nota: </span>
                {preview.nota.numero ?? '—'}
                {preview.nota.serie ? ` / Série ${preview.nota.serie}` : ''}
              </p>
              <p>
                <span className="text-muted-foreground">Emissão: </span>
                {preview.nota.dataEmissao ? formatarData(preview.nota.dataEmissao) : '—'}
              </p>
              <p>
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
                    className="mt-1 h-4 w-4 rounded border-border accent-primary"
                  />
                  <span>
                    Criar fornecedor <strong>{preview.fornecedor.nome}</strong>
                    {preview.fornecedor.cnpj ? ` (${preview.fornecedor.cnpj})` : ''} ao confirmar a
                    importação
                  </span>
                </label>
              </div>
            )}

            {preview.fornecedor.fornecedorExistente && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Fornecedor identificado no cadastro e será vinculado aos itens.
              </p>
            )}

            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead>NCM</TableHead>
                    <TableHead>CFOP</TableHead>
                    <TableHead>Un.</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Custo un.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.itens.map((item, idx) => (
                    <TableRow key={`${item.produto.codigo}-${idx}`}>
                      <TableCell className="max-w-[180px]">
                        <div className="truncate font-medium" title={item.produto.descricao}>
                          {item.produto.descricao}
                        </div>
                        {item.pecaExistenteNome && item.acao === 'atualizar' && (
                          <p className="text-xs text-muted-foreground truncate">
                            → {item.pecaExistenteNome}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{item.produto.codigo}</TableCell>
                      <TableCell className="text-xs">{item.produto.codigoBarras ?? '—'}</TableCell>
                      <TableCell className="text-xs">{item.produto.ncm ?? '—'}</TableCell>
                      <TableCell className="text-xs">{item.produto.cfop ?? '—'}</TableCell>
                      <TableCell className="text-xs">{item.produto.unidade}</TableCell>
                      <TableCell className="text-right text-sm">{item.produto.quantidade}</TableCell>
                      <TableCell className="text-right text-sm">
                        {formatarMoeda(item.produto.custoUnitario)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatarMoeda(item.produto.valorTotal)}
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        <Select
                          value={item.acao}
                          onValueChange={(v) => alterarAcao(idx, v as AcaoImportacaoXmlNfe)}
                        >
                          <SelectTrigger className="h-8 text-xs">
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
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            Sugerido: {ROTULO_ACAO[item.acaoSugerida]}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={fechar} disabled={importando}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={importando || itensParaImportar === 0}
                onClick={confirmarImportacao}
              >
                {importando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="mr-2 h-4 w-4" />
                )}
                Confirmar importação ({itensParaImportar})
              </Button>
            </div>
          </div>
        )}

        {!preview && !erroLeitura && !lendo && (
          <p className="text-sm text-muted-foreground">
            Envie um arquivo XML de NF-e para visualizar os produtos antes de importar.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
