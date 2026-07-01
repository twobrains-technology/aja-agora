# Spec — Captura Conversacional de Lead (Web)

**Data**: 2026-05-17
**Branch**: feat/improving-web-conversation
**Operador**: Kairo
**Status**: Aprovado para implementação

---

## 1. Problema

O chat web do Aja Agora hoje captura lead **muito tarde** no funil: somente quando o usuário clica "Tenho interesse" num `recommendation-card` aparece o `lead_form` (nome + telefone + email, três campos obrigatórios de uma vez). Resultado: a maior parte das conversas web não vira lead — o usuário sai antes de chegar ao gate final.

Sintomas observados:
- Agent **não pergunta o nome** em momento algum durante a qualificação
- Agent **não menciona WhatsApp** como canal de continuidade
- Form pesado (3 campos obrigatórios) tem alta fricção
- `conversations.contactName` existe no schema mas nunca é populado
- Já existe lógica análoga no WhatsApp (commit `ef7b91a` — lead criado no início) sem equivalente no web

## 2. Objetivo

Capturar lead **progressivamente** ao longo da conversa web, replicando o padrão `awareness → interest → consideration` validado em chatbots conversacionais de 2026 (10-15% de conversão vs 2-3% de forms tradicionais):

1. **Nome** — capturado imediatamente após o objetivo declarado, via texto puro + tool de extração
2. **WhatsApp** — ofertado após primeira simulação/recomendação, via componente UI dedicado (card com input mascarado + botões "Quero" / "Agora não")
3. **Lead row criada na tabela `leads`** no momento da captura do nome (stage='novo'), promovida a 'engajado' ao salvar WhatsApp
4. **Form de fallback** mantido para o "Tenho interesse", agora com WhatsApp obrigatório + email opcional + pré-preenchimento

## 3. Decisões arquiteturais (aprovadas)

| # | Decisão | Justificativa |
|---|---------|---------------|
| D1 | Nome capturado imediatamente após objetivo, **bloqueando** próxima etapa | Maximiza captura; agent já precisa do nome pra personalizar respostas |
| D2 | WhatsApp ofertado **após primeira simulação/recomendação** (não antes) | Ânc¬ora de valor entregue → aceita melhor; progressive profiling clássico |
| D3 | **2 tools dedicadas**: `save_contact_name`, `save_contact_whatsapp` + **1 tool de UI**: `present_whatsapp_optin` | Persistência explícita; espelha padrão dos outros artifacts |
| D4 | Lead row criada ao salvar nome (stage='novo'); promovida a 'engajado' ao salvar WhatsApp | Espelha o que já acontece no WhatsApp (`ef7b91a`); métricas finas de funil |
| D5 | WhatsApp **opcional** durante conversa, **obrigatório** no form de fallback. Email **opcional** no form | WhatsApp é o canal primário do produto; email é fallback de compliance |
| D6 | Componente UI dedicado para WhatsApp (não texto puro) | Parsing de telefone BR é frágil; máscara client-side dá feedback imediato e elimina ambiguidade |
| D7 | Nome continua via texto puro (não componente) | Parsing trivial; componente seria over-engineering |
| D8 | Form de fallback mantido, agora **pré-preenchido** com nome/WhatsApp já capturados | Reduz re-trabalho; mantém gate de conversão final |

## 4. Arquitetura — fluxo end-to-end

```
USUÁRIO declara objetivo ("quero comprar carro")
      │
      ▼
AGENT responde + pergunta nome ────────────────────────────┐
      │                                                    │
      ▼                                                    │
USUÁRIO digita resposta livre ("Kairo" / "sou o Kairo")    │ captura
      │                                                    │ conversacional
      ▼                                                    │ progressiva
AGENT chama save_contact_name({ name: "Kairo" })           │
      │  → UPDATE conversations.contactName                │
      │  → INSERT leads (stage='novo', conversation_id)    │
      │  → leadEvents: → novo                              │
      │  → emit data-event { type: 'lead_created' }        │
      ▼                                                    │
AGENT segue qualificação (value_picker → search_groups)    │
      │                                                    │
      ▼                                                    │
AGENT entrega simulate_quota + present_simulation_result   │
      │                                                    │
      ▼                                                    │
AGENT chama present_whatsapp_optin (artifact UI) ──────────┘
      │
      ▼
USUÁRIO: [Quero] (+ input mascarado) │ [Agora não]
      │                              │
      ▼                              ▼
POST /api/chat                       AGENT segue conversa;
{ action:                            tenta de novo só
  kind: 'whatsapp_optin',            no form final
  phone: '11987654321' }
      │
      ▼
save_contact_whatsapp({ phone })
   → UPDATE conversations.waId + leads.phone
   → stage 'novo' → 'engajado' (leadEvents)
   → emit data-event { type: 'lead_promoted' }
      │
      ▼
AGENT continua até "Tenho interesse"
      │
      ▼
LEAD FORM fallback (pré-preenchido se temos nome+phone)
   → WhatsApp obrigatório · Nome obrigatório · Email opcional
   → POST /api/leads (idempotente: UPDATE se já existe)
   → stage → 'qualificado'
   → handoffToAgents()
```

