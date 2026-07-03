# Roadmap — Feedback do piloto BoxGestor

Documentação de integrações e melhorias **futuras**. Nenhuma integração externa real foi implementada nesta etapa.

## 1. Importar XML de NF-e para estoque

**Objetivo:** alimentar o estoque automaticamente a partir de notas fiscais.

**Fluxo proposto:**
1. Upload de arquivo XML NF-e na tela de Estoque ou Financeiro.
2. Parser local do XML (produtos, quantidade, preço unitário, fornecedor, chave da NF).
3. Tela de **revisão** antes de confirmar — usuário confere e mapeia itens.
4. Mapeamento produto da nota → item existente no estoque (ou criar novo).
5. Entrada automática no estoque após confirmação.
6. **Evitar duplicidade** pela chave de acesso da NF (44 dígitos).
7. Histórico de entradas vinculado à NF.

**Requisitos técnicos futuros:**
- Validar schema NF-e (versões 3.10 / 4.00).
- Armazenar chave NF e XML hash em metadata da movimentação.
- Permissões: dono/gerente com estoque.

---

## 2. Consulta automática por placa

**Objetivo:** preencher marca, modelo, ano, cor e tipo ao informar a placa.

**Status atual:** botão "Buscar pela placa" na tela de veículos aparece como **Em breve** (desabilitado).

**Integração futura:**
- API autorizada de consulta veicular (ex.: parceiros homologados).
- Dados possíveis: marca, modelo oficial, ano, cor, tipo, cilindrada (se disponível), chassi (se permitido pela API e LGPD).
- **LGPD:** consentimento do titular, finalidade clara, retenção mínima.
- **Custo:** avaliar plano por consulta vs. pacote mensal.
- **Não usar** scraping ou fontes não autorizadas.
- Cadastro manual continua sempre disponível.

---

## 3. Mensagens agendadas automáticas

**Objetivo:** lembretes e avisos proativos ao cliente.

**Antes da automação:** manter envio manual com modelos prontos (WhatsApp / Comunicação).

**Fila futura de mensagens agendadas:**
- Lembrete de revisão periódica.
- Lembrete de serviço agendado (véspera / dia).
- Aviso de OS pronta para retirada.
- Aviso de orçamento aguardando aprovação.

**Integração futura:** WhatsApp Business API, Z-API ou provedor equivalente.

**Histórico:** registrar envios na área de Comunicação (data, tipo, destinatário, status).

---

## Implementado nesta etapa (usabilidade interna)

- Dashboard com cards clicáveis.
- Lista de OS com clique na linha/card.
- Checklist com situação e observação visíveis (tela + PDF).
- Ditado por voz (Web Speech API) nas observações do checklist.
- Combustível com frações do tanque (Vazio, 1/4, 1/2, 3/4, Cheio).
- Visualização ampliada da OS antes de baixar PDF.
- Modo Orçamento vs. Ordem de Serviço com conversão para OS.

---

*Última atualização: feedback piloto BoxGestor/Craft Oficina.*
