# Manual do BoxGestor

**Versão:** v0.5  
**Atualizado em:** 18/08/2026  

Este manual orienta o uso do BoxGestor na oficina e no suporte administrativo. Serve para dono, funcionário/mecânico, suporte/admin do BoxGestor e gestor do produto.

Não exibe dados reais da sua oficina, valores da sua conta nem códigos PIN. Configurações sensíveis aparecem só como orientação geral.

**Como usar este guia:** abra o menu **Como usar**, use a busca por assunto ou os atalhos de seção.

---

## Visão geral do BoxGestor

O **BoxGestor** é o sistema de gestão para oficinas (moto, carro ou mista). Ele organiza o dia a dia: clientes, veículos, orçamentos, ordens de serviço (OS), estoque, caixa, financeiro, comunicação e acompanhamento visual do pátio.

**Para quem serve**

- Dono/admin da oficina — visão completa e configurações.
- Recepção/atendimento — clientes, OS, orçamentos e comunicação.
- Mecânico — OS, checklist, fotos e status do serviço.
- Suporte BoxGestor — diagnóstico somente leitura na Central de Admin (não é tela da oficina).

**Fluxo principal da oficina**

1. Cadastrar cliente e veículo.
2. Abrir orçamento ou OS.
3. Registrar serviços, peças, checklist e fotos.
4. Enviar orçamento ao cliente (WhatsApp manual e/ou link do portal).
5. Aprovar (interna, por link ou parcial) e converter em OS, se for orçamento.
6. Acompanhar no Pátio / Central do Dia.
7. Registrar pagamento, gerar recibo/PDF e entregar o veículo.

---

## Login e acesso

### Entrar no sistema

1. Abra o BoxGestor no navegador ou no app instalado (PWA).
2. Informe usuário e senha.
3. Se o sistema pedir, informe o **código da oficina**.
4. Confirme o acesso e use o menu lateral para navegar.

### Código da oficina

O código identifica a oficina no login. Use quando:

- o mesmo usuário existir em mais de uma oficina; ou
- o administrador pedir o código na criação/convite do usuário.

Em **Configurações** / área de usuários, o dono pode consultar e enviar o código ao funcionário. **Não envie sua senha nem o PIN** no lugar do código.

### Usuários e permissões

Perfis comuns: dono/admin, gerente, recepção e mecânico. O dono define o que cada um pode ver e fazer em **Configurações → Permissões da equipe** (conforme o plano).

- **Dono/admin** — acesso amplo, configurações e autorizações.
- **Gerente** — operação e, se liberado, financeiro/caixa.
- **Recepção** — atendimento; caixa só se a permissão permitir (em geral, visualização).
- **Mecânico** — foco na OS; sem financeiro/caixa por padrão.

### PIN de autorização

O **PIN** do dono/admin protege alterações sensíveis, por exemplo:

- mudar valores bloqueados na OS;
- registrar pagamento quando o perfil exige autorização.

Configure o PIN em **Configurações**. Nunca compartilhe o PIN em WhatsApp, print ou papel.

---

## Dashboard

O **Dashboard** é a visão geral ao entrar no sistema.

**O que costuma aparecer**

- Indicadores do dia (OS, pendências, atalhos).
- Acesso rápido ao **Pátio** e à **Central do Dia**.
- Checklist de primeiros passos (útil em oficinas novas).
- Atalhos para o que precisa de atenção.

Use o Dashboard para começar o dia; use a Central do Dia e o Pátio para operar o fluxo.

---

## Central do Dia

A **Central do Dia** é o painel operacional do dia (consulta rápida).

**O que você encontra**

- OS do dia.
- OS atrasadas.
- OS prontas / para retirada.
- Pagamentos e pendências do dia.
- Agendamentos.
- Comunicações pendentes ou recentes.
- Alertas de estoque baixo.
- Situação do caixa (quando houver permissão).

**Como usar**

1. Menu **Central do Dia**.
2. Veja os cartões do dia.
3. Clique para abrir a OS, o Pátio ou o módulo relacionado.
4. Atualize a página se acabou de sincronizar dados.

É uma visão de acompanhamento — as alterações principais continuam na OS, Caixa, Estoque etc.

---

## Pátio

O **Pátio** mostra as OS em colunas/etapas, para ver a oficina “de cima”.

