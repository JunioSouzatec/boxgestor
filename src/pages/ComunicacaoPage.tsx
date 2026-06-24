import { MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { MODELOS_MENSAGEM } from '@/services/comunicacao/comunicacao.service'
import { getLabelTipoMensagem } from '@/types/comunicacao'
import { formatarData } from '@/lib/utils'

function ComunicacaoConteudo() {
  const { historico } = useComunicacao()
  const termos = useTermosOficina()

  return (
    <div>
      <PageHeader
        titulo="Comunicação"
        descricao="Mensagens prontas e histórico de contato com clientes via WhatsApp"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-5 w-5 text-emerald-400" />
              Mensagens prontas
            </CardTitle>
            <CardDescription>
              Modelos usados nos botões &quot;Enviar WhatsApp&quot; em Clientes, {termos.veiculos} e OS
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {MODELOS_MENSAGEM.map((modelo) => (
                <div
                  key={modelo.tipo}
                  className="rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:border-emerald-500/30"
                >
                  <p className="font-medium text-sm">{modelo.label}</p>
                  <p className="mt-2 line-clamp-4 whitespace-pre-line text-xs text-muted-foreground">
                    {modelo.corpo.replace(/\{\{[^}]+\}\}/g, '…')}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Histórico de contato</CardTitle>
            <CardDescription>
              Registros de mensagens enviadas manualmente pelo WhatsApp Web
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nenhum contato registrado ainda. Use &quot;Enviar WhatsApp&quot; nas telas de
                        Clientes, {termos.veiculos} ou OS.
                      </TableCell>
                    </TableRow>
                  ) : (
                    historico.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatarData(item.data.slice(0, 10))}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {item.data.slice(11, 16)}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{item.cliente_nome}</TableCell>
                        <TableCell>{getLabelTipoMensagem(item.tipo_mensagem)}</TableCell>
                        <TableCell>
                          {item.ordem_servico_numero ? `#${item.ordem_servico_numero}` : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                            Enviado manualmente
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function ComunicacaoPage() {
  return (
    <RecursoPlanoGate recurso="comunicacao" pagina className="min-h-[520px]">
      <ComunicacaoConteudo />
    </RecursoPlanoGate>
  )
}
