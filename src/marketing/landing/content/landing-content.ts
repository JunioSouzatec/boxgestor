/**
 * Conteúdo comercial do site BoxGestor (preview).
 * Fonte de verdade de recursos = código real do produto.
 * Preços da landing refletem `src/types/plano.ts` (não alteram o app).
 */

import {
  MAX_USUARIOS_POR_PLANO,
  PRECO_USUARIO_EXTRA_POR_PLANO,
} from '@/types/plano'
import {
  getLandingBase,
  getLandingHomePath,
  isLandingPreviewMode,
  landingPath,
} from '@/marketing/landing/lib/landing-host'

/** @deprecated Prefira `getLandingBase()` / `landingPath()` (host-aware). */
export const LANDING_BASE = '/landing-preview'

/** @deprecated Prefira `isLandingPreviewMode()`. */
export const LANDING_IS_PREVIEW = true

export { getLandingBase, getLandingHomePath, isLandingPreviewMode, landingPath }

export const LANDING_BRAND = {
  name: 'BOXGESTOR',
  slogan: 'Sua oficina. Sob controle.',
  title: 'BoxGestor | Sistema de Gestão para Oficinas',
  description:
    'Sistema de gestão para oficinas mecânicas: organize clientes, veículos, orçamentos, OS, estoque, agenda e financeiro com o BoxGestor.',
  dominio: 'useboxgestor.com.br',
} as const

/** Logo oficial (crop sem alterar a arte). */
export const LANDING_LOGO_SRC: string | null = '/landing/logo-boxgestor.png'

/** Paths relativos do app (hosts do sistema / preview). No apex, CTAs usam APP_PUBLIC_ORIGIN. */
export const LANDING_LINKS = {
  entrar: '/login',
  testar: '/cadastro',
  suporteEmail: 'contato@useboxgestor.com.br',
  whatsappNumero: '5538997290857',
  instagram: '' as string,
  facebook: '' as string,
} as const

const NAV_LABELS = [
  { label: 'Recursos', segment: 'recursos' },
  { label: 'Como funciona', segment: 'como-funciona' },
  { label: 'Planos', segment: 'planos' },
  { label: 'Sobre', segment: 'sobre' },
  { label: 'Contato', segment: 'contato' },
] as const

/** Itens de navegação com paths corretos para o hostname atual. */
export function getNavItems(): { label: string; to: string }[] {
  return NAV_LABELS.map((item) => ({
    label: item.label,
    to: landingPath(item.segment),
  }))
}

