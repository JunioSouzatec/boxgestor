# Auditoria MVP — Craft Oficina

**Data:** 13/06/2026  
**Escopo:** Estabilidade, cálculos, navegação, permissões e integrações internas antes da integração Supabase real.  
**Build:** `npm run build` — ✅ sucesso após correções desta auditoria.

---

## 1. Telas revisadas

| Rota | Tela | Status | Observação |
|------|------|--------|------------|
| `/` | Dashboard | ✅ | Métricas com filtros seguros de data; totais OS recalculados |
| `/clientes` | Clientes | ✅ | CRUD estável; limite de plano Free |
| `/portal-cliente` | Portal do Cliente | ✅ | Resumo financeiro com totais recalculados |
| `/portal-cliente/:id` | Portal detalhe | ✅ | Fallback quilometragem; totais OS corrigidos |
| `/motos` | Motos | ✅ | Busca segura para registros incompletos |
| `/ordens-servico` | Ordens de Serviço | ✅ | Fluxo completo OS; cálculo financeiro unificado |
| `/catalogo-servicos` | Catálogo de Serviços | ✅ | Gate plano Profissional+ |
| `/financeiro` | Financeiro | ✅ | Contas a receber via `calcularResumoFinanceiroOS` |
| `/relatorios` | Relatórios | ✅ | Totais OS recalculados; datas legadas ignoradas |
| `/comunicacao` | Comunicação | ✅ | Gate plano Profissional+ |
| `/lembretes` | Lembretes | ✅ | Gate plano Profissional+ |
| `/estoque` | Estoque | ✅ | Normalização peça (unidade/categoria); gate plano |
| `/fornecedores` | Fornecedores | ✅ | CRUD estável |
| `/agenda` | Agenda | ✅ | Ordenação segura sem `horario` nulo |
| `/usuarios` | Usuários | ✅ | Permissões por papel; gate multiusuários |
| `/planos` | Planos | ✅ | Simulação localStorage |
| `/configuracoes` | Configurações | ✅ | Preferências com fallback; PWA; reset dados |
| — | Backup e Segurança | ⚠️ | **Não há rota `/backup`**. Equivalente: card “Dados do sistema” em Configurações (restaurar dados iniciais — apenas Dono) |

---

## 2. Ordem de Serviço — conferência

| Funcionalidade | Status | Notas |
|----------------|--------|-------|
| Criação / edição | ✅ | Validação amigável; `mergeOrdemServico` recalcula `valor_total` |
| Status rápido | ✅ | Atualização inline na lista |
| Checklist editável | ✅ | Migração automática de OS antigas |
| Serviços do catálogo | ✅ | Sugestões genéricas; confirmação antes de adicionar peça |
| Peças/produtos | ✅ | `linha_id` único; fallbacks unidade/categoria |
| Quantidade decimal | ✅ | `parseQuantidadeDecimalComValidacao` |
| Unidade de medida | ✅ | 12 unidades; normalização em estoque e OS |
| Valores adicionais / descontos | ✅ | Refletem no total em tempo real |
| Garantia | ✅ | Gate plano Profissional+ |
| Pagamentos parciais | ✅ | Soma do histórico de lançamentos |
| Cartão parcelado | ✅ | 1x à vista ou Nx com valor da parcela |
| Recibo parcial / quitação | ✅ | Título dinâmico; saldo restante visível |
| PDF da OS | ✅ | Download direto; layout branco; valor pago/pendente |

---

## 3. Cálculos financeiros — centralização

**Serviço central:** `src/services/os-financeiro.service.ts`

Retorna: mão de obra, peças, adicionais, descontos, total geral, valor pago, pendente, status sugerido/efetivo.

