---
id: FIX-363
titulo: "Apagar a modalidade 'Serviços' de todas as camadas (seed, banco de prod, detecção em texto livre, tipo/enum)"
status: todo
severidade: alta
projeto: aja-agora
arquivos:
  - drizzle/ (nova migration)
  - src/db/schema.ts
  - src/lib/agent/personas.ts
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/categories.ts
  - src/lib/agent/qualify-config.ts
  - src/lib/agent/recommendation.ts
  - src/lib/consorcio/plan-estimate.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/agent/orchestrator/routing.ts
  - src/lib/agent/tools/assistant-tools.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/tools/schemas.ts
  - src/lib/chat/types.ts
  - src/lib/chat/ui-message.ts
  - src/lib/diagnose/types.ts
  - src/lib/agent/personas-repo.ts
  - src/lib/agent/reactivation.ts
  - src/lib/whatsapp/formatter.ts
  - src/lib/adapters/bevi/partner-offer-mapper.ts
  - src/lib/validations/persona.ts
rodada: 2026-07-22 — campanha vendedor-matador-consorcio (goal doc .processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md, ITEM 1)
---

## Palavras do operador
> "veja a thread anoite o bug. temos que apagar do seed e do banco de prod o agent de servicos. nem pelo whats enm pela web deve podder falar com ele. nem ter essa ocpao."

Citação da thread anexada (print em
`docs/correcoes/inbox/_evidencia/2026-07-22-remover-agente-servicos-thread-whatsapp-time.png`):
- Bernardo Canedo Plusoft: "Ela simulou uma carta de serviços. Acho que não deveríamos oferecer essa modalidade."
- Bruna Perrotta: "Não mesmo... não estava habilitado" / "Só imóvel, auto e moto" / "tem um agente exclusivo para serviço - temos que demitir ele" / "as opções foram removidas mas ele continuava no escritório"

## Cenário exato
- **Rota/tela:** Não especificado no print original — cliente conseguiu simular carta de "Serviços" mesmo com a modalidade supostamente já desabilitada (provável WhatsApp pelo teor da thread).
- **Passos:** 1) Cliente conversa com o agente 2) Consegue simular carta de crédito pra "Serviços" 3) Time percebe que a modalidade não deveria existir de jeito nenhum.
- **Dados usados:** N/A — bug estrutural de catálogo/seed.

## Esperado × Atual
- **Esperado:** Modalidade "Serviços" não existe mais em lugar nenhum — nem seed, nem banco de prod, nem detecção em texto livre, nem como opção oferecida (web ou WhatsApp). Só restam Imóvel, Auto, Moto.
- **Atual:** Os chips clicáveis (web/WhatsApp) já foram restringidos antes (`welcome-options.ts:9-11`, decisão documentada de manter `servicos` viva no domínio só sem chip) — remoção superficial. `turn-analyzer.ts` ainda detecta "servicos" em texto livre (reforma/viagem/educação/saúde), ativando a persona "Camila" de verdade.

## Root cause (INVESTIGADO — provado no código, blast radius maior que a superfície)
Confirmado por 2 buscas amplas (find-code) + revisão de um agente crítico (Opus): a categoria
`servicos` vive em **~30 arquivos não-teste**. Pontos-chave:
- `src/lib/agent/turn-analyzer.ts:22,25,165` — enum `Category` inclui `servicos` + few-shot que
  classifica "reforma"/"viagem" como servicos.
- `src/db/schema.ts:505-508` — CHECK constraint `personas_category_check` permite `servicos`.
- `drizzle/0004_agents_crud.sql:59` — seed da persona "Camila" (category=servicos) — **e
  migrations 0009/0014/0015/0016 também referenciam essa persona** (CHECK + UPDATEs de
  examples/tools). A persona acumulou config em 5+ migrations.
- `src/lib/agent/personas.ts:9,373` — `Category` type + `SPECIALIST_CATEGORIES`.
- `src/lib/agent/categories.ts:8,12`, `qualify-config.ts:93,226,342,354`,
  `recommendation.ts:81`, `plan-estimate.ts:27,34`, `routing.ts:10` (regex),
  `assistant-tools.ts:76` (regex), `chat/types.ts` (7×), `ui-message.ts` (3×),
  `tools/ai-sdk.ts` (7× zod enum), `tools/schemas.ts:19,35`, `validations/persona.ts:39,97,129`,
  `diagnose/types.ts:12`, `personas-repo.ts:134`, `reactivation.ts:52`,
  `whatsapp/formatter.ts` (5×) — todos tratam `servicos` como categoria válida.
- **Dependência escondida crítica:** `src/lib/adapters/bevi/partner-offer-mapper.ts:70-83`
  (`beviSegmentToCategory`) mapeia segmentos REAIS da Bevi `SERVICOS` e `OUTROS BENS` →
  `servicos`, e **dá `throw` em segmento desconhecido (linha 81)**. Remover `servicos` do enum
  sem tratar esse mapeamento **derruba a descoberta de grupos em runtime** quando a Bevi
  retornar uma oferta desses segmentos.
- `messages.personaId` é `text` sem FK (`schema.ts:309`) — deletar a persona não quebra por
  cascata, só deixa `personaId='servicos'` órfão em transcripts antigos (aceitável).
- **Decisão de produto tomada por default recomendado** (Kairo ausente, `AskUserQuestion`
  dispensado 2×, ver goal doc): mapear segmentos `SERVICOS`/`OUTROS BENS` da Bevi pra `auto`
  em vez de `servicos`; erradicar a categoria de TODAS as camadas (não só ocultar do cliente).
  ⚠️ PENDENTE-KAIRO revisar essas 2 decisões quando puder.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Mapear segmentos `SERVICOS`/`OUTROS BENS` da Bevi pra `auto` (nunca `throw`) | `partner-offer-mapper.ts` (`beviSegmentToCategory`) |
| Nova migration: deletar a persona "Camila"/servicos ANTES de aplicar o novo CHECK sem `servicos` (ordem importa) | `drizzle/` (nova migration) + `schema.ts` |
| Remover `servicos` de `Category`/`SPECIALIST_CATEGORIES` | `personas.ts` |
| Remover `servicos` de `CATEGORY_META`/`CREDIT_BOUNDS` | `categories.ts`, `qualify-config.ts` |
| Remover `servicos` de ranges de recomendação e plan-estimate | `recommendation.ts`, `plan-estimate.ts` |
| `turn-analyzer.ts` para de classificar qualquer texto como `servicos` | `turn-analyzer.ts` |
| Remover `servicos` dos enums zod/tools/types/validations | `tools/ai-sdk.ts`, `tools/schemas.ts`, `chat/types.ts`, `ui-message.ts`, `diagnose/types.ts`, `validations/persona.ts` |
| Remover `servicos` do formatter WhatsApp, routing regex, assistant-tools regex, personas-repo, reactivation | arquivos citados acima |

## Regressão exigida
- **TDD strict** (é lógica/invariante, não copy): teste que prova que uma oferta Bevi simulada
  com segmento `SERVICOS`/`OUTROS BENS` mapeia pra `auto` sem `throw` (regressão do
  `partner-offer-mapper.ts`).
- Teste que prova que texto livre mencionando "reforma"/"viagem"/"serviço" NUNCA classifica como
  categoria válida no `turn-analyzer` (categoria inexistente, sem branch pra ela).
- `pnpm typecheck` da base deve sair limpo depois da remoção do tipo (prova mecânica de que não
  sobrou referência solta a `servicos` em nenhum arquivo listado acima).
