/**
 * Conteúdo comercial do site BoxGestor (preview).
 * Fonte de verdade de recursos = código real do produto.
 * Preços comerciais desta página seguem a especificação do site (não alteram plano.ts do app).
 */

export const LANDING_BASE = '/landing-preview'

export const LANDING_BRAND = {
  name: 'BOXGESTOR',
  slogan: 'Sua oficina. Sob controle.',
  title: 'BoxGestor | Sistema de Gestão para Oficinas',
  description:
    'Organize clientes, veículos, orçamentos, ordens de serviço, estoque, agenda e financeiro com o BoxGestor.',
} as const

/** Coloque o arquivo oficial em public/landing/ e aponte o caminho aqui. */
export const LANDING_LOGO_SRC: string | null = null
// Exemplos quando o asset oficial existir:
// export const LANDING_LOGO_SRC = '/landing/logo-boxgestor.svg'

export const LANDING_LINKS = {
  entrar: '/login',
  testar: '/cadastro',
  suporteEmail: 'suporte@boxgestor.com.br',
  /** Preencher quando houver número oficial. Enquanto vazio, CTA leva ao contato. */
  whatsappNumero: '' as string,
  instagram: '' as string,
  facebook: '' as string,
} as const

export const NAV_ITEMS = [
  { label: 'Recursos', to: `${LANDING_BASE}/recursos` },
  { label: 'Como funciona', to: `${LANDING_BASE}/como-funciona` },
  { label: 'Planos', to: `${LANDING_BASE}/planos` },
  { label: 'Sobre', to: `${LANDING_BASE}/sobre` },
  { label: 'Contato', to: `${LANDING_BASE}/contato` },
] as const

export const HERO = {
  titulo: 'Gestão completa para sua oficina, em um só lugar.',
  texto:
    'Organize clientes, veículos, orçamentos, ordens de serviço, estoque, agenda e financeiro com mais agilidade e controle.',
  destaques: ['Fácil de usar', 'Acesso pelo computador e celular', 'Feito para oficinas'] as const,
}

export const PROBLEMAS = [
  'Informações espalhadas em cadernos, planilhas e mensagens',
  'Processos manuais que atrasam o atendimento',
  'Financeiro desorganizado e difícil de acompanhar',
  'Agenda sem visão clara do dia',
  'Estoque sem controle de entradas e saídas',
] as const

export const SOLUCAO_FECHAMENTO =
  'Menos papelada, mais organização e mais controle para sua oficina.'

export const RECURSOS_PRINCIPAIS = [
  {
    id: 'patio',
    titulo: 'Pátio',
    descricao: 'Acompanhe o status das OS e a operação do dia em uma visão visual.',
  },
  {
    id: 'orcamentos-os',
    titulo: 'Orçamentos e OS',
    descricao: 'Crie orçamentos, aprove por link e converta em ordem de serviço.',
  },
  {
    id: 'agenda',
    titulo: 'Agenda',
    descricao: 'Organize compromissos e a rotina da oficina em um só lugar.',
  },
  {
    id: 'clientes-veiculos',
    titulo: 'Clientes e Veículos',
    descricao: 'Histórico de clientes e veículos centralizado para consultas rápidas.',
  },
  {
    id: 'estoque',
    titulo: 'Estoque',
    descricao: 'Controle peças, fornecedores, entradas, saídas e movimentações.',
  },
  {
    id: 'financeiro',
    titulo: 'Financeiro',
    descricao: 'Caixa, pagamentos, recibos e visão financeira da operação.',
  },
  {
    id: 'comunicacao',
    titulo: 'Comunicação',
    descricao:
      'O BoxGestor prepara as informações para você abrir o WhatsApp e enviar ao cliente.',
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    descricao: 'Acompanhe resultados e indicadores da oficina com relatórios do sistema.',
  },
] as const

export const DIFERENCIAIS = [
  {
    titulo: 'Orçamento → aprovação → OS',
    descricao: 'Fluxo contínuo da proposta até a ordem de serviço.',
  },
  {
    titulo: 'Aprovação por link',
    descricao: 'Cliente aprova o orçamento pelo celular, sem precisar de login.',
  },
  {
    titulo: 'Aprovação parcial',
    descricao: 'Permite aprovar só o que o cliente autorizar.',
  },
  {
    titulo: 'Histórico de clientes e veículos',
    descricao: 'Consulta rápida do que já foi feito em cada atendimento.',
  },
  {
    titulo: 'Fotos na OS',
    descricao: 'Registre imagens privadas vinculadas à ordem de serviço.',
  },
  {
    titulo: 'Checklist',
    descricao: 'Padronize conferências e etapas do serviço.',
  },
  {
    titulo: 'Estoque integrado',
    descricao: 'Peças e movimentações ligadas à operação da oficina.',
  },
  {
    titulo: 'Caixa e financeiro',
    descricao: 'Controle entradas, pagamentos e a rotina financeira.',
  },
  {
    titulo: 'Equipe e PIN',
    descricao: 'Controle de acesso da equipe conforme recursos do plano.',
  },
  {
    titulo: 'Compartilhar pelo WhatsApp',
    descricao:
      'Compartilhe pelo WhatsApp de forma simples e prática — o envio é feito por você.',
  },
  {
    titulo: 'Computador e celular',
    descricao: 'Use no navegador, no PC ou no celular, com experiência responsiva.',
  },
] as const

