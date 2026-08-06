/**
 * Campos fiscais do produto (F3A) — somente preparação, sem emissão.
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
import {
  ORIGENS_MERCADORIA,
  UNIDADES_FISCAIS_PRODUTO,
  labelStatusFiscalProduto,
  type DadosFiscaisProduto,
} from '@/types/fiscal-produto'

interface FiscalProdutoCamposProps {
  value: DadosFiscaisProduto
  onChange: (next: DadosFiscaisProduto) => void
  nomeProduto?: string
}

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-snug text-muted-foreground">{children}</p>
}

const fieldControlClass =
  'border-border bg-background text-foreground placeholder:text-muted-foreground'

export function FiscalProdutoCampos({ value, onChange, nomeProduto }: FiscalProdutoCamposProps) {
  const status = labelStatusFiscalProduto(value, nomeProduto)

  function patch(p: Partial<DadosFiscaisProduto>) {
    onChange({
      ...value,
      ...p,
      origem_dados: value.origem_dados === 'xml' ? 'manual' : value.origem_dados ?? 'manual',
    })
  }

  return (
    <div className="sm:col-span-2 space-y-4 rounded-lg border border-border bg-card/40 p-4 text-foreground">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Dados fiscais</p>
          <p className="text-xs text-muted-foreground">
            Preparação para NFC-e/NF-e futura. Não emite nota nesta fase. Campos opcionais — o
            produto pode ser salvo mesmo com fiscal incompleto.
          </p>
        </div>
        <Badge
          variant={status.completo ? 'success' : 'outline'}
          className={
            status.completo
              ? undefined
              : 'border-amber-500/50 bg-amber-500/15 text-amber-950 dark:text-amber-100'
          }
        >
          {status.label}
        </Badge>
      </div>

      <p className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-50">
        Confirme os dados fiscais com o contador antes de emitir nota.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-ncm" className="text-foreground">
            NCM
          </Label>
          <Input
            id="fiscal-ncm"
            className={fieldControlClass}
            value={value.ncm ?? ''}
            onChange={(e) => patch({ ncm: e.target.value.replace(/\D/g, '').slice(0, 8) })}
            placeholder="8 dígitos"
            inputMode="numeric"
          />
          <FieldHint>8 dígitos. Use o XML de compra ou confirme com o contador.</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-cfop" className="text-foreground">
            CFOP padrão de venda
          </Label>
          <Input
            id="fiscal-cfop"
            className={fieldControlClass}
            value={value.cfop_padrao_venda ?? ''}
            onChange={(e) =>
              patch({ cfop_padrao_venda: e.target.value.replace(/\D/g, '').slice(0, 4) })
            }
            placeholder="4 dígitos"
            inputMode="numeric"
          />
          <FieldHint>
            Confirme com o contador. Não é preenchido automaticamente nesta fase.
          </FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-cfop-xml" className="text-foreground">
            CFOP XML (entrada)
          </Label>
          <Input
            id="fiscal-cfop-xml"
            className={fieldControlClass}
            value={value.cfop_xml_entrada ?? ''}
            onChange={(e) =>
              patch({ cfop_xml_entrada: e.target.value.replace(/\D/g, '').slice(0, 4) })
            }
            placeholder="Do XML de compra"
            inputMode="numeric"
          />
          <FieldHint>Vem da nota/XML de compra.</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-cest" className="text-foreground">
            CEST
          </Label>
          <Input
            id="fiscal-cest"
            className={fieldControlClass}
            value={value.cest ?? ''}
            onChange={(e) => patch({ cest: e.target.value.replace(/\D/g, '').slice(0, 7) })}
            placeholder="Opcional"
            inputMode="numeric"
          />
          <FieldHint>Opcional. Use apenas se constar no XML ou orientação contábil.</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-foreground">Unidade fiscal</Label>
          <Select
            value={value.unidade_fiscal || undefined}
            onValueChange={(v) => patch({ unidade_fiscal: v })}
          >
            <SelectTrigger className={`${fieldControlClass} shadow-sm`}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {UNIDADES_FISCAIS_PRODUTO.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldHint>Use a unidade da nota: UN, PAR, KG, LT, CX...</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-foreground">Origem da mercadoria</Label>
          <Select
            value={value.origem_mercadoria || undefined}
            onValueChange={(v) => patch({ origem_mercadoria: v })}
          >
            <SelectTrigger className={`${fieldControlClass} shadow-sm`}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {ORIGENS_MERCADORIA.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldHint>Use a origem da nota/XML ou confirme com o contador.</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-cst" className="text-foreground">
            CST / CSOSN
          </Label>
          <Input
            id="fiscal-cst"
            className={fieldControlClass}
            value={value.cst_csosn ?? ''}
            onChange={(e) => patch({ cst_csosn: e.target.value.slice(0, 10) })}
            placeholder="Ex.: 102"
          />
          <FieldHint>Confirme com o contador.</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-icms" className="text-foreground">
            Alíquota ICMS %
          </Label>
          <Input
            id="fiscal-icms"
            className={fieldControlClass}
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={value.aliquota_icms ?? ''}
            onChange={(e) =>
              patch({
                aliquota_icms: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            placeholder="Opcional"
          />
          <FieldHint>Opcional. Não calculamos imposto nesta fase.</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fiscal-ean" className="text-foreground">
            Código de barras / EAN
          </Label>
          <Input
            id="fiscal-ean"
            className={fieldControlClass}
            value={value.ean ?? ''}
            onChange={(e) => patch({ ean: e.target.value.replace(/\D/g, '').slice(0, 14) })}
            placeholder="Opcional"
            inputMode="numeric"
          />
          <FieldHint>Código de barras, se houver.</FieldHint>
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="fiscal-desc" className="text-foreground">
            Descrição fiscal
          </Label>
          <Input
            id="fiscal-desc"
            className={fieldControlClass}
            value={value.descricao_fiscal ?? ''}
            onChange={(e) => patch({ descricao_fiscal: e.target.value })}
            placeholder="Se vazio, usa o nome do produto"
          />
          <FieldHint>Descrição que aparecerá futuramente na nota.</FieldHint>
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="fiscal-obs" className="text-foreground">
            Observações fiscais
          </Label>
          <Textarea
            id="fiscal-obs"
            className={fieldControlClass}
            value={value.observacoes_fiscais ?? ''}
            onChange={(e) => patch({ observacoes_fiscais: e.target.value })}
            rows={2}
            placeholder="Opcional"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border bg-background text-primary accent-primary"
            checked={value.tributavel !== false}
            onChange={(e) => patch({ tributavel: e.target.checked })}
          />
          Produto tributável
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border bg-background text-primary accent-primary"
            checked={value.usar_dados_xml !== false}
            onChange={(e) => patch({ usar_dados_xml: e.target.checked })}
          />
          Usar dados do XML quando disponíveis
        </label>
      </div>

      {value.sugestao_xml &&
      (value.sugestao_xml.ncm ||
        value.sugestao_xml.cfop ||
        value.sugestao_xml.ean ||
        value.sugestao_xml.cest) ? (
        <p className="text-xs text-muted-foreground">
          Sugestão do último XML (não sobrescreveu dados manuais):{' '}
          {[
            value.sugestao_xml.ncm ? `NCM ${value.sugestao_xml.ncm}` : '',
            value.sugestao_xml.cfop ? `CFOP ${value.sugestao_xml.cfop}` : '',
            value.sugestao_xml.cest ? `CEST ${value.sugestao_xml.cest}` : '',
            value.sugestao_xml.ean ? `EAN ${value.sugestao_xml.ean}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
    </div>
  )
}