export const HERO = {
  tituloAntes: 'Organização e controle para oficinas de diferentes portes, em um',
  tituloDestaque: 'só lugar.',
  texto:
    'Organize clientes, veículos, orçamentos, ordens de serviço, estoque, agenda e financeiro com mais agilidade em um só lugar.',
  destaques: [
    'Fácil de usar',
    'Acesso pelo celular e computador',
    'Feito para oficinas de todos os portes',
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
      'Mensagens prontas para atendimento e links/PDFs para compartilhar — envio manual pelo WhatsApp.',
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
    titulo: 'Cadastre cliente e veículo',
    descricao: 'Centralize os dados de quem chega na oficina e do veículo em atendimento.',
  },
  {
    passo: 2,
    titulo: 'Abra OS ou orçamento',
    descricao: 'Monte a proposta, envie para aprovação por link e converta em ordem de serviço.',
  },
  {
    passo: 3,
    titulo: 'Acompanhe pátio e serviços',
    descricao: 'Veja o andamento do dia, peças, checklist e fotos na rotina da oficina.',
  },
  {
    passo: 4,
    titulo: 'Controle pagamento e comunicação',
    descricao:
      'Registre pagamentos, compartilhe links e PDFs e envie mensagens manualmente pelo WhatsApp.',
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
      'Mensagens, links e PDFs preparados para envio manual pelo WhatsApp. Sem envio automático.',
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
      'Adicional — em preparação. Sem emissão de nota fiscal nesta fase; vendido separadamente quando disponível.',
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
    descricao: 'Para operar a oficina de ponta a ponta.',
    itens: [
      'Clientes e veículos',
      'Pátio e agenda',
      'Orçamentos e aprovação por link',
      'OS e conversão orçamento → OS',
      'Checklist e fotos',
      'Estoque básico',
      'Caixa, pagamentos e recibos',
      'PDFs',
      'Envio manual pelo WhatsApp (mensagens, links e PDFs)',
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
  subtitulo: 'Adicional — vendido separadamente quando disponível',
  status: 'Em desenvolvimento',
  precoLabel: null as string | null,
  descricao:
    'Módulo fiscal em preparação, preparado para evolução futura. Nesta fase não há emissão de nota fiscal. Não incluso automaticamente nos planos — vendido separadamente quando disponível.',
  objetivos: [
    'Rascunho e conferência fiscal',
    'Organização de documentos (em evolução)',
    'Relatórios fiscais (em preparação)',
    'Preparação para evolução futura — sem emissão de nota fiscal nesta fase',
  ],
  avisos: [
    'Módulo em desenvolvimento — sem emissão de nota fiscal nesta fase.',
    'Vendido separadamente quando disponível.',
    'Custos externos (certificado, contador, provedor e impostos) não estão inclusos.',
  ],
} as const

export const COMUNICACAO_SECAO = {
  titulo: 'Comunique-se melhor, tenha mais resultados.',
  texto:
    'Envio manual pelo WhatsApp: o BoxGestor prepara mensagem, link e PDF para você abrir o WhatsApp e enviar ao cliente.',
  itens: [
    'Mensagens prontas para atendimento',
    'Links e PDFs para compartilhar com o cliente',
    'Envio manual pelo WhatsApp — você envia',
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
    'Aprovação de orçamento por link já disponível. Acompanhamento do serviço por link e o portal completo ainda estão em evolução.',
  disponivelHoje: [
    'Aprovação de orçamento por link',
    'Aprovação total',
    'Aprovação parcial',
    'Recusa',
  ] as const,
  emDesenvolvimento: [
    'Acompanhamento do serviço por link (em evolução)',
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
    pergunta: 'O BoxGestor é para qual tipo de oficina?',
    resposta:
      'Para oficinas mecânicas de diferentes portes que querem organizar operação, atendimento e financeiro em um só sistema.',
  },
  {
    pergunta: 'Posso começar com uma oficina pequena?',
    resposta:
      'Sim. O plano Essencial (R$ 127/mês, 1 usuário) cobre a operação de ponta a ponta para quem está começando. Todos os planos são para uma única oficina.',
  },
  {
    pergunta: 'Qual plano escolher?',
    resposta:
      'Essencial (R$ 127, 1 usuário), Profissional (R$ 247, 3 usuários) ou Premium (R$ 397, 6 usuários). Usuários extras: R$ 59 / R$ 69 / R$ 79 conforme o plano. Fiscal é adicional e não vem incluso automaticamente.',
  },
  {
    pergunta: 'Posso adicionar mais usuários?',
    resposta:
      'Sim. Cada plano inclui uma quantidade de usuários e permite contratar usuários adicionais mensalmente, com valores conforme o plano.',
  },
  {
    pergunta: 'O sistema envia WhatsApp automático?',
    resposta:
      'Não. O BoxGestor gera mensagens, links e PDFs para envio manual pelo WhatsApp. Não há envio automático, bot ou API oficial de WhatsApp nesta fase.',
  },
  {
    pergunta: 'O sistema já emite nota fiscal?',
    resposta:
      'O módulo fiscal está em preparação e é vendido separadamente quando disponível. Nesta fase não há emissão de nota fiscal.',
  },
  {
    pergunta: 'O suporte é imediato?',
    resposta:
      'Oferecemos suporte direto com o fundador na fase inicial e atendimento próximo durante a implantação, em horários combinados — sem promessa de resposta instantânea.',
  },
  {
    pergunta: 'Funciona no celular?',
    resposta:
      'Sim. O sistema é responsivo e pode ser usado no computador e no celular pelo navegador, inclusive como PWA.',
  },
  {
    pergunta: 'Como funciona o teste de 15 dias?',
    resposta:
      'Você cria sua conta e testa o BoxGestor por 15 dias. Neste fluxo de cadastro não pedimos cartão de crédito.',
  },
  {
    pergunta: 'Como funcionará o Portal do Cliente?',
    resposta:
      'Hoje: aprovação de orçamento por link (total, parcial ou recusa). Acompanhamento do serviço por link e o portal completo ainda estão em evolução.',
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
    'Login com controle de acesso',
    'Controle de usuários e permissões',
    'Projetado com foco em organização, segurança e separação dos dados por oficina',
    'Links públicos com token seguro (aprovação e acompanhamento)',
    'Fotos privadas quando aplicável',
  ] as const,
}

export const CTA_FINAL = {
  titulo: 'Pronto para organizar a gestão da sua oficina?',
  texto:
    'Teste o BoxGestor por 15 dias e veja na prática como ter mais controle na rotina — sem cartão de crédito neste fluxo.',
  botao: 'Testar por 15 dias',
  botaoSecundario: 'Falar sobre minha oficina',
  botaoConhecer: 'Quero conhecer o BoxGestor',
}