**Como usar**

1. Menu **Pátio**.
2. Veja as OS por etapa (em serviço, aguardando peça, prontas etc., conforme a configuração).
3. Use filtros (busca, status, mecânico) quando disponíveis.
4. Abra a OS para detalhes ou ações.

Ideal para recepção e dono acompanharem o andamento sem abrir cada OS uma a uma.

---

## Clientes e veículos

### Cadastrar cliente

1. Menu **Clientes** → **Novo cliente**.
2. Preencha pelo menos nome e telefone.
3. Salve.

### Cadastrar veículo

1. Pelo cliente ou pelo cadastro de veículos, adicione o veículo.
2. Informe placa, marca, modelo, ano e tipo (carro, moto etc.).
3. Confira o vínculo com o cliente certo.

### Tipo de oficina

Em **Configurações**, defina se a oficina atende **carro**, **moto** ou **mista**. Isso ajusta textos e cadastros de veículo.

### Histórico

Pelo cliente ou pelo veículo você consulta OS e orçamentos anteriores. Cadastre o veículo antes da OS para facilitar histórico, checklist e impressão.

---

## Ordens de Serviço

### Abrir OS

1. Menu **Ordens de Serviço**.
2. Crie uma nova OS (ou converta um orçamento aprovado).
3. Selecione cliente e veículo.
4. Informe defeito/reclamação, serviços, peças e observações.
5. Salve antes de fotos ou envios.

### Serviços e peças

- Adicione serviços do catálogo ou manuais.
- Vincule peças do estoque quando houver baixa automática.
- Revise quantidades e valores antes de salvar.

### Checklist, fotos, status e mecânico

- Preencha o **checklist de entrada** na OS salva.
- Adicione **fotos** (ver capítulo Fotos).
- Atualize o **status** conforme o andamento.
- Atribua o **mecânico** responsável quando a oficina usar esse controle.
- Consulte o **histórico de eventos** da OS.

### Campos bloqueados e alteração com PIN

Alguns valores (ex.: total de mão de obra) podem ficar bloqueados após certas etapas. Para alterar, use **Alterar com PIN** e peça o PIN do dono/admin.

### Impressão e PDF

1. Abra a OS.
2. Use o botão **Baixar PDF** do sistema (não use “Imprimir → Salvar como PDF” do navegador).
3. O arquivo costuma se chamar algo como `boxgestor-os-{numero}.pdf`.

---

## Orçamentos

### Criar e enviar

1. Crie um orçamento em **Ordens de Serviço** (tipo orçamento).
2. Monte serviços, peças e totais.
3. Salve.
4. Envie ao cliente pela comunicação / **Enviar ao cliente** (WhatsApp **manual** — o sistema prepara texto, link e PDF; você finaliza no WhatsApp).

### Formas de aprovação

- **Aprovação interna** — a oficina registra a decisão no sistema.
- **Aprovação por link** — o cliente abre o link seguro e responde.
- **Aprovação parcial** — o cliente aprova só parte dos itens (quando disponível).
- **Recusa** — fica registrada com o status correspondente.

### Conversão em OS

Quando aprovado:

1. Abra o orçamento.
2. Converta em OS.
3. Confira itens, valores e dados.
4. Continue o atendimento na OS.

Orçamentos convertidos mantêm rastreio no histórico (número/OS gerada).

---

## Portal do Cliente

O **Portal do Cliente** é uma página pública aberta por **link** (com token), sem login da oficina.

**O que o cliente costuma ver**

- Dados da oficina (nome, contato, logo quando configurado).
- Resumo do orçamento / OS pública.
- Opções de **aprovar**, **recusar** ou **aprovar parcialmente** (conforme o caso).
- Botão para **falar com a oficina** (abre contato/WhatsApp da oficina).

**Segurança do link**

- O link é pessoal e temporário (pode expirar ou ser revogado).
- Não compartilhe o link em grupos públicos.
- Quem tem o link acessa aquela proposta — trate como informação sensível.

**O que não aparece no portal**

- Financeiro interno, caixa, estoque, custos, PIN, usuários da equipe e dados de outras OS.

---

## WhatsApp

O BoxGestor **não envia WhatsApp automaticamente**. O fluxo é **manual**:

