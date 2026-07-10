import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle, Pencil, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MensagensAgendadasSection } from '@/components/comunicacao/MensagensAgendadasSection'
import { AlertasComunicacaoSection } from '@/components/comunicacao/AlertasComunicacaoSection'
import { HistoricoContatoLista } from '@/components/comunicacao/HistoricoContatoLista'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { MSG } from '@/lib/mensagens-usuario'
import { salvarDadosOficinaComSupabase } from '@/services/supabase-sync/salvar-oficina.service'
import { resolverModelosMensagemOficina, mesclarModeloMensagemSalvo } from '@/services/comunicacao/mensagens-prontas.service'
import type { ModeloMensagem } from '@/types/comunicacao'

function ComunicacaoConteudo() {
  const { resumoMensagensAgendadas, resumoAlertas } = useComunicacao()
  const { atualizarConfiguracao, dados } = useCraft()
  const { configuracao } = useOficinaData()
  const { executar: executarSalvar, salvando: salvandoModelo } = useSalvarAcao()
  const termos = useTermosOficina()
  const modelos = resolverModelosMensagemOficina(configuracao)
  const [modeloEditando, setModeloEditando] = useState<ModeloMensagem | null>(null)
  const [textoEditando, setTextoEditando] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const abaParam = searchParams.get('aba')
  const abaInicial =
    abaParam === 'agendadas' || abaParam === 'alertas' || abaParam === 'historico'
      ? abaParam
      : 'modelos'
  const [aba, setAba] = useState(abaInicial)

  useEffect(() => {
    setAba(abaInicial)
  }, [abaInicial])

  function mudarAba(value: string) {
    setAba(value)
    if (value === 'agendadas' || value === 'alertas' || value === 'historico') {
      setSearchParams({ aba: value })
    } else {
      setSearchParams({})
    }
  }

  const pendenciasAgendadas =
    resumoMensagensAgendadas.totalPendentesHoje + resumoMensagensAgendadas.totalAtrasadas

  const pendenciasAlertas = resumoAlertas.pendentes

  return (
    <div>
      <PageHeader
        titulo="Comunicação"
        descricao="Mensagens prontas, agendamentos e histórico de contato com clientes via WhatsApp"
      />

      <Tabs value={aba} onValueChange={mudarAba} className="space-y-6">
        <TabsList>
          <TabsTrigger value="modelos">Mensagens prontas</TabsTrigger>
          <TabsTrigger value="alertas" className="gap-2">
            Alertas
            {pendenciasAlertas > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {pendenciasAlertas}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="agendadas" className="gap-2">
            Mensagens agendadas
            {pendenciasAgendadas > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {pendenciasAgendadas}
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
                {modelos.map((modelo) => (
                  <div
                    key={modelo.tipo}
                    className="rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:border-emerald-500/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{modelo.label}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => {
                          setModeloEditando(modelo)
                          setTextoEditando(modelo.corpo)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="mt-2 line-clamp-4 whitespace-pre-line text-xs text-muted-foreground">
                      {modelo.corpo.replace(/\{\{[^}]+\}\}/g, '…')}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Dialog open={modeloEditando != null} onOpenChange={(open) => !open && setModeloEditando(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Editar mensagem — {modeloEditando?.label}</DialogTitle>
              </DialogHeader>
              <Textarea
                value={textoEditando}
                onChange={(e) => setTextoEditando(e.target.value)}
                rows={12}
                className="text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModeloEditando(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!modeloEditando) return
                    void executarSalvar({
                      acao: async () => {
                        const mensagens_prontas = mesclarModeloMensagemSalvo(
                          configuracao,
                          modeloEditando.tipo,
                          { corpo: textoEditando }
                        )
                        const resultado = await salvarDadosOficinaComSupabase(
                          dados,
                          { mensagens_prontas },
                          (patch) => atualizarConfiguracao(patch)
                        )
                        if (
                          getCraftPersistenceMode() === 'supabase' &&
                          !resultado.salvouSupabase
                        ) {
                          throw new Error(MSG.semConexao)
                        }
                        setModeloEditando(null)
                      },
                      sucesso: 'Mensagem salva e sincronizada com a oficina.',
                    })
                  }}
                  disabled={salvandoModelo}
                >
                  {salvandoModelo ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    'Salvar'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="alertas">
          <AlertasComunicacaoSection />
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
