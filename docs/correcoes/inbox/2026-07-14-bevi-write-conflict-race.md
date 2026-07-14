---
titulo: "P0 — Bevi devolve 'write conflict' quando o turno faz 2+ chamadas no mesmo proposal (jornada quebra de forma intermitente)"
origem: QA ao vivo do loop-de-goal (rodada 1/2), 2026-07-14
---

# Bevi: write conflict por chamadas concorrentes no mesmo proposal

## Cenário
No turno do reveal, o modelo chama `search_groups` + `recommend_groups` (+ às vezes
`simulate_quota` e `present_comparison_table`). Cada uma dispara `update-step` no **mesmo**
proposal da Bevi (`BEVI_SELFCONTRACT_HASH` é único para todas as conversas de homologação).

Resultado (log real):

```
BeviApiError: "Caused by :: Write conflict during plan execution and yielding is disabled.
               :: Please retry your operation or multi-document transaction."
[discovery-failed] guard: descoberta falhou no turno — fallback determinístico
```

O usuário vê: *"não consegui carregar as opções agora"* — e a jornada morre ali.

## Por que é intermitente
É uma RACE. A mesma jornada funcionou minutos antes (23 ofertas reais retornadas) e falhou
depois. Depende do tempo entre as chamadas.

## Impacto
- Quebra a jornada de forma aleatória, no ponto mais importante (o reveal).
- Também torna **impossível rodar QA em paralelo** (duas jornadas simultâneas colidem) — o que
  já custou uma coleta inteira nesta campanha.

## Correção proposta (a investigar)
- **Serializar** as chamadas à Bevi por conversa (lock/mutex no adapter) — nenhuma escrita
  concorrente no mesmo proposal.
- E/OU **retry com backoff** no `BeviApiError` de write conflict (a própria mensagem da API
  pede: *"Please retry your operation"*).
- Verificar com a AGX/Bernardo se dá pra ter um proposal-hash **por conversa** em homologação —
  a raiz do problema é o hash compartilhado.

## Evidência
`docker logs` do container do app, conversas `576ddd27…` e `777239e1…` (2026-07-14).
