# Bug — Agente pode sugerir "atualiza a página/recarregue" como fallback (sem regressão que vete)

- **Data:** 2026-06-21 (achado no QA noturno, ancorado na revisão 2 da jornada)
- **Origem:** FIX-52 (jornada2_revisão.docx, Bernardo): "agente cai em fallback proibido ('atualiza a página') + meta-narrativa". O FIX-52 corrigiu a **causa** (card identify passou a disparar), mas **não** adicionou defesa-em-profundidade contra a **frase** de fallback em si.
- **Severidade:** média (reforço/defesa-em-profundidade; a causa direta já foi tratada).

## Cenário
Quando o agente fica sem ação clara (gate não dispara, erro de tool, estado inesperado), nada no prompt nem nos testes o impede de improvisar uma instrução técnica de UI ao usuário — "atualiza a página", "recarregue", "dá um refresh". É a "solução manual preguiçosa" que é regra inviolável evitar (empurra o trabalho pro usuário).

## Esperado × Atual
- **Esperado:** existir (1) regra dura no HARD_RULES.md + system-prompt vetando o agente sugerir atualizar/recarregar a página; (2) cassette de regressão que reprova essa frase.
- **Atual:** busca exaustiva em `src/lib/agent/` e `tests/regression/` → **nenhuma** camada veta a frase. `META_NARRATIVE_PHRASES` cobre meta-narrativa do mecanismo, não fallback técnico.

## Evidência
- `grep -rniE "atualiz[ae].{0,15}p[áa]gina|recarregu?e|refresh"` em testes de agente → vazio em contexto de veto.
- `system-prompt.ts`/`builder.ts` → sem regra anti-refresh.

## Onde mexe (provável)
- `src/lib/agent/HARD_RULES.md` (nova subsection 1.8)
- `src/lib/agent/system-prompt.ts` (regra dura no bloco de proibições)
- `tests/regression/agent-trajectory.test.ts` (cassette + detector) + `src/lib/agent/system-prompt.behavior-guards.test.ts` (structural)

## Tratamento
TDD 3 camadas (Camada 1 structural + Camada 2 cassette falhando → fix no prompt → verde). Inline no QA noturno.
