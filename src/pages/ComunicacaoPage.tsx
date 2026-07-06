import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MensagensAgendadasSection } from '@/components/comunicacao/MensagensAgendadasSection'
import { HistoricoContatoLista } from '@/components/comunicacao/HistoricoContatoLista'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { MODELOS_MENSAGEM } from '@/services/comunicacao/comunicacao.service'

function ComunicacaoConteudo() {
  const { resumoMensagensAgendadas } = useComunicacao()
  const termos = useTermosOficina()
  const [searchParams, setSearchParams] = useSearchParams()
  const abaInicial = searchParams.get('aba') === 'agendadas' ? 'agendadas' : 'modelos'
  const [aba, setAba] = useState(abaInicial)

  useEffect(() => {
    setAba(abaInicial)
  }, [abaInicial])

  function mudarAba(value: string) {
    setAba(value)
    if (value === 'agendadas') {
      setSearchParams({ aba: 'agendadas' })
    } else {
      setSearchParams({})
    }
  }

  const pendencias =
    resumoMensagensAgendadas.totalPendentesHoje + resumoMensagensAgendadas.totalAtrasadas

  return (
    <div>
      <PageHeader
        titulo="Comunicação"
        descricao="Mensagens prontas, agendamentos e histórico de contato com clientes via WhatsApp"
      />

      <Tabs value={aba} onValueChange={mudarAba} className="space-y-6">
        <TabsList>
          <TabsTrigger value="modelos">Mensagens prontas</TabsTrigger>
          <TabsTrigger value="agendadas" className="gap-2">
            Mensagens agendadas
            {pendencias > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {pendencias}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="modelos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-5 w-5 text-emerald-400" />
                Mensagens prontas
              </CardTitle>
              <CardDescription>
                Modelos usados nos botões &quot;Enviar WhatsApp&quot; em Clientes, {termos.veiculos}{' '}
                e OS
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
        </TabsContent>

        <TabsContent value="agendadas">
          <MensagensAgendadasSection />
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de contato</CardTitle>
              <CardDescription>
                Registros de mensagens enviadas manualmente pelo WhatsApp Web
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HistoricoContatoLista />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
