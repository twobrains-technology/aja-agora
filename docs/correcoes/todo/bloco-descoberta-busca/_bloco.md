---
bloco: bloco-descoberta-busca
branch: feat/descoberta-valor-busca-embutido
workspace: feat-descoberta-valor-busca-embutido
onda: 1
depends_on: []
paralelo_com: [bloco-jornada-conversa, bloco-cards-recomendacao]
itens: [FIX-218, FIX-219]
escopo_arquivos:
  - src/components/chat/artifacts/value-picker.tsx
  - src/lib/agent/parse-asset-value.ts
  - src/lib/agent/qualify-config.ts
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/bevi/discovery-session.ts
  - src/lib/adapters/types.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/recommendation.ts
conflitos_esperados:
  - "qualify-config.ts: bloco-jornada-conversa toca COLLECTION_GATES/gates de lance; aqui toco CREDIT_BOUNDS/clamp. Regiões diferentes (nível 2)."
  - "recommendation.ts: bloco-cards-recomendacao toca ranking/mesmo-peso (rankGroups); aqui toco só o dedup que preserva modalidade. Nível 2/3 — este bloco produz o shape de resultado (com/sem embutido) que o cards consome. Ordem de merge: este ANTES do bloco-cards."
---
# Bloco Descoberta-Busca — valor digitável · busca Bevi com/sem embutido

**Superfície:** entrada de valor (web) + construção da query/sweep na Bevi. Disjunta da
superfície conversacional (bloco-jornada) e da de display (bloco-cards), com overlaps
mecânicos de nível 2/3.

## Itens (ordem de execução)
1. **FIX-218** — valor digitável livre (relaxar o clamp client+server). Menor, isolado.
2. **FIX-219** — busca Bevi com/sem embutido (2 queries + dedup, cache key inclui embutido).

## Regra da jornada (ler antes)
`docs/jornada/jornada-canonica.md` seção **"Refino Ata 2026-07-04"** (itens 3 e 4). Assumir
~30% de embutido por ora; caso de borda (cota não permite) fica pra depois — não travar.
