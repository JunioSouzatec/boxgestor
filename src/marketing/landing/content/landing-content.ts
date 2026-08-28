/**
 * Conteúdo comercial do site BoxGestor (preview).
 * Fonte de verdade de recursos = código real do produto.
 * Preços da landing refletem `src/types/plano.ts` (não alteram o app).
 */

import {
  MAX_USUARIOS_POR_PLANO,
  PRECO_USUARIO_EXTRA_POR_PLANO,
} from '@/types/plano'

export const LANDING_BASE = '/landing-preview'

export const LANDING_BRAND = {
  name: 'BOXGESTOR',
  slogan: 'Sua oficina. Sob controle.',
  title: 'BoxGestor | Sistema de Gestão para Oficinas',
  description:
    'Organize clientes, veículos, orçamentos, ordens de serviço, estoque, agenda e financeiro com o BoxGestor.',
} as const

/** Logo oficial (crop sem alterar a arte). */
export const LANDING_LOGO_SRC: string | null = '/landing/logo-boxgestor.png'

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
  tituloAntes: 'Gestão completa para sua oficina, em um',
  tituloDestaque: 'só lugar.',
  texto:
    'Organize clientes, veículos, orçamentos, ordens de serviço, estoque, agenda e financeiro com mais agilidade e controle.',
  destaques: [
    'Fácil de usar',
    'Acesso pelo celular e computador',
    'Feito para oficinas',
  ] as const,
}

export const BENEFICIOS_HOME = [
  {
    titulo: 'Mais organização',
    descricao: 'Tenha as informações da sua oficina em um só lugar.',
  },
  {
    titulo: 'Mais agilidade',
    descricao: 'Ganhe tempo no atendimento e na execução dos serviços.',
  },
  {
    titulo: 'Mais controle',
    descricao: 'Acompanhe indicadores e tome decisões com mais clareza.',
  },
  {
    titulo: 'Mais visão da operação',
    descricao: 'Veja o andamento do dia a dia sem depender de planilhas soltas.',
  },
] as const

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
    titulo: 'Organize sua operação',
    descricao: 'Centralize clientes, veículos, estoque e a rotina do dia.',
  },
  {
    passo: 3,
    titulo: 'Crie orçamentos e OS',
    descricao: 'Monte propostas, envie para aprovação e abra ordens de serviço.',
  },
  {
    passo: 4,
    titulo: 'Controle sua oficina',
    descricao: 'Acompanhe pátio, financeiro e resultados em um só sistema.',
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
    titulo: 'Clientes e veículos',
    descricao: 'Cadastro, histórico e consulta rápida.',
    status: 'disponivel',
  },
  {
    id: 'orcamentos',
    titulo: 'Orçamentos',
    descricao: 'Criação, PDF e aprovação pública por link.',
    status: 'disponivel',
  },
  {
    id: 'aprovacao',
    titulo: 'Aprovação por link',
    descricao: 'Aprovação, aprovação parcial ou recusa pelo celular do cliente.',
    status: 'disponivel',
  },
  {
    id: 'os',
    titulo: 'Ordens de serviço',
    descricao: 'Conversão orçamento → OS, checklist, fotos e PDF.',
    status: 'disponivel',
  },
  {
    id: 'fotos-checklist',
    titulo: 'Fotos e checklist',
    descricao: 'Registros visuais e conferências padronizadas na OS.',
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
    descricao: 'Peças, fornecedores, entradas, saídas e movimentações.',
    status: 'disponivel',
  },
  {
    id: 'financeiro',
    titulo: 'Caixa e financeiro',
    descricao: 'Caixa, pagamentos, recibos e controle financeiro.',
    status: 'disponivel',
  },
  {
    id: 'equipe',
    titulo: 'Equipe e comissões',
    descricao: 'Usuários, permissões, PIN e comissões conforme o plano.',
    status: 'disponivel',
  },
  {
    id: 'comunicacao',
    titulo: 'Comunicação',
    descricao:
      'Mensagens e PDFs preparados para você abrir o WhatsApp e enviar. Sem envio automático.',
    status: 'disponivel',
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    descricao:
      'Faturamento, ticket médio, operação e exportação CSV/PDF já disponíveis no sistema.',
    status: 'disponivel',
  },
  {
    id: 'portal',
    titulo: 'Portal do Cliente',
    descricao:
      'Hoje: aprovação pública de orçamento. Acompanhamento completo ainda em desenvolvimento.',
    status: 'em_desenvolvimento',
  },
  {
    id: 'fiscal',
    titulo: 'Módulo Fiscal',
    descricao:
      'Adicional para qualquer plano. Em desenvolvimento — prévia conceitual, sem emissão pronta.',
    status: 'adicional',
  },
]

