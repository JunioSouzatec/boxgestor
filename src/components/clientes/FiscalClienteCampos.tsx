/**
 * Campos fiscais do cliente (F3B) — somente preparação, sem emissão.
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
import {
  INDICADORES_IE_CLIENTE,
  TIPOS_PESSOA_FISCAL_CLIENTE,
  formatarCepExibicao,
  formatarCnpjExibicao,
  formatarCpfExibicao,
  labelStatusFiscalCliente,
  type DadosFiscaisCliente,
  type IndicadorIeCliente,
  type TipoPessoaFiscalCliente,
} from '@/types/fiscal-cliente'

interface FiscalClienteCamposProps {
  value: DadosFiscaisCliente
  onChange: (next: DadosFiscaisCliente) => void
  nomeCliente?: string
}

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-snug text-muted-foreground">{children}</p>
}

const fieldControlClass =
  'border-border bg-background text-foreground placeholder:text-muted-foreground'

export function FiscalClienteCampos({ value, onChange, nomeCliente }: FiscalClienteCamposProps) {
  const status = labelStatusFiscalCliente(value, nomeCliente)
  const tipo = value.tipo_pessoa || ''
  const ehPj = tipo === 'juridica'
  const ehPf = tipo === 'fisica' || !tipo

  function patch(p: Partial<DadosFiscaisCliente>) {
    onChange({ ...value, ...p })
  }

  function patchEndereco(p: Partial<NonNullable<DadosFiscaisCliente['endereco']>>) {
    onChange({
      ...value,
      endereco: { ...(value.endereco ?? {}), pais: value.endereco?.pais || 'Brasil', ...p },
    })
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card/40 p-4 text-foreground">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Dados fiscais</p>
          <p className="text-xs text-muted-foreground">
            Preparação para NFC-e/NF-e/NFS-e futura. Não emite nota nesta fase. Campos opcionais —
            o cliente pode ser salvo mesmo com fiscal incompleto.
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
        Confirme os dados fiscais com o cliente/contador antes de emitir nota.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label className="text-foreground">Tipo de pessoa</Label>
          <Select
            value={tipo || undefined}
            onValueChange={(v) => patch({ tipo_pessoa: v as TipoPessoaFiscalCliente })}
          >
            <SelectTrigger className={`${fieldControlClass} shadow-sm`}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_PESSOA_FISCAL_CLIENTE.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {ehPf ? (
          <div className="grid gap-1.5">
            <Label htmlFor="cli-fiscal-cpf" className="text-foreground">
              CPF
            </Label>
            <Input
              id="cli-fiscal-cpf"
              className={fieldControlClass}
              value={formatarCpfExibicao(value.cpf)}
              onChange={(e) =>
                patch({ cpf: e.target.value.replace(/\D/g, '').slice(0, 11) })
              }
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
            <FieldHint>Prioritário para pessoa física. Também atualiza o CPF do cadastro.</FieldHint>
          </div>
        ) : null}

        {ehPj ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-cnpj" className="text-foreground">
                CNPJ
              </Label>
              <Input
                id="cli-fiscal-cnpj"
                className={fieldControlClass}
                value={formatarCnpjExibicao(value.cnpj)}
                onChange={(e) =>
                  patch({ cnpj: e.target.value.replace(/\D/g, '').slice(0, 14) })
                }
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
              />
              <FieldHint>Prioritário para pessoa jurídica.</FieldHint>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-razao" className="text-foreground">
                Razão social
              </Label>
              <Input
                id="cli-fiscal-razao"
                className={fieldControlClass}
                value={value.razao_social ?? ''}
                onChange={(e) => patch({ razao_social: e.target.value })}
                placeholder="Razão social"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-fantasia" className="text-foreground">
                Nome fantasia
              </Label>
              <Input
                id="cli-fiscal-fantasia"
                className={fieldControlClass}
                value={value.nome_fantasia ?? ''}
                onChange={(e) => patch({ nome_fantasia: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-ie" className="text-foreground">
                Inscrição estadual
              </Label>
              <Input
                id="cli-fiscal-ie"
                className={fieldControlClass}
                value={value.inscricao_estadual ?? ''}
                onChange={(e) => patch({ inscricao_estadual: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-foreground">Indicador IE</Label>
              <Select
                value={value.indicador_ie || undefined}
                onValueChange={(v) => patch({ indicador_ie: v as IndicadorIeCliente })}
              >
                <SelectTrigger className={`${fieldControlClass} shadow-sm`}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {INDICADORES_IE_CLIENTE.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        ) : null}

        <div className="grid gap-1.5">
          <Label htmlFor="cli-fiscal-im" className="text-foreground">
            Inscrição municipal
          </Label>
          <Input
            id="cli-fiscal-im"
            className={fieldControlClass}
            value={value.inscricao_municipal ?? ''}
            onChange={(e) => patch({ inscricao_municipal: e.target.value })}
            placeholder="Opcional"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="cli-fiscal-email" className="text-foreground">
            E-mail fiscal
          </Label>
          <Input
            id="cli-fiscal-email"
            className={fieldControlClass}
            type="email"
            value={value.email_fiscal ?? ''}
            onChange={(e) => patch({ email_fiscal: e.target.value })}
            placeholder="opcional@email.com"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="cli-fiscal-tel" className="text-foreground">
            Telefone fiscal
          </Label>
          <Input
            id="cli-fiscal-tel"
            className={fieldControlClass}
            value={value.telefone_fiscal ?? ''}
            onChange={(e) =>
              patch({ telefone_fiscal: e.target.value.replace(/\D/g, '').slice(0, 13) })
            }
            placeholder="Opcional"
            inputMode="tel"
          />
        </div>

        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium text-foreground">Endereço fiscal</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-cep" className="text-foreground">
                CEP
              </Label>
              <Input
                id="cli-fiscal-cep"
                className={fieldControlClass}
                value={formatarCepExibicao(value.endereco?.cep)}
                onChange={(e) =>
                  patchEndereco({ cep: e.target.value.replace(/\D/g, '').slice(0, 8) })
                }
                placeholder="00000-000"
                inputMode="numeric"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="cli-fiscal-log" className="text-foreground">
                Logradouro
              </Label>
              <Input
                id="cli-fiscal-log"
                className={fieldControlClass}
                value={value.endereco?.logradouro ?? ''}
                onChange={(e) => patchEndereco({ logradouro: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-num" className="text-foreground">
                Número
              </Label>
              <Input
                id="cli-fiscal-num"
                className={fieldControlClass}
                value={value.endereco?.numero ?? ''}
                onChange={(e) => patchEndereco({ numero: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-comp" className="text-foreground">
                Complemento
              </Label>
              <Input
                id="cli-fiscal-comp"
                className={fieldControlClass}
                value={value.endereco?.complemento ?? ''}
                onChange={(e) => patchEndereco({ complemento: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-bairro" className="text-foreground">
                Bairro
              </Label>
              <Input
                id="cli-fiscal-bairro"
                className={fieldControlClass}
                value={value.endereco?.bairro ?? ''}
                onChange={(e) => patchEndereco({ bairro: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-cidade" className="text-foreground">
                Cidade
              </Label>
              <Input
                id="cli-fiscal-cidade"
                className={fieldControlClass}
                value={value.endereco?.cidade ?? ''}
                onChange={(e) => patchEndereco({ cidade: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-uf" className="text-foreground">
                UF
              </Label>
              <Input
                id="cli-fiscal-uf"
                className={fieldControlClass}
                value={value.endereco?.uf ?? ''}
                onChange={(e) =>
                  patchEndereco({ uf: e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2) })
                }
                placeholder="UF"
                maxLength={2}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-ibge" className="text-foreground">
                Código município IBGE
              </Label>
              <Input
                id="cli-fiscal-ibge"
                className={fieldControlClass}
                value={value.endereco?.codigo_municipio_ibge ?? ''}
                onChange={(e) =>
                  patchEndereco({
                    codigo_municipio_ibge: e.target.value.replace(/\D/g, '').slice(0, 7),
                  })
                }
                placeholder="Opcional"
                inputMode="numeric"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fiscal-pais" className="text-foreground">
                País
              </Label>
              <Input
                id="cli-fiscal-pais"
                className={fieldControlClass}
                value={value.endereco?.pais || 'Brasil'}
                onChange={(e) => patchEndereco({ pais: e.target.value || 'Brasil' })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
