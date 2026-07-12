# ADR — Bloco r9-2 prompt-honestidade: recovery de tool-error responde exatidão/critério + meta-narrativa não vaza

- **Data:** 2026-07-12
- **Branch:** `fix/r9-2-prompt-honestidade`
- **Itens:** FIX-282, FIX-283 (veredito r9pos, Sonnet 5, UX 4/10 — G-B/I2 e G-D)
- **Natureza:** honestidade do agente no pós-reveal. 2 itens, bloco isolado (onda 1, paralelo a
  `bloco-r9-2-anchor-fechamento` e `bloco-r9-2-gate-refino`).

---

## FIX-282 — fallback de tool-error cego à pergunta de exatidão/critério (decisão de design real)

### Contexto

Veredito r9pos (§2 sonda I2, §3 G-B): o usuário pressiona "essa carta que você recomendou é de
120 mil como pedi? Por que essa e não outra?" logo após o reveal. O modelo tenta `search_groups`
pra "conferir" — fora do toolset da fase `reveal` (`tool-policy.ts`), vira `tool-error`. O
orchestrator (`index.ts:475-500`) intercepta e substitui a narração por um fallback genérico
("as opções que já apareceram aqui pra você continuam valendo...") — cego ao CONTEÚDO da
pergunta, nunca responde SIM/NÃO nem explica o critério. A resposta honesta (comparação
`rawCreditValue` × `creditValue`, diretiva FIX-277 já existente em `system-prompt.ts:598-609`)
nunca chegava a rodar.

### A decisão em aberto

`meta.recommendedOffer` (`personas.ts:163-174`) não persiste `score`/`scoreBreakdown` — só
`administradora/category/creditValue/termMonths/monthlyPayment/groupId`. Quando o usuário
pergunta "por que essa e não outra" (o CRITÉRIO de ranking), não há dado determinístico em
memória pra citar um número real de score.

### Opções levantadas

1. **(Recomendada, escolhida) Opção A — responder só a parte de EXATIDÃO com números reais +
   frase honesta-mas-genérica sobre o critério combinado** (prazo/parcela/contemplação), sem
   inventar um score que não existe em memória. Menor blast radius, resolve o P1 imediato sem
   mudar schema.
2. Opção B — persistir `score`/`scoreBreakdown` em `meta.recommendedOffer` no momento do reveal
   (`runner.ts`, mesmo ponto que já grava `creditValue`/`termMonths`/`monthlyPayment`) e citar o
   critério REAL na resposta. Mais completo, porém muda o schema de
   `ConversationMetadata.recommendedOffer` e `personas.ts` — escopo maior que este bloco.

### Decisão

**Escolhida a Opção A.** Quem decidiu: Kairo, via `AskUserQuestion` com a opção recomendada em
1º lugar (sessão de execução do bloco, 2026-07-12).

**Porquê:** resolve o P1 do veredito (a pergunta do cliente nunca fica sem resposta honesta)
sem inventar um número que não existe em memória — a alternativa (Opção B) seria mudar o schema
de `recommendedOffer`/`personas.ts` pra um ganho que o card já classificou como "achado pra
rodada seguinte", fora do escopo deste bloco.

### Implementação

- Novo classificador `isExactnessOrCriteriaQuestion` (`directives.ts`) — regex estreito nos
  padrões literais do dossiê ("bate", "exato(a)/exatamente", "sem ajuste", "o mesmo valor",
  "como pedi", "por que essa", "e não outra", "critério", "por que [você] recomend[a/ou]").
  Escopo estreito por decisão de design (preferindo falso-negativo a falso-positivo, mesmo
  padrão do FIX-283 abaixo).
- Novo builder `buildToolErrorRecoveryExactnessFallback` — compara `rawCreditValue`
  (`qualifyAnswers.creditClampedFrom ?? creditMax`, mesma âncora do FIX-261/281) × `creditValue`
  real, no padrão já validado da diretiva FIX-277.
- Novo branch em `index.ts:475-500`, ANTES do `mentionedOffer`/fallback genérico: dispara quando
  `isUserTurn && isExactnessOrCriteriaQuestion(userText) && meta.recommendedOffer?.creditValue`.
  `wants_more_options` genuíno (I1, "quero ver mais opções") não casa o classificador — continua
  recebendo o fallback antigo (regressão coberta em teste, não regrediu).

### Consequências

- A pergunta de exatidão/critério do cliente no meio de um tool-error agora SEMPRE recebe
  números reais, nunca contenção cega.
- Achado aberto pra rodada seguinte (não implementado aqui): persistir `score`/`scoreBreakdown`
  reais em `meta.recommendedOffer` (Opção B) pra citar o critério de ranking com números
  concretos em vez da frase genérica sobre prazo/parcela/contemplação.

---

## FIX-283 — meta-narrativa do mecanismo interno vaza (sem decisão de design aberta)

Correção fechada desde o card — nova categoria de blocklist `isMechanismNarrationClaim`
(`sanitizer.ts`, adicionada a `isEphemeralSegment`) + reforço de fraseado em
`whatsappOptinSection("done")` (`system-prompt.ts:918-920`). Sem trade-off de produto em
aberto. Ver `docs/correcoes/done/fix-283-metanarrativa-whatsapp-optin-vaza.md`.
