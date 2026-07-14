---
id: FIX-336
titulo: "P0 — o agente MENTE: diz que a proposta saiu com bevi_proposals = 0 no banco"
status: todo
bloco: bloco-c-whatsapp-invariantes
arquivos:
  - src/lib/whatsapp/interactive-handlers.ts
  - src/lib/whatsapp/proxy.ts
  - src/lib/agent/orchestrator/index.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1 (juiz Sonnet, whatsapp 3/10)
---

# FIX-336 — promessa FALSA de proposta (invariante I4 quebrado)

## Cenário exato (dossiê auto-whatsapp)

O agente afirma:

> "Sua proposta com a ITAÚ já saiu"

E o banco diz:

```sql
SELECT count(*) FROM bevi_proposals WHERE conversation_id='90b6c34f-…';  --> 0
```

**Nenhuma proposta existe.** O cliente foi informado de que a reserva dele está feita. Isso é o
pior tipo de defeito que este produto pode ter — é o invariante I4 ("nunca prometer o que não
aconteceu") quebrado com o cliente na linha.

## Root cause (provado pelo juiz)

O "tenho interesse" por **texto livre** não tem caminho determinístico no WhatsApp: só o
CLIQUE do botão passa por `handleInterest` (`interactive-handlers.ts:630`). Quando o usuário
escreve "quero essa" em vez de clicar, nada cria a proposta — e o modelo, sem nenhum fato que o
contradiga, **aluciná a confirmação**.

Na web esse caminho existe. No WhatsApp, não.

## Correção proposta

| O quê | Onde |
|---|---|
| "Tenho interesse" por TEXTO LIVRE tem que cair no MESMO handler determinístico do clique | `interactive-handlers.ts` / `proxy.ts` (detectar a intenção e rotear pra `handleInterest`) |
| **Invariante em código, não no prompt**: o modelo NÃO PODE afirmar que a proposta/reserva saiu se não existir linha em `bevi_proposals` para a conversa. Isso vira guard determinístico (mesma família de `isPrematureReservationClaim`, que hoje só pega a palavra "reservado") | `sanitizer.ts` — checar o FATO no banco, não a palavra |

## Regressão exigida
- Integração: usuário escreve "quero essa" (sem clicar) → a proposta É criada, ou o agente NÃO
  afirma que foi. Nunca as duas coisas divergindo.
- Integração: com `bevi_proposals = 0`, qualquer fala do modelo afirmando que a proposta saiu é
  bloqueada.
