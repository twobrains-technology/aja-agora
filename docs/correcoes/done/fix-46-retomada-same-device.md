---
id: FIX-46
titulo: "Retomada de contexto no mesmo dispositivo (cookie ↔ conversa + /api/chat/resume)"
status: todo
bloco: bloco-c-retorno-web
arquivos:
  - src/app/api/chat/resume/route.ts     # novo
  - src/app/api/chat/route.ts
  - src/lib/chat/provider.tsx
  - src/app/chat/page.tsx
  - src/lib/conversation/messages.ts
rodada: 2026-06-14 — anotação Funil + Cliente unificado + Retorno web (Kairo, voz)
---

# FIX-46 — Retomada same-device

## Palavras do operador

> *"se for pelo mesmo computador / mesmo dispositivo, ele vai conseguir voltar
> exatamente com o contexto que ele estava."*

## Cenário / problema

Usuário conversa na web, fecha o navegador, volta no dia seguinte **no mesmo
computador**. Hoje começa do **zero**: a conversa anterior fica órfã no banco e
uma nova é criada. O cookie persiste 90 dias mas não é usado pra retomar nada.

## Root cause investigado (provado no código)

- `chat/provider.tsx:80-81` — `conversationId` é `generateId()` **novo a cada
  mount**; nunca tenta carregar a conversa anterior.
- `api/chat/route.ts:230-273` — lê o cookie `aja_uid` só como identificador;
  cria conversa nova se o body não trouxer `conversationId`. **Cookie e conversa
  são ortogonais** — não há "conversa deste cookie".
- `identity.ts:11-12` — cookie `aja_uid`, 90d, HttpOnly, lazy-create.
- `conversation/messages.ts:8-22` — `loadConversationHistory()` existe (precisa
  só do conversationId) → base pronta pra reidratar.

## Correção proposta

| O quê | Onde |
|---|---|
| Vincular cookie ↔ conversa: gravar o cookie na conversa web (coluna ou metadata) ao criar | `api/chat/route.ts` |
| `GET /api/chat/resume` — pela cookie, retorna a última conversa web ativa (não handed-off): `{ conversationId, messages, meta }`. **Sem cache.** | novo route |
| `ChatProvider` hidrata com `initialConversationId` + `initialMessages` quando o resume traz algo; senão gera novo (primeira vez intacta) | `provider.tsx`, `chat/page.tsx` |

## Regra de ouro

Cookie ausente OU sem conversa anterior → **fluxo de primeira vez idêntico ao de
hoje**. Zero atrito, zero tela a mais. Same-device é seguro (o cookie HttpOnly já
prova posse do device) — **não** exige verificação.

## Regressão exigida (CLAUDE.md)

- **Camada 1 (structural):** `resume` existe e filtra por cookie + channel=web +
  status≠handed_off; provider usa `initialMessages` quando presente.
- **Integration (toca DB real):** cria conversa web com cookie, simula "volta"
  (GET resume com o mesmo cookie) → retorna a conversa certa com as mensagens;
  cookie novo → retorna vazio (primeira vez). Ver falhar antes do route existir.
- **E2E (Playwright):** conversar 3 turnos, recarregar a página → histórico
  reaparece. Cookie limpo → começa do zero. Screenshots.
- **Camada 2 (cassette):** dispensada — não muda fala do agente (só reidrata UI).