## 5. Componentes & arquivos

### 5.1 Novos arquivos

| Arquivo | Função |
|---------|--------|
| `src/lib/leads/contact-capture.ts` | Serviço de domínio: `saveContactName(convId, name)`, `saveContactWhatsapp(convId, phone)`. Encapsula lead create/update + stage promote + leadEvents. Idempotente. |
| `src/lib/agent/tools/handlers/contact.ts` | `execute()` das tools — chama `contact-capture.ts` |
| `src/components/chat/artifacts/whatsapp-optin.tsx` | Card UI: copy curto, input `(DD) 9XXXX-XXXX` (máscara via regex manual + `inputMode="tel"`), botões "Quero receber" / "Agora não". Estado: `idle | submitting | accepted | declined`. |

### 5.2 Alterações em arquivos existentes

| Arquivo | Mudança |
|---------|---------|
| `src/lib/agent/tools/ai-sdk.ts` | +3 tools: `save_contact_name`, `save_contact_whatsapp`, `present_whatsapp_optin` |
| `src/lib/agent/system-prompt.ts` | + bloco "Captura Progressiva" no `SPECIALIST_BASE_PROMPT` (ver §6) |
| `src/app/api/chat/route.ts` | + 2 handlers de `body.action.kind`: `'whatsapp_optin'` (executa save) e `'whatsapp_optin_decline'` (registra recusa em conversation.metadata) |
| `src/app/api/leads/route.ts` | Zod relaxado: `email` opcional; **invariante**: ao menos um de `phone`/`email` presente (com phone preferencial) |
| `src/components/chat/artifacts/lead-form.tsx` | WhatsApp obrigatório · Email opcional · Pré-preencher de `conversation.contactName` + `lead.phone` se vierem do server |
| `src/db/schema.ts` | Verificar: `leads.email` deve ser `nullable` (provavelmente já é, validar); `conversations.contactName` já existe |
| `src/lib/whatsapp/proxy.ts` | `handoffToAgents` deve preferir `conversations.contactName` antes de pedir nome no WhatsApp |
| `src/lib/agent/types.ts` (ou onde estão os types do `AjaUIMessage`) | + tipos `data-event lead_created`, `lead_promoted`, `whatsapp_optin_*` |

### 5.3 Sem alteração

- `createLeadFromConversation()` em `src/lib/admin/lead-stage-tracker.ts` — reusado pelo `contact-capture.ts`
- `handoffToAgents()` — inalterado em interface, só consome `contactName` melhor
- Fluxo WhatsApp não-web — inalterado

## 6. Prompt — delta no `SPECIALIST_BASE_PROMPT`

Bloco a injetar logo após "Acolha o sonho":

```
## Captura Progressiva de Contato (CRÍTICO)

### Nome — capture IMEDIATAMENTE após o objetivo
Logo que o usuário declarar o que quer ("comprar carro", "moto", "imóvel"):
1. Responda com 1 frase de entusiasmo (não mais)
2. Pergunte o nome ANTES de qualquer outra ação:
   "Show! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?"
3. Quando o usuário responder (qualquer formato: "Kairo", "sou o Kairo", "me chamo Alan"),
   chame IMEDIATAMENTE save_contact_name({ name }) extraindo só o primeiro nome.
4. NÃO siga pra present_value_picker ou search_groups antes de salvar o nome.
5. Use o nome capturado nas próximas respostas ("Beleza, Kairo, deixa eu buscar...")

### WhatsApp — ofereça DEPOIS da primeira simulação
Após apresentar present_simulation_result OU present_recommendation_card pela 1ª vez,
chame present_whatsapp_optin (sem parâmetros — o sistema preenche).
NÃO pergunte WhatsApp por texto.
NÃO insista se o usuário recusar (botão "Agora não") — siga normalmente.
NÃO chame present_whatsapp_optin mais de uma vez na mesma conversa
(o sistema marca em conversation.metadata.whatsappOptinShown).

### NUNCA
- Pedir telefone/email por texto antes do form de "Tenho interesse"
- Chamar save_contact_name com sobrenome longo — só o primeiro nome (max 30 chars)
- Repetir present_whatsapp_optin se já foi mostrado nesta conversa
```

