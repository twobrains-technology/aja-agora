---
id: FIX-226
titulo: "Guardrail de crédito líquido — netCredit nunca abaixo do valor do bem"
status: done
bloco: bloco-motor-calculo
arquivos:
  - src/lib/agent/recommendation.ts
  - src/lib/agent/recommendation.test.ts
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR2/D6)
commit: 961a869
executado_em: "2026-07-09"
---

## Palavras do operador (handoff)
> "Invariante duro — se a estratégia usa embutido, `creditoLiquido >= valorDoBem`. Se
> violar, subir a faixa de carta (o sweep `[0.7, 1.0, 1.3]x` já existe: usar a faixa
> superior). Onde travar: invariante duro → CÓDIGO, não prompt." — `docs/00`, `docs/03` D6

## Cenário exato
Bem R$ 120.000, carta R$ 123.300, embutido 30% = R$ 36.990 → `netCredit` = **R$ 86.310**
❌ (não compra o bem). Carta R$ 171.000, embutido 30% = R$ 51.300 → `netCredit` =
**R$ 119.700** ✅. A falha silenciosa mais grave do embutido: o cliente contempla mais
rápido e recebe dinheiro que não compra o que veio comprar.

## Root cause INVESTIGADO (provado no código)
`recommendation.ts` NÃO tem nenhum filtro por crédito líquido — `rankGroups`
(`:112-198`) e `recommendWithFallback` (`:228-265`) rankeiam por score
(`monthlyFit/contemplation/adminFee/termMatch`) sem checar `netCredit`. Confirmado por
grep: `netCredit`/`valorDoBem` só aparecem em `consorcio/`, nunca em `recommendation.ts`.

## Correção proposta
| O quê | Onde |
|---|---|
| Quando a candidata for consumida numa estratégia COM embutido, filtrar por `netCredit = creditValue - creditValue*maxEmbutidoPct >= valorDoBem` | `recommendation.ts` (novo filtro, condicional a `hasLance`/embutido) |
| Usar a faixa `1.3×` do sweep já existente (`bevi-self-contract-adapter.ts`) pra achar a carta maior — SEM chamada nova à Bevi | integração no ranking/recomendação |
| Função pura reutilizável `respectsNetCreditGuardrail(creditValue, maxEmbutidoPct, valorDoBem)` (ver `03c-implementacao-referencia.ts`) | `recommendation.ts` ou `consorcio/` (exportar) |

Manter o comportamento "nunca descarta grupo à toa" (Kairo 2026-07-01): o guardrail
REORDENA/prefere a carta que respeita o invariante, não some com opções — mas a
estratégia de embutido recomendada nunca aponta pra uma carta que viole `netCredit`.

## Regressão exigida (TDD strict)
- bem 120k + embutido 30% → nunca recomenda como estratégia-de-embutido uma carta com `netCredit < 120k`.
- carta 171k + embutido 30% (netCredit 119.7k ~ 120k) → passa.
- sem embutido (`hasLance` falso) → guardrail não interfere no ranking.
- `respectsNetCreditGuardrail` puro: casos de borda (netCredit == valorDoBem → true).
