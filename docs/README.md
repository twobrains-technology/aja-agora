# Mapa da documentação (padrão `padrao-de-docs`)

**2 mundos:** `docs/` = produto durável · `.processo/` = processo efêmero.

## O que manda no comportamento do agente

| Camada | Onde |
|---|---|
| **Referência viva** (como a conversa deve fluir) | `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/` — mockup HTML + handoff |
| **A ordem real dos gates** | o CÓDIGO: `nextGate` em `src/lib/agent/qualify-state.ts` |
| **Invariantes duros** (o que É regra, e a única coisa que é) | `docs/jornada/decisoes-do-cliente.md` |

> Não existe documento soberano sobre o código. O `jornada.docx` foi rebaixado em 2026-07-13 —
> ele engessou o agente. Ver "Não engesse o agente" no `CLAUDE.md`.

## As pastas

| Pasta | O que guarda |
|---|---|
| `docs/jornada/` | decisões do cliente (histórico) + invariantes duros + contexto Bevi |
| `docs/decisoes/blocos/` | ADRs — por QUÊ |
| `docs/design/specs/` | desenho de feature antes de codar (inclui o handoff e os mockups) |
| `docs/entregas/` | o que foi entregue (vira corpo de PR) |
| `docs/correcoes/{inbox,todo,done}/` | bugs |
| `docs/qa/` | roteiro de QA + critérios de aceite da conversa |
| `docs/integracoes/` | dossiê técnico da Bevi/AGX |
| `docs/visao/` | visão de produto (propõe) |
| `docs/referencia/` | guias temáticos + domínio |
| `.processo/sessoes/` | planos de sessão (efêmero) |
| `.processo/diarios/` | diários de autonomia (efêmero) |
| `.processo/qa/` | ledgers de QA (efêmero) |

> Fonte canônica do padrão: skill `padrao-de-docs`. Não reinvente local/template de doc.
