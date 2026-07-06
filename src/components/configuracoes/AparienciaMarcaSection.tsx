import { useMemo, useState } from 'react'
import { RotateCcw, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { LogoOficinaUpload } from '@/components/configuracoes/LogoOficinaUpload'
import { LogoOficina } from '@/components/oficina/LogoOficina'
import { BotaoUpgrade } from '@/components/plano/BotaoUpgrade'
import { useAssinatura } from '@/context/AssinaturaContext'
import { MSG } from '@/lib/mensagens-usuario'
import {
  CORES_MARCA_PADRAO,
  obterCoresMarcaEfetivas,
  obterNomeExibidoOficina,
} from '@/lib/oficina-marca'
import { corTextoContraste } from '@/lib/oficina-tema'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import type { AparienciaOficina, ConfiguracaoOficina, CoresMarcaOficina, PreferenciasSistema } from '@/types'
import { normalizarPlanoTier, planoAtendeMinimo } from '@/types/plano'

interface AparienciaMarcaSectionProps {
  configuracao: ConfiguracaoOficina
  onSalvar: (patch: Partial<ConfiguracaoOficina>) => void | Promise<void>
}

type CampoCor = keyof CoresMarcaOficina

const CAMPOS_COR: { chave: CampoCor; label: string; descricao: string }[] = [
  { chave: 'cor_primaria', label: 'Cor principal da marca', descricao: 'Identidade visual geral' },
  { chave: 'cor_destaque', label: 'Cor de destaque', descricao: 'Ícones ativos e realces' },
  { chave: 'cor_botoes', label: 'Cor dos botões', descricao: 'Salvar, Nova OS, PDF, etc.' },
  { chave: 'cor_secundaria', label: 'Cor secundária', descricao: 'Fundos e elementos neutros' },
  { chave: 'cor_sucesso', label: 'Cor de sucesso', descricao: 'Status concluído e confirmações' },
  { chave: 'cor_alerta', label: 'Cor de alerta', descricao: 'Avisos e pendências' },
  { chave: 'cor_erro', label: 'Cor de erro', descricao: 'Erros e ações destrutivas' },
]

function PreviewMarca({
  logoUrl,
  nome,
  cores,
}: {
  logoUrl?: string
  nome: string
  cores: Required<CoresMarcaOficina>
}) {
  const corBotao = cores.cor_botoes || cores.cor_primaria
  const textoBotao = corTextoContraste(corBotao)

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prévia</p>
      <div className="flex items-center gap-3">
        <LogoOficina logoUrl={logoUrl} nome={nome} tamanho="sm" formato="circular" />
        <div>
          <p className="font-semibold">{nome}</p>
          <p className="text-xs text-muted-foreground">Como aparece no menu</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md px-4 py-2 text-sm font-medium shadow-sm"
          style={{ backgroundColor: corBotao, color: textoBotao }}
        >
          Botão principal
        </button>
        <Badge style={{ backgroundColor: `${cores.cor_primaria}33`, color: cores.cor_destaque }}>
          Badge
        </Badge>
      </div>
      <div
        className="rounded-md border p-3 text-sm"
        style={{ borderColor: `${cores.cor_primaria}44` }}
      >
        <p className="font-medium" style={{ color: cores.cor_destaque }}>
          Card de exemplo
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Visual premium com suas cores de marca
        </p>
      </div>
    </div>
  )
}

