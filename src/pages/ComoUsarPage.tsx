import { useMemo, useState } from 'react'
import { BookOpen, Download, Search } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChecklistInicialCard } from '@/components/dashboard/ChecklistInicialCard'
import manualMarkdown from '@/content/manual-boxgestor-v0.5.md?raw'
import {
  filtrarSecoesManual,
  MANUAL_PDF_DISPONIVEL,
  MANUAL_PDF_INDISPONIVEL_LABEL,
  MANUAL_PDF_PATH,
  MANUAL_VERSAO,
  parseBlocosManual,
  parseSecoesManual,
  renderInlineParts,
} from '@/lib/manual-conteudo'

function TextoInline({ texto }: { texto: string }) {
  return (
    <>
      {renderInlineParts(texto).map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <strong key={i} className="font-medium text-foreground">
            {part.bold}
          </strong>
        )
      )}
    </>
  )
}

function CorpoSecao({ corpo }: { corpo: string }) {
  const blocos = useMemo(() => parseBlocosManual(corpo), [corpo])

  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      {blocos.map((bloco, idx) => {
        if (bloco.tipo === 'p') {
          return (
            <p key={idx}>
              <TextoInline texto={bloco.texto} />
            </p>
          )
        }
        if (bloco.tipo === 'ul') {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-5">
              {bloco.itens.map((item, j) => (
                <li key={j}>
                  <TextoInline texto={item} />
                </li>
              ))}
            </ul>
          )
        }
        if (bloco.tipo === 'ol') {
          return (
            <ol key={idx} className="list-decimal space-y-1 pl-5">
              {bloco.itens.map((item, j) => (
                <li key={j}>
                  <TextoInline texto={item} />
                </li>
              ))}
            </ol>
          )
        }
        return (
          <div key={idx} className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-foreground">
                <tr>
                  {bloco.headers.map((h, j) => (
                    <th key={j} className="px-3 py-2 font-medium">
                      <TextoInline texto={h} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bloco.rows.map((row, r) => (
                  <tr key={r} className="border-t border-border">
                    {row.map((cell, c) => (
                      <td key={c} className="px-3 py-2 align-top">
                        <TextoInline texto={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

export function ComoUsarPage() {
  const [busca, setBusca] = useState('')

  const secoes = useMemo(() => parseSecoesManual(manualMarkdown), [])
  const secoesVisiveis = useMemo(() => filtrarSecoesManual(secoes, busca), [secoes, busca])

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Manual do BoxGestor"
        descricao={`Versão ${MANUAL_VERSAO} — guia por módulos com busca por assunto`}
        acoes={
          MANUAL_PDF_DISPONIVEL ? (
            <Button variant="outline" size="sm" asChild>
              <a href={MANUAL_PDF_PATH} download target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Baixar manual em PDF
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled
              title={MANUAL_PDF_INDISPONIVEL_LABEL}
            >
              <Download className="mr-2 h-4 w-4" />
              {MANUAL_PDF_INDISPONIVEL_LABEL}
            </Button>
          )
        }
      />

      <ChecklistInicialCard />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Buscar no manual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ex.: caixa, estorno, pagamento, OS, permissão, estoque, recibo, offline"
            aria-label="Buscar no manual"
          />
          <div className="flex flex-wrap gap-2">
            {secoes.map((s) => (
              <a
                key={s.id}
                href={`#manual-${s.id}`}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {s.titulo}
              </a>
            ))}
          </div>
          {busca.trim() && (
            <p className="text-xs text-muted-foreground">
              {secoesVisiveis.length === 0
                ? 'Nenhuma seção encontrada para esta busca.'
                : `${secoesVisiveis.length} seção(ões) correspondente(s).`}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {secoesVisiveis.map((secao) => (
          <Card
            key={secao.id}
            id={`manual-${secao.id}`}
            className={
              busca.trim()
                ? 'scroll-mt-20 border-primary/40 ring-1 ring-primary/20'
                : 'scroll-mt-20'
            }
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                {secao.titulo}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CorpoSecao corpo={secao.corpo} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">PDF com layout quebrado?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Use sempre o botão <strong className="text-foreground">Baixar PDF</strong> dentro do
            sistema (na OS ou no recibo). Não use Imprimir → Salvar como PDF do navegador.
          </p>
          <p>
            Se o arquivo sair cortado ou sem formatação, pode ser cache ou versão antiga do app
            instalado (PWA):
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Aceite a atualização quando aparecer o aviso &quot;Nova versão disponível&quot;</li>
            <li>Confira a versão em Configurações</li>
            <li>Limpe o cache do site ou teste em aba anônima</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
