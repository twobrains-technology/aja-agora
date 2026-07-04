---
bloco: bloco-cards-recomendacao
branch: feat/cards-recomendacao-lance
workspace: feat-cards-recomendacao-lance
onda: 1
depends_on: []
paralelo_com: [bloco-jornada-conversa, bloco-descoberta-busca]
itens: [FIX-220, FIX-221, FIX-223, FIX-222, FIX-224]
escopo_arquivos:
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/group-card.tsx
  - src/components/chat/artifacts/simulation-result.tsx
  - src/components/chat/artifacts/contemplation-dial.tsx
  - src/lib/consorcio/contemplation-dial.ts
  - src/lib/adapters/bevi/offer-mapper.ts
  - src/lib/adapters/bevi/partner-offer-mapper.ts
  - src/lib/agent/orchestrator/recommendation-payload.ts
  - src/lib/agent/recommendation.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/adapters/types.ts
  - src/lib/chat/types.ts
  - src/db/schema.ts
conflitos_esperados:
  - "directives.ts + system-prompt.ts: bloco-jornada-conversa também toca (copy/fluxo de lance). REGIÕES diferentes (nível 2). Este bloco mergeia POR ÚLTIMO (forka da base já com jornada+descoberta) → resolve o conflito residual sempre do mesmo lado."
  - "recommendation.ts: bloco-descoberta-busca produz o shape de resultado com/sem embutido; aqui consumo (ranking/mesmo-peso). Nível 3 leve — a coerção server-side (recommendation-payload) é o contrato. Mergear DEPOIS de bloco-descoberta."
---
# Bloco Cards-Recomendação — 1ª lista neutra · parcela antes/depois · logo · lance médio · reorder

**Superfície:** display de recomendação (cards + simulador de contemplação + coerção
server-side dos números). Disjunta da conversa (bloco-jornada) e da descoberta (bloco-descoberta).
É o **bloco grande de produto** desta onda — fica sozinho na sua superfície.

## Itens (ordem de execução)
1. **FIX-220** — 1ª lista com todos os grupos no mesmo peso (sem preferencial).
2. **FIX-221** — parcela antes/depois no card + corrigir rótulo mentiroso + "embutido = recebe menos" (modelo AMORTIZA — ⚠️ inverte CONTEXT/código, PENDENTE-Bernardo o número). **É o P0 indispensável.**
3. **FIX-223** — lance médio no card (propagar do fechamento pro shape de descoberta).
4. **FIX-222** — logo da administradora (coluna nova + migration + fallback; assets reais PENDENTE).
5. **FIX-224** — reordenar os 3 blocos do reveal + consolidar lance dentro do card (executar DEPOIS de 221).

## Regra da jornada (ler antes)
`docs/jornada/jornada-canonica.md` seção **"Refino Ata 2026-07-04"** (itens 5 cards, 7 modelo do
embutido). A **recomendação em 2 estágios completa é ONDA 2** — aqui só a 1ª lista neutra + o gancho.