1. Na OS/orçamento, use **Enviar ao cliente** (ou envio de fotos).
2. O sistema monta a **mensagem pronta**, pode incluir **link do portal** e orientar o **PDF**.
3. Você abre o WhatsApp e **confirma o envio**.
4. Se quiser histórico, **marque como enviado** só depois de enviar de verdade.

**PDF separado:** baixe o PDF no sistema (`boxgestor-os-…` ou `boxgestor-orcamento-…`) e anexe na conversa se precisar.

**Fotos ao cliente:** escolha as fotos, gere a mensagem e envie no WhatsApp; marque como enviado quando concluir.

Diferença importante: **gerar mensagem** ≠ **marcar como enviada**. Marcar sem enviar gera histórico falso.

---

## Fotos

### Tirar ou escolher

1. Abra uma OS **já salva**.
2. Em **Fotos da OS** (ou fotos do checklist), tire a foto ou escolha da galeria.
3. Informe o tipo (entrada, avaria, peça, serviço, entrega etc.) e uma legenda curta, se quiser.
4. Use JPG, PNG ou WEBP dentro do limite permitido.

### Envio ao cliente e PDF

- Envios ao cliente seguem o fluxo **manual** do WhatsApp (capítulo anterior).
- Nem toda foto entra automaticamente em todo PDF — use o PDF do sistema e confira o conteúdo.

### Offline

Em conexão ruim, a foto pode ficar pendente de sincronização. Aguarde o upload, use **Sincronizar agora** se existir, e **não feche a aba** no meio do envio.

---

## Estoque

1. Menu **Estoque**.
2. Cadastre peças (nome, código, custo, preço, quantidade).
3. Cadastre fornecedores quando fizer entrada identificada.
4. Registre **movimentos** (entrada/saída) com motivo claro.
5. Acompanhe **estoque baixo** na Central do Dia e no próprio módulo.
6. Na OS, vincule peças do estoque para baixar quantidade.
7. Na **venda balcão**, a baixa também pode consumir estoque.

**Cancelamento / devolução:** quando a oficina cancela venda ou devolve peça pelo fluxo do sistema, a quantidade deve voltar de forma segura. Evite ajustar quantidade “na mão” sem motivo — o histórico ajuda a conferir diferenças.

Importação por XML de compra existe como base; melhorias (Excel etc.) podem evoluir com o tempo.

---

## Caixa

O **Caixa** é a sessão diária de entradas e saídas. Nesta versão o caixa é **único por oficina** (um caixa aberto por vez).

### Abrir e fechar

1. Menu **Caixa**.
2. **Abrir caixa** — inicia a sessão (quem gerencia).
3. Lance movimentos manuais (sangria, reforço, despesa etc.) quando precisar.
4. **Fechar caixa** — encerra a sessão.

### Pagamentos de OS e estornos

- Pagamento real com caixa aberto pode entrar como venda vinculada à OS.
- Cancelamento pode gerar **estorno** no caixa aberto ou **estorno pendente** se não houver caixa adequado.
- Ao abrir novo caixa, lance estornos pendentes.

### Histórico e auditoria

Movimentos cancelados podem aparecer para consulta. Autorizações especiais (ex.: pagamento sem caixa aberto) ficam na auditoria.

### Exigir caixa aberto

Em **Configurações**, o dono pode ligar **Exigir caixa aberto para pagamentos**:

- Ligado — pagamento real sem caixa é bloqueado para usuário comum; dono/admin/gerente autorizado pode liberar com **motivo**.
- Pagamento **pendente / a receber** continua sem exigir caixa aberto.

**Quem acessa:** dono sempre; gerente e recepção conforme permissões (recepção em geral só visualiza).

---

## Financeiro

O menu **Financeiro** concentra pagamentos, pendentes, receitas/despesas e contas (conforme permissão e plano).

**Relação com o caixa**

- Pagamentos reais podem refletir no caixa quando a sessão está aberta.
- Pendentes/a receber não exigem caixa aberto.
- Recibos saem pelo sistema (`boxgestor-recibo-os-…` quando aplicável).

**Cartão parcelado:** registre a forma e as parcelas conforme a tela de pagamento; acompanhe pendências no Financeiro.

Mecânico, por padrão, **não** vê o financeiro completo.

---

## Venda balcão

Use **Venda balcão** para vender peça/serviço sem abrir OS completa (conforme o plano).

