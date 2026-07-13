---
id: FIX-311
titulo: "Liga scarcity + decision_prompt ao ramo FELIZ do funil (hoje só existem no ramo de recusa)"
status: done
bloco: bloco-r10-4-happy-path-ceremony
severidade: alta
projeto: aja-agora
arquivos:
  - src/app/api/chat/route.ts
  - src/app/api/chat/route.fix-311-happy-path-ceremony.integration.test.ts
  - src/app/api/chat/route.lead-form-prefill.test.ts
  - tests/regression/agent-trajectory.test.ts
  - tests/regression/fix-237-cards-orfaos.test.ts
rodada: 2026-07-13 (loop-de-goal r10, onda 4, bloco r10-4-happy-path-ceremony — investigação de causa-raiz da Etapa A)
commit: ed38813, 978d0ce5
executado_em: 2026-07-13
---
## Palavras do operador
> Investigação de causa-raiz: em ambos os dossiês limpos (Madalena aceita o hero, Mario segue o
> caminho de aceite direto), `scarcity` e `decision_prompt` NUNCA aparecem — o funil pula direto
> pro fecho (`contract_form`/`whatsapp_optin`) assim que o usuário demonstra interesse claro.

## Cenário exato
- **Rota/tela:** `POST /api/chat`, ação `interest` (usuário claramente interessado/pronto pra
  avançar) e o branch de aceite do simulador.
- **Dados usados:** `madalena-junta-v2/dossie.json` + `mario-sem-lance-v2/dossie.json` — grep por
  `scarcity`/`decision_prompt` em ambos retorna zero ocorrências.

## Esperado × Atual
- **Esperado:** a cerimônia de fechamento (criar urgência com `scarcity`, confirmar decisão com
  `decision_prompt`) acontece SEMPRE antes do fecho, seja qual for o caminho que o usuário tomou
  pra chegar ali — aceitar de cara também merece a cerimônia completa, não só quem hesitou.
- **Atual:** `route.ts:508-522` (ação `interest`) tem um atalho de "caminho feliz" que pula direto
  de reveal/hero pra `contract_form`, sem passar por `scarcity`/`decision_prompt`. Mesma coisa em
  `route.ts:1125-1145` (branch de aceite do simulador). A cerimônia completa (`scarcity` →
  `decision_prompt`) só existe hoje no branch de recusa/ambiguidade do simulador
  (`route.ts:1147-1189`) — ou seja, o usuário que hesita recebe MAIS cuidado no fecho do que o
  usuário que aceita direto, o que é o inverso do que o produto quer (todo fecho merece a mesma
  cerimônia, ela existe pra dar segurança/urgência genuína, não pra "recuperar" hesitantes).

## Root cause (INVESTIGADO)
- `route.ts:508-522`: fast-path da ação `interest` pula `scarcity`/`decision_prompt` direto pro
  fecho.
- `route.ts:1125-1145`: branch de aceite do simulador tem o mesmo atalho.
- `route.ts:1147-1189`: única região que hoje executa a cerimônia completa — mas só é alcançada
  pelo ramo de recusa/ambiguidade.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Extrair a cerimônia `scarcity`→`decision_prompt` (hoje só em `1147-1189`) pra uma função/passo comum do funil | `route.ts` |
| Fazer os dois fast-paths do ramo feliz (`508-522` ação `interest`, `1125-1145` aceite do simulador) passarem por essa mesma cerimônia ANTES do fecho, em vez de pular direto | `route.ts:508-522`, `route.ts:1125-1145` |

## Regressão exigida
- Teste de integração: usuário aceita a oferta de cara (ação `interest`) → `scarcity` e
  `decision_prompt` aparecem ANTES de `contract_form`/`whatsapp_optin`.
- Teste de integração: usuário aceita o simulador → mesma cerimônia, mesma ordem.
- Teste de regressão: ramo de recusa/ambiguidade (já cobria a cerimônia) continua funcionando.

## Resumo da execução

Implementado exatamente como proposto. A cerimônia (`route.ts:1147-1189`, único lugar que a
implementava) foi extraída pra uma função helper local ao arquivo, `pipeClosingCeremony` — sem
abstração maior (nem módulo novo, nem parametrização extra): recebe `conversationId`/`meta`/
`contactName`/`writer`/`userKey` e dispara `buildScarcityDirective` → card `scarcity` →
`buildDecisionPromptDirective` → card `decision_prompt`, na mesma ordem de antes. Idempotência
(`decisionDispatched`) continua responsabilidade do CALLER, igual ao padrão anterior.

Os dois fast-paths do ramo feliz religam ao helper, ambos guardados por
`if (!decisionDispatched)` (idempotente — quem já viu a cerimônia por qualquer caminho não a vê
de novo):
- Ação `interest` (`508-522`): religa a cerimônia ANTES de `buildAdvanceToContractDirective`.
- Gate `simulator-offer="yes"` (`1125-1145`): o dial (`buildSimulatorDialDirective`) continua
  sendo mostrado — não foi removido, ainda é UX valiosa (conceito do Bernardo) — e a cerimônia
  dispara DETERMINISTICAMENTE logo em seguida, no MESMO turno, em vez de depender de um turno de
  texto livre futuro classificar a resposta como avanço (o que nos 2 dossiês investigados nunca
  acontecia, porque o clique seguinte ia direto pro fast-path `interest`, que também pulava a
  cerimônia).

TDD strict seguido à risca: `route.fix-311-happy-path-ceremony.integration.test.ts` (4 cenários —
`interest` mostra a cerimônia, `simulator-offer="yes"` mostra a cerimônia, `interest` com
`decisionDispatched` já `true` NÃO repete a cerimônia, `simulator-offer="no"` — regressão do ramo
que já funcionava — continua idêntico) FALHOU antes da implementação (2/4, exatamente os dois
fast-paths do ramo feliz) e PASSOU 4/4 depois.

3 arquivos de teste pré-existentes travavam a decisão ANTIGA do FIX-38 ("clique explícito pula o
card de decisão") — `route.lead-form-prefill.test.ts`, `tests/regression/agent-trajectory.test.ts`
(describe `FIX-38-NO-DOUBLE-CONFIRM`, renomeado pra `FIX-311-HAPPY-PATH-CEREMONY`) e
`tests/regression/fix-237-cards-orfaos.test.ts`. Todos atualizados pra checar o novo
comportamento (religamento de `pipeClosingCeremony`) em vez da ausência dele — "palavra nova
vence": FIX-311 reverte o FIX-38 de propósito, então os guards antigos foram corrigidos pra
refletir a decisão nova, não defendidos.

Suíte completa `pnpm test:unit` rodada ao final: 368 arquivos / 3403 testes verdes. Nenhum caso
de borda ficou de fora do escopo declarado no fix — os únicos dois fast-paths do ramo feliz
citados na investigação (`interest`, `simulator-offer="yes"`) foram cobertos; o caminho de texto
livre (`orchestrator/index.ts`, fora do escopo de arquivos deste bloco) já implementava a
cerimônia corretamente e não foi tocado.
