---
id: FIX-190
titulo: "Agente pode sugerir 'atualiza a página / recarregue / dá um refresh' como fallback — nenhuma camada veta a frase (defesa-em-profundidade)"
status: todo
severidade: media
projeto: aja-agora
bloco: bloco-streaming-chat-layer
arquivos:
  - src/lib/agent/HARD_RULES.md
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/system-prompt.behavior-guards.test.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-01 — refino do print (promove card inbox 2026-06-21-agente-fallback-refresh)
---

## Palavras do operador
> (card promovido do inbox — origem FIX-52 / jornada2_revisão.docx do Bernardo: "agente cai
> em fallback proibido ('atualiza a página') + meta-narrativa". O FIX-52 corrigiu a CAUSA
> (card identify passou a disparar), mas não vetou a FRASE em si.)

## Cenário exato
Quando o agente fica sem ação clara (gate não dispara, erro de tool, estado inesperado), nada
no prompt nem nos testes o impede de improvisar uma instrução técnica de UI ao usuário —
"atualiza a página", "recarregue", "dá um refresh". É a "solução manual preguiçosa" que a
regra global do Kairo veta (empurra o trabalho pro usuário).

## Esperado × Atual
- **Esperado:** (1) regra dura no `HARD_RULES.md` + `system-prompt.ts` vetando o agente sugerir
  atualizar/recarregar a página; (2) cassette de regressão que reprova essa frase.
- **Atual:** busca exaustiva em `src/lib/agent/` e `tests/regression/` → **nenhuma** camada
  veta a frase. `META_NARRATIVE_PHRASES` cobre meta-narrativa do mecanismo, não fallback técnico.

## Root cause INVESTIGADO (provado no código — do card de inbox)
- `grep -rniE "atualiz[ae].{0,15}p[áa]gina|recarregu?e|refresh"` nos testes de agente → vazio
  em contexto de veto. `system-prompt.ts`/`builder.ts` → sem regra anti-refresh.
- Este é o gêmeo comportamental do FIX-186: no fluxo bem-corrigido, o fallback de falha é a
  mensagem determinística + ação (do FIX-186), NUNCA "atualiza a página". Este card é a
  defesa-em-profundidade da FRASE, complementando o FIX-186 (que remove a CAUSA de o agente
  precisar improvisar fallback na descoberta).

## Correção proposta
| O quê | Onde |
|-------|------|
| Nova subsection anti-refresh no `HARD_RULES.md` (defesa-em-profundidade) | `src/lib/agent/HARD_RULES.md` (nova ~1.8) |
| Regra dura no bloco de proibições do system-prompt | `src/lib/agent/system-prompt.ts` |
| Detector da frase (regex refresh/recarregar/atualizar página) | `tests/regression/agent-trajectory.test.ts` + `src/lib/agent/system-prompt.behavior-guards.test.ts` |

## Regressão exigida (3 camadas — CLAUDE.md §"Regressão de agent")
- **Camada 1 (structural):** `system-prompt.behavior-guards.test.ts` — o prompt contém a
  proibição anti-refresh; `HARD_RULES.md` tem a subsection (sincronia travada por `HARD_RULES.test.ts`).
- **Camada 2 (cassette OBRIGATÓRIO):** `tests/regression/agent-trajectory.test.ts` — cassette
  em que o modelo tenta "atualiza a página" num estado de falha; detector reprova.
- **Camada 3 (eval nightly):** cenário de falha genérica — o agente nunca sugere refresh.
