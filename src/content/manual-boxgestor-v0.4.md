# Manual do BoxGestor

**Versão:** v0.4  
**Atualizado em:** 26/07/2026  

Este manual orienta o uso do BoxGestor na oficina: clientes, veículos, orçamentos, OS, checklist, fotos, pagamentos, caixa, permissões, estoque, comunicação, offline e Gestor Inteligente.

Não exibe dados reais da oficina, valores financeiros da sua conta nem códigos PIN. Configurações sensíveis aparecem apenas como orientação geral.

---

## Primeiros passos

1. Acesse o sistema pelo navegador (ou pelo app instalado / PWA).
2. Entre com usuário e senha.
3. Em **Configurações**, confira nome da oficina, telefone, endereço e tipo (moto, carro ou ambos).
4. Cadastre o primeiro **cliente**.
5. Cadastre o primeiro **veículo** vinculado ao cliente.
6. Abra a primeira **OS** ou **orçamento**.
7. Registre um **pagamento** quando receber.
8. Gere **recibo** ou **PDF** da OS quando precisar.

Use o menu **Como usar** sempre que precisar consultar este guia. O checklist de primeiros passos no Dashboard também acompanha o progresso inicial.

**Dicas**

- Mantenha o nome da oficina correto — ele aparece em documentos.
- Salve a OS antes de adicionar fotos.
- Aceite atualizações do app quando aparecer “Nova versão disponível”.

---

## Clientes e veículos

### Cadastrar cliente

1. Menu **Clientes** → **Novo cliente**.
2. Preencha nome e telefone (já bastam para começar).
3. Salve o cadastro.

### Cadastrar veículo

1. Pelo cliente ou pelo menu de veículos, adicione um veículo.
2. Informe placa, marca, modelo, ano e tipo.
3. Confira se ficou vinculado ao cliente certo.

**Boa prática:** cadastre o veículo antes de abrir a OS. Isso facilita histórico, checklist, comunicação e impressão.

---

## Orçamentos e OS

### Criar orçamento ou OS

1. Menu **Ordens de Serviço**.
2. Crie um novo orçamento ou uma nova OS.
3. Selecione cliente e veículo.
4. Informe defeito, serviços, peças e observações.
5. Revise valores e salve.

### Converter orçamento em OS

Quando o cliente aprovar:

1. Abra o orçamento.
2. Use a opção de converter em OS.
3. Confira se itens, valores e dados foram mantidos.
4. Continue o atendimento com a OS em andamento.

### Status comuns

- **Em serviço** — veículo em trabalho.
- **Pronto para retirada** — serviço concluído para o cliente buscar.
- **Aguardando pagamento** — falta receber.
- **Finalizada** — concluída conforme a regra da oficina.

A lista de OS prioriza o **número da OS** (mais recente primeiro), para facilitar a busca operacional.

---

## Checklist e fotos

### Checklist de entrada

1. Abra a OS completa (já salva).
2. Na área de dados, localize o checklist de entrada.
3. Marque os itens verificados e registre observações.
4. Quando disponível, use ditado por voz nas observações.
5. Salve a OS.

Modelos de checklist podem ser padronizados em **Configurações**.

### Quilometragem e combustível

Registre quilometragem quando aplicável. O combustível pode usar frações do tanque (vazio, 1/4, 1/2, 3/4, cheio).

### Fotos da OS

1. Abra uma OS já salva.
2. Na seção **Fotos da OS**, escolha o tipo (geral, entrada, avaria, peça, serviço, entrega etc.).
3. Adicione legenda curta, se quiser.
4. Envie imagem JPG, PNG ou WEBP dentro do limite permitido.

**Importante**

- A OS precisa estar salva antes de adicionar fotos.
- Em conexões ruins, aguarde a sincronização.
- Use sempre o botão **Baixar PDF** do sistema — não use “Imprimir → Salvar como PDF” do navegador se o layout sair quebrado.

---

## Pagamentos e financeiro

### Registrar pagamento na OS

1. Abra a OS salva.
2. Vá na seção **Pagamento**.
3. Informe valor e forma (Pix, dinheiro, cartão etc.).
4. Confira saldo restante.
5. Salve.

