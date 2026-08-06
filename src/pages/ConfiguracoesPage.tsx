import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Loader2, Users, CreditCard, Bell, Shield, RefreshCw, Wallet } from 'lucide-react'
import { AjudaTooltip } from '@/components/shared/AjudaTooltip'
import { LABEL_MODO_OS, type ModoOS } from '@/lib/os-modo'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ModelosChecklistSection } from '@/components/checklist/ModelosChecklistSection'
import { AparienciaMarcaSection } from '@/components/configuracoes/AparienciaMarcaSection'
import { FiscalOficinaSection } from '@/components/configuracoes/FiscalOficinaSection'
import { BackupSimplesCard } from '@/components/configuracoes/BackupSimplesCard'
import {
  ConfiguracoesHubCards,
  ConfiguracoesSecaoCabecalho,
  ICONES_HUB,
  type CardConfiguracoesDef,
  type SecaoConfiguracoes,
} from '@/components/configuracoes/configuracoes-hub'
import { BotaoInstalarApp } from '@/components/pwa/BotaoInstalarApp'
import { formatarVersaoApp } from '@/lib/app-version'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { useAuth } from '@/context/AuthContext'
import { formatarTelefone } from '@/lib/utils'
import { MSG } from '@/lib/mensagens-usuario'
import { labelTipoOficina } from '@/types/tipo-oficina'
import { APP_NAME } from '@/lib/app-brand'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { salvarDadosOficinaComSupabase } from '@/services/supabase-sync/salvar-oficina.service'
import { forcarSincronizacaoComServidor } from '@/services/comunicacao/forcar-sincronizacao.service'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import {
  normalizarCodigoAcessoOficina,
  obterCodigoAcessoOficina,
  validarCodigoAcessoOficina,
} from '@/lib/internal-user'
import { sincronizarCodigoAcessoOficinaSupabase } from '@/services/auth/internal-users.service'
import { podeAlterarPermissoesEquipe } from '@/services/auth/permissions'
import {
  obterCaixaConfig,
  type CaixaConfigOficina,
} from '@/types/caixa-config'
import {
  labelStatusCadastroFiscal,
  obterDadosFiscaisOficina,
} from '@/types/fiscal'
import { getLabelPlano } from '@/types/plano'
import type { ConfiguracaoOficina, PreferenciasSistema } from '@/types'
import type { AuthUser } from '@/types/auth'

