---
id: FIX-187
titulo: "Card de proposta/recomendação/simulação é emitido mesmo após a busca do turno falhar — gate precisa exigir descoberta bem-sucedida NO TURNO ATUAL, não 'exibido alguma vez'"
status: done
commit: c8979eaa
executado_em: 2026-07-01
severidade: alta
projeto: aja-agora
bloco: bloco-funil-turno-orquestracao
arquivos:
  - src/lib/agent/orchestrator/action-policy.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/artifact-guard.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-01 — refino do print "vazamento de processo + proposta fantasma" (Kairo)
evidencia:
  - _evidencia/agente-meta-narrativa-search-groups-falha-print.png
---

## Palavras do operador
> (print do Kairo: depois de "Kairo, tive um problema aqui agora — deixa eu buscar as
> opções reais…", o chat MESMO ASSIM mostra o card "Esse plano faz sentido para você?
> (BANCO DO BRASIL)" com Valor do bem R$ 131.042, Parcela R$ 2.365,57, Prazo 72 meses,
> Grupo 1797, Lance médio R$ 79.281 e botão "Sim, quero contratar agora".)

## Cenário exato
- **Rota/tela:** chat web (e WhatsApp).
- **Passos:** o turno tenta buscar as opções reais → a descoberta falha (FIX-186) → mesmo
  assim o agente emite `present_decision_prompt` (+ um `recommendation_card`/
  `simulation_result` com números) → o usuário vê uma **proposta ancorada em dado que não
  carregou neste turno**.

## Esperado × Atual
- **Esperado (regra INVIOLÁVEL do `CLAUDE.md` §"REGRAS DE PRODUTO" #2):** nenhuma proposta,
  recomendação, simulação ou número é exibido sem vir de uma descoberta **bem-sucedida** na
  Bevi. Se a busca do turno falhou, **nenhum** card de proposta/decisão/recomendação/
  simulação pode ser emitido — só o fallback do FIX-186.
- **Atual:** o gate só verifica se a administradora **já foi exibida alguma vez** na conversa
  e só quando `administradora` vem preenchida. Proposta pós-falha ancora em dado **antigo**,
  apresentado como atual.

## Root cause INVESTIGADO (provado no código)
- `present_decision_prompt` (`src/lib/agent/tools/ai-sdk.ts:1015-1036`) só valida se
  `args.administradora` está presente (`ai-sdk.ts:1026`); a única checagem é
  `shown.administradoras.has(administradora)` (`src/lib/agent/orchestrator/action-policy.ts:73-81`)
  = "essa administradora **já apareceu alguma vez** nesta conversa" — **não** "a descoberta
  deste turno teve sucesso". Sem `administradora`, **nenhuma** checagem roda.
- `present_recommendation_card` e `present_simulation_result` **não entram** na tabela de
  precondição (`ACTION_PRECONDITIONS` cobre só `simulate_quota`/`get_group_details`/
  `present_decision_prompt` — `action-policy.ts:89-96`). Os números do recommendation_card
  são o que o modelo passar (não coeridos). O `simulation_result` só é coerido a partir de
  `lastQuotaSimulation` se `simulate_quota` retornou **neste turno** (`runner.ts:331-333`);
  se a simulação falhou, não há coerção com fonte fresca.
- A governança do bloco A (FIX-179/180) trava "agir sobre grupo/administradora **nunca
  exibido**" — mas **não** trava "propor depois que a descoberta **deste turno** falhou".
  É o gap exato que este card fecha, usando o sinal `discoveryFailedThisTurn` do FIX-186.

## Correção proposta
| O quê | Onde |
|-------|------|
| Precondição nova: `present_decision_prompt`/`present_recommendation_card`/`present_simulation_result` exigem descoberta **bem-sucedida no turno** (ou dado fresco coerido de retorno real) — não só "exibido alguma vez" | `src/lib/agent/orchestrator/action-policy.ts` (`ACTION_PRECONDITIONS`) |
| Cobrir `present_recommendation_card` + `present_simulation_result` na tabela de precondição (hoje ausentes) | `action-policy.ts:89-96` |
| Endurecer o `execute` das 3 tools pra recusar quando `discoveryFailedThisTurn` (sinal do FIX-186) | `src/lib/agent/tools/ai-sdk.ts` |
| Regra 2ª linha (blocklist reativa) no artifact-guard: **drop** de proposta/decisão/recomendação/simulação quando o turno teve erro de descoberta | `src/lib/agent/orchestrator/artifact-guard.ts` |
| INVARIANTE em código (não regra-no-prompt): número fiscal/de oferta só de fonte fresca real | (as 3 tools + guard) |

## Regressão exigida (3 camadas — CLAUDE.md §"Regressão de agent")
- **Camada 1 (structural):** `action-policy.test.ts` — as 3 tools reprovam quando
  `discoveryFailedThisTurn=true` / sem descoberta fresca; recommendation_card e
  simulation_result agora constam em `ACTION_PRECONDITIONS`.
- **Camada 2 (cassette OBRIGATÓRIO):** `tests/regression/agent-trajectory.test.ts` — turno
  com descoberta falhada onde o modelo TENTA emitir `present_decision_prompt`/
  `recommendation_card`; o guard **dropa** e nenhuma proposta chega ao usuário (só o
  fallback do FIX-186).
- **Camada 3 (eval nightly):** persona chega ao ponto de proposta com Bevi falhando — o
  agente nunca mostra card com números; entrega o fallback.

## Nota de dependência (mesmo bloco)
Depende do sinal `discoveryFailedThisTurn` do **FIX-186** — por isso a ordem interna é
186 → 187. Ambos no mesmo worktree, edição sequencial (sem merge entre eles).