## 7. Schemas (Zod) das novas tools

```ts
// save_contact_name
const saveContactNameSchema = z.object({
  name: z.string().min(2).max(30)
    .regex(/^[\p{L} '-]+$/u, "nome inválido")
    .transform(s => s.trim().split(/\s+/)[0]) // só primeiro nome
});

// save_contact_whatsapp
const saveContactWhatsappSchema = z.object({
  phone: z.string()
    .transform(s => s.replace(/\D/g, ''))
    .refine(s => /^[1-9]{2}9?[0-9]{8}$/.test(s), "telefone BR inválido (DDD + 8/9 dígitos)")
});

// present_whatsapp_optin — sem parâmetros obrigatórios
const presentWhatsappOptinSchema = z.object({}).optional();
```

## 8. Persistência — invariantes

- `saveContactName` é **idempotente**: chamar 2x com mesmo nome não duplica lead nem cria 2º leadEvent.
- `saveContactWhatsapp` é **idempotente**: só promove `novo→engajado` se o lead estiver em `novo`. Se já em `engajado+`, atualiza `phone` mas não regride stage.
- `conversation.metadata.whatsappOptinShown: true` impede dupla apresentação do card.
- `/api/leads` POST: se já existe lead pra `conversationId`, atualiza (não duplica). Stage `qualificado` só promove pra frente, nunca regride.
- `phone` armazenado em formato canônico (só dígitos, com DDD, sem código país — código BR adicionado no handoff WhatsApp).

## 9. Erros & edge cases

| Cenário | Tratamento |
|---------|-----------|
| Tool `save_contact_name` recebe nome inválido | Zod falha → tool retorna `{ ok: false, error: "name_invalid" }` → agent re-pergunta com tom natural |
| Tool `save_contact_whatsapp` recebe phone inválido | Tool retorna erro estruturado → frontend exibe mensagem inline no card (não no chat) |
| `whatsapp_optin` action sem conversa válida | API route 404 |
| Usuário envia "não" / "depois" ao pedir nome | Agent insiste 1x com tom leve ("entendo, só preciso de algo pra te chamar — pode ser apelido"), depois segue sem |
| Race: 2 chamadas paralelas `save_contact_name` na mesma conversa | Idempotent service: SELECT FOR UPDATE em leads ou ON CONFLICT DO UPDATE |
| Usuário muda de ideia (recusou WhatsApp, depois aceita no form) | Form fallback é fonte de verdade final → atualiza phone normalmente |
| Lead já está em `qualificado` quando `save_contact_whatsapp` chamado | No-op no stage; apenas atualiza phone (sem leadEvent) |

## 10. Métricas & observabilidade

Eventos a emitir (logs estruturados + leadEvents quando aplicável):

| Evento | Quando | Onde |
|--------|--------|------|
| `lead_created` | save_contact_name → criou lead novo | leadEvents + console log |
| `lead_promoted_engajado` | save_contact_whatsapp em lead novo | leadEvents |
| `whatsapp_optin_shown` | tool present_whatsapp_optin executada | conversation.metadata |
| `whatsapp_optin_accepted` | usuário clicou "Quero" + envio OK | conversation.metadata |
| `whatsapp_optin_declined` | usuário clicou "Agora não" | conversation.metadata |
| `lead_qualified` | form POST OK | leadEvents |

**KPIs pós-deploy**:
- % conversas web → lead criado (meta: 3-5x do baseline)
- % leads com WhatsApp preenchido **antes** do form fallback (meta: ≥ 60%)
- Tempo médio (turnos) até `lead_created` (meta: ≤ 3)
- Taxa de aceite do whatsapp_optin (accepted / shown) — alvo: > 50%

## 11. Plano de testes (alto nível — PO Lead detalha em TEST-PLAN.md)

### Integration (vitest, DB real local)
- **IT-01** `saveContactName` cria lead novo + popula `conversations.contactName` + emite leadEvent
- **IT-02** `saveContactName` idempotente — 2 chamadas não duplicam
- **IT-03** `saveContactWhatsapp` promove stage `novo → engajado` + emite leadEvent
- **IT-04** `saveContactWhatsapp` em lead `qualificado` apenas atualiza phone (sem regredir)
- **IT-05** `/api/leads` POST com `phone` presente e `email` vazio → 200
- **IT-06** `/api/leads` POST com `phone` e `email` ambos vazios → 400
- **IT-07** `/api/leads` POST idempotente (2 submits do mesmo conversationId)
- **IT-08** Tool `save_contact_name` rejeita nome inválido (vazio, números, > 30 chars)
- **IT-09** Tool `save_contact_whatsapp` rejeita telefone inválido (sem DDD, < 10 dígitos)

