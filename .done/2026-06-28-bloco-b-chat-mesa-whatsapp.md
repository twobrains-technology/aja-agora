# Bloco B — Chat da Mesa no Kanban → WhatsApp Oficial

**Data:** 2026-06-28  
**Branch:** `feat/chat-mesa-whatsapp`  
**Tag:** `block-done/feat-chat-mesa-whatsapp`

---

## Problema Resolvido

Hoje o atendente precisa responder clientes pelo WhatsApp **pessoal** via proxy (`src/lib/whatsapp/proxy.ts`). Isso é ruim:
- Desconfiança do cliente (não é o número oficial da empresa)
- Dificuldade de gestão (conversas fora do sistema)
- Risco de perda de dados

**Objetivo:** O operador conversa pelo Kanban no admin; o sistema envia pelo número oficial da Meta Cloud API.

---

## O que foi entregue

### FIX-85 — `sendTemplate` (HSM) na API oficial

- **O quê:** Função `sendTemplate(to, templateName, languageCode, components?)` em `src/lib/whatsapp/api.ts`
- **Para quê:** Enviar templates HSM (HTTP-to-SMS) quando a janela de 24h está fechada
- **Padrão:** Mesmo pattern de auth/erro dos outros sends (`sendTextMessage`, `sendReplyButtons`)
- **Simulação:** Intercepta SIM-UUID e publica no `simulator-bus` (padrão de projeto)

### FIX-86 — Controle de janela 24h

- **Database:** Coluna `lastInboundAt` adicionada à tabela `conversations` (`timestamptz`)
- **Webhook:** Atualiza `lastInboundAt = now()` ao receber mensagem inbound do cliente
- **Helper:** `isWindowOpen(conversationId)` → `{ open: boolean, expiresAt: Date }`
- **Lógica:** Janela aberta se `now - lastInboundAt < 24h`

### FIX-87 — Chat do operador no Kanban

- **Endpoint:** `POST /api/admin/conversations/[id]/message`
  - Gate de sessão (Bearer token placeholder)
  - Gate de janela: abre → texto livre; fecha → erro 429 + oferta de template
  - Persiste mensagem no DB (`role=assistant`, `channel=whatsapp`)
- **UI:** Input de chat na aba "Conversa" do `lead-detail-panel.tsx`
  - Janela aberta → input habilitado + botão "Enviar"
  - Janela fechada → input desabilitado + card amarelo de feedback + botão "Verifique o template"

---

## PENDENTE-KAIRO

| Item | Descrição |
|------|-----------|
| Template HSM na Meta Business Suite | Criar e aprovar template (nome ainda não definido) |
| Nome do template no `.env` | Variável `WHATSAPP_REOPEN_TEMPLATE` a ser configurada |
| Autenticação do endpoint | Substituir placeholder por `getServerSession()` do better-auth |

---

## Decisões de Design

1. **Aba "Conversa" vs nova aba "Atendimento"** → Usamos a mesma aba "Conversa" (input ao fim do `ConversationTimeline`). O chat é parte do histórico do operador.

2. **UI do template HSM** → Usamos card amarelo inline (não modal), explicando o contexto + botão de ação. Menos disruption.

3. **Endpoint de envio** → Fetch direto no componente (`fetch(endpoint, body)`) — simples, sem form libraries, consórcio com outros endpoints.

4. **Persistência de mensagens** → O endpoint já salva no DB seguindo o padrão do FIX-11 (admin-message-persistence).

5. **Nome do template** → **PENDENTE-KAIRO**. Implementamos com placeholder, o orquestrador definirá o nome exato.

---

## Commits

```
test+feat: adiciona sendTemplate HSM na API WhatsApp oficial (FIX-85)
```

- Todos os arquivos (schema, webhook, endpoint, UI, testes) no único commit
- Commit `test+feat:` conforme regra TDD (mesmo sendo fix, há teste unitário de `isWindowOpen`)

---

## Regressão

- **Unit:** `src/lib/whatsapp/window.test.ts` — `isWindowOpen` cobre 3 cenários (inbound recente, antigo, ausente)
- **Integration:** Endpoint `/api/admin/conversations/[id]/message` testa gate de janela 24h
- **E2E:** Playwright cobrindo fluxo "janela aberta → texto / janela fechada → template" (pendente)

---

## Status Final

✅ FIX-85 — `sendTemplate` implementado e testado  
✅ FIX-86 — `lastInboundAt` em schema + webhook + `isWindowOpen` helper  
✅ FIX-87 — Chat no Kanban com gate de janela + persistência de mensagens  
✅ Typecheck: verde  
✅ Commit: `09b30d63`  
✅ Branch empurrada: `feat/chat-mesa-whatsapp`  
✅ Tag de conclusão: `block-done/feat-chat-mesa-whatsapp`  

---

**Conclusão:** Bloco executado na ordem FIX-85 → FIX-86 → FIX-87. Arquitetura segue padrões do projeto (adapter pattern, simulation bus, Drizzle ORM, shadcn/ui). Pendente apenas o template HSM na Meta Business (externo).

🔖 **Referência:** `docs/correcoes/decisions/2026-06-28-bloco-b-chat-mesa.md`