export const PLANOS = [
  {
    id: 'essencial' as const,
    tone: 'essential' as const,
    nome: 'Essencial',
    preco: 127,
    usuariosInclusos: MAX_USUARIOS_POR_PLANO.essential,
    usuarioExtra: PRECO_USUARIO_EXTRA_POR_PLANO.essential,
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
      'Mensagens prontas para envio manual pelo WhatsApp',
    ],
  },
  {
    id: 'profissional' as const,
    tone: 'professional' as const,
    nome: 'Profissional',
    preco: 247,
    usuariosInclusos: MAX_USUARIOS_POR_PLANO.professional,
    usuarioExtra: PRECO_USUARIO_EXTRA_POR_PLANO.professional,
    destaque: true,
    badge: 'Mais escolhido',
    descricao: 'Tudo do Essencial, com mais equipe e profundidade operacional.',
    itens: [
      'Tudo do Essencial',
      `${MAX_USUARIOS_POR_PLANO.professional} usuários incluídos`,
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
    id: 'premium' as const,
    tone: 'premium' as const,
    nome: 'Premium',
    preco: 397,
    usuariosInclusos: MAX_USUARIOS_POR_PLANO.premium,
    usuarioExtra: PRECO_USUARIO_EXTRA_POR_PLANO.premium,
    destaque: false,
    badge: null as string | null,
    descricao: 'Para oficinas que querem mais visão gerencial.',
    itens: [
      'Tudo do Profissional',
      `${MAX_USUARIOS_POR_PLANO.premium} usuários incluídos`,
      'Painéis e relatórios gerenciais já disponíveis',
      'Visão de indicadores existentes no sistema',
    ],
    itensFuturos: [
      'Metas e comparativos avançados (em evolução)',
      'Indicadores adicionais conforme forem liberados',
    ],
  },
]

export const MODULO_FISCAL = {
  titulo: 'Módulo Fiscal',
  subtitulo: 'Adicional para qualquer plano',
  status: 'Em desenvolvimento',
  precoLabel: null as string | null,
  descricao:
    'Estamos desenvolvendo o módulo Fiscal do BoxGestor para integrar a rotina fiscal à operação. Prévia conceitual — sem emissão pronta e sem cálculo automático de impostos nesta fase.',
  objetivos: [
    'Emissão de NF-e e NFC-e quando aplicável',
    'Importação e gestão de XML',
    'Relatórios fiscais',
    'Conformidade e segurança (em evolução)',
  ],
  avisos: [
    'Ainda em desenvolvimento — não anunciar como emissão pronta.',
    'Custos externos (certificado, contador, provedor e impostos) não estão inclusos.',
  ],
} as const

export const COMUNICACAO_SECAO = {
  titulo: 'Comunique-se melhor, tenha mais resultados.',
  texto:
    'O BoxGestor prepara mensagem, link e PDF para você abrir o WhatsApp e enviar ao cliente — de forma simples e profissional.',
  itens: [
    'Mensagens prontas e personalizadas',
    'Compartilhamento pelo WhatsApp',
    'Orçamentos e informações preparados para envio',
    'Comunicação organizada na rotina da oficina',
  ] as const,
}

