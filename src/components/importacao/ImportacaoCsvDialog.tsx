import { useRef, useState } from 'react'
import { Download, FileUp, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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
import { baixarTextoComoArquivo, lerArquivoComoTexto } from '@/lib/csv-parse'
import { MSG } from '@/lib/mensagens-usuario'
import type { PoliticaDuplicadoImportacao } from '@/services/importacao-estoque.service'

export interface LinhaImportacaoBase {
  linha: number
  status: 'valido' | 'erro' | 'duplicado'
  erros: string[]
  avisos: string[]
}

interface ImportacaoCsvDialogProps<T extends LinhaImportacaoBase> {
  aberto: boolean
  onFechar: () => void
  titulo: string
  descricao: string
  nomeModelo: string
  conteudoModelo: string
  colunasPreview: { key: keyof T | string; label: string; render?: (item: T) => string }[]
  parsear: (texto: string) => T[]
  onConfirmar: (
    linhas: T[],
    politica: PoliticaDuplicadoImportacao
  ) => { importados: number; atualizados: number; ignorados: number; erros: number }
  renderResumo?: (resumo: {
    importados: number
    atualizados: number
    ignorados: number
    erros: number
  }) => string
}

export function ImportacaoCsvDialog<T extends LinhaImportacaoBase>({
  aberto,
  onFechar,
  titulo,
  descricao,
  nomeModelo,
  conteudoModelo,
  colunasPreview,
  parsear,
  onConfirmar,
}: ImportacaoCsvDialogProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [linhas, setLinhas] = useState<T[]>([])
  const [carregando, setCarregando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [politicaDuplicado, setPoliticaDuplicado] =
    useState<PoliticaDuplicadoImportacao>('atualizar')
  const [resumo, setResumo] = useState<{
    importados: number
    atualizados: number
    ignorados: number
    erros: number
  } | null>(null)

  function fechar() {
    setLinhas([])
    setResumo(null)
    onFechar()
  }

  async function handleArquivo(arquivo: File | null) {
    if (!arquivo) return
    setCarregando(true)
    setResumo(null)
    try {
      const texto = await lerArquivoComoTexto(arquivo)
      const parsed = parsear(texto)
      setLinhas(parsed)
    } finally {
      setCarregando(false)
    }
  }

  function confirmarImportacao() {
    setImportando(true)
    try {
      const resultado = onConfirmar(linhas, politicaDuplicado)
      setResumo(resultado)
    } finally {
      setImportando(false)
    }
  }

  const temDuplicados = linhas.some((l) => l.status === 'duplicado')
  const temErros = linhas.some((l) => l.status === 'erro')
  const prontos = linhas.filter((l) => l.status !== 'erro').length

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && fechar()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => baixarTextoComoArquivo(conteudoModelo, nomeModelo)}
          >
            <Download className="mr-2 h-4 w-4" />
            Baixar modelo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={carregando}
          >
            {carregando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Enviar CSV
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void handleArquivo(e.target.files?.[0] ?? null)}
          />
        </div>

        {linhas.length === 0 && !resumo && (
          <p className="text-sm text-muted-foreground">{MSG.nenhumDadoImportado}</p>
        )}

        {linhas.length > 0 && !resumo && (
          <div className="space-y-4">
            <p className="text-sm text-emerald-400">{MSG.arquivoCarregadoImportacao}</p>
            <p className="text-sm text-muted-foreground">{MSG.confiraAntesImportar}</p>

            {temDuplicados && (
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                <Label>Itens duplicados encontrados</Label>
                <Select
                  value={politicaDuplicado}
                  onValueChange={(v) => setPoliticaDuplicado(v as PoliticaDuplicadoImportacao)}
                >
                  <SelectTrigger className="max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="atualizar">Atualizar item existente</SelectItem>
                    <SelectItem value="ignorar">Ignorar duplicado</SelectItem>
                    <SelectItem value="criar">Criar mesmo assim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead>
                    <TableHead>Status</TableHead>
                    {colunasPreview.map((c) => (
                      <TableHead key={String(c.key)}>{c.label}</TableHead>
                    ))}
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.slice(0, 50).map((item) => (
                    <TableRow key={item.linha}>
                      <TableCell>{item.linha}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === 'valido'
                              ? 'success'
                              : item.status === 'duplicado'
                                ? 'warning'
                                : 'destructive'
                          }
                        >
                          {item.status === 'valido'
                            ? 'OK'
                            : item.status === 'duplicado'
                              ? 'Duplicado'
                              : 'Erro'}
                        </Badge>
                      </TableCell>
                      {colunasPreview.map((c) => (
                        <TableCell key={String(c.key)}>
                          {c.render ? c.render(item) : String((item as Record<string, unknown>)[c.key as string] ?? '—')}
                        </TableCell>
                      ))}
                      <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                        {[...item.erros, ...item.avisos].join(' · ') || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {linhas.length > 50 && (
              <p className="text-xs text-muted-foreground">
                Exibindo 50 de {linhas.length} linhas na prévia.
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={fechar}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={importando || prontos === 0}
                onClick={confirmarImportacao}
              >
                {importando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="mr-2 h-4 w-4" />
                )}
                Confirmar importação ({prontos})
              </Button>
            </div>
            {temErros && (
              <p className="text-sm text-amber-400">{MSG.itensPrecisamCorrecao}</p>
            )}
          </div>
        )}

        {resumo && (
          <div className="space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
            <p className="font-medium text-emerald-300">{MSG.importacaoConcluida}</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>Itens importados: {resumo.importados}</li>
              <li>Itens atualizados: {resumo.atualizados}</li>
              <li>Itens ignorados: {resumo.ignorados}</li>
              <li>Erros: {resumo.erros}</li>
            </ul>
            <Button type="button" onClick={fechar}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
