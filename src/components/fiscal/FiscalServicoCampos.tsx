/**
 * Campos fiscais do serviço (F5A) — somente preparação NFS-e futura, sem emissão.
 */
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  EXIGIBILIDADE_ISS_OPCOES,
  ISS_RETIDO_OPCOES,
  labelStatusFiscalServico,
  type DadosFiscaisServico,
  type ExigibilidadeIssServico,
  type IssRetidoServico,
  type StatusFiscalServico,
} from '@/types/fiscal-servico'

interface FiscalServicoCamposProps {
  value: DadosFiscaisServico
  onChange: (next: DadosFiscaisServico) => void
  nomeServico?: string
  /** Sugestão visual (cidade/UF da oficina) — NÃO preenche o campo sozinho. */
  sugestaoMunicipioOficina?: string
}

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-snug text-foreground/75">{children}</p>
}

const fieldControlClass =
  'border-border bg-background text-foreground placeholder:text-foreground/45'

export function classesBadgeFiscalServico(status: StatusFiscalServico): string {
  switch (status) {
    case 'pronto_conferencia':
      return 'border-emerald-400/70 bg-emerald-950 text-emerald-100 dark:bg-emerald-950 dark:text-emerald-100'
    case 'basico':
      return 'border-sky-400/70 bg-sky-950 text-sky-100 dark:bg-sky-950 dark:text-sky-100'
    default:
      return 'border-red-400/70 bg-red-950 text-red-100 dark:bg-red-950 dark:text-red-100'
  }
}

export function FiscalServicoCampos({
  value,
  onChange,
  nomeServico,
  sugestaoMunicipioOficina,
}: FiscalServicoCamposProps) {
  const status = labelStatusFiscalServico(value, nomeServico)

  function patch(p: Partial<DadosFiscaisServico>) {
    onChange({
      ...value,
      ...p,
      origem_dados: 'manual',
    })
  }

  return (
    <div className="sm:col-span-2 space-y-4 rounded-lg border border-border bg-card p-4 text-foreground">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Dados fiscais do serviço
          </p>
          <p className="mt-1 text-xs text-foreground/80">
            Esses dados serão usados futuramente na preparação de NFS-e. Confirme a configuração
            inicial com o contador. Não emite nota nesta fase.
          </p>
        </div>
        <Badge variant="outline" className={cn('font-semibold', classesBadgeFiscalServico(status.status))}>
          {status.badge}
        </Badge>
      </div>

      <p className="rounded-md border border-amber-400/60 bg-amber-950 px-3 py-2 text-xs font-medium text-amber-100 dark:border-amber-400/50 dark:bg-amber-950 dark:text-amber-100">
        ISS informado é apenas para conferência — o sistema não calcula imposto automaticamente.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="fiscal-serv-desc" className="text-foreground">
            Descrição fiscal do serviço
          </Label>
          <Input
            id="fiscal-serv-desc"
            className={fieldControlClass}
            value={value.descricao_fiscal ?? ''}
            onChange={(e) => patch({ descricao_fiscal: e.target.value })}
            placeholder={nomeServico?.trim() || 'Se vazio, usa o nome do serviço'}
          />
          <FieldHint>Se vazio, a prévia usa o nome/descrição do serviço.</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-serv-cod-mun" className="text-foreground">
            Código municipal do serviço
          </Label>
          <Input
            id="fiscal-serv-cod-mun"
            className={fieldControlClass}
            value={value.codigo_municipal_servico ?? ''}
            onChange={(e) => patch({ codigo_municipal_servico: e.target.value })}
            placeholder="Ex.: código usado pela prefeitura/provedor"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-serv-lc116" className="text-foreground">
            Item da lista de serviços LC 116
          </Label>
          <Input
            id="fiscal-serv-lc116"
            className={fieldControlClass}
            value={value.item_lista_servico_lc116 ?? ''}
            onChange={(e) => patch({ item_lista_servico_lc116: e.target.value })}
            placeholder="Ex.: 14.01, 14.02, 14.13..."
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-serv-trib" className="text-foreground">
            Código de tributação municipal
          </Label>
          <Input
            id="fiscal-serv-trib"
            className={fieldControlClass}
            value={value.codigo_tributacao_municipal ?? ''}
            onChange={(e) => patch({ codigo_tributacao_municipal: e.target.value })}
            placeholder="Opcional — algumas prefeituras/provedores"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-serv-cnae" className="text-foreground">
            CNAE relacionado
          </Label>
          <Input
            id="fiscal-serv-cnae"
            className={fieldControlClass}
            value={value.cnae ?? ''}
            onChange={(e) => patch({ cnae: e.target.value })}
            placeholder="Opcional"
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="fiscal-serv-mun" className="text-foreground">
            Município de prestação padrão
          </Label>
          <Input
            id="fiscal-serv-mun"
            className={fieldControlClass}
            value={value.municipio_prestacao_padrao ?? ''}
            onChange={(e) => patch({ municipio_prestacao_padrao: e.target.value })}
            placeholder="Cidade / UF"
          />
          {sugestaoMunicipioOficina ? (
            <FieldHint>
              Sugestão da oficina: {sugestaoMunicipioOficina}. Use se for o município padrão —
              não é preenchido automaticamente.
            </FieldHint>
          ) : (
            <FieldHint>Opcional. Informe cidade/UF do local de prestação.</FieldHint>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-serv-iss" className="text-foreground">
            ISS informado (%) — apenas para conferência
          </Label>
          <Input
            id="fiscal-serv-iss"
            className={fieldControlClass}
            inputMode="decimal"
            value={
              value.aliquota_iss_informada == null ? '' : String(value.aliquota_iss_informada)
            }
            onChange={(e) => {
              const raw = e.target.value.replace(',', '.').trim()
              if (!raw) {
                patch({ aliquota_iss_informada: null })
                return
              }
              const n = Number(raw)
              patch({ aliquota_iss_informada: Number.isFinite(n) ? n : null })
            }}
            placeholder="Ex.: 5"
          />
          <FieldHint>Não calcula imposto nesta fase.</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-foreground">ISS retido</Label>
          <Select
            value={value.iss_retido || 'nao_informado'}
            onValueChange={(v) => patch({ iss_retido: v as IssRetidoServico })}
          >
            <SelectTrigger className={fieldControlClass}>
              <SelectValue placeholder="Não informado" />
            </SelectTrigger>
            <SelectContent>
              {ISS_RETIDO_OPCOES.map((o) => (
                <SelectItem key={o.value} value={o.value || 'nao_informado'}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label className="text-foreground">Exigibilidade do ISS</Label>
          <Select
            value={value.exigibilidade_iss || 'nao_informado'}
            onValueChange={(v) =>
              patch({ exigibilidade_iss: v as ExigibilidadeIssServico })
            }
          >
            <SelectTrigger className={fieldControlClass}>
              <SelectValue placeholder="Não informado" />
            </SelectTrigger>
            <SelectContent>
              {EXIGIBILIDADE_ISS_OPCOES.map((o) => (
                <SelectItem key={o.value} value={o.value || 'nao_informado'}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="fiscal-serv-obs" className="text-foreground">
            Observações fiscais do serviço
          </Label>
          <Textarea
            id="fiscal-serv-obs"
            className={fieldControlClass}
            value={value.observacoes_fiscais ?? ''}
            onChange={(e) => patch({ observacoes_fiscais: e.target.value })}
            rows={2}
            placeholder="Opcional"
          />
        </div>
      </div>
    </div>
  )
}
