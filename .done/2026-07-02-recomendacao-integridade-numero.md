# Fix: Integridade de Número na Jornada de Recomendação

**Branch:** fix/recomendacao-integridade-numero  
**Data:** 2026-07-02  
**Commit:** e2fe7c4  
**Executor:** Claude Code (Kairo coordenando)  

---

## Resumo

Correção de bug crítico de **integridade de dados** em recomendações de consórcio:
- **A)** Agente afirmava "93,17% do seu teto declarado" SEM cliente ter informado orçamento mensal (teto FABRICADO de default)
- **B)** MOTO nunca coleta orçamento, mas frase de teto poderia ser emitida (design inconsistente)
- **C)** Gap entre números de recomendação (descoberta) e carta real (fechamento) — classificado como product-decision, fora escopo

Encontrado em QA de produção (2026-07-02, todas as modalidades). Corrigido com TDD strict (Camadas 1+2).

---

## Bugs Encontrados (QA)

### 1. Teto Fabricado (IMÓVEL, WEB, PROD)
- **Cenário:** Jornada imóvel (valor R$ 300k, lance, lance embutido) — **nenhuma coleta de orçamento**
- **Sintoma:** Recomendação: "R$ 1.863,32/mês representa **93,17% do seu teto declarado**"
- **Problema:** Cliente nunca declarou teto; número é fabricado (default interno ≈R$ 2.000)
- **Risco:** CDC art. 30/37 — número afirmado como fato sem base em dados reais

### 2. MOTO Sem Coleta de Orçamento
- **Context:** system-prompt.ts linhas 15-17 definem MONTHLY_BOUNDS pra imovel/auto/servicos, **MOTO não aparece**
- **Problema:** Se frase "% do seu teto" fosse emitida pra MOTO, seria dado inexistente
- **Decisão:** Omitir frase inteiramente pra MOTO (b1 — choice do Kairo)

### 3. Divergência Recomendação vs Carta Real
- **Cenário:** Recomendação mostra R$ 1.863/mês (283k/200m) → Carta real R$ 2.745/mês (312k/210m) — **+47%**
- **Classificação:** Gap entre dois shapes Bevi (descoberta=rico; fechamento=magro) — **investigado, product-decision**
- **Status:** Fora escopo deste fix; registrado pra revisão de reconciliação Bevi

---

## Correção (Fix)

### A) Blindagem de Budget em directives.ts
**Arquivo:** src/lib/agent/orchestrator/directives.ts (linha 205)

```typescript
// FIX-INTEGRIDADE (2026-07-02): frase "% do seu teto" NÃO pode aparecer quando:
// 1. Cliente NÃO declarou orçamento mensal (monthlyBudget undefined)
// 2. Categoria é MOTO (não coleta orçamento mensal — system-prompt FIX-104 passo 15-17)
const hasBudget =
  category !== "moto" &&
  typeof q.monthlyBudget === "number" &&
  q.monthlyBudget > 0;
```

**Efeito:** 
- `recommend_groups` NUNCA recebe `budget` arg se monthlyBudget undefined
- `recommend_groups` NUNCA recebe `budget` arg se categoria é MOTO
- Bloco `CONFRONTO DE VIABILIDADE` (confrontoBudget) só aparece se `hasBudget === true`

### B) Guardrail no System Prompt
**Arquivo:** src/lib/agent/system-prompt.ts (linha 606)

```markdown
**FIX-INTEGRIDADE (2026-07-02): REGRA DURA — "% do seu teto" SÓ EMITIR SE CLIENTE DECLAROU ORÇAMENTO**
Se o cliente NÃO informou um orçamento mensal durante a conversa (o sistema não passou `budget` nos args),
você NUNCA cite "teto", "orçamento declarado" ou "parcela X% do seu orçamento" — esses dados NÃO existem.
Omita a frase inteira. Caso especial: MOTO não coleta orçamento — NUNCA cite teto/orçamento pra MOTO.
```

**Efeito:** Prompt deixa explícito que frase é condicional ao dado real coletado.

---

## Testes (TDD Strict)

### Camada 1 — Structural (Fonte + Directives)
Verificações determinísticas de guards:

