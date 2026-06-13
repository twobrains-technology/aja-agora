---
id: FIX-23
titulo: "Token diet — tool results de descoberta/simulação retornam só o alto-sinal pro contexto"
status: done
bloco: bloco-i-token-diet
arquivos:
  - src/lib/agent/tools/ai-sdk.ts (outputs de search_groups / recommend_groups)
  - src/lib/adapters/bevi/offer-mapper.ts (toModelGroupSummary)
  - src/lib/agent/tools/ai-sdk.fix-23-token-diet.test.ts (Camada 1)
rodada: 2026-06-11 (sessão de arquitetura — pesquisa boas práticas abril/maio 2026)
anotado_em: 2026-06-11
commit: ac48418
executado_em: 2026-06-11
---

# FIX-23 — Tool results em dieta: cortar payload bruto do contexto da conversa

## Palavras do operador

Sessão de arquitetura 2026-06-11 — gap nº4 da pesquisa (Anthropic: "design tools
to return token-efficient information"; "don't load complete data objects when
lightweight identifiers suffice"). Kairo pediu pra anotar as tasks da sessão.

## Cenário exato

O output do `execute` das tools de descoberta entra INTEIRO no histórico da
conversa como tool-result e é re-enviado a CADA turno subsequente (multi-turn).
Conversa que passou pelo reveal carrega o payload da Bevi até o fechamento —
custo composto: tokens × turnos restantes. Afeta latência (SLA <3s) e qualidade
(context rot conforme a conversa cresce).

## Root cause INVESTIGADO

A suspeita anotada era que os mappers preservam campos que o modelo nunca usa.
**A medição derrubou a suspeita pro código atual** — o `offer-mapper` já reduz a
oferta bruta da Bevi (68 campos) pro resumo decisório no nível do adapter.

### Medição baseline (fixture real `ok-selfcontract-simulation.json`, AUTOS, 3 ofertas)

| Output | tokens (≈) | observação |
|---|---|---|
| RAW Bevi 3× (se vazasse cru) | ~1948 | 68 campos/oferta |
| `search_groups` atual | ~199 | **mapper já corta 90%** |
| `simulate_quota` atual | ~128 | |
| `get_group_details` atual | ~105 | `contemplationHistory: []` |
| `get_rates` atual | ~137 | |

O grosso da dieta (1948 → 199, **90%**) já estava feito no mapper. O que sobrava
era quase todo **load-bearing**:

- **`simulate_quota`**: 100% consumido pelo `coerceSimulationPayload` em
  `runner.ts` — o runner lê o tool-result (`lastQuotaSimulation`) e coage TODOS
  os campos numéricos do card a partir dele. Cortar aqui quebraria a coerção do
  `simulation_result`. `runner.ts` está **fora do escopo deste bloco** → diet do
  `simulate_quota` BLOQUEADO pelo acoplamento (anotado como follow-up: separar o
  canal "rico pro card" do "enxuto pro modelo" exige tocar o runner).
- **`search_groups` / `recommend_groups`**: cada campo é copiado pelo modelo nos
  schemas dos cards de apresentação — EXCETO `totalParticipants`, constante `0`
  no Trilho B (a oferta self-contract não traz total de cotas), que nenhum schema
  de card referencia e nada downstream lê. **Único campo morto.**

## Correção aplicada

1. **Corte do campo morto** — `toModelGroupSummary()` no `offer-mapper.ts` (Omit
   de `totalParticipants`), aplicado nos `execute` de `search_groups` e
   `recommend_groups` em `ai-sdk.ts`. `search_groups`: 697 → 631 chars
   (~199 → ~180 tok, ~9% do que restava × turnos).
2. **Trava anti-regressão (Camada 1)** — `ai-sdk.fix-23-token-diet.test.ts`
   garante que (a) o output pro modelo expõe SÓ o allow-list de resumo decisório
   e NENHUM campo cru da Bevi (`bank`, `quotaId`, `bidPercentage`, …) volte ao
   contexto, e (b) o payload do CARD (pós `coerceSimulationPayload`) continua
   RICO — a dieta não pode esfomear o `simulation_result`. Se uma mudança futura
   no mapper reintroduzir o payload bruto (regressão 199 → ~1948 tok), o CI
   quebra.

## Regressão exigida

- **Camada 1**: ✅ `ai-sdk.fix-23-token-diet.test.ts` (4 testes) — shape enxuto
  pro modelo (allow-list + denylist de campos crus) + card permanece rico.
  Vermelho antes (totalParticipants presente), verde depois.
- **Camada 2**: ✅ cassettes do reveal em `agent-trajectory.test.ts` seguem
  verdes (grepam texto/artifacts, não tool-results — não tocados pela dieta;
  157/158 passam, a única falha é teste de DB sem Postgres no worktree).
- **Camada 3**: nightly da jornada 1→5 (não roda no PR) valida que o modelo ainda
  conversa sobre as ofertas com o resumo enxuto.

## Honestidade

A dieta de alto impacto já estava banked no mapper. Este FIX entrega: o corte do
último campo morto + a **trava de regressão** que impede o payload bruto de
voltar ao contexto (o risco real que o gap nº4 nomeia) + o registro do bloqueio
arquitetural do `simulate_quota` (acoplado ao runner) como follow-up.
