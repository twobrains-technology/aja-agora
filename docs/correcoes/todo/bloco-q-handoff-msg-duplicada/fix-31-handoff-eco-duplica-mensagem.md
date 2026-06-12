---
id: FIX-31
titulo: "Conversa em handoff: mensagem do usuário aparece DUPLICADA — o backend ecoa a user message no bus com UUID novo e o dedupe por id do provider nunca casa"
status: todo
bloco: bloco-q-handoff-msg-duplicada
arquivos:
  - src/app/api/chat/route.ts (branch handed_off ~245-276 — publishMessage com id novo)
  - src/lib/chat/provider.tsx (consumer SSE ~158-168 — dedupe por id)
rodada: 2026-06-11 (testes manuais do Kairo no dev, pós-deploy da auditoria do dial)
anotado_em: 2026-06-11
---

# FIX-31 — Eco do handoff duplica a bolha do usuário

### Palavras do operador

> "bug msg duplicada nesse cenario."

### Cenário exato (print, dev 2026-06-11)

Fluxo: "Tenho interesse" → lead form → "Dados recebidos!" → conversa entrou em
handoff → usuário digitou **"preciso mudar o valor"** → a bolha apareceu
**2×** na tela, seguida de "_Mensagem enviada para Consultor. Aguarde a
resposta aqui._".

### Root cause INVESTIGADO (provado no código)

1. `useChat.sendMessage` appenda a mensagem do usuário **otimisticamente** no
   estado local, com o id gerado pelo SDK.
2. `src/app/api/chat/route.ts:245-258` (branch `status === "handed_off"`):
   além de salvar e relayar pro atendente, faz `publishMessage(...)` da MESMA
   user message no bus — **com `id: crypto.randomUUID()` NOVO** (linha 254).
3. `src/lib/chat/provider.tsx:158-168`: quando handed_off, o provider assina o
   SSE (`/api/chat/stream`) e appenda mensagens do bus com dedupe **por id**
   (`prev.some((p) => p.id === m.id)`). Como o id do eco ≠ id da mensagem
   otimista, o dedupe **nunca casa por construção** → bolha duplicada, 100%
   reproduzível em qualquer mensagem do usuário durante handoff.

O publish existe pro ATENDENTE (admin) ver a mensagem do cliente em tempo
real — o defeito é o próprio cliente web re-receber o eco sem id estável.

### Correção proposta

| O quê | Onde |
|---|---|
| Ecoar o **id original** da mensagem do cliente no `publishMessage` (o body do useChat traz o id da message) → o dedupe por id do provider passa a casar | `route.ts` branch handed_off |
| Alternativa/reforço: o provider ignora eventos `role === "user"` vindos do bus quando a mensagem partiu desta sessão (o eco só interessa a OUTRAS abas/ao admin) | `provider.tsx` |
| Teste do branch handed_off cobrindo o contrato do id (eco preserva id do cliente) | route.test |

### Estado da arte (pesquisa web 2026-06-11 — ver `docs/correcoes/2026-06-11-pesquisa-stack-padroes.md`)

- Há issues conhecidas de duplicação no `useChat` do AI SDK (vercel/ai #8131 —
  mensagens repetidas com tools; #8227 — parts vazando entre mensagens no
  mesmo stream). Nosso root cause é o eco do bus (provado acima), mas na
  execução: conferir a versão pinada do `ai` e descartar overlap com #8131.
- Padrão da indústria: id estável fim-a-fim é o contrato de dedupe em
  streaming UI — data parts com reconciliação por id (`ai-sdk.dev`,
  Streaming Custom Data).

### Regressão exigida

- Camada 1: route test do branch handed_off (eco com id preservado) + teste do
  provider (evento do bus com id já presente não duplica). Fluxo
  determinístico sem LLM — cassette dispensado pela regra do CLAUDE.md.
