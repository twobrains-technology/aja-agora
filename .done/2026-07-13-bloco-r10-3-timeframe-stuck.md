# Bloco r10-3 timeframe-stuck — FIX-305

## Bakeoff Qwen — antes × depois (destaque)

| | Baseline (pré onda 1) | Pós onda-1 (FIX-304, antes deste fix) | Pós onda-3 (este fix) |
|---|---|---|---|
| `fluxoScore` | 0.774 | 0.68 | **0.734** |
| Testes verdes | 27/31 | 19/31 | 19/31 |
| Gate `simulator-offer` | disparou | **nunca disparou** (preso em `timeframe` 4x) | **disparou** |

`scripts/tunnel-litellm.sh` (repo `twobrains-aws-platform`) + virtual key de dev
(`tb/dev/aja-agora/env` → `LITELLM_API_KEY`, `qwen3.6-flash` na allowlist), rodado em foreground
(mesma lição do bloco anterior — background trava o túnel SSM). Comando:
`AI_MODEL=qwen3.6-flash AI_MODEL_EVAL=claude-haiku-4-5 pnpm vitest run --config
vitest.eval.config.ts tests/eval/jornada-aja-agora.eval.test.ts`. Log completo em
`.bakeoff/qwen3.6-flash-r10-3-timeframe-stuck.log` (local ao worktree, `.gitignore`d).

**Ressalva honesta (epistêmica, não infle o resultado):** `n=1`, e esta execução específica NÃO
exercitou o mecanismo de escape (`gateDefaultsAssumed` nunca apareceu no log — o Qwen respondeu o
prazo direto desta vez, sem ficar vago). Não dá pra atribuir a melhora de score ao fix com
confiança nesta amostra — o que dá pra afirmar com confiança é: (a) nenhuma regressão nova, (b) a
falha catastrófica do FIX-304 ("simulator-offer nunca disparou") não se repetiu. Os 12/31 testes
que continuam falhando são a MESMA classe já diagnosticada no FIX-304 (`tool_error` em
`present_decision_prompt` fora de fase — BUG-REVEAL-LOOP — + desvio pra "especialista em
cadastros" no fechamento), confirmada nos logs desta execução — fora do escopo deste bloco
(`tool-policy.ts`, não `qualify-state.ts`).

A prova RIGOROSA e determinística do fix não é o bakeoff (ruidoso, LLM real) — é o TDD de 2
camadas abaixo, que reproduz o cenário exato do log real e prova RED→GREEN.

## O que foi implementado

Gate `timeframe` (achado real no bakeoff pós-onda-1: `[gate-skip] gate=timeframe intent=neutral —
staying conversational` 4x seguidas, `simulator-offer` nunca alcançado) ficava preso pra sempre em
`nextGate()` quando o modelo não extraía o prazo do texto livre. Decisão de produto já vinha
pronta do Kairo (`AskUserQuestion`, 2026-07-13): default após N tentativas, nunca trava.

**Decisões técnicas** (registradas em `docs/decisoes/blocos/2026-07-13-bloco-r10-3-timeframe-stuck.md`):
- **N = 3** tentativas — valor já usado como exemplo no próprio card fix-305.
- **Default de prazo = 12 meses** — opção CANÔNICA já existente (`TIMEFRAME_OPTIONS`,
  qualify-config.ts), não um número inventado; mantém `objetivo="contemplacao_rapida"`.
- **Campo novo `meta.gateStuckTurns`** — distinto de `gateAttempts` (que já existia, mas é a
  escalada de re-cobrança por INATIVIDADE/desvio, termina em oferta de especialista, nunca em
  "assume default").
- **`lance`/`lance-value`/`lance-embutido` confirmados no código**: AINDA estão em
  `COLLECTION_GATES` hoje — mas isso NÃO os protege do mesmo risco (`COLLECTION_GATES` só afeta se
  o card volta a aparecer, nunca se `nextGate()` avança). Aplicado o MESMO mecanismo aos 4 gates:
  - `lance` → default `"no"` (resposta já válida, pula lance-value, não pula o funil inteiro)
  - `lance-value` → default 20% do `creditMax` (mesmo percentual do cenário "provável" já cravado
    em `scenarios.ts`)
  - `lance-embutido` → default `false` (consent-minimization — nunca assume opt-in sem sinal)

Cada assunção de default emite um aviso determinístico ao usuário (`gateStuckDefaultNotice`,
gate-questions.ts — mesmo padrão de `TWO_PATHS_FOLLOWUP_TEXT`/`SPECIALIST_EXIT_OFFER`, fora do
LLM) e segue pro próximo gate no MESMO turno — nunca fecha mudo.

## TDD (2 camadas, RED→GREEN provado)

- **Camada 1** (`qualify-state.fix-305-timeframe-stuck.test.ts`, 9 testes, lógica pura sem DB/LLM):
  reproduz o travamento matemático de `nextGate()`, prova o teto de tentativas, o default (12
  meses / sem lance / 20% do crédito / sem embutido) e o caminho feliz (resposta clara não
  regride).
- **Camada 2** (`orchestrator/index.fix-305-timeframe-stuck.integration.test.ts`, DB real + LLM
  mockado): reproduz o log EXATO do bakeoff (`[gate-skip] gate=timeframe intent=neutral`), prova
  que o 3º turno assume o default, avisa o usuário e dispara o gate `lance` no MESMO turno.
- `pnpm test:unit` completo verde (368 arquivos / 3403 testes), sem regressão.
- Pre-commit Camada 3 (LLM real cirúrgico, `EVAL-SAVE-CONTACT-NAME-CIRURGICO` +
  `EVAL-ASSISTANT-LESS-FORMAL`) verde nos 2 commits de código.

## Infra usada

- DB do workspace: `aja_agora_ws_r10_3_timeframe_stuck` clonado de `aja_agora_template` (Postgres
  shared `aja-shared-pg`, acessível do host via DNS `.orb.local` do OrbStack — sem precisar de
  container próprio pra rodar vitest).
- `.env.local` do worktree backfilled do clone principal (estava ausente — mesma classe da lição
  "Worktree env bootstrap"), com `DATABASE_URL` ajustado pro banco do workspace.
- `ANTHROPIC_API_KEY` do clone principal roteia DIRETO pra `api.anthropic.com` (testado com curl) —
  não precisou de túnel/VPN pro pre-commit real (Camada 3).
- Bakeoff Qwen precisou do túnel LiteLLM (ver seção acima) — derrubado ao final.

## Resumo final

- **N escolhido:** 3 tentativas.
- **Default de prazo:** 12 meses (canônico, já existia como opção do produto).
- **Outros gates com o mesmo tratamento:** sim — `lance`/`lance-value`/`lance-embutido` (mesma
  classe de bug confirmada por leitura do código, não assumida).
- **Score do bakeoff antes×depois:** 0.68 → 0.734 (baseline original 0.774) — melhora real, mas
  com a ressalva honesta de que esta amostra (n=1) não exercitou o escape em si; a falha
  catastrófica do FIX-304 (simulator-offer nunca disparado) não se repetiu.