**src/lib/agent/system-prompt.recomendacao-integridade.test.ts**
- ✅ Prompt menciona "teto DECLARADO pelo próprio usuário" (não default)
- ✅ Prompt proíbe usar teto quando cliente NÃO declarou orçamento
- ✅ MOTO referenciado em contexto de orçamento

**src/lib/agent/orchestrator/directives.recomendacao-integridade.test.ts**
- ✅ IMOVEL COM orçamento: passa `budget` em args
- ✅ IMOVEL SEM orçamento: NÃO passa `budget` em args
- ✅ MOTO: NÃO passa `budget` mesmo se monthlyBudget set (decisão b1)
- ✅ AUTO com orçamento: passa `budget` em args

### Camada 2 — Trajectory Snapshots (Cassettes)
Regex detectors + cassettes esperados:

**tests/regression/agent-trajectory.test.ts**
- ✅ Detector regex: frases proibidas ("% do seu teto" sem declaração)
- ✅ Cassette real observado (QA prod): "93,17% do seu teto declarado" caça com detectors
- ✅ Cassette esperado MOTO: omite teto, apenas menciona parcela
- ✅ Structural: directives.ts tem `category !== "moto"` guard

---

## Decisões de Produto

### B — MOTO: Omitir Teto vs Adicionar Coleta

**Opção B1 (ESCOLHIDA):** Omitir comparação de teto pra MOTO
- MOTO não coleta orçamento mensal
- Frase "% do seu teto" não faz sentido sem o dado
- Recomendação menciona parcela e score, sem teto

**Opção B2 (rejeitada):** Adicionar coleta de orçamento pra MOTO
- Requer design de UX novo (gate adicional ou integração)
- Amplifica surface de coleta sem clareza de valor

**Justificativa:** B1 é coerente com contrato atual: sem coleta = sem frase.

### C — Divergência Recomendação vs Fechamento

**Status:** Investigado, product-decision separada
- Causa: Dois shapes Bevi (descoberta=rico data; fechamento=magro) retornam grupos diferentes
- Reconciliação plena é refactor de Bevi bridge (fora escopo TDD deste bug)
- Recomendação: gap documentado; próximas ciclos: alertar usuário antes do "Confirmar e contratar"

---

## Branches & Próximas Ações

- **Branch atual:** fix/recomendacao-integridade-numero
- **Destino merge:** develop (via PR)
- **Gate de merge:** pnpm test:unit (Camadas 1+2 struktural)
- **QA de validação:** E2E em all-canals (web, WhatsApp) com cassettes verificando regressão

### Pendências para Kairo/Equipe
1. **Antes de merge:** Rodar CI com `pnpm test:unit` completo (Camada 3 LLM-as-judge nightly)
2. **QA final:** Testar jornada imóvel/auto/moto com e sem orçamento declarado (web + WhatsApp)
3. **Divergência Bevi (C):** Agendar revisão de reconciliação com Bernardo + Bevi API

---

## Arquivos Modificados

```
src/lib/agent/orchestrator/directives.ts ± ~10 linhas (hasBudget blindado)
src/lib/agent/system-prompt.ts ± ~5 linhas (guardrail FIX-INTEGRIDADE)
tests/regression/agent-trajectory.test.ts ± ~60 linhas (cassettes + detectors)

Novos:
src/lib/agent/system-prompt.recomendacao-integridade.test.ts (42 linhas)
src/lib/agent/orchestrator/directives.recomendacao-integridade.test.ts (70 linhas)
```

---

## Observações

- **Regra de Autonomia:** Kairo foi consultado apenas sobre **B** (decisão de produto — MOTO). Fix **A** foi aplicado direto (blindagem obvia).
- **Escalação:** Bug era **crítico** (CDC violação potencial de art. 30/37). Fix foi priorizado fim-de-dia QA.
- **Cassettes:** Não foram adicionados ao histórico de conversa real (seria snapshots enormes). Foram registrados como regex/estrutura em Camada 2 pra detecção futura.

---

**Status:** ✅ **PRONTO PÁRA MERGE** (testes estruturais verdes; Camada 3 nightly).
