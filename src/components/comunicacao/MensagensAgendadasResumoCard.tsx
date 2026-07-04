import { Link } from 'react-router-dom'
import { useAssinatura } from '@/context/AssinaturaContext'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { formatarData, formatarTelefone } from '@/lib/utils'
import { getLabelTipoMensagem } from '@/types/comunicacao'

export function MensagensAgendadasResumoCard() {
  const { temRecurso } = useAssinatura()
  const { resumoMensagensAgendadas } = useComunicacao()
  const { paraHoje, atrasadas } = resumoMensagensAgendadas
  const destaques = [...atrasadas, ...paraHoje].slice(0, 4)

  if (!temRecurso('comunicacao')) return null

  if (
    resumoMensagensAgendadas.totalPendentesHoje === 0 &&
    resumoMensagensAgendadas.totalAtrasadas === 0
  ) {
    return null
  }

  return (
    <Card className="border-emerald-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5 text-emerald-500" />
              Mensagens agendadas
            </CardTitle>
            <CardDescription>
              {resumoMensagensAgendadas.totalPendentesHoje > 0 && (
                <span>
                  {resumoMensagensAgendadas.totalPendentesHoje} mensagem
                  {resumoMensagensAgendadas.totalPendentesHoje !== 1 ? 's' : ''} para enviar hoje
                </span>
              )}
              {resumoMensagensAgendadas.totalPendentesHoje > 0 &&
                resumoMensagensAgendadas.totalAtrasadas > 0 &&
                ' · '}
              {resumoMensagensAgendadas.totalAtrasadas > 0 && (
                <span className="text-destructive">
                  {resumoMensagensAgendadas.totalAtrasadas} atrasada
                  {resumoMensagensAgendadas.totalAtrasadas !== 1 ? 's' : ''}
                </span>
              )}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link to="/comunicacao?aba=agendadas">
              Ver todas
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      {destaques.length > 0 && (
        <CardContent>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {destaques.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{m.cliente_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {getLabelTipoMensagem(m.tipo_mensagem)} · {formatarTelefone(m.telefone)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatarData(m.agendado_para.slice(0, 10))}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
