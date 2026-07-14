---
id: FIX-348
titulo: "P1 — meta-narrativa de pipeline sobrevive há 3 rodadas ('Deixa eu apresentar as opções pra você escolher')"
status: todo
bloco: bloco-f-turno-vazio-meta
arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/directives.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 4
---

# FIX-348 — o agente ainda narra o próprio pipeline

## Cenário (3ª rodada seguida)
No reveal, o agente empilha frases que **anunciam o passo** em vez de dar o passo:

> "Separei as melhores pra você conferir — vem ver qual encaixa melhor."
> "Deixa eu apresentar as opções pra você escolher uma e simular:"
> "Escolhe uma pra simular e ver como fica a parcela com tudo incluso."

Três frases dizendo a MESMA coisa. Soa como log de execução, não como gente vendendo.

## Root cause
O FIX-335 criou `PRODUCT_STEP_ANNOUNCEMENT_PATTERNS` (sanitizer) mas ele cobre só parte dos
padrões ("Agora vou…"). Escapa tudo que é "Deixa eu…", "Separei…", "Vou te mostrar…".

E a raiz está no **directive**: ele descreve a sequência numerada ("(1) escreva… (2) chame…") de um
jeito que o modelo ECOA como narração.

## Correção proposta
| O quê | Onde |
|---|---|
| Reescrever o directive do reveal pra pedir o RESULTADO, não a sequência ("apresente as opções", não "(1) escreva uma frase (2) chame a tool") | `directives.ts` (search-summary / recomendação) |
| Ampliar o guard pra família toda: "deixa eu (te )?(mostrar\|apresentar\|trazer)", "separei", "vou te mostrar", "vou apresentar" — quando SEGUIDO de um card no mesmo turno | `sanitizer.ts` |
| ⚠️ Cuidado pra não virar mordaça: o agente pode e deve fazer transições curtas. O alvo é a REDUNDÂNCIA (3 frases pro mesmo ato), não a transição | — |

## Regressão exigida
- Unit: "Deixa eu apresentar as opções pra você escolher uma e simular:" é dropado quando um card
  sai no mesmo turno.
- Unit: uma transição curta legítima ("Olha só o que encontrei:") PASSA.
