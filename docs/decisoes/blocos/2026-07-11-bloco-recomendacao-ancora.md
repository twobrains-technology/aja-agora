# ADR — Bloco Recomendação-Ancora: ancorar o ranking no valor do bem pedido

- **Data:** 2026-07-11
- **Branch:** `fix/recomendacao-ancora-valor-pedido`
- **Itens:** FIX-276 (QA do dono, 2026-07-11 — conversa `f6c5aec0`, ledger
  `.processo/qa/2026-07-11-conversa-consorcio-ledger.md`)
- **Natureza:** correção de scoring (risco CDC). 1 item, bloco isolado.

---

## FIX-276 — recomendação favorecia carta MAIS CARA que o valor pedido

### Contexto

Cenário reportado: categoria Carro, "creta 2023", **valor do bem R$ 120.000**, busca real
Bevi. Esperado: a recomendada honra o pedido (havia BB R$ 120.000 exato). Atual: recomendou
**ITAÚ R$ 150.000** (25% acima do pedido), parcela 64% maior.

Root cause confirmado no código (`src/lib/agent/recommendation.ts` + `src/lib/agent/tools/ai-sdk.ts`):

1. `recommend_groups` exige `budget` ("orçamento mensal do usuário") mas o usuário **nunca
   informa** orçamento mensal — só o valor do bem. O LLM **inventa** esse número pra poder
   chamar a tool (achado já registrado na rodada de 2026-07-01, [[project_aja_tela_recomendacao_dados_reais]]).
2. `monthlyFitScore` tinha o **maior peso do score (0.4)** e premia parcela em 70-100% do
   budget. Budget inventado alto ⇒ carta de parcela maior vence ⇒ recomendação acima do
   valor pedido.

Núcleo: a recomendação estava ancorada num **número fabricado** (budget mensal), não no
**dado real do cliente** (o valor do bem que ele pediu pra comprar).

### Opções levantadas

1. **(Recomendada, escolhida) Fator de proximidade de carta no score.** Novo fator
   `creditProximityScore(creditValue, creditMax)` — penaliza linearmente
   `|creditValue − creditMax| / creditMax` (carta == pedido pontua 1; quanto mais distante,
   pra cima OU pra baixo, mais penaliza). Entra em `WEIGHTS` como o fator **dominante** (0.4),
   com os demais rebalanceados pra baixo (soma continua 1.0). `budget` continua existindo e
   entrando no score (monthlyFit não desaparece — ainda desempata conforto de parcela), mas
   perde a capacidade de sozinho empurrar a recomendação pra uma carta acima do pedido.
2. Derivar o `budget` server-side a partir do valor do bem pedido (backstop determinístico no
   input da tool, padrão FIX-115/FIX-208), em vez de aceitar o número que o LLM inventa.
3. Coletar orçamento mensal real do usuário (novo slot na conversa) — descartada de saída,
   fora do escopo deste bloco (mudança de fluxo de conversa, não de scoring).

### Decisão

**Opção 1.** Motivos (avaliados sem necessidade de escalar — ver análise abaixo):

- **Garante o invariante diretamente.** O pedido do cliente (`creditMax`) é o único número
  **real** nesta equação — o usuário sempre informa o valor do bem, nunca o orçamento mensal.
  Ancorar o fator dominante nele resolve a causa raiz sem depender de nenhuma heurística nova.
- **Opção 2 não garante nada, só desloca a fabricação.** Derivar budget a partir do valor do
  bem exigiria inventar uma RAZÃO parcela/valor-do-bem (não existe essa constante no domínio —
  varia por administradora, prazo e taxa de adm) — troca "LLM inventa" por "código inventa",
  sem fechar o buraco: o número resultante ainda seria um proxy indireto, e o
  `monthlyFitScore` continuaria podendo empurrar a recomendação pra cima do pedido em casos
  onde a heurística de conversão erra (ex.: prazo muito longo/curto muda a parcela por um
  fator grande). A Opção 1 mede a distância ao pedido **diretamente**, sem heurística
  intermediária.
- **Matemática verificada no pior caso.** Simulei o cenário adversarial (budget "inventado"
  casando EXATAMENTE a parcela da carta mais cara, o máximo que `monthlyFit` pode favorecer a
  opção errada) com os pesos escolhidos — a carta que bate o pedido vence com margem
  confortável (~0.045 de score, numa escala 0-1) mesmo nesse pior caso. Confirmado também
  com dados REAIS capturados da Bevi (fixture AUTOS: BB R$ 50.000, ITAÚ R$ 54.832, ÂNCORA
  R$ 42.000) — nesse dataset real, o padrão do bug se reproduz fielmente com os pesos ANTIGOS
  (ITAÚ vence por score) e se corrige com os pesos NOVOS (BB vence).
- Dado que a Opção 2 é estritamente mais fraca (não garante o invariante, introduz uma nova
  heurística sem base no domínio) e a Opção 1 é a que o próprio achado já apontava como
  recomendada, não havia trade-off real a escalar via `AskUserQuestion` — decisão tomada e
  registrada aqui pra auditoria.

### Pesos escolhidos

| Fator | Antes | Depois |
|---|---|---|
| `creditProximity` (novo) | — | **0.4** |
| `monthlyFit` | 0.4 | 0.15 |
| `contemplation` | 0.25 | 0.2 |
| `adminFee` | 0.2 | 0.15 |
| `termMatch` | 0.15 | 0.1 |

