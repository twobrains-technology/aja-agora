---
id: FIX-233
titulo: "Reordenar gates (experience↓, timeframe reintroduzido↑) + slots de desejo + 3ª saída do lance"
status: todo
bloco: bloco-jornada-conversa
arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/qualify-state.test.ts
  - src/lib/agent/qualify-config.ts
  - src/lib/agent/personas.ts
  - src/lib/agent/system-prompt.ts
  - docs/jornada/jornada-canonica.md
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR3/D1/D2)
---

## Palavras do operador (decisões 2026-07-09)
- timeframe: **"Reintroduzir como o handoff pede"** (reverte FIX-103).
- experience: **"Mover pra pós-search"**.
- Handoff: "depois do name, duas perguntas curtas: qual bem específico + por que agora.
  A resposta é reaproveitada." — `docs/01`

## Root cause INVESTIGADO (estado real, provado em qualify-state.ts)
Cadeia real hoje (`nextGate`): `name → experience(:58) → consent → identify(:77) →
credit(:80) → search(:112) → [reveal] → lance(:136) → lance-value(:140) →
lance-embutido(:147) → simulator-offer(:154) → decision(:155)`.
- `experience` é o 1º gate (`:58`) — mover pra depois de `search`.
- `timeframe` foi REMOVIDO (FIX-103, `:81-89` comenta que `nextGate` nunca mais o emite) —
  REINTRODUZIR depois da recomendação (antes do simulador), como ponte pro `contemplation_dial`.
- Não há slots `desiredItem`/`motivation`/`monthlySavings` em `QualifyAnswers` (`personas.ts:19-41`).
- Gate `lance` (`:136`) é binário sim/não — falta a 3ª saída "só a parcela" → two_paths.

## Correção proposta
| O quê | Onde |
|---|---|
| Mover `experience` pra depois de `search` (roda com grupos na tela; explicação só pra novato) | `qualify-state.ts` nextGate |
| Reintroduzir `timeframe` PÓS-recomendação (ponte pro simulador). Cadeia-alvo em `docs/01` | `qualify-state.ts`, `qualify-config.ts` |
| Gate novo `desire` (não bloqueante, sem card): 2 perguntas → slots `desiredItem`, `motivation` | `qualify-state.ts`, `qualify-config.ts`, `personas.ts` |
| Novos slots em `QualifyAnswers`: `desiredItem?`, `motivation?`, `monthlySavings?` | `personas.ts` |
| 3ª saída no gate `lance`: "não quero comprometer nada além da parcela" → chama `present_two_paths`, pula embutido/agulha | `qualify-state.ts`, directive |
| `motivation` espelhada UMA vez no prompt (não a cada turno) | `system-prompt.ts` |
| `desiredTermMonths` volta a pesar em `termMatchScore` (timeframe reativado) | garantir que o valor flua do meta pra `recommendation` (via tools/ai-sdk.ts) |
| **Atualizar a jornada canônica** (fonte soberana) refletindo as 2 mudanças | `docs/jornada/jornada-canonica.md` |

## Regressão exigida (TDD strict — o funil tem testes de ordem)
- `nextGate` emite `experience` DEPOIS de `search` (com `revealCompleted`), nunca antes.
- `nextGate` volta a emitir `timeframe` após a recomendação e antes do simulador.
- lead que responde tudo numa frase ("quero um Corolla de 120 mil") NÃO vê cards redundantes (`decideShowGate`).
- gate `desire` não bloqueia (usuário pula → funil segue).
- 3ª saída do lance → two_paths, sem passar por embutido/agulha.
- atualizar os testes de ordem existentes (ex.: `qualify-state.fix-103.test.ts` — a premissa mudou).
