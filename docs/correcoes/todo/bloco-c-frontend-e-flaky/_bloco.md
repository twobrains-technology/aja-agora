---
bloco: bloco-c-frontend-e-flaky
branch: fix/frontend-dup-e-flaky
workspace: fix-frontend-dup-e-flaky
onda: 1
depends_on: []
paralelo_com: [bloco-a-governanca-agente, bloco-b-intent-ver-mais]
itens: [FIX-184, FIX-185]
escopo_arquivos:
  - src/components/chat/chat-message.tsx
  - src/components/chat/message-list.tsx
  - src/app/api/chat/route.admin-message-persistence.test.ts
conflitos_esperados:
  - "Totalmente disjunto de bloco-a (agent core) e bloco-b (analyzer). Componentes React + um arquivo de teste de route. Nível 1, merge limpo."
---
# Bloco C — Housekeeping: saudação duplicada (frontend) + teste flaky

Dois bugs pequenos e INDEPENDENTES da doença arquitetural, agrupados num pacote de
housekeeping pra um dev. Nenhum toca o agente/orquestrador.

## Itens
1. **FIX-184** — saudação "Prazer, Mirella!" duplicada na TELA (rendering React; backend salvou 1x,
   provado no banco). Bug de cliente puro.
2. **FIX-185** — teste pré-existente instável (`admin-message-persistence`) que conta mensagens a
   mais. Confirmado pré-existente via git stash. Regra "erro que você vê, você corrige".
