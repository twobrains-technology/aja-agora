---
id: FIX-305
titulo: "Gate timeframe (e outros não-COLLECTION pós-reveal) sem escape — trava indefinida sob modelo fraco"
status: todo
bloco: bloco-r10-3-timeframe-stuck
severidade: alta
projeto: aja-agora
arquivos: [src/lib/agent/qualify-state.ts, src/lib/agent/orchestrator/index.ts, src/lib/agent/personas.ts]
rodada: 2026-07-13 (loop-de-goal r10, onda 3 — achado durante a verificação do bakeoff pós-onda-1, FIX-304)
---
## Palavras do operador
> Decisão via `AskUserQuestion` (2026-07-13): "Default após N tentativas (Recomendado) — Depois de
> ~2-3 respostas vagas/neutras seguidas sem extrair prazo, assume um prazo padrão razoável (ex.:
> 12 meses) e segue o funil — o usuário pode ajustar depois. Nunca trava."

## Cenário exato
- **Rota/tela:** chat (web/whatsapp), pós-reveal, gate `timeframe` (prazo desejado de
  contemplação), qualquer modelo com tool-calling/extração fraca.
- **Passos:** completar o reveal → responder de forma neutra/vaga às tentativas do agente de
  descobrir o prazo desejado (ex.: "show", "beleza", sem mencionar um prazo).
- **Dados usados:** `.bakeoff/qwen-jornada-pos-r10-onda1.log` (re-rodado no FIX-304, worktree
  `fix/r10-2-bakeoff-regua`) — trace real: `... reco-consent → lance → timeframe → lance-value →
  lance-embutido → timeframe → timeframe → timeframe → timeframe` (4x seguidas, `[gate-skip]
  gate=timeframe intent=neutral — staying conversational`), terminando sem NUNCA emitir o gate
  `simulator-offer`. Teste que capturou: `tests/eval/jornada-aja-agora.eval.test.ts` — "passo 4 —
  a oferta do simulador foi EMITIDA pela máquina de estado (sem fallback)".

## Esperado × Atual
- **Esperado:** o funil NUNCA trava indefinidamente num gate — depois de algumas tentativas sem
  extrair o dado, assume um default razoável e segue (a régua já usada nos outros gates de
  coleta, FIX-208, adaptada pra "assumir default" em vez de "forçar o gate mesmo em neutral").
- **Atual:** `timeframe` (e por extensão `lance`/`lance-value`/`lance-embutido` fora do
  `COLLECTION_GATES`) não tem NENHUMA proteção contra ficar preso — `nextGate()` retorna o mesmo
  gate pra sempre enquanto o dado (`qualifyAnswers.prazoMeses`) não for preenchido, e o
  heurístico "neutral → conversacional" (intencional pra deixar o agente fluir) não tem teto de
  tentativas.

## Root cause (INVESTIGADO — provado no log real)
- `qualify-state.ts:158`: `if (q.prazoMeses === undefined) return "timeframe";` — sem limite de
  tentativas, sem fallback.
- `qualify-state.ts` (COLLECTION_GATES, linha ~32-37): `timeframe` NÃO está no set — não herda
  NENHUMA das proteções que `credit`/`lance`/`lance-value`/`lance-embutido` ganharam (mas
  `lance`/`lance-value`/`lance-embutido` TAMBÉM não estão mais garantidos — confirmar no código se
  ainda estão no set ou se migraram; ver correção abaixo).
- `personas.ts:138`: `gateAttempts?: Partial<Record<Gate, number>>` já existe, mas é usado
  HOJE só pelo worker de reengajamento (`gate-reengage.ts`, escalada por INATIVIDADE/tempo) — não
  por contagem de turnos-sem-progresso NA MESMA conversa ativa. Reusar o mesmo campo pra uma
  semântica diferente (turnos consecutivos, não tempo) arriscaria colidir com a escalada de
  reengajamento — usar um campo NOVO e distinto.
- Consequência direta: o teste `simulator-offer NÃO foi emitido pela máquina de estado` — o funil
  nunca alcança o simulador de contemplação porque fica preso ANTES dele.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Novo campo `meta.gateStuckTurns?: Partial<Record<Gate, number>>` — incrementado no orquestrador toda vez que o MESMO gate não-COLLECTION segue pendente após um turno de usuário com intent neutral/sem progresso; resetado quando o gate resolve OU muda | `personas.ts` (tipo), `orchestrator/index.ts` (incremento/reset) |
| `nextGate()`/lógica de resolução do `timeframe`: quando `gateStuckTurns.timeframe >= 3` (2-3 tentativas, conforme decisão do Kairo), assume um default razoável (ex.: `prazoMeses = 12`, marcar `qualifyAnswers.prazoMeses` com uma flag `prazoMesesInferred: true` se fizer sentido pro produto sinalizar isso em algum canto) e segue — nunca trava. Copy do turno que assume o default deve avisar o usuário de forma natural ("vou considerar 12 meses por enquanto, você pode ajustar depois") | `qualify-state.ts`, `orchestrator/index.ts`, `gate-questions.ts` (copy do turno de fallback) |
| Confirmar quais outros gates pós-reveal (`lance`, `lance-value`, `lance-embutido`) têm o MESMO risco (fora de COLLECTION_GATES hoje?) — se sim, aplicar o MESMO mecanismo de escape a eles, não só timeframe (mesma classe de bug, não patchear um só) | `qualify-state.ts` |
| Regression test citando o log real (cassette) — reproduzir 3-4 turnos neutros seguidos no gate `timeframe` e confirmar que o funil assume o default e alcança `simulator-offer` | `tests/regression/` |

## Regressão exigida
- Teste de integração: gate `timeframe` recebe 3 respostas neutras seguidas (sem prazo
  extraído) → funil assume default e avança, chega em `simulator-offer`.
- Teste de integração: gate `timeframe` recebe uma resposta CLARA de prazo na 1ª ou 2ª tentativa
  → usa o valor real, nunca o default (não regredir o caminho feliz).
- Cassette reproduzindo o trace exato do log (`reco-consent → lance → timeframe → timeframe →
  timeframe → timeframe` sem simulator-offer) — prova que o cenário ANTES falhava e agora passa.
- Re-rodar `scripts/bakeoff.sh` com Qwen pós-fix e comparar contra os dois logs anteriores
  (baseline 0.774, pós-onda-1 0.68) — meta: recuperar pelo menos o patamar do baseline.
