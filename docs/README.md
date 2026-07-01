# Mapa da documentação (padrão `padrao-de-docs`)

**2 mundos:** `docs/` = produto durável · `.processo/` = processo efêmero.

| Pasta | O que guarda |
|---|---|
| `docs/jornadas/` | o que o produto FAZ (intenção viva + cenários testáveis) |
| `docs/decisoes/` | por QUÊ (log central `decisoes.md` + ADRs de bloco em `blocos/`) |
| `docs/design/{specs,planos}/` | desenho de feature antes de codar |
| `docs/entregas/` | o que foi entregue (vira corpo de PR) |
| `docs/correcoes/{inbox,todo,done}/` | bugs |
| `docs/referencia/` | guias temáticos + `CONTEXT.md` (domínio) |
| `.processo/sessoes/` | planos de sessão (efêmero) |
| `.processo/diarios/` | diários de autonomia (efêmero) |
| `.processo/qa/` | ledgers de QA (efêmero) |

> Fonte canônica do padrão: skill `padrao-de-docs`. Não reinvente local/template de doc.