| Área | Usa cálculo central | Observação |
|------|---------------------|------------|
| Resumo financeiro OS | ✅ | `calcularResumoFinanceiroOS` + total ao vivo |
| Seção Pagamento | ✅ | `{ totalGeral: valorTotal }` do formulário |
| Lista de OS | ✅ | Colunas Total e Pendente recalculadas |
| Histórico cliente | ✅ | |
| PDF OS | ✅ | |
| Recibo | ✅ | Parcial vs quitação |
| Financeiro / contas a receber | ✅ | `listarContasReceber` |
| Dashboard métricas pagamento | ✅ | |
| Relatórios (ticket, clientes, motos) | ✅ | **Corrigido nesta auditoria** |
| Portal do cliente | ✅ | **Corrigido nesta auditoria** |
| Analytics (top clientes/serviços) | ✅ | **Corrigido nesta auditoria** |
| Botão WhatsApp (valor OS) | ⚠️ | Usa `valor_estimado ?? valor_total` — aceitável para mensagem |

**Migração:** `normalizarOS` recalcula `valor_total` ao carregar dados antigos.

---

## 4. Estoque — conferência

| Item | Status |
|------|--------|
| Entrada de estoque | ✅ |
| Saída ao finalizar OS | ✅ |
| Devolução ao cancelar | ✅ |
| Unidade de medida | ✅ Fallback `unidade`; óleo/arrefecimento → litro |
| Quantidade decimal | ✅ |
| Estoque mínimo / alertas | ✅ |
| Movimentações | ✅ |
| Fornecedores | ✅ |
| Peça sem categoria | ✅ → `outros` |
| Peça sem unidade | ✅ → `unidade` |

---

## 5. Permissões por perfil

Matriz em `src/services/auth/permissions.ts` + `ProtectedRoute` / Sidebar.

| Perfil | Visão geral |
|--------|-------------|
| **Dono** | Acesso total; planos; reset dados; usuários |
| **Gerente** | Quase total; sem excluir oficina / alterar plano |
| **Recepção** | Clientes, OS, agenda; financeiro limitado; sem editar preços de estoque |
| **Mecânico** | OS (linhas); consulta estoque; portal timeline moto; sem valores financeiros completos |

**Pendente manual:** teste E2E por perfil em ambiente real (login com cada papel).

---

## 6. Planos Free / Profissional / Premium

Gates via `RecursoPlanoGate` e `AvisoLimitePlano`.

| Recurso | Free | Profissional | Premium |
|---------|------|--------------|---------|
| Financeiro completo | ❌ | ✅ | ✅ |
| Relatórios avançados | ❌ | ✅ | ✅ |
| Estoque avançado | ❌ | ✅ | ✅ |
| Multiusuários | ❌ | ✅ | ✅ |
| Checklist personalizado | ❌ | ❌ | ✅ |
| Lembretes | ❌ | ✅ | ✅ |
| Comunicação | ❌ | ✅ | ✅ |
| Portal do cliente | ❌ | ✅ | ✅ |
| Catálogo de serviços | ❌ | ✅ | ✅ |

Limites Free: 30 clientes, 30 motos, 50 OS/mês.

---

## 7. PWA e modo offline

| Item | Status |
|------|--------|
| Indicador online/offline | ✅ `IndicadorConexao` + `AvisoModoOffline` |
| Botão instalar app | ✅ Configurações + componente PWA |
| App abre offline | ✅ Service worker (vite-plugin-pwa) |
| Dados locais | ✅ localStorage multi-tenant |
| Fila de sincronização | ⚠️ Preparada (`sync-queue.service.ts`); **não conectada ao Supabase** |
| Backup | ⚠️ Apenas reset para seed; **sem export/import JSON dedicado** |

Documentação existente: `docs/offline-first.md`, `docs/pwa-offline.md`.

---

## 8. PDF e recibo

| Item | Status |
|------|--------|
| Sem erro oklch | ✅ Sanitização em `pdf-capture.service.ts` |
| Download direto | ✅ Sem pop-up |
| Layout branco | ✅ `os-documento.css` |
| Múltiplas páginas | ✅ Paginação automática no jsPDF |
| Recibo parcial / quitação | ✅ |
| Saldo restante | ✅ Seção “Informações financeiras” |

---

## 9. Problemas encontrados e correções desta auditoria

### Críticos (corrigidos)

1. **Migração frágil** — arrays `undefined` no localStorage quebravam todas as telas.  
   → `garantirEstruturaDatabase()` em `database-migration.service.ts`.

