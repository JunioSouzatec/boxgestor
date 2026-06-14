import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Users, CreditCard, Bell } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ModelosChecklistSection } from '@/components/checklist/ModelosChecklistSection'
import { AparienciaMarcaSection } from '@/components/configuracoes/AparienciaMarcaSection'
import { BackupSimplesCard } from '@/components/configuracoes/BackupSimplesCard'
import { BotaoInstalarApp } from '@/components/pwa/BotaoInstalarApp'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { useAuth } from '@/context/AuthContext'
import { formatarTelefone } from '@/lib/utils'
import { MSG } from '@/lib/mensagens-usuario'
import { APP_NAME } from '@/lib/app-brand'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { salvarDadosOficinaComSupabase } from '@/services/supabase-sync/salvar-oficina.service'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import type { ConfiguracaoOficina, PreferenciasSistema } from '@/types'

export function ConfiguracoesPage() {
  const { atualizarConfiguracao, dados } = useCraft()
  const { configuracao } = useOficinaData()
  const { session } = useAuth()
  const { temRecurso } = useAssinatura()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar: executarSalvar, salvando: salvandoEmpresa } = useSalvarAcao()
  const { executar: executarPreferencias, salvando: salvandoPreferencias } = useSalvarAcao()
  const { executar: executarHorario, salvando: salvandoHorario } = useSalvarAcao()

  const papel = session?.user.papel ?? 'recepcao'
  const podeVerPlanos = papel === 'dono'
  const podeVerUsuarios = papel === 'dono'

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
  const [horarioFuncionamento, setHorarioFuncionamento] = useState(
    configuracao.horario_funcionamento ?? ''
  )
  const [preferencias, setPreferencias] = useState<PreferenciasSistema>(
    configuracao.preferencias ?? {
      tema_escuro: true,
      notificacoes: true,
      alerta_estoque_baixo: true,
    }
  )

  useEffect(() => {
    setNome(configuracao.nome)
    setNomeFantasia(configuracao.nome_fantasia ?? '')
    setEndereco(configuracao.endereco)
    setBairro(configuracao.bairro ?? '')
    setCidade(configuracao.cidade ?? '')
    setEstado(configuracao.estado ?? '')
    setCep(configuracao.cep ?? '')
    setTelefone(configuracao.telefone)
    setWhatsapp(configuracao.whatsapp ?? '')
    setCnpj(configuracao.cnpj ?? '')
    setEmail(configuracao.email ?? '')
    setHorarioFuncionamento(configuracao.horario_funcionamento ?? '')
    if (configuracao.preferencias) setPreferencias(configuracao.preferencias)
  }, [configuracao])

  async function salvarConfiguracaoOficina(
    patch: Partial<ConfiguracaoOficina>,
    confirmarSubstituicao = false
  ) {
    if (getCraftPersistenceMode() === 'supabase' && confirmarSubstituicao) {
      const ok = await confirmar({
        titulo: 'Salvar alterações',
        mensagem: 'Deseja salvar as alterações da oficina?',
        confirmarTexto: 'Salvar',
      })
      if (!ok) return null
    }

    const resultado = await salvarDadosOficinaComSupabase(dados, patch, (p) => {
      atualizarConfiguracao(p)
    })

    if (resultado.salvouSupabase) {
      toast.sucesso(MSG.dadosSalvos)
    } else if (getCraftPersistenceMode() === 'supabase') {
      toast.atencao(MSG.semConexao)
    } else {
      toast.sucesso(MSG.dadosSalvos)
    }

    return resultado
  }

  function salvarEmpresa() {
    void executarSalvar({
      validar: () => (!nome.trim() ? 'Informe o nome da oficina.' : null),
      acao: async () => {
        await salvarConfiguracaoOficina(
          {
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
          },
          true
        )
      },
      sucesso: '',
    })
  }

  function salvarHorario() {
    void executarHorario({
      acao: async () => {
        await salvarConfiguracaoOficina(
          { horario_funcionamento: horarioFuncionamento.trim() || undefined },
          true
        )
      },
      sucesso: '',
    })
  }

  function salvarPreferencias() {
    void executarPreferencias({
      acao: async () => {
        await salvarConfiguracaoOficina({ preferencias }, true)
      },
      sucesso: '',
    })
  }

  async function salvarApariencia(patch: Partial<ConfiguracaoOficina>) {
    await salvarConfiguracaoOficina(patch, true)
  }

  return (
    <div>
      <PageHeader
        titulo="Configurações"
        descricao="Dados e preferências da sua oficina"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Dados da oficina</CardTitle>
            <CardDescription>
              Informações exibidas na OS, PDF e recibo. Logo e cores em Aparência e Marca.
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
                placeholder="Ex: Souza Motos"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="endereco">Endereço (logradouro e número)</Label>
              <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
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
              <Input id="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
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
              <Label htmlFor="email">E-mail de contato</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={salvarEmpresa} className="w-fit" disabled={salvandoEmpresa}>
                {salvandoEmpresa ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  'Salvar dados'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Horário de funcionamento</CardTitle>
            <CardDescription>Exibido em documentos e comunicações com o cliente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={horarioFuncionamento}
              onChange={(e) => setHorarioFuncionamento(e.target.value)}
              placeholder="Ex: Segunda a sexta, 8h às 18h · Sábado, 8h às 12h"
              rows={3}
            />
            <Button onClick={salvarHorario} disabled={salvandoHorario} className="w-fit">
              {salvandoHorario ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Salvar horário'
              )}
            </Button>
          </CardContent>
        </Card>

        <AparienciaMarcaSection configuracao={configuracao} onSalvar={salvarApariencia} />

        <ModelosChecklistSection />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferências da OS</CardTitle>
            <CardDescription>Ajustes básicos do fluxo de ordens de serviço</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferencias.os_destaque_numero ?? true}
                onChange={(e) =>
                  setPreferencias({ ...preferencias, os_destaque_numero: e.target.checked })
                }
                className="h-4 w-4 rounded border-border"
              />
              <div>
                <p className="text-sm font-medium">Destacar número da OS na listagem</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferencias.os_sugerir_recibo ?? false}
                onChange={(e) =>
                  setPreferencias({ ...preferencias, os_sugerir_recibo: e.target.checked })
                }
                className="h-4 w-4 rounded border-border"
              />
              <div>
                <p className="text-sm font-medium">Sugerir recibo ao concluir OS</p>
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
              </div>
            </label>
            <Button onClick={salvarPreferencias} className="w-fit" disabled={salvandoPreferencias}>
              {salvandoPreferencias ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Salvar preferências'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferências gerais</CardTitle>
            <CardDescription>Notificações e aparência do app</CardDescription>
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
                <p className="text-xs text-muted-foreground">Também em Aparência e Marca</p>
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
                <p className="text-xs text-muted-foreground">Agendamentos e pendências</p>
              </div>
            </label>
          </CardContent>
        </Card>

        {temRecurso('lembretes') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Lembretes
              </CardTitle>
              <CardDescription>Configure lembretes de retorno e revisões</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/lembretes">Abrir lembretes</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {podeVerUsuarios && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Usuários da oficina
              </CardTitle>
              <CardDescription>Equipe e cargos conforme seu plano</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/usuarios">Gerenciar usuários</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {podeVerPlanos && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Plano atual
              </CardTitle>
              <CardDescription>Recursos disponíveis e opções de upgrade</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/planos">Ver plano e recursos</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <BackupSimplesCard />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aplicativo instalável</CardTitle>
            <CardDescription>Use o {APP_NAME} em janela própria no computador</CardDescription>
          </CardHeader>
          <CardContent>
            <BotaoInstalarApp variant="settings" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
