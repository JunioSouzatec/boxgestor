import { useState } from 'react'
import { CalendarClock, ChevronDown, MessageCircle, Send, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useAuth } from '@/context/AuthContext'
import { useOficinaData } from '@/context/CraftContext'
import { AgendarMensagemDialog } from '@/components/comunicacao/AgendarMensagemDialog'
import { sugerirDataRevisaoFutura } from '@/services/comunicacao/mensagens-agendadas.service'
import { podeAcessarModuloUsuario } from '@/services/auth/permissions'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import type { TipoMensagem } from '@/types/comunicacao'
import type { Cliente, Moto, OrdemServico } from '@/types'

type DialogPreset = {
  tipo: TipoMensagem
  modo: 'agendar' | 'enviar_agora'
  titulo: string
  origem: 'os' | 'orcamento' | 'revisao'
  dataRevisao?: string
}

interface OsAcoesMensagemClienteProps {
  os: OrdemServico
  cliente: Cliente
  moto: Moto
}

export function OsAcoesMensagemCliente({ os, cliente, moto }: OsAcoesMensagemClienteProps) {
  const { session } = useAuth()
  const { temRecurso } = useAssinatura()
  const { configuracao } = useOficinaData()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [preset, setPreset] = useState<DialogPreset | null>(null)

  if (
    !session?.user ||
    !temRecurso('comunicacao') ||
    !podeAcessarModuloUsuario(session.user, 'comunicacao', configuracao)
  ) {
    return null
  }

  const ehOrcamento = ehDocumentoOrcamento(os)
  const osFinalizada = os.status === 'finalizada' || os.status === 'entregue'

  function abrir(p: DialogPreset) {
    setPreset(p)
    setDialogAberto(true)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MessageCircle className="h-4 w-4" />
            Mensagem ao cliente
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() =>
              abrir({
                tipo: ehOrcamento ? 'orcamento_aguardando' : 'moto_em_servico',
                modo: 'agendar',
                titulo: 'Agendar aviso ao cliente',
                origem: ehOrcamento ? 'orcamento' : 'os',
              })
            }
          >
            <CalendarClock className="mr-2 h-4 w-4" />
            Agendar aviso ao cliente
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              abrir({
                tipo: 'moto_pronta_retirada',
                modo: 'agendar',
                titulo: 'Agendar retirada',
                origem: ehOrcamento ? 'orcamento' : 'os',
              })
            }
          >
            <CalendarClock className="mr-2 h-4 w-4" />
            Agendar retirada
          </DropdownMenuItem>
          {osFinalizada && (
            <DropdownMenuItem
              onClick={() =>
                abrir({
                  tipo: 'lembrete_revisao',
                  modo: 'agendar',
                  titulo: 'Agendar revisão futura',
                  origem: 'revisao',
                  dataRevisao: sugerirDataRevisaoFutura(),
                })
              }
            >
              <Wrench className="mr-2 h-4 w-4" />
              Agendar revisão futura
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              abrir({
                tipo: ehOrcamento ? 'envio_orcamento' : 'envio_os',
                modo: 'enviar_agora',
                titulo: 'Enviar mensagem agora',
                origem: ehOrcamento ? 'orcamento' : 'os',
              })
            }
          >
            <Send className="mr-2 h-4 w-4" />
            Enviar mensagem agora
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {preset && (
        <AgendarMensagemDialog
          aberto={dialogAberto}
          onFechar={() => {
            setDialogAberto(false)
            setPreset(null)
          }}
          cliente={cliente}
          moto={moto}
          os={os}
          tipoInicial={preset.tipo}
          modoInicial={preset.modo}
          origem={preset.origem}
          titulo={preset.titulo}
          dataRevisaoSugerida={preset.dataRevisao}
        />
      )}
    </>
  )
}