export function AparienciaMarcaSection({ configuracao, onSalvar }: AparienciaMarcaSectionProps) {
  const { confirmar } = useConfirmacao()
  const { executar, salvando } = useSalvarAcao()
  const { plano, temRecurso } = useAssinatura()
  const planoNorm = normalizarPlanoTier(plano)
  const podeLogo = temRecurso('personalizacao_marca') || planoNorm === 'trial'
  const podeCores = planoAtendeMinimo(planoNorm, 'professional')
  const [logoUrl, setLogoUrl] = useState(configuracao.logo_url)
  const [nomeExibido, setNomeExibido] = useState(configuracao.aparencia?.nome_exibido ?? '')
  const [cores, setCores] = useState<CoresMarcaOficina>(
    configuracao.aparencia?.cores ?? { ...CORES_MARCA_PADRAO }
  )
  const [temaEscuro, setTemaEscuro] = useState(
    configuracao.preferencias?.tema_escuro ?? true
  )

  const coresPreview = useMemo(
    () => obterCoresMarcaEfetivas({ aparencia: { cores } }),
    [cores]
  )

  const nomePreview = useMemo(
    () =>
      nomeExibido.trim() ||
      obterNomeExibidoOficina({ ...configuracao, aparencia: { nome_exibido: nomeExibido } }),
    [nomeExibido, configuracao]
  )

  function atualizarCor(chave: CampoCor, valor: string) {
    setCores((prev) => ({ ...prev, [chave]: valor }))
  }

  function salvar() {
    void executar({
      acao: async () => {
        const aparencia: AparienciaOficina = {
          nome_exibido: nomeExibido.trim() || undefined,
          cores: { ...cores },
        }
        const preferencias: PreferenciasSistema = {
          ...configuracao.preferencias,
          tema_escuro: temaEscuro,
        }
        await onSalvar({
          logo_url: logoUrl,
          logo_storage_path: logoUrl ? configuracao.logo_storage_path : undefined,
          logo_removida_em: logoUrl ? undefined : new Date().toISOString(),
          aparencia,
          preferencias,
        })
      },
      sucesso: '',
    })
  }

  async function restaurarPadrao() {
    const ok = await confirmar({
      titulo: 'Restaurar cores padrão',
      mensagem: 'Restaurar as cores padrão do Craft? A logo cadastrada será mantida.',
      confirmarTexto: 'Restaurar',
    })
    if (!ok) return

    const coresPadrao = { ...CORES_MARCA_PADRAO }
    setCores(coresPadrao)

    void executar({
      acao: async () => {
        const aparencia: AparienciaOficina = {
          nome_exibido: nomeExibido.trim() || undefined,
          cores: coresPadrao,
        }
        await onSalvar({ aparencia })
      },
      sucesso: 'Cores padrão restauradas.',
    })
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Aparência e Marca</CardTitle>
        <CardDescription>
          Logo, nome exibido e cores da oficina no app, login, PDF e recibo — conforme seu plano
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {podeLogo ? (
            <LogoOficinaUpload
              logoUrl={logoUrl}
              nomeOficina={nomePreview}
              onChange={setLogoUrl}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              <Lock className="mx-auto mb-2 h-5 w-5" />
              <p>{MSG.recursoPlanoProfissional}</p>
              <div className="mt-3">
                <BotaoUpgrade variant="outline" />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="nome-exibido">Nome exibido no sistema</Label>
            <Input
              id="nome-exibido"
              value={nomeExibido}
              onChange={(e) => setNomeExibido(e.target.value)}
              placeholder={configuracao.nome_fantasia || configuracao.nome}
            />
            <p className="text-xs text-muted-foreground">
              Usado no menu lateral, login e cabeçalho. Se vazio, usa nome fantasia ou razão social.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={temaEscuro}
              onChange={(e) => setTemaEscuro(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <div>
              <p className="text-sm font-medium">Tema escuro</p>
              <p className="text-xs text-muted-foreground">
                Desmarque para usar tema claro (experimental)
              </p>
            </div>
          </label>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Cores da marca</p>
              {!podeCores && (
                <Badge variant="outline" className="text-xs">
                  Plano Profissional+
                </Badge>
              )}
            </div>
            {podeCores ? (
              CAMPOS_COR.map(({ chave, label, descricao }) => (
                <div key={chave} className="grid gap-1.5">
                  <Label htmlFor={`cor-${chave}`} className="text-xs">
                    {label}
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`cor-${chave}`}
                      type="color"
                      value={cores[chave] ?? CORES_MARCA_PADRAO[chave]}
                      onChange={(e) => atualizarCor(chave, e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
                      title={label}
                    />
                    <Input
                      value={cores[chave] ?? CORES_MARCA_PADRAO[chave]}
                      onChange={(e) => atualizarCor(chave, e.target.value)}
                      className="font-mono text-xs uppercase"
                      maxLength={7}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{descricao}</p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
                <p>{MSG.solicitarUpgradeRecurso}</p>
                <div className="mt-3">
                  <BotaoUpgrade variant="outline" size="sm" />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Salvar aparência'
              )}
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={restaurarPadrao}>
              <RotateCcw className="h-4 w-4" />
              Restaurar aparência padrão
            </Button>
          </div>
        </div>

        <PreviewMarca logoUrl={logoUrl} nome={nomePreview} cores={coresPreview} />
      </CardContent>
    </Card>
  )
}