### E2E Playwright (web, golden + edge)
- **E2E-01** [Golden] Usuário declara objetivo → agent pede nome → resposta → tool save_contact_name disparada → DB tem lead com `stage='novo'` e `contactName` populado → continua qualificação → simula → card WhatsApp aparece → clica "Quero" → input WhatsApp → envio → `leads.phone` populado, `stage='engajado'` → "Tenho interesse" → form fallback pré-preenchido → submit → `stage='qualificado'` + handoff disparado
- **E2E-02** [Recusa WhatsApp] Mesmo fluxo, clica "Agora não" → conversa continua → ao clicar "Tenho interesse", form fallback exige WhatsApp → submit OK
- **E2E-03** [Sem nome] Usuário ignora pedido de nome → agent insiste 1x → ainda ignora → segue mas não cria lead até nome capturado
- **E2E-04** [Phone inválido no card] Usuário digita telefone inválido → mensagem inline no card → corrige → aceita
- **E2E-05** [Form fallback sem WhatsApp] Submit com WhatsApp vazio → erro de validação → preenche → OK

### Regressão
- **R-01** Fluxo WhatsApp (não-web) inalterado — `wa_id` continua funcionando, handoffToAgents usa `contactName` se existir
- **R-02** Demais tools (`search_groups`, `simulate_quota`, etc.) inalteradas
- **R-03** Simulator (`SIM-<uuid>`) continua isolado

## 12. Critérios de aceite (binários)

- [ ] Agent pergunta nome em até 2 turnos após objetivo declarado em 100% dos cenários de objetivo conhecido (carro/moto/imóvel)
- [ ] `save_contact_name` é chamada após resposta do usuário ao pedido de nome (golden path)
- [ ] `conversations.contactName` populado e `leads` row criada com `stage='novo'` no momento `save_contact_name`
- [ ] `present_whatsapp_optin` é chamada uma única vez por conversa, após primeira simulação/recomendação
- [ ] Card WhatsApp renderiza com input mascarado funcional e validação client-side
- [ ] "Quero" persiste phone + promove stage `novo→engajado`
- [ ] "Agora não" não persiste nada, registra `whatsappOptinShown: true` em metadata
- [ ] Form fallback aceita submit com `phone` presente sem `email` (200 OK)
- [ ] Form fallback rejeita submit sem `phone` (mesmo com `email` presente)
- [ ] Todos os testes IT-01..09 passam
- [ ] Todos os testes E2E-01..05 passam
- [ ] Regressões R-01..03 passam (suite existente verde)

## 13. Out of scope (não fazer agora)

- OTP/verificação de WhatsApp (mandar SMS pra validar número) — fica pra evolução
- Captura de email conversacional — só via form fallback
- Captação cross-channel (web → identifica WhatsApp existente do usuário) — exige feature de identidade
- Redesign visual do form fallback — só relaxar Zod + pré-preenchimento
- Analytics dashboard pra os KPIs novos — só emit + log; dashboard depois

## 14. Riscos & mitigações

| Risco | Mitigação |
|-------|-----------|
| Agent não chama `save_contact_name` consistentemente | Prompt forte + teste E2E adversarial validando call da tool |
| Agent chama `present_whatsapp_optin` cedo demais | Guard no system prompt + assertion no E2E (não aparece antes de simulação) |
| Telefone capturado fica em formato inconsistente entre web e WhatsApp | Função única `normalizePhoneBR` compartilhada |
| Pré-preenchimento do form com phone vazio quebra UI | Form trata `null` como string vazia, nunca undefined |
| Stage regride por race condition | `applyTrackedStageToLead` já tem guarda; reusar |

## 15. Plano de implementação (resumo — detalhe em writing-plans)

Fases (commits separados, cada um TDD `test+feat:`):

1. **Schema check + serviço de domínio** — `contact-capture.ts` + testes IT-01..04
2. **API route**: `/api/leads` Zod relaxado + handler `whatsapp_optin` no `/api/chat` + testes IT-05..07
3. **Tools AI SDK**: 3 tools novas + handlers + testes IT-08..09
4. **System prompt**: bloco "Captura Progressiva"
5. **Componente UI**: `whatsapp-optin.tsx` + types `data-event`
6. **Form fallback**: relax email + pré-preenchimento
7. **E2E Playwright**: E2E-01..05
8. **PO Lead → TEST-PLAN** completo, **QA crítico → execução adversarial**, loop até verde

---

**Aprovado por**: Kairo (2026-05-17)
**Próximo passo**: `superpowers:writing-plans` → plano detalhado fase a fase
