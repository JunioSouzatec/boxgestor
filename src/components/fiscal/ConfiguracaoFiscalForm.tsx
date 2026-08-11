/**
 * F6A — UI de configuração fiscal (provedor/homologação).
 * Sem emissão, sem API externa, sem upload de certificado, sem token real persistido.
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2, RotateCcw, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCraft } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { MSG } from '@/lib/mensagens-usuario'
import { salvarDadosOficinaComSupabase } from '@/services/supabase-sync/salvar-oficina.service'
import {
  AMBIENTE_DESEJADO_OPCOES,
  CERTIFICADO_A1_STATUS_OPCOES,
  PROVEDOR_FISCAL_OPCOES,
  STATUS_MODULO_FISCAL_OPCOES,
  certificadoInformado,
  labelAmbienteDesejado,
  montarFiscalConfigParaSalvar,
  obterFiscalConfig,
  provedorFoiEscolhido,
  type AmbienteFiscalDesejado,
  type FiscalConfigOficina,
  type ProvedorFiscalNome,
  type StatusCertificadoA1Config,
  type StatusModuloFiscalConfig,
} from '@/types/fiscal-config'
import type { ConfiguracaoOficina } from '@/types/oficina'

const AVISO_AMBAR =
  'rounded-md border border-amber-600/50 bg-amber-100 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/70 dark:bg-amber-950/70 dark:text-amber-50'

interface ConfiguracaoFiscalFormProps {
  configuracao: ConfiguracaoOficina
}

function StatusCard({ titulo, valor, ok }: { titulo: string; valor: string; ok?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-foreground/70">{titulo}</p>
      <p className={`mt-0.5 text-sm font-semibold ${ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'}`}>
        {valor}
      </p>
    </div>
  )
}

export function ConfiguracaoFiscalForm({ configuracao }: ConfiguracaoFiscalFormProps) {
  const { dados, atualizarConfiguracao } = useCraft()
  const { toast } = useToast()
  const { executar, salvando } = useSalvarAcao()

  const salvo = useMemo(() => obterFiscalConfig(configuracao), [configuracao])
  const [form, setForm] = useState<FiscalConfigOficina>(() => obterFiscalConfig(configuracao))
  /** Digitado só em memória — nunca persistido em claro. */
  const [tokenDigitado, setTokenDigitado] = useState('')
  const [mensagemOk, setMensagemOk] = useState<string | null>(null)

  useEffect(() => {
    setForm(obterFiscalConfig(configuracao))
    setTokenDigitado('')
  }, [configuracao])

  function patchForm(patch: Partial<FiscalConfigOficina>) {
    setForm((atual) => ({ ...atual, ...patch }))
    setMensagemOk(null)
  }

  function restaurarSalvo() {
    setForm(obterFiscalConfig(configuracao))
    setTokenDigitado('')
    setMensagemOk(null)
    toast.info('Formulário restaurado com a configuração salva.')
  }

  function salvar() {
    void executar({
      acao: async () => {
        const normalizado = montarFiscalConfigParaSalvar({
          form,
          tokenDigitado,
        })
        // Garantia: nenhuma chave de token em claro no payload.
        const seguro = {
          ...normalizado,
          provedor: {
            ...normalizado.provedor,
            // remove qualquer campo acidental
          },
        }
        const resultado = await salvarDadosOficinaComSupabase(
          dados,
          { fiscal_config: seguro },
          (p) => atualizarConfiguracao(p)
        )
        setTokenDigitado('')
        setForm(seguro)
        setMensagemOk('Configuração salva')
        if (resultado.salvouSupabase) {
          toast.sucesso(MSG.dadosSalvos)
        } else if (getCraftPersistenceMode() === 'supabase') {
          toast.atencao(MSG.semConexao)
        } else {
          toast.sucesso(MSG.dadosSalvos)
        }
      },
    })
  }

  const provedorOk = provedorFoiEscolhido(form)
  const certOk = certificadoInformado(form)
  const homologPrep =
    form.ambiente_desejado === 'homologacao' &&
    (form.status_modulo_fiscal === 'em_preparacao' ||
      form.status_modulo_fiscal === 'homologacao_futura' ||
      provedorOk)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Configuração fiscal</CardTitle>
            {mensagemOk ? (
              <Badge
                variant="outline"
                className="border-emerald-400/70 bg-emerald-950 font-semibold text-emerald-100"
              >
                {mensagemOk}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className={AVISO_AMBAR}>
            Esta configuração prepara a oficina para uma futura integração fiscal. A emissão de
            notas ainda não está ativa.
          </p>
          <p className="text-xs text-foreground/75">
            Não há botão de emitir, testar API ou enviar ao provedor nesta fase. Token e certificado
            não são enviados a serviços externos.
          </p>
        </CardContent>
      </Card>

      {/* A) Ambiente */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">A) Ambiente fiscal</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="status-modulo">Status do módulo fiscal</Label>
            <select
              id="status-modulo"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.status_modulo_fiscal}
              onChange={(e) =>
                patchForm({ status_modulo_fiscal: e.target.value as StatusModuloFiscalConfig })
              }
            >
              {STATUS_MODULO_FISCAL_OPCOES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ambiente-desejado">Ambiente desejado</Label>
            <select
              id="ambiente-desejado"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.ambiente_desejado}
              onChange={(e) =>
                patchForm({ ambiente_desejado: e.target.value as AmbienteFiscalDesejado })
              }
            >
              {AMBIENTE_DESEJADO_OPCOES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-foreground/70">
              Produção só deve ser usada depois dos testes em homologação.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* B) Tipos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">B) Tipos de documentos pretendidos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['nfe_produtos', 'NF-e para produtos'],
                ['nfce_venda_balcao', 'NFC-e para venda balcão'],
                ['nfse_servicos', 'NFS-e para serviços'],
                ['os_mista_separada', 'OS mista pode exigir produto + serviço separados'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.tipos_documento[key]}
                  onChange={(e) =>
                    patchForm({
                      tipos_documento: {
                        ...form.tipos_documento,
                        [key]: e.target.checked,
                      },
                    })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className={AVISO_AMBAR}>
            OS com produtos e serviços pode exigir documentos fiscais diferentes. Confirme a
            configuração inicial com o contador.
          </p>
        </CardContent>
      </Card>

      {/* C) Provedor */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">C) Provedor fiscal</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="provedor-nome">Provedor</Label>
            <select
              id="provedor-nome"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.provedor.nome}
              onChange={(e) =>
                patchForm({
                  provedor: {
                    ...form.provedor,
                    nome: e.target.value as ProvedorFiscalNome,
                  },
                })
              }
            >
              {PROVEDOR_FISCAL_OPCOES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {form.provedor.nome === 'outro' ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="provedor-outro">Nome do provedor</Label>
              <Input
                id="provedor-outro"
                value={form.provedor.outro_nome ?? ''}
                onChange={(e) =>
                  patchForm({
                    provedor: { ...form.provedor, outro_nome: e.target.value },
                  })
                }
                placeholder="Nome do provedor"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="empresa-id">ID/Token da empresa no provedor</Label>
            <Input
              id="empresa-id"
              value={form.provedor.empresa_id ?? ''}
              onChange={(e) =>
                patchForm({
                  provedor: { ...form.provedor, empresa_id: e.target.value },
                })
              }
              placeholder="Opcional — não valida agora"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="token-api">Token/API Key (placeholder)</Label>
            <Input
              id="token-api"
              type="password"
              value={tokenDigitado}
              onChange={(e) => {
                setTokenDigitado(e.target.value)
                setMensagemOk(null)
              }}
              placeholder={
                form.provedor.token_configurado
                  ? `Mascarado: ${form.provedor.token_mascarado || '••••'}`
                  : 'Opcional — não será usado nesta fase'
              }
              autoComplete="new-password"
            />
            <p className="text-xs text-foreground/70">
              Apenas placeholder. O valor real não é armazenado nem enviado. Ao salvar, guardamos só
              “token configurado” e uma máscara visual.
            </p>
            {form.provedor.token_configurado ? (
              <p className="text-xs text-foreground/80">
                Status: token marcado como informado ({form.provedor.token_mascarado || '••••'})
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url-homo">URL base homologação</Label>
            <Input
              id="url-homo"
              value={form.provedor.url_homologacao ?? ''}
              onChange={(e) =>
                patchForm({
                  provedor: { ...form.provedor, url_homologacao: e.target.value },
                })
              }
              placeholder="Opcional"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url-prod">URL base produção</Label>
            <Input
              id="url-prod"
              value={form.provedor.url_producao ?? ''}
              onChange={(e) =>
                patchForm({
                  provedor: { ...form.provedor, url_producao: e.target.value },
                })
              }
              placeholder="Opcional"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="obs-provedor">Observações de integração</Label>
            <Textarea
              id="obs-provedor"
              value={form.provedor.observacoes ?? ''}
              onChange={(e) =>
                patchForm({
                  provedor: { ...form.provedor, observacoes: e.target.value },
                })
              }
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* D) Certificado */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">D) Certificado A1</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <p className={`${AVISO_AMBAR} sm:col-span-2`}>
            Não envie o certificado A1 nesta fase. A forma segura de armazenamento será definida na
            etapa de integração real.
          </p>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cert-status">Certificado A1 configurado?</Label>
            <select
              id="cert-status"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.certificado.status}
              onChange={(e) =>
                patchForm({
                  certificado: {
                    ...form.certificado,
                    status: e.target.value as StatusCertificadoA1Config,
                  },
                })
              }
            >
              {CERTIFICADO_A1_STATUS_OPCOES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-validade">Validade do certificado</Label>
            <Input
              id="cert-validade"
              value={form.certificado.validade ?? ''}
              onChange={(e) =>
                patchForm({
                  certificado: { ...form.certificado, validade: e.target.value },
                })
              }
              placeholder="Ex.: 12/2027"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-resp">Responsável pela renovação</Label>
            <Input
              id="cert-resp"
              value={form.certificado.responsavel_renovacao ?? ''}
              onChange={(e) =>
                patchForm({
                  certificado: {
                    ...form.certificado,
                    responsavel_renovacao: e.target.value,
                  },
                })
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cert-obs">Observações</Label>
            <Textarea
              id="cert-obs"
              value={form.certificado.observacoes ?? ''}
              onChange={(e) =>
                patchForm({
                  certificado: { ...form.certificado, observacoes: e.target.value },
                })
              }
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* E) Séries */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">E) Numeração e séries futuras</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <p className={`${AVISO_AMBAR} sm:col-span-2`}>
            Esses campos são apenas preparação. A numeração oficial só deve ser controlada quando a
            emissão real estiver ativa.
          </p>
          {(
            [
              ['nfe_serie', 'Série NF-e'],
              ['nfce_serie', 'Série NFC-e'],
              ['nfse_serie', 'Série NFS-e'],
              ['nfe_proximo_numero', 'Próximo número NF-e'],
              ['nfce_proximo_numero', 'Próximo número NFC-e'],
              ['nfse_proximo_numero', 'Próximo número NFS-e'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={form.series[key] ?? ''}
                onChange={(e) =>
                  patchForm({
                    series: { ...form.series, [key]: e.target.value },
                  })
                }
                placeholder="Informativo"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* F) Responsáveis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">F) Responsáveis</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="resp-oficina">Responsável interno da oficina</Label>
            <Input
              id="resp-oficina"
              value={form.responsaveis.responsavel_oficina ?? ''}
              onChange={(e) =>
                patchForm({
                  responsaveis: {
                    ...form.responsaveis,
                    responsavel_oficina: e.target.value,
                  },
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contador-nome">Contador responsável</Label>
            <Input
              id="contador-nome"
              value={form.responsaveis.contador_nome ?? ''}
              onChange={(e) =>
                patchForm({
                  responsaveis: { ...form.responsaveis, contador_nome: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contador-tel">Telefone/WhatsApp do contador</Label>
            <Input
              id="contador-tel"
              value={form.responsaveis.contador_telefone ?? ''}
              onChange={(e) =>
                patchForm({
                  responsaveis: {
                    ...form.responsaveis,
                    contador_telefone: e.target.value,
                  },
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contador-email">E-mail do contador</Label>
            <Input
              id="contador-email"
              type="email"
              value={form.responsaveis.contador_email ?? ''}
              onChange={(e) =>
                patchForm({
                  responsaveis: { ...form.responsaveis, contador_email: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="resp-obs">Observações fiscais</Label>
            <Textarea
              id="resp-obs"
              value={form.responsaveis.observacoes ?? ''}
              onChange={(e) =>
                patchForm({
                  responsaveis: { ...form.responsaveis, observacoes: e.target.value },
                })
              }
              rows={2}
            />
          </div>
          <p className="text-xs text-foreground/75 sm:col-span-2">
            O contador ajuda na configuração inicial, dúvidas, rejeições e mudanças fiscais. No uso
            diário, depois de configurado, a oficina poderá emitir diretamente quando o módulo real
            estiver ativo.
          </p>
        </CardContent>
      </Card>

      {/* G) Status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">G) Status da integração</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <StatusCard
            titulo="Provedor configurado"
            valor={provedorOk ? 'Sim' : 'Não'}
            ok={provedorOk}
          />
          <StatusCard
            titulo="Ambiente homologação"
            valor={homologPrep ? 'Preparado' : 'Não preparado'}
            ok={homologPrep}
          />
          <StatusCard
            titulo="Certificado"
            valor={certOk ? 'Informado' : 'Pendente'}
            ok={certOk}
          />
          <StatusCard titulo="Emissão real" valor="Não ativa" />
          <StatusCard titulo="XML autorizado" valor="Não ativo" />
          <StatusCard titulo="DANFE oficial" valor="Não ativo" />
          <StatusCard titulo="Cancelamento fiscal" valor="Não ativo" />
          <StatusCard
            titulo="Ambiente desejado"
            valor={labelAmbienteDesejado(form.ambiente_desejado)}
          />
          {salvo.atualizado_em ? (
            <StatusCard
              titulo="Última atualização salva"
              valor={new Date(salvo.atualizado_em).toLocaleString('pt-BR')}
            />
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configuração
        </Button>
        <Button type="button" variant="outline" onClick={restaurarSalvo} disabled={salvando}>
          <RotateCcw className="h-4 w-4" />
          Restaurar configuração salva
        </Button>
      </div>
    </div>
  )
}
