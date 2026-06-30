---
id: FIX-93
titulo: "system-prompt descreve ordem de gates errada (timeframe/lance pré-valor) — alinhar à ordem real pós-FIX-53"
status: todo
bloco: bloco-e-funil-qualificacao
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/HARD_RULES.md
  - src/lib/agent/qualify-state.sequence.test.ts
rodada: 2026-06-28 — mutirão inbox (qa-noturno 21/06 + infra 24-26/06 + jornada 28/06)
---

# Bug — system-prompt descreve ordem de gates ERRADA (timeframe/lance "pré-valor")

- **Data:** 2026-06-21 (achado no QA noturno da jornada v2, rodada 2)
- **Severidade:** média-alta (inconsistência prompt×produto na jornada v2; degrada a narrativa do agente).
- **Origem:** revisão 2 / FIX-53 reorganizou a ordem do funil, mas a `REGRA DURA — fluxo de 3 gates pré-valor` (`system-prompt.ts:265`) não foi atualizada.

## Achado
A ordem REAL do funil (provada encadeando `nextGate`, e alinhada ao docx passo 2 "valor → prazo → lance"):
```
name → experience → consent → identify → credit(VALOR) → timeframe → lance → lance-embutido → search → simulator-offer → decision
```
Os gates pré-valor são **experience, consent, identify**. **timeframe e lance vêm DEPOIS do valor.**

Mas `system-prompt.ts:265-286` afirma:
- linha 269-271: "3 gates de qualificação NESTA ORDEM EXATA: 1.experience 2.timeframe 3.lance" (antes do valor).
- linha 275: "NUNCA chame present_value_picker ANTES de experiencePrev + **prazoMeses + hasLance** estarem todos preenchidos".
- linha 281 (BAD): "user respondeu so experience → agent: 'qual valor?' ← PROIBIDO, faltam timeframe + lance" — mas na ordem real, após experience+consent+identify o valor É o próximo.
- linha 284 (GOOD): "user respondeu os 3 gates (experience + timeframe + lance) → agora pode present_value_picker" — errado, valor vem antes.

## Esperado × Atual
- **Esperado:** o prompt descreve a ordem real (experience/consent/identify pré-valor; valor; timeframe/lance pós-valor), preservando a proteção anti-skip (agente não antecipa gates, só reage; orchestrator dirige).
- **Atual:** o prompt instrui timeframe/lance antes do valor — contradiz `nextGate` (`qualify-state.ts:55-57`) e o docx.

## Evidência
- Probe encadeando `nextGate`: `... → identify → credit → timeframe → lance → ...` (valor antes de prazo/lance).
- docx `jornada-canonica.md` passo 2: valor (slider) → prazo → lance.

## Onde mexe
- `src/lib/agent/system-prompt.ts` (seção REGRA DURA 265-286 — corrigir ordem + exemplos).
- `src/lib/agent/HARD_RULES.md` (§2.2 "3 gates pré-valor" — mesma correção).
- Testes: `qualify-state.sequence.test.ts` (novo — sequência canônica), structural do prompt.

## Tratamento
TDD 3 camadas inline. Correção cirúrgica do prompt (alinhar à ordem real, preservar proteção anti-skip). Validação comportamental completa (eval LLM da jornada) fica pro nightly / bloco de saneamento do eval (ver card eval-jornada-gate-sequence-fix53).
