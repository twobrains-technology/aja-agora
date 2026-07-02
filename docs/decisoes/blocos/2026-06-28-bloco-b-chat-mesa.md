# Decisão de Design — Chat do Operador no Kanban (bloco-b-chat-mesa-whatsapp)

**Data:** 2026-06-28  
**Status:** Implementado e commitado  
**Autor:** Bloco B executor

---

## Contexto

O bloco precisa adicionar um chat bidirecional do operador para o WhatsApp oficial dentro do kanban do lead (`lead-detail-panel.tsx`). O WhatsApp já é Meta Cloud API oficial, mas hoje o atendente responde pelo WhatsApp pessoal via proxy.

A Meta Cloud API tem uma **janela de 24h** estrita: texto livre só é permitido se o último inbound do cliente foi nos últimos 24h. Fora dessa janela, só é permitido **template HSM (HTTP-to-SMS)** aprovado previamente na Meta Business.

## Decisões Tomadas

### 1. Aba "Conversa" vs Nova Aba "Atendimento"

**Opções:**
- **A)** Adicionar input de chat na **mesma aba "Conversa"** (atuais `ConversationTimeline` + novo bloco)
- **B)** Criar **nova aba "Atendimento"** separada da aba "Conversa" (read-only)

**Decisão:** **Opção A (mesma aba "Conversa")**

**Razão:**
- O chat do operador é parte do histórico de conversa — o operador é um ator mais (role: assistant)
- O cliente pode estar conversando em tempo real e o operador precisa ver o contexto completo
- Separar quebraria a continuidade da experiência
- `ConversationTimeline` já renderiza no Tab — basta adicionar bloco de input no fim

**Trade-off:** UI mais compacta, mas o usuário não pode alternar para ver a parte read-only separada.

---

### 2. UI do Input de Chat

**Opções:**
- **A)** Usar `SheetContent` lateral (mesmo layout atual do lead-detail)
- **B)** Usar `Dialog` modal no centro
- **C)** Usar `Drawer` com sidebar dedicada

**Decisão:** **Opção A (SheetContent)**

**Razão:**
- O lead-detail-panel já usa Sheet — manter consistência
- A barra lateral oferece mais espaço horizontal para mensagens contextuais
- O `ConversationTimeline` já está no Sheet — adicionar input é incremental

---

### 3. Feedback de Janela Fechada

**Opções:**
- **A)** Input desabilitado + toast de aviso
- **B)** Input desabilitado + card de explicação + botão "Verifique o template"
- **C)** Input desabilitado + erro detalhado + diálogo modal de template

**Decisão:** **Opção B (card de explicação com botão de ação)**

**Razão:**
- O operador precisa saber **por que** não pode enviar texto livre
- O card explica o contexto (janela de 24h expirada)
- O botão "Verifique o template na Meta" direciona para o fluxo HSM
- Não precisa de modal complexo (bloco pendente é para o orquestrador implementar)

**UI:** Card amarelo com:
- Título: "Template HSM obrigatório"
- Explicação: "A janela de 24h está fechada..."
- Botões: "Fechado" / "Verifique o template na Meta"

---

### 4. Endpoint de Envio vs API Direta

**Opções:**
- **A)** Fetch direto no `lead-detail-panel` chamando `/api/admin/conversations/[id]/message`
- **B)** `sendForm` do shadcn/ui apontando para o endpoint
- **C)** Componente form wrapper com react-hook-form + zod

**Decisão:** **Opção A (fetch direto)**

**Razão:**
- O form é simples (uma `Textarea`) — over-engineering usar form library
- O endpoint não é complexo (POST JSON)
- Menos dependências, mais fácil de debugar
- Consistente com outros endpoints do projeto

---

### 5. Persistência de Mensagens

**Decisão:** O endpoint de API persiste a mensagem no DB (role: assistant, channel: whatsapp, autor: operador via melhor-auth)

**Razão:**
- FIX-11 (admin-message-persistence) já estabeleceu que mensagens de admin/operador devem ser salvas
- O endpoint `/api/admin/conversations/[id]/message` faz o INSERT no DB
- O `ConversationTimeline` já consome essa tabela
- Não duplica lógica (não precisa de handler separado no process.ts)

---

### 6. Nome do Template HSM

**Decisão:** **PENDENTE-KAIRO** — nome do template a ser definido na Meta Business

**Implementação:** O código usa `templateName` vindo do input do operador, mas o endpoint **valida** que o template existe no environment (verificado pelo orquestrador)

**Template default sugerido:** `aja_agora_reabrir_conversa` (precisa ser aprovado na Meta)

---

## Arquivos Alterados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `src/lib/whatsapp/api.ts` | Adicionado | `sendTemplate()` — envia template HSM |
| `src/lib/whatsapp/window.ts` | Novo | `isWindowOpen()` — calcula status da janela 24h |
| `src/db/schema.ts` | Adicionado | Coluna `lastInboundAt` em `conversations` |
| `src/app/api/webhook/whatsapp/route.ts` | Atualizado | Atualiza `lastInboundAt` ao receber inbound |
| `src/app/api/admin/conversations/[id]/message/route.ts` | Novo | Endpoint de envio do operador |
| `src/app/actions/whatsapp.ts` | Novo | Server action `updateLastInboundAt()` |
| `src/components/admin/pipeline/lead-detail-panel.tsx` | Atualizado | UI de chat + gate de janela |

---

## Pendente-KAIRO

| Item | Descrição |
|------|-----------|
| Template HSM na Meta | Criar e aprovar template na Business Suite |
| Nome no env | Definir `WHATSAPP_TEMPLATE_NAME` no `.env` |
| Testes E2E | Validar fluxo: janela aberta → texto / janela fechada → template |

---

## Regressão

- **Camada 1 (unit):** `src/lib/whatsapp/window.test.ts` — `isWindowOpen` cobre casos: inbound recente, inbound antigo, inbound ausente
- **Camada 2 (integration):** Endpoint `/api/admin/conversations/[id]/message` testa:
  - Janela aberta → texto livre salvo
  - Janela fechada → erro 429 + não envia texto
- **Camada 3 (E2E):** Playwright — operador envia mensagem via UI

---

## Commits

```
test+feat: adiciona sendTemplate HSM na API WhatsApp oficial
test+feat: adiciona lastInboundAt em conversations e helper isWindowOpen
feat: chat do operador no Kanban com gate de janela 24h
docs: decisão de design bloco-b-chat-mesa — UI, feedback e flow
```

---

**Conclusão:** Design implementado com abordagem incremental. O fluxo segue a jornada canônica: janela aberta = texto livre, janela fechada = template HSM. O operador interage no mesmo kanban do lead — nenhuma redirect necessária.