### Pagamento pendente / a receber

É possível deixar valor **pendente** ou **a receber** quando o cliente ainda não quitou. Esse tipo de lançamento **não exige caixa aberto**.

### Recibo

Após o pagamento, gere o recibo pelo sistema. O recibo mostra o valor recebido, saldo restante quando existir e informações de quem registrou a operação.

### Financeiro

O menu **Financeiro** concentra receitas, despesas e contas. O acesso depende do perfil e das permissões da equipe. Mecânico normalmente não vê o financeiro completo.

**Orientação de segurança:** operações sensíveis (alterar valores, autorizações especiais) podem exigir PIN ou perfil autorizado. Nunca compartilhe PIN em mensagens ou capturas de tela.

---

## Caixa

O **Caixa** é a sessão diária de entrada e saída de valores da oficina. Nesta versão o caixa é **único por oficina** (um caixa aberto por vez).

### Acessar o Caixa

1. Menu **Caixa**.
2. Quem pode acessar depende das permissões:
   - **Dono/admin** — sempre.
   - **Gerente** — se a permissão “Permitir acessar o caixa” estiver ligada (em configs antigas, pode seguir o financeiro completo).
   - **Recepção** — somente se a flag dela estiver ligada; nesta fase, **só visualização**.
   - **Mecânico** — sem acesso por padrão.

### Abrir e fechar

- **Abrir caixa** — inicia a sessão do dia (quem tem permissão de gerenciar).
- **Fechar caixa** — encerra a sessão e registra o fechamento.
- Movimentos manuais (sangria, reforço, despesa etc.) ficam no histórico da sessão.

### Pagamento de OS no caixa

Quando um pagamento real da OS é registrado com caixa aberto, ele pode entrar no caixa como **venda**, vinculando OS e caixa.

### Estornos e cancelamentos

Se um pagamento for cancelado:

- Com caixa aberto adequado, o sistema pode lançar o **estorno/refund**.
- Se não houver caixa aberto para estornar na hora, pode surgir um **estorno pendente**.
- Ao abrir um novo caixa, a oficina pode **lançar o estorno pendente**.

### Histórico e auditoria

O histórico do caixa é auditável: movimentos cancelados podem aparecer para consulta, sem entrar no saldo ativo. Eventos importantes (como autorização especial) ficam registrados na auditoria.

### Exigir caixa aberto para pagamentos

Em **Configurações**, o dono pode ativar:

**Exigir caixa aberto para pagamentos**

- **Desligado** — o fluxo de pagamento continua como antes.
- **Ligado** — pagamento real sem caixa aberto é bloqueado para usuário comum/recepção.
- **Dono/admin/gerente autorizado** pode liberar exceção informando **motivo obrigatório**.
- A auditoria registra a autorização (`payment_without_open_cash_authorized`).
- Pagamento **pendente/a receber** continua sem exigir caixa aberto.

### Busca rápida neste tópico

Palavras-chave: caixa, estorno, auditoria, pagamento, exigir caixa aberto, sessão, refund.

---

## Permissões

Acesse **Configurações → Permissões da equipe** (dono/admin).

Perfis comuns: dono/admin, gerente, recepção e mecânico.

### Gerente

O dono controla, entre outras:

- Ver financeiro operacional / completo
- **Permitir acessar o caixa**
- Registrar pagamentos
- Estoque, agenda e relatórios conforme flags

Para **gerenciar** o caixa (abrir/fechar/lançar), o gerente precisa da permissão de caixa **e** do financeiro completo.

### Recepção

Pode ter:

- Criar clientes, veículos e OS
- Registrar pagamentos (se liberado)
- **Permitir acessar o caixa** — nesta fase, só **visualização**

### Mecânico

Foco na OS: checklist, observações, peças/serviços conforme permissão. Sem acesso ao caixa e ao financeiro geral por padrão.

**Regra:** cada pessoa vê só o necessário para trabalhar. Isso reduz erro e protege o financeiro.

---

## Estoque

1. Menu **Estoque**.
2. Cadastre peças (nome, código, custo, preço, quantidade).
3. Use fornecedores quando houver entrada identificada.
4. Na OS, vincule peças do estoque para baixar quantidade.
5. Acompanhe alertas de estoque baixo.