export const RELATORIOS_SECAO = {
  titulo: 'Informações que geram decisões.',
  texto:
    'Visualize informações importantes da operação e consulte dados de diferentes áreas em um só lugar.',
  destaques: [
    {
      icone: 'chart' as const,
      titulo: 'Relatórios completos',
      descricao: 'Financeiro, OS, estoque e operação em painéis do sistema.',
    },
    {
      icone: 'chart' as const,
      titulo: 'Indicadores claros',
      descricao: 'Faturamento, ticket médio, lucro estimado e visão do período.',
    },
    {
      icone: 'filter' as const,
      titulo: 'Filtros por período',
      descricao: 'Consulte o intervalo que importa para a rotina da oficina.',
    },
    {
      icone: 'pdf' as const,
      titulo: 'Exportação CSV e PDF',
      descricao: 'Baixe relatórios para compartilhar ou arquivar.',
    },
  ],
  kpisExemplo: [
    { label: 'Faturamento', valor: '—' },
    { label: 'Lucro estimado', valor: '—' },
    { label: 'OS no período', valor: '—' },
    { label: 'Ticket médio', valor: '—' },
  ],
  pilares: [
    'Mais clareza',
    'Mais controle',
    'Decisões melhores',
    'Fácil de consultar',
  ] as const,
  itens: [
    'Faturamento e resultados do período',
    'Ticket médio e indicadores de OS',
    'Exportação CSV e PDF',
    'Visão de estoque e operação',
  ] as const,
}

export const PORTAL_SECAO = {
  titulo: 'Portal do Cliente',
  status: 'Em desenvolvimento',
  texto:
    'Hoje o cliente já aprova orçamentos por link. Estamos preparando um portal mais completo para acompanhamento — ainda em desenvolvimento.',
  disponivelHoje: [
    'Aprovação de orçamento por link',
    'Aprovação total',
    'Aprovação parcial',
    'Recusa',
  ] as const,
  emDesenvolvimento: [
    'Acompanhamento mais completo da OS',
    'Histórico ampliado para o cliente',
    'Status e informações do serviço',
    'Fotos públicas e demais recursos do portal',
  ] as const,
  pilares: [
    'Mais transparência',
    'Mais confiança',
    'Mais organização',
    'Mais satisfação',
  ] as const,
}

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
    pergunta: 'Funciona no celular?',
    resposta:
      'Sim. O sistema é responsivo e pode ser usado no computador e no celular pelo navegador, inclusive como PWA.',
  },
  {
    pergunta: 'Preciso instalar?',
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
    pergunta: 'Como funciona o WhatsApp?',
    resposta:
      'O BoxGestor prepara mensagem, link ou PDF e abre o WhatsApp para você enviar. Não há envio automático, bot ou API oficial de WhatsApp nesta fase.',
  },
  {
    pergunta: 'Como funcionará o Fiscal?',
    resposta:
      'O Módulo Fiscal é adicional para qualquer plano e está em desenvolvimento. Não afirmamos emissão homologada ou conformidade total enquanto a integração não estiver pronta.',
  },
  {
    pergunta: 'Como funcionará o Portal do Cliente?',
    resposta:
      'Hoje o cliente já pode aprovar, aprovar parcialmente ou recusar orçamentos por link público. O portal completo de acompanhamento ainda está em desenvolvimento.',
  },
] as const

export const SOBRE = {
  titulo: 'Sobre o BoxGestor',
  texto:
    'O BoxGestor foi criado para facilitar a gestão de oficinas, reunindo operação e administração em um único sistema.',
  posicionamento: 'Mais controle. Mais eficiência. Mais resultados.',
  escolha: 'A escolha certa para oficinas que querem crescer.',
  pilares: [
    'Organização',
    'Controle',
    'Praticidade',
    'Evolução constante',
    'Proximidade com a rotina da oficina',
  ] as const,
}

export const SEGURANCA = {
  titulo: 'Segurança e acesso',
  itens: [
    'Autenticação segura',
    'Controle de acesso',
    'Dados armazenados em infraestrutura moderna',
    'Projetado com foco em segurança e separação dos dados por oficina',
    'Fotos privadas quando aplicável',
    'Acesso protegido',
  ] as const,
}

export const CTA_FINAL = {
  titulo: 'Pronto para transformar a gestão da sua oficina?',
  texto:
    'Teste o BoxGestor gratuitamente por 15 dias e descubra na prática como é ter sua oficina mais organizada e sob controle.',
  botao: 'Teste grátis por 15 dias',
}
