/**
 * Hub de navegação da tela Configurações (cards → seção ativa).
 * Sem regras de negócio — só UI/organização.
 */
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  Building2,
  CreditCard,
  FileText,
  KeyRound,
  MessageSquare,
  Palette,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type SecaoConfiguracoes =
  | 'empresa'
  | 'fiscal'
  | 'visual'
  | 'equipe'
  | 'caixa'
  | 'comunicacao'
  | 'codigo'
  | 'planos'
  | 'sistema'

export interface CardConfiguracoesDef {
  id: SecaoConfiguracoes
  titulo: string
  descricao: string
  icone: LucideIcon
  status?: string
  oculto?: boolean
}

export const TITULOS_SECAO_CONFIG: Record<SecaoConfiguracoes, string> = {
  empresa: 'Dados da empresa',
  fiscal: 'Fiscal',
  visual: 'Visual do sistema',
  equipe: 'Equipe e permissões',
  caixa: 'Caixa',
  comunicacao: 'Comunicação',
  codigo: 'Código da oficina',
  planos: 'Planos',
  sistema: 'Sistema e sincronização',
}

export function ConfiguracoesHubCards({
  cards,
  onAbrir,
}: {
  cards: CardConfiguracoesDef[]
  onAbrir: (id: SecaoConfiguracoes) => void
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards
        .filter((c) => !c.oculto)
        .map((card) => {
          const Icone = card.icone
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onAbrir(card.id)}
              className={cn(
                'group flex flex-col rounded-xl border border-border/80 bg-card p-5 text-left',
                'shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icone className="h-5 w-5" aria-hidden />
                </span>
                {card.status ? (
                  <Badge variant="outline" className="max-w-[55%] truncate text-xs font-normal">
                    {card.status}
                  </Badge>
                ) : null}
              </div>
              <h2 className="text-base font-semibold tracking-tight group-hover:text-primary">
                {card.titulo}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                {card.descricao}
              </p>
            </button>
          )
        })}
    </div>
  )
}

export function ConfiguracoesSecaoCabecalho({
  secao,
  onVoltar,
}: {
  secao: SecaoConfiguracoes
  onVoltar: () => void
}) {
  return (
    <div className="mb-6 space-y-3">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 gap-2"
        onClick={onVoltar}
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para configurações
      </Button>
      <div>
        <p className="text-sm text-muted-foreground">
          Configurações{' '}
          <span className="text-foreground/70">›</span>{' '}
          <span className="font-medium text-foreground">{TITULOS_SECAO_CONFIG[secao]}</span>
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">
          {TITULOS_SECAO_CONFIG[secao]}
        </h2>
      </div>
    </div>
  )
}

export const ICONES_HUB = {
  empresa: Building2,
  fiscal: FileText,
  visual: Palette,
  equipe: Users,
  caixa: Wallet,
  comunicacao: MessageSquare,
  codigo: KeyRound,
  planos: CreditCard,
  sistema: RefreshCw,
} as const