**Fluxos comuns**

1. Montar a venda e escolher paga ou pendente.
2. Registrar recebimento quando o cliente pagar.
3. Gerar **recibo**.
4. Em cancelamento seguro, seguir o fluxo do sistema para estornar pagamento e **devolver estoque**.

Não apague movimentos só no estoque sem cancelar a venda — isso desalinha financeiro e quantidade.

---

## Comissão

Quando a oficina usa comissão (planos que incluem o recurso):

- Comissão pode ser calculada por OS / serviços.
- Baixas parciais de pagamento podem afetar o que já foi “ganho” vs. pendente.
- Pode existir **conta corrente de comissão** para acompanhar o que o mecânico tem a receber.

Dono/gerente veem a visão gerencial; o mecânico pode ver só o que a permissão liberar. Confira sempre os valores antes de pagar comissão.

---

## Comunicação

O módulo **Comunicação** e as mensagens na OS ajudam a avisar o cliente (orçamento, status, retirada, pagamento, lembretes).

1. Abra Comunicação ou a OS.
2. Escolha mensagem pronta ou personalize.
3. Confira nome, veículo, placa e status.
4. Envie pelo WhatsApp (**manual**).
5. Marque como enviada **somente depois** do envio real.

Alertas e histórico ficam no módulo para consulta. Gerar texto não substitui marcar enviado — e marcar sem enviar gera histórico incorreto.

---

## Agenda

A **Agenda** registra agendamentos de clientes/veículos.

1. Menu **Agenda** (quando disponível no plano).
2. Crie o agendamento com data, horário e cliente.
3. Acompanhe na própria Agenda e, quando houver, na Central do Dia.

O agendamento está disponível desde o plano **Essencial** (e no teste). Lembretes extras podem depender do plano e das configurações.

---

## Fiscal

O módulo **Fiscal** é **adicional** e, nesta versão, está em **preparação / homologação** — **não é emissão real de nota fiscal**.

**O que já pode existir**

- Dados fiscais da oficina.
- Dados fiscais de produtos.
- Dados fiscais de clientes.
- Central para **preparar** nota.
- Rascunhos fiscais.
- Espelho fiscal e checklist de pendências.
- Validações técnicas de homologação (sem enviar nota de verdade).

**Aviso importante:** o BoxGestor **não promete emissão fiscal automática** enquanto a homologação/emissão real não estiver pronta. Trate os dados como preparação para o futuro e valide com o contador.

---

## Configurações

Em **Configurações** o dono ajusta a oficina:

- Dados da empresa (nome, telefone, endereço, tipo carro/moto/mista).
- Visual / marca (conforme plano).
- Equipe e permissões.
- Caixa (incluindo exigir caixa aberto).
- Comunicação.
- Código da oficina e usuários.
- Planos e cobrança.
- Fiscal adicional (preparação).
- PIN de autorização de valores.
- Modelos de checklist.

Mantenha nome e telefone corretos — eles aparecem em documentos, portal e mensagens.

---

## Planos

Planos atuais (orientação geral — limites podem ser ajustados comercialmente):

| Plano | Usuários inclusos (base) | Observação |
|-------|--------------------------|------------|
| Teste grátis | Até 3 | **15 dias** com o sistema completo para conhecer o BoxGestor |
| Essencial | 1 | Organização básica: OS, orçamento, agenda, estoque/financeiro básicos, Pátio e Central do Dia simples |
| Profissional | 3 | Operação completa: caixa, venda balcão, comissão, permissões, Pátio/Central mais completos |
| Premium | 6 | Gestão avançada e recursos premium; Portal do Cliente em evolução |

**Fiscal** é **adicional** — não vem incluso automaticamente em nenhum plano.

Usuários extras podem ser contratados conforme a política comercial vigente. Este manual **não lista preços** — confira valores na tela de planos ou com o comercial BoxGestor.

---

## Offline, PWA e sincronização

O BoxGestor tem recursos de **PWA** e trabalho com persistência local + sincronização.

**Na prática**

- Com internet fraca ou queda, parte do trabalho pode continuar no aparelho.
- Ao voltar a conexão, use **Sincronizar agora** (quando existir) e confira OS, clientes e pagamentos.
- Fotos pendentes podem precisar subir depois — aguarde o envio.
- **Não feche a aba** no meio de upload ou sync importante.
- Aceite “Nova versão disponível” quando aparecer; confira a versão em Configurações se o app parecer antigo.

