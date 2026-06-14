import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useAssinatura } from '@/context/AssinaturaContext'
import type { RecursoPlano } from '@/types/plano'
import { BotaoUpgrade } from '@/components/plano/BotaoUpgrade'
import { mensagemRecursoSuperior } from '@/services/assinatura/plano-features'
import { cn } from '@/lib/utils'

const LABEL_RECURSO: Record<RecursoPlano, string> = {
  financeiro_basico: 'Financeiro básico',
  financeiro_completo: 'Financeiro completo',
  relatorios_avancados: 'Relatórios principais',
  relatorios_completos: 'Relatórios completos',
  estoque: 'Estoque básico',
  estoque_completo: 'Estoque completo',
  agenda: 'Agenda',
  pdf_os: 'PDF da OS',
  multiusuarios: 'Múltiplos usuários',
  permissoes: 'Permissões por cargo',
  historico_avancado_moto: 'Histórico avançado da moto',
  fotos_antes_depois: 'Fotos antes/depois',
  alertas: 'Alertas inteligentes',
  garantia: 'Garantia',
  comunicacao: 'Comunicação com cliente',
  lembretes: 'Lembretes de retorno',
  portal_cliente: 'Portal do Cliente',
  checklist_personalizado: 'Checklists personalizados',
  catalogo_servicos: 'Catálogo de Serviços',
  personalizacao_marca: 'Personalização de logo e cores',
  clientes_vip: 'Clientes VIP',
}

interface RecursoPlanoGateProps {
  recurso: RecursoPlano
  children: ReactNode
  /** Bloqueio de página inteira vs. seção */
  pagina?: boolean
  className?: string
}

export function RecursoPlanoGate({
  recurso,
  children,
  pagina = false,
  className,
}: RecursoPlanoGateProps) {
  const { temRecurso } = useAssinatura()

  if (temRecurso(recurso)) {
    return <>{children}</>
  }

  return (
    <div className={cn('relative', pagina ? 'min-h-[420px]' : '', className)}>
      <div
        className={cn(
          pagina ? 'pointer-events-none select-none blur-[2px]' : 'opacity-40 pointer-events-none'
        )}
        aria-hidden
      >
        {children}
      </div>

      <div
        className={cn(
          'flex flex-col items-center justify-center text-center',
          pagina
            ? 'absolute inset-0 rounded-xl border border-border/60 bg-background/85 backdrop-blur-sm p-6'
            : 'mt-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-6'
        )}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <p className="text-lg font-semibold">{LABEL_RECURSO[recurso]}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{mensagemRecursoSuperior()}</p>
        <div className="mt-4">
          <BotaoUpgrade />
        </div>
      </div>
    </div>
  )
}
