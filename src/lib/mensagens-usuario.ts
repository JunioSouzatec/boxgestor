/** Mensagens amigáveis para o usuário final. Detalhes técnicos ficam no Diagnóstico ou no console (DEV). */
export const MSG = {
  salvo: 'Salvo com sucesso.',
  alterado: 'Alterado com sucesso.',
  excluido: 'Excluído com sucesso.',
  pagamentoRegistrado: 'Pagamento registrado com sucesso.',
  pagamentoNaoEnviadoServidor:
    'Este pagamento ainda não foi enviado ao servidor. Tentaremos sincronizar quando houver conexão.',
  osEPagamentoRegistrados: 'OS e pagamento salvos com sucesso.',
  osNaoSalvaPagamentoNaoRegistrado:
    'Não foi possível salvar a OS. O pagamento não foi registrado.',
  salvandoOs: 'Salvando OS…',
  registrandoPagamento: 'Registrando pagamento…',
  alteracoesNaoSalvasTitulo: 'Alterações não salvas',
  alteracoesNaoSalvasMensagem: 'Existem alterações não salvas. Deseja sair sem salvar?',
  continuarEditando: 'Continuar editando',
  sairSemSalvar: 'Sair sem salvar',
  osSalva: 'Ordem de Serviço salva com sucesso.',
  osAlterada: 'Ordem de Serviço alterada com sucesso.',
  servicoAdicionado: 'Serviço adicionado com sucesso.',
  servicoRemovido: 'Serviço removido com sucesso.',
  osTotalMenorQuePago:
    'O total da OS ficou menor que o valor já pago. Ajuste o valor da OS ou revise os pagamentos.',
  servicoDuplicadoTitulo: 'Serviço já adicionado',
  servicoDuplicadoMensagem: 'Este serviço já foi adicionado. Deseja adicionar novamente?',
  servicoDuplicadoConfirmar: 'Adicionar novamente',
  clienteSalvo: 'Cliente salvo com sucesso.',
  motoSalva: 'Moto salva com sucesso.',
  dadosSalvos: 'Dados salvos com sucesso.',
  erroSalvar: 'Não foi possível salvar. Tente novamente.',
  semConexao: 'Sem conexão. Salvamos localmente e sincronizaremos depois.',
  salveOsAntesPagamento: 'Salve a Ordem de Serviço antes de registrar pagamento.',
  sessaoExpirada: 'Sessão expirada. Entre novamente.',
  atencaoSync: 'Atenção: existem dados aguardando sincronização.',
  pagamentoCancelado: 'Pagamento cancelado.',
  pagamentoExcluido: 'Pagamento excluído com sucesso.',
  pagamentosDuplicadosReparados: 'Pagamentos duplicados reparados com sucesso.',
  osTotalmentePaga: 'Esta OS já está totalmente paga.',
  valorPagamentoInvalido: 'Informe um valor de pagamento válido.',
  valorUltrapassaSaldo: (restante: string) =>
    `O valor informado ultrapassa o saldo restante da OS. Valor restante: ${restante}.`,
  possivelDuplicidadePagamentoTitulo: 'Possível pagamento duplicado',
  possivelDuplicidadePagamentoMensagem:
    'Possível pagamento duplicado. Já existe um pagamento igual registrado para esta OS hoje. Deseja registrar mesmo assim?\n\nSe este pagamento é novo, clique em Registrar mesmo assim.',
  possivelDuplicidadeConfirmar: 'Registrar mesmo assim',
  itemAdicionado: 'Item adicionado com sucesso.',
  estoqueAtualizado: 'Estoque atualizado com sucesso.',
  estoqueInsuficiente: 'Estoque insuficiente para este item.',
  statusAlterado: 'Status alterado com sucesso.',
  acaoCancelada: 'Ação cancelada.',
  dadosTesteLimpos: 'Dados de teste limpos com sucesso.',
  planoAtualizado: 'Plano atualizado com sucesso.',
  planoOficinaAtualizado: 'Plano da oficina atualizado com sucesso.',
  solicitacaoUpgradeEnviada:
    'Solicitação enviada com sucesso. O suporte entrará em contato para confirmar o plano.',
  aguardandoConfirmacaoSuporte: 'Aguardando confirmação do suporte.',
  solicitacaoAprovada: 'Solicitação aprovada.',
  solicitacaoRecusada: 'Solicitação recusada.',
  planoAtualLabel: (nome: string) => `Seu plano atual é ${nome}.`,
  usuarioAtualizado: 'Usuário atualizado com sucesso.',
  convitePreparado: 'Convite preparado com sucesso.',
  linkCopiado: 'Link copiado.',
  conviteCancelado: 'Convite cancelado.',
  conviteEnviarManualmente:
    'Envie o link manualmente para o funcionário. O envio automático de e-mail será ativado futuramente.',
  conviteSmtpFuturo: 'Envio automático de convite por e-mail será configurado na versão online.',
  conviteSupabasePendente:
    'No modo online, a criação automática de conta via Supabase Auth será ativada em breve. Use o modo local para testar o fluxo completo.',
  conviteContaCriadaConfirmarEmail: 'Conta criada. Confirme seu e-mail para entrar.',
  conviteAceito: 'Convite aceito com sucesso.',
  conviteEntrouOficina: 'Você entrou na oficina com sucesso.',
  conviteEmailDiferente:
    'Este convite pertence a outro e-mail. Saia da conta atual e entre com o e-mail convidado.',
  conviteIndisponivel: 'Este convite não está mais disponível.',
  testeExpiradoCurto: 'Seu teste terminou. Escolha um plano para continuar.',
  testePremiumEncerrado: 'Seu Teste Premium terminou.',
  testePremiumEscolherPlano: 'Escolha um plano para continuar usando o BoxGestor.',
  testePremiumDadosSalvos: 'Seus dados permanecem salvos após o teste.',
  testePremiumComece: 'Comece testando o BoxGestor completo.',
  testePremiumDepoisPlano: 'Depois escolha o plano ideal para sua oficina.',
  limitePlano: 'Limite do plano atingido.',
  semPermissaoArea: 'Você não tem permissão para acessar esta área.',
  recursoPlanoSuperior: 'Este recurso está disponível em um plano superior.',
  recursoPlanoProfissional: 'Recurso disponível no Plano Profissional.',
  solicitarUpgradeRecurso: 'Solicite upgrade para liberar este recurso.',
  cadastroConfirmarEmail:
    'Conta criada. Confirme seu e-mail para acessar o BoxGestor.',
  cadastroBeneficioOrganizacao:
    'Organize clientes, motos, ordens de serviço, estoque, financeiro e relatórios em um só lugar.',
  cadastroBeneficioPremium: 'Teste todos os recursos Premium por 7 dias.',
  cadastroSemCartao: 'Não precisa cartão para começar.',
  /** @deprecated */
  limitePlanoFree: 'Limite do plano atingido.',
  /** @deprecated */
  recursoPremium: 'Este recurso está disponível em um plano superior.',
} as const