`monthlyFit` perde peso mas não é removido — o conforto de parcela ainda desempata entre
cartas igualmente próximas do pedido. Sem `creditMax` (busca sem faixa), o fator novo vira
neutro (0.5), mesmo padrão dos demais fatores quando falta dado
(`contemplationScore`/`termMatchScore`).

### Alternativas descartadas

- Opção 2 (budget server-side derivado do valor do bem): descartada — ver acima, não garante
  o invariante e introduz heurística de conversão sem base de domínio documentada.
- Opção 3 (coletar orçamento mensal real): fora de escopo — mudaria o fluxo de qualificação da
  conversa, não é uma correção de scoring. Fica como gancho pra uma rodada de produto futura,
  se algum dia fizer sentido personalizar por orçamento real declarado.
- Curva de penalização não-linear (quadrática) pra `creditProximity`: descartada — a
  instrução original pediu explicitamente a razão linear
  `|creditValue − creditMax| / creditMax`; a linear já garante margem confortável no pior caso
  testado, sem precisar de uma curva mais agressiva.
- Expor `creditProximity` no breakdown visível do card (`FACTOR_LABELS`,
  `recommendation-card.tsx`): descartada por ora — fica fora do escopo deste bloco (arquivos
  declarados: `recommendation.ts` + `ai-sdk.ts`). O fator já entra no `scoreBreakdown` do
  payload (mesmo padrão do `adminFee`, que também não é exibido — decisão de produto anterior,
  Bernardo 2026-06-11); decidir se vale exibi-lo é uma escolha de UX separada, não uma
  correção de bug.

### Implementação

- `src/lib/agent/recommendation.ts`: nova `creditProximityScore(creditValue, creditMax)`;
  `WEIGHTS` com o novo fator + rebalanceamento; `ScoringInput.creditMax?`; `ScoredGroup.factors`
  ganha `creditProximity`; `rankGroups` computa e pondera o novo fator.
- `src/lib/agent/tools/ai-sdk.ts`: `executeRecommendGroups` passa `searchParams.creditMax`
  (o valor do bem pedido, já existente no schema `recommendGroupsSchema`) pro `ScoringInput` de
  `rankGroups`. `budget` continua sendo repassado como já era.
- `src/lib/consorcio/score-label.ts`: comentário que citava o peso antigo (0.4) do
  `monthlyFit` corrigido pra não descrever um número que deixou de ser verdade.
- Testes:
  - **Camada 1 (estrutural):** `src/lib/agent/recommendation.fix276.test.ts` — 3 cenários
    paramétricos (`creditMax` 80k/120k/250k), cada um no PIOR caso pro fix (budget inventado
    casando a parcela da carta mais cara) + 1 caso sem `creditMax` (fator neutro). Falha antes
    do fix, passa depois (verificado via `git stash`).
  - **Camada 2 (cassette, dados reais):** `tests/regression/fix-276-recomendacao-ancora.test.ts`
    — chama `recommend_groups` de ponta a ponta (`buildConsorcioTools` + fixture real da Bevi,
    captura AUTOS de 2026-05-27) com `creditMax` batendo exato com uma das 3 ofertas reais e
    budget adversarial casando a parcela da oferta mais cara. Reproduz o padrão exato do bug
    real nos pesos antigos (ITAÚ vence) e corrige nos pesos novos (BB vence). Falha antes do
    fix, passa depois (verificado via `git stash`).

### Consequências

- ✅ Invariante do fix (recomendada não fica acima do pedido sem justificativa) garantido por
  matemática verificada no pior caso adversarial + reproduzido com dados reais da Bevi.
- ✅ `monthlyFit` não desaparece — conforto de parcela ainda pesa no desempate.
- ⚠️ **Gap residual conhecido:** o `budget` continua sendo um número fabricado pelo LLM — este
  fix neutraliza o efeito danoso dele no ranking, mas não elimina a fabricação em si (isso
  exigiria a Opção 3, fora de escopo). Se o produto algum dia coletar orçamento real, o fator
  `monthlyFit` passa a carregar sinal de verdade — nenhuma mudança de código necessária além
  de parar de inventar o valor.
- ⚠️ **Gate `pnpm test:unit` — ambiente deste worktree sem Postgres local:** 5 testes
  pré-existentes falham por `password authentication failed for user "test"` (sem relação com
  este fix — todos batem em `db.insert`/`db.delete`/`db.select` de código não tocado por esta
  mudança: `contract-summary.test.ts`, `lead-history-completeness.test.ts` ×2,
  `ai-sdk.test.ts` via `markShown`). Confirmado via `git stash` que a falha independe deste
  fix (mesmos 5 testes falham com ou sem as mudanças). Causa: este worktree não tem
  `.env.local`/stack local-dev bootstrapada (`aja-pg-fix-recomendacao-ancora-valor-pedido`
  nunca subiu) — gap de ambiente, não de código. `1399 passed, 217 skipped` no restante da
  suíte, incluindo todos os testes de `recommendation.ts`/`rankGroups`/`recommend_groups`
  (64/67 em `ai-sdk.test.ts`, únicas 3 falhas ali são as mesmas de DB).
- **Reversibilidade:** fácil (mudança de pesos + 1 fator novo em função pura; sem migração,
  sem shape de dado novo pra fora do backend).
- **Status:** aceita e implementada. **Evidência:** FIX-276.
