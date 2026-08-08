/**
 * F5B — UI do checklist de prontidão fiscal (sem emissão).
 */
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type {
  BlocoEntidadeProntidao,
  ChecklistProntidaoFiscal,
  StatusBlocoProntidao,
  StatusGeralProntidao,
} from '@/services/fiscal/fiscal-prontidao.service'

function badgeBloco(status: StatusBlocoProntidao): { label: string; className: string } {
  switch (status) {
    case 'completo':
      return {
        label: 'Completo',
        className:
          'border-emerald-400/70 bg-emerald-950 text-emerald-100 dark:bg-emerald-950 dark:text-emerald-100',
      }
    case 'atencao':
      return {
        label: 'Atenção',
        className:
          'border-amber-400/70 bg-amber-950 text-amber-100 dark:bg-amber-950 dark:text-amber-100',
      }
    case 'nao_ativo':
      return {
        label: 'Não ativo',
        className: 'border-border bg-muted text-muted-foreground',
      }
    default:
      return {
        label: 'Incompleto',
        className:
          'border-red-400/70 bg-red-950 text-red-100 dark:bg-red-950 dark:text-red-100',
      }
  }
}

function badgeGeral(status: StatusGeralProntidao): { label: string; className: string } {
  switch (status) {
    case 'pronto_homologacao':
      return {
        label: 'Pronto para iniciar homologação fiscal',
        className:
          'border-emerald-400/70 bg-emerald-950 text-emerald-100 dark:bg-emerald-950 dark:text-emerald-100',
      }
    case 'quase_pronto':
      return {
        label: 'Quase pronto',
        className:
          'border-sky-400/70 bg-sky-950 text-sky-100 dark:bg-sky-950 dark:text-sky-100',
      }
    case 'nao_configurado':
      return {
        label: 'Não configurado',
        className:
          'border-zinc-400/60 bg-zinc-900 text-zinc-100 dark:bg-zinc-900 dark:text-zinc-100',
      }
    default:
      return {
        label: 'Incompleto',
        className:
          'border-amber-400/70 bg-amber-950 text-amber-100 dark:bg-amber-950 dark:text-amber-100',
      }
  }
}

function BarraProgresso({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent))
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-sky-500 transition-[width]"
        style={{ width: `${p}%` }}
        aria-hidden
      />
    </div>
  )
}

function BlocoEntidade({
  titulo,
  bloco,
  atalho,
}: {
  titulo: string
  bloco: BlocoEntidadeProntidao
  atalho: { to: string; label: string }
}) {
  const b = badgeBloco(bloco.status)
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base">{titulo}</CardTitle>
          <p className="mt-1 text-xs text-foreground/75">
            {bloco.prontos} prontos · {bloco.pendentes} com pendência · {bloco.total} total
          </p>
        </div>
        <Badge variant="outline" className={cn('font-semibold', b.className)}>
          {b.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-foreground/80">{bloco.percent}% com fiscal básico</span>
        </div>
        <BarraProgresso percent={bloco.percent} />
        <ul className="grid gap-1 text-xs text-foreground/80 sm:grid-cols-2">
          {bloco.campos.map((c) => (
            <li key={c.rotulo}>
              {c.rotulo}: {c.preenchidos}/{c.total}
            </li>
          ))}
        </ul>
        {bloco.pendencias.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Principais pendências</p>
            <ul className="space-y-1">
              {bloco.pendencias.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs text-foreground"
                >
                  <span className="font-medium">{p.nome}</span>
                  <span className="text-foreground/70"> — {p.motivo}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : bloco.total === 0 ? (
          <p className="text-xs text-foreground/70">Nenhum registro ativo para avaliar.</p>
        ) : (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Sem pendências básicas na amostra.
          </p>
        )}
        <Button asChild variant="outline" size="sm">
          <Link to={atalho.to}>
            {atalho.label}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

interface ProntidaoFiscalChecklistProps {
  checklist: ChecklistProntidaoFiscal
}

export function ProntidaoFiscalChecklist({ checklist }: ProntidaoFiscalChecklistProps) {
  const geral = badgeGeral(checklist.status_geral)
  const ofBadge = badgeBloco(checklist.oficina.status)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Prontidão fiscal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="rounded-md border border-amber-400/60 bg-amber-950 px-3 py-2 text-xs font-medium text-amber-100">
            Este checklist é apenas uma conferência interna. Ele não emite nota fiscal e não
            substitui orientação contábil.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('font-semibold', geral.className)}>
              {checklist.status_geral_label}
            </Badge>
            <span className="text-sm text-foreground/80">{checklist.percent}% pronto</span>
          </div>
          <BarraProgresso percent={checklist.percent} />
          <p className="text-xs text-foreground/75">
            Este checklist ajuda a preparar a oficina para uma futura emissão fiscal. A emissão
            fiscal ainda não está ativa. Completar este checklist não emite nota automaticamente.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-base">A) Oficina / Emitente</CardTitle>
            <p className="mt-1 text-xs text-foreground/75">
              {checklist.oficina.qtdOk}/{checklist.oficina.qtdTotal} campos essenciais
            </p>
          </div>
          <Badge variant="outline" className={cn('font-semibold', ofBadge.className)}>
            {ofBadge.label}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {checklist.oficina.itens.map((i) => (
              <li key={i.rotulo} className="flex items-start gap-2 text-sm text-foreground">
                {i.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                )}
                <span>
                  {i.rotulo}
                  {i.rotulo.includes('(se houver)') && !i.ok ? (
                    <span className="text-foreground/60"> — não informado</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm">
            <Link to="/configuracoes">
              Ir para Configurações
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <BlocoEntidade
        titulo="B) Produtos"
        bloco={checklist.produtos}
        atalho={{ to: '/estoque', label: 'Ir para Estoque' }}
      />
      <BlocoEntidade
        titulo="C) Serviços"
        bloco={checklist.servicos}
        atalho={{ to: '/catalogo-servicos', label: 'Ir para Catálogo de Serviços' }}
      />
      <BlocoEntidade
        titulo="D) Clientes"
        bloco={checklist.clientes}
        atalho={{ to: '/clientes', label: 'Ir para Clientes' }}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">E) Operação fiscal</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {checklist.operacao.map((o) => (
              <li
                key={o.rotulo}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{o.rotulo}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'font-semibold',
                    o.ativo
                      ? 'border-emerald-400/70 bg-emerald-950 text-emerald-100'
                      : 'border-border bg-muted text-muted-foreground'
                  )}
                >
                  {o.ativo ? 'Ativo' : 'Não ativo'}
                </Badge>
                <span className="w-full text-xs text-foreground/70">{o.detalhe}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">F) Próximos passos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {checklist.proximos_passos.map((p) => (
              <li key={p.texto} className="flex items-start gap-2 text-sm text-foreground">
                {p.feito ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40" />
                )}
                <span className={p.feito ? 'text-foreground/70 line-through' : undefined}>
                  {p.texto}
                </span>
              </li>
            ))}
          </ul>
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground/80">
            Revise as configurações fiscais iniciais com o contador e consulte em caso de dúvidas,
            rejeições ou mudanças fiscais.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
