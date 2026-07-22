---
slug: remover-agente-servicos-seed-e-prod
titulo: "Remover completamente a modalidade/agente de Serviços (seed + banco de prod, web e WhatsApp)"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-07-22 — thread interna do time relatando teste com cliente
evidencia:
  - _evidencia/2026-07-22-remover-agente-servicos-thread-whatsapp-time.png
mexe_em:
  - drizzle/0004_agents_crud.sql (CHECK constraint personas_category_check + seed persona Camila/servicos)
  - src/db/schema.ts (CHECK constraint personas_category_check, TS)
  - src/lib/agent/personas.ts (Category type + SPECIALIST_CATEGORIES inclui "servicos")
  - src/lib/diagnose/types.ts (categoryEnum inclui "servicos")
  - src/lib/agent/categories.ts (CATEGORY_META["servicos"])
  - src/lib/agent/qualify-config.ts (CREDIT_BOUNDS.servicos)
  - src/lib/agent/recommendation.ts (ranges de recomendação servicos)
  - src/lib/consorcio/plan-estimate.ts (meses/taxa média servicos)
  - src/lib/agent/orchestrator/gate-questions.ts (perguntas de gate por categoria, inclui servicos)
  - src/lib/whatsapp/formatter.ts (formata "Serviços" em cards WhatsApp)
  - src/lib/agent/turn-analyzer.ts (detecta categoria "servicos" em texto livre — reforma/viagem/etc.)
  - drizzle/0016_personas_examples.sql, 0018_whatsapp_optin_narrative_examples.sql, 0021_auto_persona_gate_flow.sql (exemplos de treino da persona Camila/servicos)
  - src/lib/agent/HARD_RULES.md (documenta "specialist serviços")
  - welcome-options.ts (já restringe chips web/WhatsApp pra imóvel/auto/moto — só a superfície foi corrigida antes)
---

## Palavras do operador
> "veja a thread anoite o bug. temos que apagar do seed e do banco de prod o agent de servicos. nem pelo whats enm pela web deve podder falar com ele. nem ter essa ocpao."

Citação da thread anexada (print, equipe interna):
- Bernardo Canedo Plusoft: "Ela simulou uma carta de serviços. Acho que não deveríamos oferecer essa modalidade."
- Bruna Perrotta: "Não mesmo... não estava habilitado" / "Só imóvel, auto e moto"
- Bernardo: "Aí o agente disse que teve problema na integração"
- Bruna: "vai mandando aí que vamos ajustando. esse aí realmente não era para estar mais disponível... tem um agente exclusivo para serviço - temos que demitir ele" / "as opções foram removidas mas ele continuava no escritório"

## Cenário
- **Rota/tela:** Não especificado no print — cliente conseguiu chegar até simular uma carta de "Serviços" mesmo com a modalidade supostamente já desabilitada nas opções visíveis.
- **Passos:** 1) Cliente conversa com o agente (canal não confirmado — provável WhatsApp pelo teor da thread) 2) Consegue simular uma carta de crédito pra modalidade "Serviços" 3) Time percebe que essa modalidade não deveria nem existir como opção.
- **Dados usados:** N/A — bug estrutural de catálogo/seed, não de um caso específico.

## Esperado × Atual
- **Esperado:** Modalidade "Serviços" não existe mais em lugar nenhum — nem no seed, nem no banco de produção, nem como opção oferecida pelo agente (web ou WhatsApp). Só devem restar: Imóvel, Auto, Moto.
- **Atual:** Mesmo com "as opções removidas" (tentativa anterior de tirar da UI/prompt), o agente "continuava no escritório" — ou seja, a remoção foi superficial (só na superfície de opções apresentadas), e o dado/registro de fundo (seed/banco) ainda permite a modalidade ser usada, causando simulação de carta de serviços que não deveria ser possível.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Confirmado por busca ampla (find-code): a categoria `servicos` (persona "Camila", especialista) **está viva em várias camadas** e a remoção anterior só tocou a superfície:

- **Já corrigido antes:** `welcome-options.ts` já restringe os chips clicáveis (web/WhatsApp) pra só imóvel/auto/moto — é por isso que "as opções foram removidas" da visão do time.
- **Ainda vivo (explica "ele continuava no escritório"):** `turn-analyzer.ts` continua **detectando "servicos" em texto livre** (reforma/viagem/educação/saúde etc.) mesmo sem chip — ou seja, o cliente não precisa clicar em nada, só falar. Daí a persona Camila (seed em `drizzle/0004_agents_crud.sql`) ser ativada e simular carta de serviços de verdade.
- Toda a cadeia de suporte pra essa categoria segue cadastrada: `Category` type, `CATEGORY_META`, `CREDIT_BOUNDS`, ranges de recomendação, `plan-estimate`, `gate-questions`, formatter do WhatsApp, CHECK constraint no schema/banco, e exemplos de treino em 3 migrations (`0016`, `0018`, `0021`).

**O que falta pra fechar de vez (não feito aqui, é trabalho da todo-blocks/execução):** decidir se a remoção é (a) uma nova migration que apaga a persona "Camila"/servicos do banco de prod + bloqueia `turn-analyzer` de detectar essa categoria e todo o resto do código passa a tratar `servicos` como categoria inexistente, ou (b) manter o type mas garantir que NENHUM caminho (tool-policy, turn-analyzer, gate-questions, seed) consiga instanciar/ativar essa persona em prod. Como o pedido do Kairo é "apagar do seed e do banco de prod", a rota (a) parece a intenção — mas isso toca schema/CHECK constraint (`personas_category_check`) e é mudança estrutural, não cosmética; vale confirmar escopo exato na promoção pra bloco.