export const COMO_FUNCIONA_PASSOS = [
  {
    passo: 1,
    titulo: 'Cadastre sua oficina',
    descricao: 'Crie sua conta e configure os dados básicos para começar.',
  },
  {
    passo: 2,
    titulo: 'Organize clientes, veículos e operação',
    descricao: 'Centralize cadastros e a rotina do dia a dia.',
  },
  {
    passo: 3,
    titulo: 'Crie orçamentos e OS',
    descricao: 'Monte propostas, envie para aprovação e abra ordens de serviço.',
  },
  {
    passo: 4,
    titulo: 'Controle o andamento e resultados',
    descricao: 'Acompanhe pátio, estoque, caixa e o histórico dos atendimentos.',
  },
] as const

export const FLUXO_ROTINA = [
  'Cliente',
  'Veículo',
  'Orçamento',
  'Aprovação',
  'OS',
  'Peças e serviços',
  'Pagamento',
  'Histórico',
] as const

export type StatusRecurso = 'disponivel' | 'em_desenvolvimento' | 'adicional' | 'futuro'

export const RECURSOS_DETALHADOS: Array<{
  id: string
  titulo: string
  descricao: string
  status: StatusRecurso
}> = [
  {
    id: 'patio',
    titulo: 'Pátio',
    descricao: 'Visão operacional das OS e andamento do dia.',
    status: 'disponivel',
  },
  {
    id: 'clientes-veiculos',
    titulo: 'Clientes e Veículos',
    descricao: 'Cadastro, histórico e consulta rápida.',
    status: 'disponivel',
  },
  {
    id: 'orcamentos',
    titulo: 'Orçamentos',
    descricao: 'Criação, PDF e aprovação pública por link (total, parcial ou recusa).',
    status: 'disponivel',
  },
  {
    id: 'os',
    titulo: 'Ordens de serviço',
    descricao: 'Conversão orçamento → OS, checklist, fotos, PDF e acompanhamento.',
    status: 'disponivel',
  },
  {
    id: 'agenda',
    titulo: 'Agenda',
    descricao: 'Organização de compromissos da oficina.',
    status: 'disponivel',
  },
  {
    id: 'estoque',
    titulo: 'Estoque',
    descricao: 'Peças, fornecedores, entradas, saídas e movimentações (sem compras automáticas).',
    status: 'disponivel',
  },
  {
    id: 'financeiro',
    titulo: 'Financeiro e caixa',
    descricao: 'Caixa, pagamentos, recibos e controle financeiro.',
    status: 'disponivel',
  },
  {
    id: 'comunicacao',
    titulo: 'Comunicação',
    descricao:
      'Prepara mensagem, link ou PDF para você abrir o WhatsApp e enviar. Sem envio automático.',
    status: 'disponivel',
  },
  {
    id: 'equipe',
    titulo: 'Equipe',
    descricao: 'Usuários, permissões e PIN conforme o plano.',
    status: 'disponivel',
  },
  {
    id: 'comissoes',
    titulo: 'Comissões',
    descricao: 'Controle de comissões da equipe nos planos com o recurso ativo.',
    status: 'disponivel',
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    descricao: 'Relatórios e painéis já existentes no sistema.',
    status: 'disponivel',
  },
  {
    id: 'portal',
    titulo: 'Portal do Cliente',
    descricao:
      'Hoje: aprovação pública de orçamento por link. Acompanhamento completo ainda em desenvolvimento.',
    status: 'em_desenvolvimento',
  },
  {
    id: 'fiscal',
    titulo: 'Módulo Fiscal',
    descricao:
      'Adicional para qualquer plano. Em desenvolvimento: preparação e estrutura para NF-e, NFS-e e NFC-e quando aplicável.',
    status: 'adicional',
  },
]

export const PLANOS = [
  {
    id: 'essencial',
    nome: 'Essencial',
    preco: 127,
    usuariosInclusos: 1,
    usuarioExtra: 59,
    destaque: false,
    badge: null as string | null,
    descricao: 'Para operar uma oficina pequena de ponta a ponta.',
    itens: [
      'Clientes e veículos',
      'Pátio e agenda',
      'Orçamentos e aprovação por link',
      'OS e conversão orçamento → OS',
      'Checklist e fotos',
      'Estoque básico',
      'Caixa, pagamentos e recibos',
      'PDFs',
      'Comunicação básica (WhatsApp manual)',
    ],
  },
  {
    id: 'profissional',
    nome: 'Profissional',
    preco: 247,
    usuariosInclusos: 3,
    usuarioExtra: 69,
    destaque: true,
    badge: 'Mais escolhido',
    descricao: 'Tudo do Essencial, com mais equipe e profundidade operacional.',
    itens: [
      'Tudo do Essencial',
      '3 usuários incluídos',
      'Aprovação parcial',
      'Fornecedores e estoque avançado',
      'Financeiro completo',
      'Equipe, permissões e PIN',
      'Comissões',
      'Relatórios completos',
      'Histórico de ações (quando disponível no sistema)',
      'Portal do Cliente quando concluído',
    ],
  },
  {
    id: 'premium',
    nome: 'Premium',
    preco: 397,
    usuariosInclusos: 6,
    usuarioExtra: 79,
    destaque: false,
    badge: null as string | null,
    descricao: 'Para oficinas que querem mais visão gerencial.',
    itens: [
      'Tudo do Profissional',
      '6 usuários incluídos',
      'Painéis e relatórios gerenciais já disponíveis no sistema',
      'Visão de produtividade e indicadores existentes',
    ],
    itensFuturos: [
      'Metas e comparativos avançados (em evolução)',
      'Indicadores gerenciais adicionais conforme forem liberados',
    ],
  },
] as const