Nem tudo funciona 100% offline. Em dúvida, salve a OS e sincronize antes de entregar o veículo ou fechar o caixa.

---

## Admin BoxGestor e Suporte das Oficinas

Área **somente para Admin do Sistema / suporte BoxGestor** — **não** é tela do dia a dia da oficina.

Acesse **Admin** (`/admin-craft` no sistema). Há a aba **Suporte das Oficinas**, além da lista de oficinas cadastradas (incluindo **Oficinas ativas**).

### Raio-X da oficina

Para cada oficina, **Abrir Raio-X** mostra um diagnóstico **somente leitura**, com abas como:

- Resumo
- Usuários
- OS
- Pagamentos
- Caixa
- Estoque
- Portal / Aprovações
- Saúde / Sync

**O que o suporte pode fazer**

- Consultar e copiar um resumo para atendimento.
- Filtrar e buscar informações já existentes.

**O que o suporte não faz por essa tela**

- Editar pagamento, estornar, excluir.
- Alterar caixa, estoque ou OS.
- Impersonar a oficina.
- Disparar sincronização remota no aparelho do cliente.

### Saúde / Sync

A aba **Saúde / Sync** mostra apenas dados que **já chegaram ao servidor**.  
Ela **não** enxerga o `localStorage` nem o offline do celular/computador da oficina. Se algo “sumiu” só no aparelho e nunca sincronizou, o Raio-X pode não mostrar.

---

## Segurança e boas práticas

- Use **senha forte** e não compartilhe login.
- Crie um usuário por pessoa; ajuste **permissões**.
- Proteja o **PIN**; nunca envie por WhatsApp.
- Não compartilhe links de portal/aprovação em grupos públicos.
- No WhatsApp, confira destinatário, mensagem e anexos antes de enviar.
- Use o botão **Baixar PDF** do sistema.
- Faça **backup** quando a oficina usar a função de exportação (`boxgestor-backup-…`).
- Aceite atualizações do app e sincronize após períodos offline.
- Dono: revise caixa e estornos pendentes com frequência.

---

## Perguntas frequentes

### O sistema envia WhatsApp sozinho?

Não. Ele prepara mensagem, link, PDF e fotos; **você** envia no WhatsApp e, se quiser, marca como enviado.

### O sistema emite nota fiscal?

Nesta versão, o Fiscal é **preparação/homologação/adicional**. **Não** há emissão fiscal real garantida pelo manual.

### Por que não consigo acessar o Caixa?

Confira perfil e permissões. Recepção só entra se a flag estiver ligada (em geral, visualização).

### Por que o pagamento foi bloqueado?

Se **Exigir caixa aberto** estiver ligado, abra o caixa ou peça autorização com motivo. Pendente/a receber não exige caixa.

### O que é estorno pendente?

Estorno de pagamento cancelado que ainda não entrou no caixa. Ao abrir um novo caixa, lance o pendente.

### Por que não consigo adicionar foto?

A OS precisa estar salva. Confira internet, formato e tamanho.

### O mecânico vê o financeiro?

Por padrão, não.

### O admin de suporte vê o offline do meu celular?

Não. O Raio-X / Saúde Sync só vê o que já sincronizou no servidor.

### PDF com layout quebrado?

Use **Baixar PDF** no sistema, não a impressão do navegador. Limpe cache ou aceite nova versão do PWA se estiver desatualizado.

---

## Histórico do manual

| Versão | Data       | Resumo |
|--------|------------|--------|
| 0.1    | 23/07/2026 | Primeira versão prática com módulos principais e Fotos da OS. |
| 0.4    | 26/07/2026 | Caixa, auditoria, estornos, exigir caixa aberto, permissões, offline e Gestor Inteligente. |
| 0.5    | 18/08/2026 | Manual ampliado: Central do Dia, Pátio, Portal, WhatsApp manual, fotos, venda balcão, comissão, agenda, fiscal em preparação, planos, sync e Admin Suporte (Raio-X somente leitura). |

O arquivo `manual-boxgestor-v0.4.md` permanece no projeto como histórico. O PDF baixável da v0.5 pode ser publicado depois; enquanto isso, use este guia dentro do menu **Como usar**.
