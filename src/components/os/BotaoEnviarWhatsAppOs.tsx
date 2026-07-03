import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EnviarWhatsAppOsDialog } from '@/components/os/EnviarWhatsAppOsDialog'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useAuth } from '@/context/AuthContext'
import { useOficinaData } from '@/context/CraftContext'
import { podeEnviarWhatsAppOs, rotuloBotaoEnviarWhatsAppOs } from '@/lib/whatsapp-os-mensagem'
import { podeVerValoresFinanceirosOS } from '@/services/auth/permissions'
import { temRecursoComAssinatura } from '@/services/assinatura/plano-features'
import type { Cliente, Moto, OrdemServico } from '@/types'
import { cn } from '@/lib/utils'

interface BotaoEnviarWhatsAppOsProps {
  os: OrdemServico
  cliente: Cliente
  moto: Moto
  variant?: 'icon' | 'sm' | 'default'
  className?: string
  exibirValores?: boolean
}

export function BotaoEnviarWhatsAppOs({
  os,
  cliente,
  moto,
  variant = 'sm',
  className,
  exibirValores,
}: BotaoEnviarWhatsAppOsProps) {
  const { session } = useAuth()
  const { assinatura, temRecurso } = useAssinatura()
  const { configuracao } = useOficinaData()
  const [dialogAberto, setDialogAberto] = useState(false)

  const user = session?.user
  if (!user || !podeEnviarWhatsAppOs(user, os, configuracao)) {
    return null
  }

  const rotulo = rotuloBotaoEnviarWhatsAppOs(os)
  const mostrarValores =
    exibirValores ?? podeVerValoresFinanceirosOS(user, configuracao)
  const podeExportarPdf = temRecursoComAssinatura(assinatura, 'pdf_os')

  function handleAbrir() {
    if (!temRecurso('comunicacao')) {
      window.alert(
        'Comunicação com cliente disponível a partir do plano Profissional. Acesse Planos para fazer upgrade.'
      )
      return
    }
    setDialogAberto(true)
  }

  return (
    <>
      {variant === 'icon' ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAbrir}
          title={rotulo}
          className={cn('text-emerald-400 hover:text-emerald-300', className)}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant={variant === 'default' ? 'default' : 'outline'}
          size="sm"
          onClick={handleAbrir}
          className={cn(
            'gap-2',
            variant !== 'default' && 'text-emerald-400 border-emerald-500/30',
            className
          )}
        >
          <MessageCircle className="h-4 w-4" />
          {rotulo}
        </Button>
      )}

      <EnviarWhatsAppOsDialog
        aberto={dialogAberto}
        onFechar={() => setDialogAberto(false)}
        os={os}
        cliente={cliente}
        moto={moto}
        exibirValores={mostrarValores}
        podeExportarPdf={podeExportarPdf}
      />
    </>
  )
}
