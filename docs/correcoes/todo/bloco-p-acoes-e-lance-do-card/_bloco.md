---
bloco: bloco-p-acoes-e-lance-do-card
onda: 1
depends_on: []
paralelo_com: [bloco-n-optin-redundante, bloco-o-outras-opcoes-dedupe, bloco-q-handoff-msg-duplicada, bloco-r-scroll-inteligente]
itens: [FIX-29, FIX-30]
escopo_arquivos:
  - src/components/chat/artifacts/simulation-result.tsx
  - src/app/api/chat/route.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/chat/types.ts
  - src/lib/adapters/bevi/offer-mapper.ts
conflitos_esperados:
  - "src/app/api/chat/route.ts: nível 2 com bloco-n (regiões distintas — aqui handler interest ~401 + handler novo adjust-value; lá contract-submit ~452). Ordem de merge recomendada: bloco-p primeiro, bloco-n resolve."
  - "src/lib/chat/types.ts: nível 2 com bloco-n (payloads/kinds distintos, append)."
---

# Bloco P — Ações e bloco de lance do card de simulação

FIX-29 e FIX-30 juntos porque ambos reescrevem regiões de
`simulation-result.tsx` (handler de actions e render do bloco de lance) — no
mesmo bloco não há conflito. Ordem interna: **FIX-29 primeiro** (roteamento de
intents é o defeito mais grave — clique inverte a intenção do usuário), depois
FIX-30 (rotulagem/mapper).

Origem: testes manuais do Kairo no dev (2026-06-11). A frase dele — "é muita
alucinação" — na verdade descreve dois defeitos DETERMINÍSTICOS: kind único
pra toda action (front) e semânticas misturadas no offer-mapper.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-p-acoes-e-lance-do-card/ na ordem FIX-29 → FIX-30.
> FIX-30 tem `decisao_pendente` PARCIAL: a parte de rotulagem honesta
> (mapper + render) vai JÁ; o que depender da semântica AGX
> (perguntas 7/8 da proposta-simulador.md) fica explícito como TODO no código.
> TDD strict nas camadas exigidas em cada item (ver falhar antes do fix).
> 1 commit `test+fix:` POR item, mover cada um pra done/ ao concluir e apagar
> a pasta do bloco no fim.
