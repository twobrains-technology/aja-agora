---
bloco: bloco-u-campos-novos-bevi
branch: feat/campos-novos-bevi-prazo-lance
workspace: feat-campos-novos-bevi-prazo-lance
onda: 1
depends_on: []
paralelo_com: [bloco-t-ux-chat]
itens: [FIX-39, FIX-40]
escopo_arquivos:
  - src/lib/adapters/bevi/partner-offer-mapper.ts (mapear prazo/lanceMedio)
  - src/lib/adapters/bevi/partner-offer-mapper.test.ts
  - src/lib/bevi/closing-presentation.ts (payload do real_offer)
  - src/lib/bevi/contract-summary.ts (prazo no resumo)
  - src/components/chat/artifacts/real-offer.tsx (+ teste)
  - src/lib/agent/orchestrator/dial-payload.ts (âncora de lance real no dial)
  - src/lib/chat/types.ts (RealOfferPayload)
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "src/lib/chat/types.ts e tests/regression: nível 2 com bloco-t (regiões distintas, append-only). Ordem de merge: tanto faz."
---

# Bloco U — Aproveitar os campos novos da API Bevi (prazo + lanceMedio)

A atualização não-comunicada da API de Parceiro (2026-06-12, mesma leva do
temEmbutido/parcela-string) trouxe 2 campos novos na oferta real: `prazo`
(meses) e `lanceMedio` (R$ do grupo). Decisão do Kairo: "bora usar tudo que
for possivel (...) nao precisamos perguntar nada para eles" — consumir os
dados com rótulo honesto (literal do campo), sem especulação de semântica
além do nome.

Shape capturado live (proposta 6a2be7b1, 2026-06-12):
`{ prazo: 72, lanceMedio: 69361.27, parcela: "2.075,34", ... }` — registrado
também na seção de root cause do fix-bevi-parcela (commit 67f7a73).

Ordem: FIX-39 (prazo — menor, destrava o card) → FIX-40 (lanceMedio).

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-u-campos-novos-bevi/ na ordem FIX-39 → FIX-40.
> Regra D11 vale SEMPRE: número só com fonte real e rótulo honesto ("prazo",
> "lance médio do grupo" — literal do campo da Bevi, sem prometer
> contemplação). Os campos são OPCIONAIS no shape (API antiga não os tinha) —
> todo consumo é defensivo (Number.isFinite), card nunca morre por ausência
> (lição BUG-PARCELA-STRING). TDD strict, 3 camadas onde houver comportamento
> de agent, 1 commit test+feat: por item. Mover pra done/ ao concluir; bloco
> vazio → apagar pasta.
