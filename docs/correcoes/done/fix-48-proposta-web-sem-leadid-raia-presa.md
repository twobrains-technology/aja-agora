---
id: FIX-48
titulo: "Proposta criada no fluxo web não vincula leadId → raia presa em 'qualificado'"
status: done
commit: 012ee52
executado_em: 2026-06-15
bloco: bloco-a-polir-funil-retorno
arquivos:
  - src/lib/bevi/contract-input.ts
  - src/app/api/chat/route.ts
  - src/lib/bevi/fulfillment.ts
  - src/lib/bevi/proposal-repo.ts
  - src/app/api/leads/route.ts
rodada: 2026-06-15 — sessão de levantamento (PO crítico) Kairo+Claude sobre funil/retorno
---

# FIX-48 — Proposta web nasce sem `leadId` e a raia trava em `qualificado`

## Palavras do operador

> "a gente enviou ali os documentos, fiz uma proposta aí, enviei até a parte
> dos documentos, só que o funil ficou até qualificado, se eu não me engano."
> — Kairo, 2026-06-15

## Cenário exato

Fluxo **WEB** (chat teatro): usuário simula, recebe oferta, clica "Contratar",
preenche `contract_form`, sobe documentos. A proposta Bevi é gerada (com PDF),
mas o lead correspondente permanece em `qualificado` no kanban — nunca avança
para `proposta_enviada`, e o polling de status nunca consegue movê-lo adiante.

## Root cause — PROVADO no código

A transição `qualificado → proposta_enviada` existe (`proposal-repo.ts:75-76`:
`if (leadId) { await transitionLeadStage(leadId, "proposta_enviada", {type:"system"}) }`),
mas é **pulada porque `leadId` chega `undefined`** no fluxo web. Cadeia provada:

1. `src/app/api/chat/route.ts` (~linha 116) chama `buildStartContractInput(meta, {...})`
   e repassa o resultado a `startContract(conversationId, input)`.
2. `src/lib/bevi/contract-input.ts:22-43` — `buildStartContractInput` **não inclui
   `leadId`** no objeto de retorno.
3. `src/lib/bevi/fulfillment.ts:116` — `createBeviProposal(conversationId, snapshot, input.leadId)`
   recebe `input.leadId === undefined`.
4. `src/lib/bevi/proposal-repo.ts:75-76` — o guard `if (leadId)` falha → **a
   transição não roda**. A proposta nasce com `bevi_proposals.leadId = null`.
5. `src/app/api/leads/route.ts` — o lead web só é criado **depois** (captura
   nome/telefone), e **não religa** a proposta órfã nem dispara a transição
   retroativa.
6. `src/lib/workers/proposal-status-poll.ts:57` — guard `if (!stage || !row.leadId)`
   **ignora a proposta** (leadId null). O desfecho (mesa → boleto → efetivada)
   nunca chega ao lead.

> Observação: o fluxo **WhatsApp** mascara o sintoma — `handoffToAgents`
> (`proxy.ts`) cria o lead antes do fechamento, então mesmo com `input.leadId`
> undefined o polling reencontra o lead pela `conversationId`. No web não há
> esse resgate.

## Confirmação adicional no banco (rodar na execução, não bloqueia anotação)

```sql
SELECT bp.id, bp.conversation_id, bp.lead_id,
       l.id AS actual_lead_id, l.stage, bp.created_at, l.created_at AS lead_created_at
FROM bevi_proposals bp
LEFT JOIN leads l ON l.conversation_id = bp.conversation_id
WHERE bp.lead_id IS NULL AND l.id IS NOT NULL AND l.stage = 'qualificado'
ORDER BY bp.created_at DESC LIMIT 10;
```

Linhas com `lead_id IS NULL` + `actual_lead_id` presente + `stage='qualificado'`
provam o desencontro proposta↔lead.

## Correção proposta

| O quê | Onde |
|---|---|
| Resolver o `leadId` da conversa no momento do fechamento e injetar no input | `src/app/api/chat/route.ts` (antes de `buildStartContractInput`) |
| `buildStartContractInput` passa a carregar `leadId` | `src/lib/bevi/contract-input.ts:22-43` |
| Garantir que `createBeviProposal` recebe `leadId` não-nulo no caminho feliz | `src/lib/bevi/fulfillment.ts:116` |
| **Religação retroativa:** ao criar o lead em `/api/leads`, se existir proposta da mesma conversa com `leadId` null → setar `leadId` + disparar `transitionLeadStage(leadId, "proposta_enviada")` (forward-only, idempotente) | `src/app/api/leads/route.ts` |
| Telemetria: logar (sem PII) quando `createBeviProposal` recebe `leadId` null pra caçar regressões futuras | `src/lib/bevi/proposal-repo.ts` |

> Decidir na execução qual das duas pontas é a fonte primária (resolver leadId
> antes da proposta **vs.** religação em `/api/leads`). O ideal é **as duas**:
> a primeira corrige o caminho novo, a segunda cura órfãos e cobre a corrida
> "lead criado depois da proposta".

## Regressão exigida

Bug **não-agêntico** (vínculo de FK + transição de estado em rota HTTP; não
depende da LLM) → **não precisa cassette (Camada 2)**. Cobertura:

- **Integration test (prioritário, toca DB real):** simula o fechamento web →
  cria proposta → assert `bevi_proposals.leadId` preenchido E `leads.stage =
  'proposta_enviada'` E `lead_events` registrou a transição
  `qualificado→proposta_enviada` com `actorType='system'`.
- **Integration test do resgate retroativo:** proposta órfã (leadId null) +
  POST `/api/leads` → assert proposta religada + raia avançada.
- **Camada 1 (structural):** assert que `buildStartContractInput` inclui `leadId`
  no shape de retorno e que o guard de transição é alcançável no caminho web.

Escrever o teste, **ver falhar** com a assinatura exata (raia presa em
`qualificado` / leadId null), só então corrigir.