const TERMOS_TECNICOS = [
  'supabase',
  'office_id',
  'customer_id',
  'motorcycle_id',
  'service_order',
  'rls',
  'foreign key',
  'payload',
  'uuid',
  'sincroniz',
  'fallback',
  'financial_transaction',
  'pendente de sincronização',
  'política de segurança',
  'postgres',
  '23503',
  '23514',
  'pgrst',
  'duplicidade evitada',
  'violates',
  'permission denied',
]

export function ehMensagemTecnica(msg: string): boolean {
  const lower = msg.toLowerCase()
  return TERMOS_TECNICOS.some((termo) => lower.includes(termo))
}

/** Converte mensagem bruta em texto seguro para toast/banner. */
export function mensagemAmigavel(
  msg: string | null | undefined,
  fallback: string
): string {
  if (!msg?.trim()) return fallback
  if (ehMensagemTecnica(msg)) return fallback
  return msg.trim()
}

export function mensagemErroSalvar(err: unknown, fallback = MSG.erroSalvar): string {
  if (err instanceof Error) {
    const lower = err.message.toLowerCase()
    if (lower.includes('sessão expirada') || lower.includes('sessao expirada')) {
      return MSG.sessaoExpirada
    }
    if (
      lower.includes('sem conexão') ||
      lower.includes('sem internet') ||
      lower.includes('offline') ||
      lower.includes('network') ||
      lower.includes('fetch')
    ) {
      return MSG.semConexao
    }
    if (!ehMensagemTecnica(err.message)) return err.message
  }
  return fallback
}

export function mensagemAvisoPersistencia(
  eventType: string,
  mensagemEvento?: string,
  escopo?: string
): string {
  if (eventType === 'offline') return MSG.semConexao
  if (eventType === 'fallback') {
    const lower = mensagemEvento?.toLowerCase() ?? ''
    if (
      lower.includes('internet') ||
      lower.includes('conexão') ||
      lower.includes('offline') ||
      lower.includes('sem conexão')
    ) {
      return MSG.semConexao
    }
    if (escopo === 'os' || escopo === 'pagamento') return MSG.atencaoSync
    return MSG.semConexao
  }
  if (eventType === 'pagamentos_pendentes') return MSG.atencaoSync
  if (eventType === 'pagamento_ok') return MSG.pagamentoRegistrado
  return mensagemAmigavel(mensagemEvento, MSG.atencaoSync)
}

export function logDetalheTecnicoDev(contexto: string, detalhe: unknown): void {
  if (!import.meta.env.DEV) return
  console.info(`[Craft ${contexto}]`, detalhe)
}