export function ConfiguracoesPage() {
  const { atualizarConfiguracao, dados, aplicarDatabase, oficinaId } = useCraft()
  const { configuracao } = useOficinaData()
  const termos = useTermosOficina()
  const { session, carregarUsuarios } = useAuth()
  const { temRecurso, plano } = useAssinatura()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar: executarSalvar, salvando: salvandoEmpresa } = useSalvarAcao()
  const { executar: executarPreferencias, salvando: salvandoPreferencias } = useSalvarAcao()
  const { executar: executarCodigoAcesso, salvando: salvandoCodigoAcesso } = useSalvarAcao()
  const { executar: executarHorario, salvando: salvandoHorario } = useSalvarAcao()
  const { executar: executarSync, salvando: sincronizando } = useSalvarAcao()
  const { executar: executarCaixaConfig, salvando: salvandoCaixaConfig } = useSalvarAcao()
  const [usuariosOficina, setUsuariosOficina] = useState<AuthUser[]>([])
  const [codigoAcessoInput, setCodigoAcessoInput] = useState('')
  const [caixaConfig, setCaixaConfig] = useState<CaixaConfigOficina>(() =>
    obterCaixaConfig(configuracao)
  )
  const [secaoAtiva, setSecaoAtiva] = useState<SecaoConfiguracoes | null>(null)

  const modoSupabase = getCraftPersistenceMode() === 'supabase'

  const papel = session?.user.papel ?? 'recepcao'
  const podeVerPlanos = papel === 'dono'
  const podeVerUsuarios = papel === 'dono'
  const podeVerTipoOficina = papel === 'dono'

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
  const [pinAutorizacao, setPinAutorizacao] = useState(configuracao.pin_autorizacao_valores ?? '')
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
    setPinAutorizacao(configuracao.pin_autorizacao_valores ?? '')
    setCaixaConfig(obterCaixaConfig(configuracao))
  }, [configuracao])

  const officeIdAcesso =
    configuracao.office_id?.trim() ||
    oficinaId?.trim() ||
    session?.user.office_id?.trim() ||
    ''

  useEffect(() => {
    if (!officeIdAcesso) {
      setUsuariosOficina([])
      return
    }
    let ativo = true
    void carregarUsuarios().then((lista) => {
      if (ativo) setUsuariosOficina(lista)
    })
    return () => {
      ativo = false
    }
  }, [carregarUsuarios, officeIdAcesso])

  const codigoAcessoOficina = useMemo(() => {
    const usuarios = [
      ...(session?.user ? [session.user] : []),
      ...usuariosOficina,
    ]
    return obterCodigoAcessoOficina(officeIdAcesso, configuracao, usuarios)
  }, [officeIdAcesso, configuracao, session?.user, usuariosOficina])

  useEffect(() => {
    setCodigoAcessoInput(codigoAcessoOficina)
  }, [codigoAcessoOficina])

  async function salvarConfiguracaoOficina(
    patch: Partial<ConfiguracaoOficina>,
    confirmarSubstituicao = false,
    opcoes?: { silencioso?: boolean }
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

    if (!opcoes?.silencioso) {
      if (resultado.salvouSupabase) {
        toast.sucesso(MSG.dadosSalvos)
      } else if (getCraftPersistenceMode() === 'supabase') {
        toast.atencao(MSG.semConexao)
      } else {
        toast.sucesso(MSG.dadosSalvos)
      }
    } else if (getCraftPersistenceMode() === 'supabase' && !resultado.salvouSupabase) {
      throw new Error(MSG.semConexao)
    }

    return resultado
  }

  function salvarEmpresa() {
    void executarSalvar({
      validar: () => (!nome.trim() ? 'Informe o nome da oficina.' : null),
      acao: async () => {
        // Enviar string vazia (não undefined) para campos limpos —
        // undefined seria ignorado no merge e o valor antigo ressuscitaria.
        await salvarConfiguracaoOficina(
          {
            nome,
            nome_fantasia: nomeFantasia.trim(),
            endereco,
            bairro: bairro.trim(),
            cidade: cidade.trim(),
            estado: estado.trim(),
            cep: cep.trim(),
            telefone,
            whatsapp: whatsapp.trim(),
            cnpj: cnpj.trim(),
            email: email.trim(),
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
          { horario_funcionamento: horarioFuncionamento.trim() },
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

  async function salvarCodigoAcessoOficina() {
    const erroValidacao = validarCodigoAcessoOficina(codigoAcessoInput)
    if (erroValidacao) {
      toast.atencao(erroValidacao)
      return
    }

    // Confirmar ANTES de qualquer escrita remota (evita profiles/offices
    // atualizados se o usuário cancelar o diálogo).
    if (getCraftPersistenceMode() === 'supabase') {
      const ok = await confirmar({
        titulo: 'Alterar código de acesso',
        mensagem:
          'O código antigo deixará de funcionar no próximo login. Deseja salvar o novo código?',
        confirmarTexto: 'Salvar código',
      })
      if (!ok) return
    }

    void executarCodigoAcesso({
      acao: async () => {
        const codigo = normalizarCodigoAcessoOficina(codigoAcessoInput)
        if (!officeIdAcesso) {
          throw new Error('Oficina não identificada.')
        }

        let codigoFinal = codigo
        try {
          const sync = await sincronizarCodigoAcessoOficinaSupabase(officeIdAcesso, codigo)
          codigoFinal = sync.office_slug
        } catch (err) {
          if (err instanceof Error && err.message.includes('já está em uso')) {
            throw err
          }
          if (
            err instanceof Error &&
            err.message.includes('com segurança')
          ) {
            throw err
          }
          throw new Error(
            'Não foi possível atualizar o código de acesso com segurança. Tente novamente.'
          )
        }

        // Espelha no cache local o código já confirmado no servidor
        // (settings/profiles/offices). Sem segunda escrita remota parcial.
        atualizarConfiguracao({ office_slug: codigoFinal })
        setCodigoAcessoInput(codigoFinal)
        void carregarUsuarios().then(setUsuariosOficina)
      },
      sucesso:
        'Código de acesso atualizado. Avise os funcionários para usarem o novo código no próximo login.',
    })
  }

  function salvarPinAutorizacao() {
    void executarPreferencias({
      acao: async () => {
        await salvarConfiguracaoOficina(
          { pin_autorizacao_valores: pinAutorizacao.trim() },
          true
        )
      },
      sucesso: 'PIN de autorização salvo.',
    })
  }

  async function salvarApariencia(patch: Partial<ConfiguracaoOficina>) {
    await salvarConfiguracaoOficina(patch, true)
  }

  async function salvarFiscal(patch: Partial<ConfiguracaoOficina>) {
    await salvarConfiguracaoOficina(patch, true)
  }

  function sincronizarAgora() {
    void executarSync({
      acao: async () => {
        const resultado = await forcarSincronizacaoComServidor(oficinaId)
        if (resultado.database) {
          aplicarDatabase(resultado.database)
        }
        if (!resultado.ok) {
          throw new Error(resultado.mensagem ?? 'Não foi possível sincronizar com o servidor.')
        }
        if ((resultado.pendentesRestantes ?? 0) > 0 || (resultado.fotosFalhas ?? 0) > 0) {
          throw new Error(
            resultado.mensagem ??
              `Ainda há ${resultado.pendentesRestantes} pendência(s). Tente novamente.`
          )
        }
        return resultado.mensagem ?? 'Dados sincronizados com o servidor.'
      },
    })
  }

  const statusFiscal = useMemo(
    () => labelStatusCadastroFiscal(obterDadosFiscaisOficina(configuracao)),
    [configuracao]
  )

  const visualPersonalizado = useMemo(() => {
    if (configuracao.logo_url?.trim()) return true
    const cores = configuracao.aparencia?.cores ?? {}
    return Object.values(cores).some((c) => typeof c === 'string' && c.trim().length > 0)
  }, [configuracao.logo_url, configuracao.aparencia?.cores])

  const cardsHub = useMemo((): CardConfiguracoesDef[] => {
    return [
      {
        id: 'empresa',
        titulo: 'Dados da empresa',
        descricao: 'Nome, CNPJ, endereço, telefone, e-mail e dados básicos da oficina.',
        icone: ICONES_HUB.empresa,
      },
      {
        id: 'fiscal',
        titulo: 'Fiscal',
        descricao: 'Dados usados futuramente para preparar notas fiscais.',
        icone: ICONES_HUB.fiscal,
        status: statusFiscal.completo ? 'Básico preenchido' : 'Incompleto',
      },
      {
        id: 'visual',
        titulo: 'Visual do sistema',
        descricao: 'Cores, tema, aparência, logo e identidade visual.',
        icone: ICONES_HUB.visual,
        status: visualPersonalizado ? 'Personalizado' : 'Padrão',
      },
      {
        id: 'equipe',
        titulo: 'Equipe e permissões',
        descricao: 'Usuários, funções, acessos e permissões.',
        icone: ICONES_HUB.equipe,
        status:
          usuariosOficina.length > 0
            ? `${usuariosOficina.length} usuário${usuariosOficina.length === 1 ? '' : 's'}`
            : undefined,
      },
      {
        id: 'caixa',
        titulo: 'Caixa',
        descricao: 'Configurações de caixa, exigência de caixa aberto e permissões.',
        icone: ICONES_HUB.caixa,
        status: caixaConfig.exigir_caixa_aberto_pagamentos ? 'Configurado' : 'Padrão',
        oculto: !podeAlterarPermissoesEquipe(session?.user),
      },
      {
        id: 'comunicacao',
        titulo: 'Comunicação',
        descricao: 'Mensagens, alertas, lembretes e WhatsApp.',
        icone: ICONES_HUB.comunicacao,
      },
      {
        id: 'codigo',
        titulo: 'Código da oficina',
        descricao: 'Código usado para acessar a oficina.',
        icone: ICONES_HUB.codigo,
      },
      {
        id: 'planos',
        titulo: 'Planos',
        descricao: 'Plano atual, limites e assinatura.',
        icone: ICONES_HUB.planos,
        status: getLabelPlano(plano),
        oculto: !podeVerPlanos,
      },
      {
        id: 'sistema',
        titulo: 'Sistema e sincronização',
        descricao: 'Status do banco, sincronização e opções técnicas.',
        icone: ICONES_HUB.sistema,
        status: modoSupabase ? 'Supabase' : 'Local',
      },
    ]
  }, [
    statusFiscal.completo,
    visualPersonalizado,
    usuariosOficina.length,
    caixaConfig.exigir_caixa_aberto_pagamentos,
    podeVerUsuarios,
    podeVerPlanos,
    session?.user,
    plano,
    modoSupabase,
  ])

  return (
    <div className="min-w-0">
      <PageHeader
        titulo="Configurações"
        descricao="Gerencie os dados e preferências da oficina"
      />

      {!secaoAtiva ? (
        <ConfiguracoesHubCards cards={cardsHub} onAbrir={setSecaoAtiva} />
      ) : (
        <div className="min-w-0 space-y-6">
          <ConfiguracoesSecaoCabecalho
            secao={secaoAtiva}
            onVoltar={() => setSecaoAtiva(null)}
          />

          {secaoAtiva === 'empresa' && (
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dados da oficina</CardTitle>
                  <CardDescription>
                    Identidade operacional da sua oficina (não do sistema {APP_NAME}). Exibidos na
                    OS, PDF e recibo. Dados fiscais ficam na seção Fiscal. Logo e cores em Visual
                    do sistema.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  {podeVerTipoOficina && (
                    <div className="grid gap-2 sm:col-span-2 rounded-lg border border-border bg-muted/20 p-4">
                      <Label>Tipo de oficina</Label>
                      <p className="text-sm font-medium">
                        {labelTipoOficina(configuracao.tipo_oficina)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Para alterar o tipo da oficina, entre em contato com o suporte.
                      </p>
                    </div>
                  )}
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="nome-oficina">Nome da oficina</Label>
                    <Input
                      id="nome-oficina"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                    />
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
                    <Label htmlFor="cnpj">CNPJ / CPF</Label>
                    <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
                    <p className="text-xs text-muted-foreground">
                      Uso comercial/operacional. O CNPJ fiscal (com IE, regime etc.) fica em Fiscal.
                    </p>
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Horário de funcionamento</CardTitle>
                  <CardDescription>
                    Exibido em documentos e comunicações com o cliente
                  </CardDescription>
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
            </div>
          )}

          {secaoAtiva === 'fiscal' && (
            <FiscalOficinaSection configuracao={configuracao} onSalvar={salvarFiscal} />
          )}

          {secaoAtiva === 'visual' && (
            <div className="grid gap-6">
              <AparienciaMarcaSection configuracao={configuracao} onSalvar={salvarApariencia} />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Preferências de aparência</CardTitle>
                  <CardDescription>Tema e notificações do aplicativo</CardDescription>
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
                        Também ajustável em Aparência e Marca
                      </p>
                    </div>
                  </label>
                  <Button
                    onClick={salvarPreferencias}
                    className="w-fit"
                    disabled={salvandoPreferencias}
                  >
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
            </div>
          )}

          {secaoAtiva === 'equipe' && (
            <div className="grid gap-6">
              {podeAlterarPermissoesEquipe(session?.user) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Permissões da equipe
                    </CardTitle>
                    <CardDescription>
                      Defina o que gerente, recepção e mecânico podem acessar na oficina
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline">
                      <Link to="/configuracoes/permissoes">Gerenciar permissões</Link>
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
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">PIN de autorização</CardTitle>
                  <CardDescription>
                    PIN do dono/admin para autorizar ações restritas
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 max-w-md">
                  <div className="grid gap-2">
                    <Label htmlFor="pin-autorizacao">PIN de autorização do dono/admin</Label>
                    <Input
                      id="pin-autorizacao"
                      type="password"
                      inputMode="numeric"
                      value={pinAutorizacao}
                      onChange={(e) => setPinAutorizacao(e.target.value)}
                      placeholder="Ex.: 1234"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use este PIN apenas para autorizar ações restritas, como alterar valores ou
                      registrar pagamento. Não envie este PIN ao funcionário.
                    </p>
                    <Button
                      onClick={salvarPinAutorizacao}
                      className="w-fit"
                      disabled={salvandoPreferencias}
                    >
                      {salvandoPreferencias ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando…
                        </>
                      ) : (
                        'Salvar PIN'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {secaoAtiva === 'caixa' && podeAlterarPermissoesEquipe(session?.user) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Configurações do Caixa
                </CardTitle>
                <CardDescription>
                  Regras simples de operação. Caixa continua único por oficina.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-border"
                    checked={caixaConfig.exigir_caixa_aberto_pagamentos}
                    onChange={(e) =>
                      setCaixaConfig((c) => ({
                        ...c,
                        exigir_caixa_aberto_pagamentos: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    <span className="text-sm font-medium">
                      Exigir caixa aberto para registrar pagamentos
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Quando ativado, pagamentos de OS só podem ser registrados com caixa aberto.
                      Dono, admin ou gerente podem autorizar exceção com motivo.
                    </span>
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Para liberar a recepção na página Caixa, use{' '}
                  <Link to="/configuracoes/permissoes" className="underline underline-offset-2">
                    Permissões da equipe
                  </Link>
                  {' '}→ “Permitir acessar o caixa”.
                </p>
                <Button
                  type="button"
                  disabled={salvandoCaixaConfig}
                  onClick={() => {
                    void executarCaixaConfig({
                      acao: async () => {
                        await salvarConfiguracaoOficina({ caixa_config: caixaConfig }, true)
                      },
                      erro: MSG.erroSalvar,
                    })
                  }}
                >
                  {salvandoCaixaConfig ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    'Salvar configurações do caixa'
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {secaoAtiva === 'comunicacao' && (
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notificações</CardTitle>
                  <CardDescription>Alertas internos do aplicativo</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
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
                  <Button
                    onClick={salvarPreferencias}
                    className="w-fit"
                    disabled={salvandoPreferencias}
                  >
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
              {temRecurso('lembretes') && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bell className="h-4 w-4" />
                      Lembretes
                    </CardTitle>
                    <CardDescription>
                      Configure lembretes de retorno e revisões
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline">
                      <Link to="/lembretes">Abrir lembretes</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">WhatsApp</CardTitle>
                  <CardDescription>
                    O número de WhatsApp da oficina fica em Dados da empresa. Ajuste lá se
                    precisar.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button type="button" variant="outline" onClick={() => setSecaoAtiva('empresa')}>
                    Ir para Dados da empresa
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {secaoAtiva === 'codigo' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Código de acesso da oficina</CardTitle>
                <CardDescription>
                  Código que o funcionário usa junto com login e senha para acessar esta oficina
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 max-w-md">
                <div className="grid gap-1.5">
                  <Label htmlFor="codigo-acesso-oficina">Código de acesso</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="codigo-acesso-oficina"
                      className="min-w-0 flex-1 font-mono"
                      value={codigoAcessoInput}
                      onChange={(e) =>
                        setCodigoAcessoInput(normalizarCodigoAcessoOficina(e.target.value))
                      }
                      placeholder="ex.: texugo"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      title="Copiar código de acesso"
                      onClick={() => {
                        const codigo = normalizarCodigoAcessoOficina(codigoAcessoInput)
                        void navigator.clipboard.writeText(codigo).then(
                          () => toast.sucesso('Código de acesso copiado.'),
                          () => toast.erro('Não foi possível copiar o código.')
                        )
                      }}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copiar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0"
                      disabled={salvandoCodigoAcesso}
                      onClick={salvarCodigoAcessoOficina}
                    >
                      {salvandoCodigoAcesso ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Salvando…
                        </>
                      ) : (
                        'Salvar código'
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Este é o código de acesso da oficina (office_slug). Não envie senha nem PIN.
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Se você alterar este código, avise os funcionários. O código antigo deixará de
                    funcionar no próximo login.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {secaoAtiva === 'planos' && podeVerPlanos && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Plano atual
                </CardTitle>
                <CardDescription>
                  Plano: {getLabelPlano(plano)}. Recursos disponíveis e opções de upgrade.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link to="/planos">Ver plano e recursos</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {secaoAtiva === 'sistema' && (
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Preferências da OS</CardTitle>
                  <CardDescription>
                    Ajustes básicos do fluxo de ordens de serviço
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">Tipo de OS</p>
                      <AjudaTooltip
                        texto={`OS Simples: cliente, ${termos.palavraVeiculo}, serviços, peças/produtos, valores e pagamento. OS Completa: checklist, diagnóstico, fotos, orçamento, garantia e mais.`}
                      />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {(['simples', 'completa'] as ModoOS[]).map((modo) => (
                        <label
                          key={modo}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                        >
                          <input
                            type="radio"
                            name="os_modo"
                            checked={(preferencias.os_modo ?? 'completa') === modo}
                            onChange={() => setPreferencias({ ...preferencias, os_modo: modo })}
                            className="h-4 w-4"
                          />
                          {LABEL_MODO_OS[modo]}
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferencias.os_destaque_numero ?? true}
                      onChange={(e) =>
                        setPreferencias({
                          ...preferencias,
                          os_destaque_numero: e.target.checked,
                        })
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
                        setPreferencias({
                          ...preferencias,
                          os_sugerir_recibo: e.target.checked,
                        })
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
                        setPreferencias({
                          ...preferencias,
                          alerta_estoque_baixo: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-border"
                    />
                    <div>
                      <p className="text-sm font-medium">Alerta de estoque baixo</p>
                    </div>
                  </label>
                  <Button
                    onClick={salvarPreferencias}
                    className="w-fit"
                    disabled={salvandoPreferencias}
                  >
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

              <ModelosChecklistSection />

              <BackupSimplesCard />

              {modoSupabase && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Sincronização com o servidor
                    </CardTitle>
                    <CardDescription>
                      Recarrega configurações, alertas e histórico do Supabase quando os
                      dispositivos estiverem divergentes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={sincronizarAgora}
                      disabled={sincronizando}
                      className="gap-2"
                    >
                      {sincronizando ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sincronizando…
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          Sincronizar agora
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Aplicativo instalável</CardTitle>
                  <CardDescription>
                    Use o {APP_NAME} em janela própria no computador
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <BotaoInstalarApp variant="settings" />
                  <p className="text-xs text-muted-foreground">
                    Versão:{' '}
                    <span className="font-mono text-foreground">{formatarVersaoApp()}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Persistência: {modoSupabase ? 'Supabase' : 'Local'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