2. **Preferências ausentes** — Configurações quebrava com config antiga.  
   → Fallback `PREFERENCIAS_PADRAO`.

3. **Datas/horários nulos** — Dashboard, Financeiro, Agenda, Relatórios.  
   → Helpers em `lib/dados-legados.ts`.

4. **Totais financeiros inconsistentes** — Relatórios, portal e analytics usavam `os.valor_total` desatualizado.  
   → Unificados com `calcularTotalGeralDeCampos`.

5. **Tela preta em erro React** — Sem boundary.  
   → `ErrorBoundary` envolvendo `AppLayout`.

### Médios (já corrigidos em sessões anteriores)

- Pagamento OS com total desatualizado vs resumo financeiro.
- Peça duplicada na OS (`linha_id`).
- Recibo sem saldo restante em pagamento parcial.

### Baixos (pendentes — ver seção 10)

- Rota dedicada “Backup e Segurança”.
- Export/import JSON de backup.
- Sincronização real com Supabase.
- Testes automatizados E2E.

---

## 10. Pontos pendentes

| Prioridade | Item |
|------------|------|
| Alta | Integração Supabase (auth, RLS, repositório remoto) |
| Alta | Conectar fila de sync offline → Supabase |
| Média | Tela Backup: exportar/importar JSON criptografado |
| Média | Testes manuais sistemáticos por papel (Dono/Gerente/Recepção/Mecânico) |
| Média | Testes automatizados (Vitest) para `os-financeiro.service` e migração |
| Baixa | Unificar `valor_estimado` vs total recalculado no WhatsApp |
| Baixa | Code-splitting (bundle > 500 kB) |

---

## 11. Riscos antes do Supabase

1. **Dados só no navegador** — perda se limpar cache/dispositivo; mitigar com backup exportável.
2. **Concorrência multi-dispositivo** — inexistente hoje; Supabase precisará de versionamento/merge.
3. **Autenticação local** — senhas em localStorage; substituir por Supabase Auth.
4. **IDs gerados no cliente** — compatível, mas validar unicidade no servidor.
5. **Anexos/logo base64** — migrar para Storage com limite de tamanho.
6. **Plano/assinatura simulada** — integrar gateway real antes de produção comercial.

---

## 12. Recomendação — próximo passo

**Fase 1 — Supabase foundation (1–2 sprints)**

1. Implementar `SupabaseCraftRepository` espelhando `ICraftRepository`.
2. Migrar auth para Supabase (manter papéis na tabela `usuarios`).
3. Executar schema em `docs/supabase-schema.sql` com RLS por `office_id`.
4. Manter `migrateDatabase` + `garantirEstruturaDatabase` na importação de dados legados.

**Fase 2 — Sync e backup**

1. Ativar `sync-queue.service` com retry e resolução de conflitos simples (last-write-wins por entidade).
2. Adicionar export/import JSON em Configurações.

**Fase 3 — Hardening**

1. Testes unitários dos serviços financeiros e estoque.
2. Checklist de QA por perfil e por plano antes de go-live.

---

## 13. Arquivos alterados nesta auditoria

- `src/services/database-migration.service.ts` — estrutura segura + migração
- `src/lib/dados-legados.ts` — helpers dados antigos
- `src/components/shared/ErrorBoundary.tsx` — mensagens amigáveis
- `src/App.tsx` — boundary no layout autenticado
- `src/services/analytics.service.ts` — totais recalculados
- `src/services/portal-cliente/portal-cliente.service.ts` — datas e totais seguros
- `src/services/relatorios.service.ts` — totais e datas seguros
- `src/pages/DashboardPage.tsx`, `FinanceiroPage.tsx`, `AgendaPage.tsx`, `MotosPage.tsx`
- `src/pages/ConfiguracoesPage.tsx`, `PortalClienteDetalhePage.tsx`
- `src/components/motos/MotoHistoricoDialog.tsx`

---

*Documento gerado como parte da auditoria pré-Supabase do Craft Oficina MVP.*
