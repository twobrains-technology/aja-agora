---
id: FIX-234
titulo: "Sanitizer (sem prazo, sem 'reservado') + voz/cadência consultiva (1 balão = 1 ideia)"
status: done
bloco: bloco-jornada-conversa
arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/HARD_RULES.md
  - src/lib/agent/hard-rules.ts
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR1-sanitizer + PR4/D7/D9)
commit: 00ddfe6
executado_em: "2026-07-09"
---

## Palavras do operador (handoff)
> "1 balão = 1 ideia completa (2-3 linhas). Nem paredão, nem picotado. Tom consultivo,
> caloroso, credível — um bom consultor, não um brother. Não oferecer redução de prazo.
> Nunca dizer 'reservado/garantido' antes da contratação." — `docs/04`, `docs/05`

## Root cause / estado atual
`sanitizer.ts` já dropa fallback técnico ("atualize a página") mas NÃO tem padrão pra
"reduzir o prazo" (D7) nem "reservado/cota garantida" (fecho). A cadência/tom vive no
`<voice>`/`<examples>` do `system-prompt.ts` — falta a regra "1 balão = 1 ideia" e os
pares ❌/✅ de `docs/04`.

## Correção proposta
| O quê | Onde |
|---|---|
| Padrão proibido `/reduzir o prazo\|terminar antes\|quitar antes/i` | `sanitizer.ts` |
| Padrão proibido `/cota (está )?garantida\|reservad[ao]\|você já está no grupo/i` | `sanitizer.ts` |
| Regra `<voice>`: "1 balão = 1 ideia completa (2-3 linhas)"; quebrar só ao mudar de assunto ou antes da pergunta-chave | `system-prompt.ts` |
| `<examples>`: pares ❌/✅ de `docs/04` (paredão×agrupado; "saco né"→"entendo bem"; "furar a fila"→"antecipar a contemplação") | `system-prompt.ts` |
| Banir léxico: "saco", "furar a fila", "carro-problema", "na sua cabeça"; emoji ≤ 1 a cada 3-4 balões | `system-prompt.ts` + `HARD_RULES.md` |
| Sincronizar `HARD_RULES.md` ↔ `hard-rules.ts` (teste `HARD_RULES.test.ts` trava a paridade) | ambos |

## Regressão exigida
- sanitizer dropa "vamos reduzir o prazo" e "sua cota está garantida" (teste que falha antes do fix).
- `HARD_RULES.md` e `hard-rules.ts` em paridade (teste existente passa).
- português correto em toda copy nova.
