---
id: FIX-347
titulo: "P1 — 'Acho que me perdi por aqui' volta em turnos com resposta CLARA do usuário (2/8)"
status: done
bloco: bloco-f-turno-vazio-meta
arquivos:
  - src/lib/chat/empty-turn-guard.ts
  - src/lib/chat/empty-turn-guard.test.ts
  - src/app/api/chat/route.ts
  - src/app/api/chat/route.admin-message-persistence.test.ts
  - src/app/api/chat/route.fix-347-empty-turn-fallback-nao-repete.integration.test.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/index.fix-347-turno-vazio-retry-motivo.integration.test.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/sanitizer.test.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 4 (juiz Sonnet, 7/10)
---

# FIX-347 — o agente diz "me perdi" quando o usuário foi claríssimo

## Cenário (moto-web t9, servicos-web t10 — 2 de 8)
O usuário responde algo **claro** e o agente devolve:

> "Acho que me perdi por aqui. Pode mandar de novo, por favor?"

Regrediu: era **0/8** na rodada 3.

## Root cause (localizado pelo juiz)
`src/lib/chat/empty-turn-guard.ts:37` (`EMPTY_TURN_FALLBACK`), disparado em
`src/app/api/chat/route.ts:1568` quando o turno fecha **sem texto e sem artifact**.

**A pergunta que você tem que responder ANTES de corrigir:** *por que o turno ficou vazio?* Duas
hipóteses — PROVE qual é (rode a jornada, olhe o log e o `turn-trace`):
1. O modelo não gerou nada (raro).
2. **O sanitizer DROPOU tudo** que ele gerou (provável — a campanha adicionou vários guards novos:
   `isHallucinatedAdministradoraClaim`, `isPrematureTopOfferClaim`, meta-narrativa…). Se for isso,
   os guards estão comendo demais e o "me perdi" é só o sintoma.

## Correção proposta

| O quê | Onde |
|---|---|
| **Se o turno esvaziou por causa do sanitizer**: em vez de emitir texto fixo, dar ao modelo UMA chance de reformular no mesmo turno, com o motivo do corte no contexto ("não cite administradora fora da lista", "não anuncie os próprios passos") | `runner.ts` (retry de 1 tentativa quando `fullResponse` fica vazio pós-sanitize) |
| Só se ainda assim vier vazio, o fallback aparece — e **nunca com a mesma frase** | `empty-turn-guard.ts` |
| ⚠️ NÃO resolva relaxando um guard de INVARIANTE (alucinação/compliance). Se o guard está certo e o modelo insiste no erro, o retry com o motivo é o caminho | — |

## Regressão exigida
- Integração: turno cujo texto é integralmente dropado pelo sanitizer → o modelo é chamado de novo
  com o motivo, e o usuário recebe uma resposta REAL (não "me perdi").
- Integração: "me perdi" nunca aparece 2× na mesma conversa.

## Root cause PROVADA (o que deu pra provar, e o que ficou como hipótese honesta)

**Não foi possível reconstruir byte-a-byte qual guard específico bloqueou `moto-web` t9 /
`servicos-web` t10** — a coleta daquela rodada só persistiu o transcript final (o texto do modelo
ANTES do sanitizer nunca foi logado); essa ausência de instrumentação é, ela mesma, parte do
achado. O que FOI provado, por leitura de código + reprodução determinística (teste de integração,
ver abaixo): existe um caminho real e reproduzível onde `EphemeralTextFilter`
(`sanitizer.ts`) dropa **100% dos segmentos** de um turno — qualquer combinação dos guards
adicionados nesta campanha (`isPrematureTopOfferClaim`, `isHallucinatedAdministradoraClaim`,
preâmbulo de processo etc.) — sem deixar rastro nenhum. Sem `toolErrorThisTurn`/
`discoveryFailedThisTurn` (que JÁ têm fallback dedicado, nunca ficam mudos), esse turno é
indistinguível de "o modelo não disse nada" pro guard de turno-vazio, que disparava sempre o
mesmo texto fixo.

Confirmado com o meta exato do funil onde `moto-web` t9 aconteceu (pós-decisão, turno livre, sem
gate pendente — `nextGate` resolve "search"/terminal, `decideShowGate` retorna `false`): reproduzido
via teste de integração com o modelo mocado narrando 100% preâmbulo de processo (mesma família de
guard que a campanha adicionou), turno fecha vazio, e — pós-fix — o retry-com-motivo resolve.

