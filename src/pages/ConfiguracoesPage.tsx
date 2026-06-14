import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModelosChecklistSection } from '@/components/checklist/ModelosChecklistSection'
import { SupabaseConexaoCard } from '@/components/configuracoes/SupabaseConexaoCard'
import { AparienciaMarcaSection } from '@/components/configuracoes/AparienciaMarcaSection'
import { BotaoInstalarApp } from '@/components/pwa/BotaoInstalarApp'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useAuth } from '@/context/AuthContext'
import { podeRestaurarDados } from '@/services/auth/permissions'
import { formatarTelefone } from '@/lib/utils'
import { obterNomeExibidoOficina } from '@/lib/oficina-marca'
import { IndicadorSistema } from '@/components/layout/IndicadorSistema'
import type { PreferenciasSistema } from '@/types'

export function ConfiguracoesPage() {
  const { atualizarConfiguracao, resetarDados } = useCraft()
  const { configuracao } = useOficinaData()
  const { session } = useAuth()
  const papel = session?.user.papel ?? 'recepcao'
  const podeReset = podeRestaurarDados(papel)
  const podeVerPlanos = session?.user.papel === 'dono'

  const [nome, setNome] = useState(configuracao.nome)
  const [nomeFantasia, setNomeFantasia] = useState(configuracao.nome_fantasia ?? '')
  const [endereco, setEndereco] = useState(configuracao.endereco)
  const [bairro, setBairro] = useState(configuracao.bairro ?? '')
  const [cidade, setCidade] = useState(configuracao.cidade ?? '')
  const [estado, setEstado] = useState(configuracao.estado ?? '')
  const [cep, setCep] = useState(configuracao.cep ?? '')
  const [telefone, setTelefone] = useState(configuracao.telefone)
  const [whatsapp, setWhatsapp] = useState(configuracao.whatsapp ?? '')
  const [cnpj, setCnpj] = useState(configuracao.cnpj ?? '')
  const [email, setEmail] = useState(configuracao.email ?? '')
  const [preferencias, setPreferencias] = useState<PreferenciasSistema>(
    configuracao.preferencias ?? {
      tema_escuro: true,
      notificacoes: true,
      alerta_estoque_baixo: true,
    }
  )

  function salvarEmpresa() {
    atualizarConfiguracao({
      nome,
      nome_fantasia: nomeFantasia.trim() || undefined,
      endereco,
      bairro: bairro.trim() || undefined,
      cidade: cidade.trim() || undefined,
      estado: estado.trim() || undefined,
      cep: cep.trim() || undefined,
      telefone,
      whatsapp: whatsapp.trim() || undefined,
      cnpj: cnpj || undefined,
      email: email || undefined,
    })
  }

  function salvarPreferencias() {
    atualizarConfiguracao({ preferencias })
  }

  function handleResetar() {
    if (
      window.confirm(
        'Isso irá restaurar todos os dados para o estado inicial. Deseja continuar?'
      )
    ) {
      resetarDados()
      window.location.reload()
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Configurações"
        descricao="Dados da empresa e preferências do sistema"
      />

      <div className="mb-6">
        <IndicadorSistema
          mostrarOfficeId
          nomeOficina={obterNomeExibidoOficina(configuracao)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Dados da Oficina</CardTitle>
            <CardDescription>
              Informações exibidas na OS, PDF e documentos comerciais. Logo e cores em{' '}
              <span className="text-primary">Aparência e Marca</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="nome-oficina">Nome da oficina</Label>
              <Input id="nome-oficina" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="nome-fantasia">Nome fantasia</Label>
              <Input
                id="nome-fantasia"
                value={nomeFantasia}
                onChange={(e) => setNomeFantasia(e.target.value)}
                placeholder="Ex: Craft Motos"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="endereco">Endereço (logradouro e número)</Label>
              <Input
                id="endereco"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bairro">Bairro</Label>
              <Input id="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cidade">Cidade</Label>
              <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="estado">Estado (UF)</Label>
              <Input
                id="estado"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                maxLength={2}
                placeholder="MG"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cep">CEP</Label>
              <Input id="cep" value={cep} onChange={(e) => setCep(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
              {telefone && (
                <p className="text-xs text-muted-foreground">
                  Exibição: {formatarTelefone(telefone.replace(/\D/g, ''))}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="Se vazio, usa o telefone"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={salvarEmpresa} className="w-fit">
                Salvar dados
              </Button>
            </div>
          </CardContent>
        </Card>

        <AparienciaMarcaSection configuracao={configuracao} onSalvar={atualizarConfiguracao} />

        <ModelosChecklistSection />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferências do sistema</CardTitle>
            <CardDescription>Personalize a experiência de uso</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferencias.tema_escuro}
                onChange={(e) =>
                  setPreferencias({ ...preferencias, tema_escuro: e.target.checked })
                }
                className="h-4 w-4 rounded border-border"
              />
              <div>
                <p className="text-sm font-medium">Tema escuro</p>
                <p className="text-xs text-muted-foreground">
                  Também configurável em Aparência e Marca
                </p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferencias.notificacoes}
                onChange={(e) =>
                  setPreferencias({ ...preferencias, notificacoes: e.target.checked })
                }
                className="h-4 w-4 rounded border-border"
              />
              <div>
                <p className="text-sm font-medium">Notificações</p>
                <p className="text-xs text-muted-foreground">Alertas de agendamentos e pendências</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferencias.alerta_estoque_baixo}
                onChange={(e) =>
                  setPreferencias({ ...preferencias, alerta_estoque_baixo: e.target.checked })
                }
                className="h-4 w-4 rounded border-border"
              />
              <div>
                <p className="text-sm font-medium">Alerta de estoque baixo</p>
                <p className="text-xs text-muted-foreground">
                  Destaque peças abaixo do estoque mínimo
                </p>
              </div>
            </label>
            <Button onClick={salvarPreferencias} className="w-fit">
              Salvar preferências
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aplicativo instalável (PWA)</CardTitle>
            <CardDescription>
              Instale o Craft Oficina no computador para uso em janela própria e offline
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BotaoInstalarApp variant="settings" />
          </CardContent>
        </Card>

        {podeVerPlanos && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plano e assinatura</CardTitle>
              <CardDescription>Gerencie o plano comercial da oficina</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Compare planos Free, Profissional e Premium. Alterações são simuladas no
                localStorage até a integração com pagamentos.
              </p>
              <Button asChild variant="outline" className="w-fit">
                <Link to="/planos">Ver planos e assinatura</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <SupabaseConexaoCard />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Dados do sistema</CardTitle>
            <CardDescription>
              ID da oficina: <code className="text-primary">{configuracao.oficina_id}</code> — preparado
              para multi-oficina (SaaS)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Os dados são armazenados localmente no navegador (localStorage). A arquitetura está
              preparada para migração futura ao Supabase sem alterações nas telas.
            </p>
            {podeReset ? (
              <Button variant="destructive" onClick={handleResetar}>
                Restaurar dados iniciais
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Apenas o dono da oficina pode restaurar ou excluir os dados do sistema.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