Entrada por XML de nota fiscal de compra existe como base; melhorias (Excel/PDF, devoluções) seguem no roadmap.

Não altere quantidade sem motivo claro — o histórico ajuda a conferir diferenças.

---

## Comunicação

O módulo **Comunicação** ajuda a avisar o cliente sobre orçamento, status, retirada, pagamento e lembretes.

1. Abra Comunicação ou a OS do cliente.
2. Escolha mensagem pronta ou personalizada.
3. Confira nome, veículo, placa e status.
4. Envie pelo WhatsApp quando aplicável.
5. Marque como enviada **somente depois** do envio real.

**PDF + WhatsApp:** o caminho seguro atual é baixar o PDF no sistema e anexar manualmente na conversa. Integração automática completa é evolução futura.

---

## Offline

O BoxGestor trabalha com persistência local e sincronização.

- Em queda de internet, parte do trabalho pode continuar no dispositivo.
- Ao voltar a conexão, sincronize e confira se OS, clientes e pagamentos atualizaram.
- Fotos e alguns fluxos ainda dependem mais da conexão — salve a OS e aguarde sync quando possível.
- Se o app instalado (PWA) parecer desatualizado: aceite “Nova versão disponível”, confira a versão em Configurações ou teste em aba anônima.

---

## Gestor Inteligente

O **Gestor Inteligente** reúne apoios operacionais do BoxGestor para acelerar o dia a dia, sem substituir a decisão do dono:

- Checklist com ditado por voz (quando o navegador permitir).
- Alertas e lembretes de pendências.
- Mensagens prontas de comunicação.
- Sugestões do catálogo de serviços/peças na montagem da OS.
- Visão do Dashboard com atalhos para o que precisa de atenção.

Use como apoio: revise sempre valores, peças e status antes de finalizar ou enviar ao cliente.

---

## Perguntas frequentes

### Por que não consigo acessar o Caixa?

Confira o perfil e as permissões em **Permissões da equipe**. Recepção só entra se a flag estiver ligada (visualização). Gerente precisa da permissão de caixa.

### Por que o pagamento foi bloqueado?

Se **Exigir caixa aberto para pagamentos** estiver ligado, abra o caixa ou peça autorização (com motivo) a quem tiver permissão. Pagamento pendente/a receber não exige caixa.

### O que é estorno pendente?

É um estorno de pagamento cancelado que ainda não entrou no caixa. Ao abrir um novo caixa, lance o pendente para manter o histórico fechado.

### Por que não consigo adicionar foto?

A OS precisa estar salva. Confira internet, formato (JPG/PNG/WEBP) e tamanho do arquivo.

### A foto entra no PDF automaticamente?

Ainda não em todas as etapas. Evoluções futuras incluem escolher fotos para o PDF.

### O mecânico vê o financeiro?

Por padrão, não. O dono define limites nas permissões.

### O sistema emite nota fiscal?

Não como emissão fiscal direta nesta versão. O foco atual é operação da oficina; assistente/fiscal pode evoluir no roadmap.

### PDF com layout quebrado?

Use o botão **Baixar PDF** dentro do sistema (OS ou recibo), não o recurso de impressão do navegador.

---

## Roadmap

Itens em evolução (orientação geral — prazos podem mudar):

- Caixa por operador (além do caixa único da oficina)
- Mais granularidade de permissões de caixa para recepção
- Ocultar foto ruim e selecionar fotos para PDF
- Offline mais completo para fotos (fila e sync)
- WhatsApp com anexo/PDF mais integrado
- Melhorias na importação de XML/Excel de estoque
- Assistente de dados para contador / portal fiscal
- Consulta automática por placa (quando houver parceiro homologado)

### Histórico do manual

| Versão | Data       | Resumo                                                                 |
|--------|------------|------------------------------------------------------------------------|
| 0.1    | 23/07/2026 | Primeira versão prática com módulos principais e Fotos da OS.          |
| 0.4    | 26/07/2026 | Caixa, auditoria, estornos pendentes, exigir caixa aberto, permissões gerente/recepção, offline e Gestor Inteligente. |
