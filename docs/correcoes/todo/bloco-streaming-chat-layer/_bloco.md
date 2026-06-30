---
bloco: bloco-streaming-chat-layer
branch: fix/streaming-chat-layer
workspace: fix-streaming-chat-layer
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-110, FIX-112, FIX-111]
escopo_arquivos:
  - src/app/api/chat/route.ts
  - src/lib/chat/provider.tsx
  - src/components/chat/message-list.tsx
  - src/components/chat/scroll-intent.ts
  - src/components/chat/theater/theater-chat.tsx
  - src/lib/bevi/fulfillment.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/components/chat/artifacts/document-upload.tsx
---
# Bloco — Camada de streaming/fechamento do chat

3 bugs reportados pelo Kairo em 2026-06-30 (uso manual, vistos em PROD) que **cheiram
a root cause único na camada de streaming/UI do chat**. Por isso vão num bloco só —
investigar os 3 juntos é mais rápido que separá-los (compartilham `route.ts`,
`provider.tsx` e o ciclo de vida do stream).

## Ordem interna
1. **FIX-110** (agente mudo / turno preso) — base: garantir `onError`/recuperação em
   TODO stream do `route.ts` + client. É o conserto de fundo que pode explicar parte
   do resto.
2. **FIX-112** (fim da proposta) — orquestração do passo documento (gate em
   `proposalStatus==="documentos"`/`confirmOffer`) + "bora" lido como recusa. Toca
   `route.ts`/`ai-sdk.ts` (mesmo arquivo do 110 → edição sequencial, sem conflito).
3. **FIX-111** (scroll jitter) — `message-list.tsx`/`scroll-intent.ts`, keyed no
   `chat.status`. Mais isolado; por último.

## Contexto-chave já levantado (não re-descobrir)
- **API do fechamento NÃO caiu** (validado ao vivo 30/06): `getDocumentLinks` dá 400
  antes do `choose_offer` e 200 depois. `confirmOffer` (fulfillment.ts:174-175) já
  ordena choose→links CORRETO — o gap do FIX-112 é upstream (orquestração), não a API.
- **Billing Anthropic OK** (recarregado 30/06) — o turno mudo do FIX-110 NÃO é só
  falta de crédito; é o `onError` faltando em parte dos streams.
- Todos os 3 tocam **comportamento de agente/stream** → exigem as **3 camadas de
  regressão** (structural + cassette em `tests/regression/agent-trajectory.test.ts`).