## Correção aplicada

1. **`sanitizer.ts`**: `EphemeralTextFilter` ganhou `droppedSegmentReasons()` — rastreia QUAL guard
   (`EphemeralDropReason`) dropou cada segmento do turno, sem alterar nenhum comportamento de
   filtragem existente (refactor: `isEphemeralSegment` agora delega pra `ephemeralSegmentReason`,
   fonte única).
2. **`runner.ts`**: `RunAgentResult` expõe `sanitizerDropReasons` (do filtro acima) e
   `executedToolCount` (pra o orchestrator saber que nenhum efeito colateral real aconteceu ainda).
3. **`directives.ts`**: `buildEmptyTurnRetryDirective(reasons)` — explica ao modelo, em PT-BR e por
   categoria (não a frase literal do guard), por que a resposta anterior não saiu. Conversa
   continua do modelo (CLAUDE.md); só o MOTIVO do corte vira contexto.
4. **`index.ts`**: quando o turno fecha com `fullResponse` vazio, zero tool-call, zero artifact, zero
   gate pendente E `sanitizerDropReasons` não-vazio (prova de que o modelo disse algo e foi
   filtrado), chama `runAgentTurn` de novo — UMA vez — com o motivo anexado ao `systemContextBlocks`.
   NUNCA relaxa o guard que bloqueou; se a retentativa também vier vazia, segue o fluxo normal (rede
   final é o fallback do route.ts).
5. **`empty-turn-guard.ts`**: `EMPTY_TURN_FALLBACK_REPEAT` + `pickEmptyTurnFallback` (função pura) —
   nunca repete a MESMA frase 2× na mesma conversa (mesmo padrão já usado pelo fallback de
   tool-error, FIX-266/332).
6. **`route.ts`**: antes de cair no `EMPTY_TURN_FALLBACK`, varre `loadConversationHistory` — se já
   foi usado antes nesta conversa, usa a variante.

⚠️ **Invariante que não quebrou:** nenhum guard de sanitizer foi relaxado ou removido — o retry só dá
ao modelo uma NOVA chance de responder sem repetir o problema, nunca contorna o invariante.

## Regressão (como foi verificada)

- `sanitizer.test.ts` (FIX-347): TDD strict, RED→GREEN, unit puro do `droppedSegmentReasons()`.
- `empty-turn-guard.test.ts` (FIX-347): TDD strict, RED→GREEN, unit puro do `pickEmptyTurnFallback`.
- `index.fix-347-turno-vazio-retry-motivo.integration.test.ts`: RED→GREEN via `git stash` do código
  de produção (testes ficam) — confirma que, SEM a correção, o turno realmente fecha mudo; COM a
  correção, o retry dispara (2 chamadas a `resolveAgent`) e a resposta real chega ao usuário.
- `route.fix-347-empty-turn-fallback-nao-repete.integration.test.ts`: RED→GREEN via reversão pontual
  do `route.ts` — confirma fim-a-fim (HTTP `POST` real) que 2 turnos mudos na mesma conversa nunca
  repetem a frase.
- **Regressão real encontrada e corrigida na própria suíte**: `route.admin-message-persistence.test.ts`
  assumia (desde o FIX-172) que TODO fallback de turno-vazio é sempre a MESMA string —
  correto até este fix, agora estale por design. Atualizado pra contar a FAMÍLIA (original +
  variante) em vez de igualdade estrita — o invariante central da suíte (N fallbacks, nunca
  perdidos, anti-ghosting) continua intacto e agora também verifica que só a 1ª ocorrência é a
  frase original.
- `pnpm test:unit` completo: 386 arquivos / 3557 testes verdes (baseline era 3549 — as 8 novas são
  deste fix). Suíte ampla de `src/lib/agent/orchestrator/` + `src/lib/chat/` + `src/app/api/chat/`
  (exceto integration): 757/759 verdes — as 2 falhas restantes são `IDENTITY_ENC_KEY` ausente na
  invocação direta do vitest (pré-existente, confirmado via `git stash`, nada a ver com este diff).
