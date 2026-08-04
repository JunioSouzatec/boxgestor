import { useEffect, useMemo, useState } from 'react'
import { FileText, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { MSG } from '@/lib/mensagens-usuario'
import {
  AMBIENTES_FISCAIS,
  DADOS_FISCAIS_OFICINA_VAZIO,
  REGIMES_TRIBUTARIOS,
  TIPOS_DOCUMENTO_FISCAL,
  emailFiscalValido,
  formatarCepExibicao,
  formatarCnpjExibicao,
  labelStatusCadastroFiscal,
  mesclarPrefillFiscalComercial,
  normalizarDadosFiscaisOficina,
  obterDadosFiscaisOficina,
  somenteDigitos,
  ufFiscalValida,
  type DadosFiscaisOficina,
  type TipoDocumentoFiscalPretendido,
} from '@/types/fiscal'
import type { ConfiguracaoOficina } from '@/types/oficina'

interface FiscalOficinaSectionProps {
  configuracao: ConfiguracaoOficina
  onSalvar: (patch: Partial<ConfiguracaoOficina>) => void | Promise<void>
}

export function FiscalOficinaSection({ configuracao, onSalvar }: FiscalOficinaSectionProps) {
  const { confirmar } = useConfirmacao()
  const { executar, salvando } = useSalvarAcao()

  const [form, setForm] = useState<DadosFiscaisOficina>(() =>
    mesclarPrefillFiscalComercial(obterDadosFiscaisOficina(configuracao), configuracao)
  )

  useEffect(() => {
    setForm(mesclarPrefillFiscalComercial(obterDadosFiscaisOficina(configuracao), configuracao))
  }, [configuracao])

  const status = useMemo(() => labelStatusCadastroFiscal(form), [form])

  function atualizarCampo<K extends keyof DadosFiscaisOficina>(campo: K, valor: DadosFiscaisOficina[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
  }

  function atualizarEndereco(campo: keyof NonNullable<DadosFiscaisOficina['endereco']>, valor: string) {
    setForm((atual) => ({
      ...atual,
      endereco: {
        ...(atual.endereco ?? { ...DADOS_FISCAIS_OFICINA_VAZIO.endereco! }),
        [campo]: valor,
      },
    }))
  }

  function toggleTipoDocumento(tipo: TipoDocumentoFiscalPretendido) {
    setForm((atual) => {
      const lista = atual.tipos_documento_pretendidos ?? []
      const jaTem = lista.includes(tipo)
      return {
        ...atual,
        tipos_documento_pretendidos: jaTem
          ? lista.filter((t) => t !== tipo)
          : [...lista, tipo],
      }
    })
  }

  function validarLeve(): string | null {
    const cnpjDigits = somenteDigitos(form.cnpj)
    if (cnpjDigits && cnpjDigits.length !== 14) {
      return 'CNPJ deve ter 14 dígitos (pode usar máscara).'
    }
    if (!emailFiscalValido(form.email_fiscal)) {
      return 'Informe um e-mail fiscal válido ou deixe em branco.'
    }
    if (!ufFiscalValida(form.endereco?.uf)) {
      return 'UF deve ter 2 letras (ex.: SP).'
    }
    const cepDigits = somenteDigitos(form.endereco?.cep)
    if (cepDigits && cepDigits.length !== 8) {
      return 'CEP deve ter 8 dígitos ou ficar em branco.'
    }
    return null
  }

  function salvar() {
    void executar({
      validar: validarLeve,
      acao: async () => {
        const normalizado = normalizarDadosFiscaisOficina({
          ...form,
          atualizado_em: new Date().toISOString(),
        })
        await onSalvar({ fiscal: normalizado })
      },
      sucesso: '',
      erro: MSG.erroSalvar,
    })
  }

  async function restaurarOpcionais() {
    const ok = await confirmar({
      titulo: 'Limpar campos opcionais',
      mensagem:
        'Limpa inscrição estadual/municipal, CNAE, e-mail e telefone fiscal, complemento, código IBGE e tipos de nota pretendidos. Mantém CNPJ, razão social, endereço principal, regime e ambiente.',
      confirmarTexto: 'Limpar opcionais',
    })
    if (!ok) return

    setForm((atual) => {
      const n = normalizarDadosFiscaisOficina(atual)
      return {
        ...n,
        inscricao_estadual: '',
        inscricao_municipal: '',
        cnae_principal: '',
        email_fiscal: '',
        telefone_fiscal: '',
        tipos_documento_pretendidos: [],
        endereco: {
          ...(n.endereco ?? { ...DADOS_FISCAIS_OFICINA_VAZIO.endereco! }),
          complemento: '',
          codigo_municipio_ibge: '',
          pais: n.endereco?.pais || 'Brasil',
        },
      }
    })
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Fiscal
            </CardTitle>
            <CardDescription>
              Dados usados para preparar notas fiscais futuramente. A emissão ainda não está ativa.
            </CardDescription>
          </div>
          <span
            className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${
              status.completo
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-800 dark:text-amber-400'
            }`}
          >
            {status.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          role="note"
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          Essas informações serão usadas futuramente para preparar notas fiscais. Confirme os dados
          com o contador antes de emitir.
        </div>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Dados da empresa</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fiscal-cnpj">CNPJ</Label>
              <Input
                id="fiscal-cnpj"
                inputMode="numeric"
                autoComplete="off"
                placeholder="00.000.000/0000-00"
                value={formatarCnpjExibicao(form.cnpj)}
                onChange={(e) => atualizarCampo('cnpj', somenteDigitos(e.target.value).slice(0, 14))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal-regime">Regime tributário</Label>
              <select
                id="fiscal-regime"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.regime_tributario ?? ''}
                onChange={(e) =>
                  atualizarCampo(
                    'regime_tributario',
                    e.target.value as DadosFiscaisOficina['regime_tributario']
                  )
                }
              >
                <option value="">Selecione…</option>
                {REGIMES_TRIBUTARIOS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fiscal-razao">Razão social</Label>
              <Input
                id="fiscal-razao"
                value={form.razao_social ?? ''}
                onChange={(e) => atualizarCampo('razao_social', e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fiscal-fantasia">Nome fantasia</Label>
              <Input
                id="fiscal-fantasia"
                value={form.nome_fantasia ?? ''}
                onChange={(e) => atualizarCampo('nome_fantasia', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal-ie">Inscrição estadual</Label>
              <Input
                id="fiscal-ie"
                value={form.inscricao_estadual ?? ''}
                onChange={(e) => atualizarCampo('inscricao_estadual', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal-im">Inscrição municipal</Label>
              <Input
                id="fiscal-im"
                value={form.inscricao_municipal ?? ''}
                onChange={(e) => atualizarCampo('inscricao_municipal', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal-cnae">CNAE principal (opcional)</Label>
              <Input
                id="fiscal-cnae"
                placeholder="Ex.: 4520-0/01"
                value={form.cnae_principal ?? ''}
                onChange={(e) => atualizarCampo('cnae_principal', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal-tel">Telefone fiscal</Label>
              <Input
                id="fiscal-tel"
                value={form.telefone_fiscal ?? ''}
                onChange={(e) => atualizarCampo('telefone_fiscal', e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fiscal-email">E-mail fiscal</Label>
              <Input
                id="fiscal-email"
                type="email"
                autoComplete="email"
                value={form.email_fiscal ?? ''}
                onChange={(e) => atualizarCampo('email_fiscal', e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Endereço fiscal</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="fiscal-cep">CEP</Label>
              <Input
                id="fiscal-cep"
                inputMode="numeric"
                placeholder="00000-000"
                value={formatarCepExibicao(form.endereco?.cep)}
                onChange={(e) =>
                  atualizarEndereco('cep', somenteDigitos(e.target.value).slice(0, 8))
                }
              />
            </div>
            <div className="space-y-2 lg:col-span-3">
              <Label htmlFor="fiscal-logradouro">Logradouro</Label>
              <Input
                id="fiscal-logradouro"
                value={form.endereco?.logradouro ?? ''}
                onChange={(e) => atualizarEndereco('logradouro', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal-numero">Número</Label>
              <Input
                id="fiscal-numero"
                value={form.endereco?.numero ?? ''}
                onChange={(e) => atualizarEndereco('numero', e.target.value)}
              />
            </div>
            <div className="space-y-2 lg:col-span-3">
              <Label htmlFor="fiscal-complemento">Complemento</Label>
              <Input
                id="fiscal-complemento"
                value={form.endereco?.complemento ?? ''}
                onChange={(e) => atualizarEndereco('complemento', e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fiscal-bairro">Bairro</Label>
              <Input
                id="fiscal-bairro"
                value={form.endereco?.bairro ?? ''}
                onChange={(e) => atualizarEndereco('bairro', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal-cidade">Cidade</Label>
              <Input
                id="fiscal-cidade"
                value={form.endereco?.cidade ?? ''}
                onChange={(e) => atualizarEndereco('cidade', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscal-uf">UF</Label>
              <Input
                id="fiscal-uf"
                maxLength={2}
                placeholder="SP"
                className="uppercase"
                value={form.endereco?.uf ?? ''}
                onChange={(e) =>
                  atualizarEndereco('uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fiscal-ibge">Código município IBGE (opcional)</Label>
              <Input
                id="fiscal-ibge"
                inputMode="numeric"
                placeholder="7 dígitos"
                value={form.endereco?.codigo_municipio_ibge ?? ''}
                onChange={(e) =>
                  atualizarEndereco(
                    'codigo_municipio_ibge',
                    somenteDigitos(e.target.value).slice(0, 7)
                  )
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fiscal-pais">País</Label>
              <Input
                id="fiscal-pais"
                value={form.endereco?.pais || 'Brasil'}
                onChange={(e) => atualizarEndereco('pais', e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Configuração futura</h3>
          <p className="text-xs text-muted-foreground">
            Apenas preparação. Não ativa emissão nem integra provedor fiscal.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fiscal-ambiente">Ambiente fiscal</Label>
              <select
                id="fiscal-ambiente"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.ambiente ?? 'homologacao'}
                onChange={(e) =>
                  atualizarCampo('ambiente', e.target.value as DadosFiscaisOficina['ambiente'])
                }
              >
                {AMBIENTES_FISCAIS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tipos de nota que a oficina pretende emitir</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {TIPOS_DOCUMENTO_FISCAL.map((t) => {
                const checked = (form.tipos_documento_pretendidos ?? []).includes(t.value)
                return (
                  <label
                    key={t.value}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-border"
                      checked={checked}
                      onChange={() => toggleTipoDocumento(t.value)}
                    />
                    <span>
                      <span className="font-medium">{t.label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t.descricao}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={salvar} disabled={salvando}>
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando…
              </>
            ) : (
              'Salvar dados fiscais'
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => void restaurarOpcionais()} disabled={salvando}>
            <RotateCcw className="h-4 w-4" />
            Limpar campos opcionais
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