export const MODULO_FISCAL = {
  titulo: 'Módulo Fiscal',
  subtitulo: 'Adicional para qualquer plano',
  status: 'Em desenvolvimento',
  precoLabel: 'Sob consulta / contratação adicional',
  descricao:
    'Não faz parte de um plano específico. Pode ser contratado à parte quando a emissão estiver pronta.',
  objetivos: [
    'NF-e, NFS-e e NFC-e quando aplicável',
    'XML e documentos (DANFE e correlatos)',
    'Cancelamento, devolução/garantia e carta de correção/inutilização quando aplicável',
    'Integração com OS, estoque e clientes',
  ],
  avisos: [
    'Ainda em desenvolvimento — não anunciar como emissão pronta.',
    'Custos externos (certificado, contador, provedor e impostos) não estão inclusos no BoxGestor.',
  ],
} as const

export const FAQ_ITENS = [
  {
    pergunta: 'Qual plano escolher?',
    resposta:
      'O Essencial cobre a operação completa de uma oficina pequena. O Profissional adiciona equipe e recursos avançados. O Premium amplia capacidade de usuários e visão gerencial já disponível no sistema.',
  },
  {
    pergunta: 'Posso adicionar usuários?',
    resposta:
      'Sim. Cada plano inclui uma quantidade de usuários e permite contratar usuários adicionais mensalmente.',
  },
  {
    pergunta: 'O BoxGestor funciona no celular?',
    resposta:
      'Sim. O sistema é responsivo e pode ser usado no computador e no celular pelo navegador, inclusive como PWA.',
  },
  {
    pergunta: 'Preciso instalar alguma coisa?',
    resposta:
      'Não é obrigatório. Você acessa pelo navegador. Se quiser, também pode instalar como aplicativo (PWA).',
  },
  {
    pergunta: 'Como funciona o teste de 15 dias?',
    resposta:
      'Você cria sua conta e testa o BoxGestor por 15 dias. Neste fluxo de cadastro não pedimos cartão de crédito.',
  },
  {
    pergunta: 'Como funciona o suporte?',
    resposta:
      'Oferecemos suporte humanizado, com atendimento direto para ajudar sua oficina. O atendimento acontece em horários específicos, incluindo período noturno e finais de semana. Consulte os horários disponíveis.',
  },
  {
    pergunta: 'Posso cancelar?',
    resposta:
      'Sim. Você pode encerrar o uso conforme a política comercial vigente no momento da contratação.',
  },
  {
    pergunta: 'Como funciona o Fiscal?',
    resposta:
      'O Módulo Fiscal é adicional para qualquer plano e está em desenvolvimento. Não afirmamos emissão homologada ou conformidade total enquanto a integração não estiver pronta.',
  },
  {
    pergunta: 'Como funciona o Portal do Cliente?',
    resposta:
      'Hoje o cliente já pode aprovar, aprovar parcialmente ou recusar orçamentos por link público. O portal completo de acompanhamento ainda está em desenvolvimento.',
  },
  {
    pergunta: 'Como funciona o WhatsApp?',
    resposta:
      'O BoxGestor prepara mensagem, link ou PDF e abre o WhatsApp para você enviar. Não há envio automático, bot ou API oficial de WhatsApp nesta fase.',
  },
] as const

export const SOBRE = {
  titulo: 'Sobre o BoxGestor',
  texto:
    'O BoxGestor foi criado para facilitar a rotina de oficinas brasileiras, centralizando gestão e operação em um único sistema.',
  posicionamento: 'Mais controle. Mais eficiência. Mais resultados.',
  pilares: ['Prático', 'Objetivo', 'Completo', 'Profissional', 'Feito para a rotina da oficina'] as const,
}

export const SEGURANCA = {
  titulo: 'Segurança e acesso',
  itens: [
    'Autenticação segura',
    'Controle de acesso',
    'Dados armazenados em infraestrutura moderna',
    'Boas práticas de segurança',
    'Fotos privadas quando aplicável',
    'Acesso protegido',
  ] as const,
}

export const CTA_FINAL = {
  titulo: 'Pronto para transformar a gestão da sua oficina?',
  texto:
    'Teste o BoxGestor gratuitamente por 15 dias e descubra na prática como é ter tudo sob controle.',
  botao: 'Teste grátis por 15 dias',
}
