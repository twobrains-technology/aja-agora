---
id: FIX-192
titulo: "Cliente Meta: createTemplate/listTemplates + env WHATSAPP_WABA_ID + .env.example"
status: todo
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/whatsapp/api.ts
  - .env.example
rodada: 2026-07-02 — feature cadastro/envio de Message Templates Meta oficial
---
## Palavras do operador
> "temos q ter o cadastro e envio de modelos de mensagens ao whatsapp meta oficial ...
> a mensagem de template que tem q ser submetida pela meta."

## Cenário exato
- **Contexto:** o envio já usa a Cloud API oficial (Graph v21.0, `src/lib/whatsapp/api.ts`).
  `sendTemplate()` existe (`api.ts:256`), mas **não há função para CRIAR/SUBMETER** um template
  à Meta, nem para LISTAR templates (necessário pro poll de reconciliação — ver FIX-194).
- **Detalhe crítico:** criar/submeter template é no **WABA (WhatsApp Business Account ID)**,
  não no `PHONE_NUMBER_ID`. Hoje só temos `WHATSAPP_PHONE_NUMBER_ID` em env.

## Esperado × Atual
- **Esperado:** `createTemplate()` (POST no WABA) e `listTemplates()` (GET no WABA); env `WHATSAPP_WABA_ID`.
- **Atual:** só `sendTemplate` (envio), nenhuma criação/listagem; sem `WHATSAPP_WABA_ID`.

## Root cause (INVESTIGADO)
`src/lib/whatsapp/api.ts:14-21` lê `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`
(lança erro se ausentes). O envio bate em `POST /{phoneNumberId}/messages` (`api.ts:28`).
Não há leitura de WABA id nem endpoint de `message_templates`. O `.env.example` **nem
lista** as vars `WHATSAPP_*` (mapa do Explore, 2026-07-02).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| `createTemplate({name, language, category, components})` → `POST ${GRAPH_API}/${WHATSAPP_WABA_ID}/message_templates`, Bearer token, retorna `{id, status, category}` | `src/lib/whatsapp/api.ts` (região das funções de saída) |
| `listTemplates()` → `GET ${GRAPH_API}/${WHATSAPP_WABA_ID}/message_templates?fields=name,status,category,language,id` (paginação simples) | `src/lib/whatsapp/api.ts` |
| Ler `WHATSAPP_WABA_ID` com erro claro se ausente (mesmo padrão das outras vars) | `src/lib/whatsapp/api.ts` |
| Documentar TODAS as `WHATSAPP_*` (ACCESS_TOKEN, PHONE_NUMBER_ID, WABA_ID, VERIFY_TOKEN, APP_SECRET, AGENT_PHONES, AGENT_NAMES) | `.env.example` |

⚠️ **PENDENTE-KAIRO:** o valor real do `WHATSAPP_WABA_ID` precisa ser obtido na Meta Business.
Não inventar. Deixar a var documentada no `.env.example` com placeholder e nota. Os testes
mockam o `fetch`, não dependem do valor real.

## Regressão exigida
Camada 1 (`src/lib/whatsapp/api.*.test.ts`): mock de `fetch`; assert de endpoint
(`/{WABA_ID}/message_templates`), método, header `Authorization: Bearer`, e corpo enviado
por `createTemplate`; erro claro quando `WHATSAPP_WABA_ID` ausente. NUNCA bater na Graph real.
