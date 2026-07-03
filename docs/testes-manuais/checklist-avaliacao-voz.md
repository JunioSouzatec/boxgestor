# Testes manuais — Parser de Avaliação por Voz

Casos de validação para `src/lib/checklist-avaliacao-voz.ts`.

Use no modal **Avaliação por voz** do checklist de entrada (OS em modo completo). Antes de aplicar, confira a prévia: cada item deve aparecer com resposta e observação sugerida.

## Frases obrigatórias

### Frase A
**Fala:** `lanterna traseira quebrada, pneu dianteiro gasto, para-brisa trincado, tanque meio`

**Esperado na prévia:**
- Lanternas → Não OK
- Pneus → Não OK
- Para-brisa → Não OK
- Combustível → 1/2

### Frase B (sem vírgulas)
**Fala:** `lanternas riscadas pneus ruins parabrisa trincado`

**Esperado na prévia:**
- Lanternas, Pneus e Para-brisa identificados (≥ 3 segmentos)

### Frase C
**Fala:** `farol esquerdo arranhado retrovisor quebrado documento entregue`

**Esperado na prévia:**
- Faróis → Não OK (ou equivalente)
- Retrovisores → Não OK
- Documento → Entregue

### Frase D
**Fala:** `tanque um quarto`

**Esperado na prévia:**
- Combustível → 1/4

### Frase E (erro de transcrição)
**Fala:** `penus gasto`

**Esperado na prévia:**
- Pneus → Não OK

## Frases adicionais (checklist real)

### Frase longa sem vírgulas
**Fala:** `lanterna traseira quebrada pneu dianteiro gasto parabrisa trincado tanque meio`

**Esperado:** ≥ 4 itens na prévia (não associar tudo só ao combustível).

### Frase 1 completa — carros
**Fala:** `lanterna traseira quebrada, pneu dianteiro gasto, para-brisa trincado, retrovisor quebrado, tanque meio`

**Esperado (checklist padrão carros):**
- Lanternas, Pneus, Combustível 1/2
- Para-brisa/retrovisor podem mapear para item de vidros, se existir no modelo

### Frase 1 sem vírgulas — motos
**Fala:** `lanterna traseira quebrada pneu dianteiro gasto parabrisa trincado retrovisor quebrado tanque meio`

**Esperado:** Lanterna, Pneus, Retrovisores, Combustível 1/2.

### Frase 2 — motos
**Fala:** `farol esquerdo arranhado, seta direita quebrada, documento entregue, pneu traseiro ruim`

**Esperado:** Farol, Setas, Documento, Pneus.

### Frase 3 — motos
**Fala:** `parabrisa trincado pneus gastos lanternas quebradas tanque um quarto`

**Esperado:** Lanterna, Pneus, Combustível 1/4.

## Como testar

1. Abrir OS (editar) com checklist de entrada.
2. Clicar em **Avaliação por voz**.
3. Falar ou colar a frase na transcrição.
4. **Finalizar avaliação** e conferir a prévia.
5. **Aplicar ao checklist** e verificar os campos preenchidos.

## Diagnóstico (desenvolvimento)

No console do navegador (modo dev), após analisar/aplicar:

- `[Voz] Transcrição analisada`
- `[Voz] Sugestões detectadas`
- `[Voz] Itens aplicados no checklist`
- `[Voz] Itens não encontrados no checklist` (se houver)
