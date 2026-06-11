---
id: FIX-23
titulo: "Token diet — tool results de descoberta/simulação retornam só o alto-sinal pro contexto"
status: todo
bloco: bloco-i-token-diet
arquivos:
  - src/lib/agent/tools/ai-sdk.ts (outputs de search_groups / simulate_quota / recommend_groups)
  - src/lib/adapters/bevi/offer-mapper.ts
  - src/lib/adapters/bevi/partner-offer-mapper.ts
rodada: 2026-06-11 (sessão de arquitetura — pesquisa boas práticas abril/maio 2026)
anotado_em: 2026-06-11
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

## Root cause INVESTIGADO (parcial — completar na execução)

A SUSPEITA (a confirmar com medição): os mappers (`offer-mapper.ts`,
`partner-offer-mapper.ts`) preservam campos que o modelo nunca usa pra
conversar — o card (artifact) é quem precisa do payload rico, e ele NÃO passa
pelo contexto do modelo (vai direto pro frontend via TurnEvent). O que o modelo
precisa no tool-result é o resumo decisório: administradora, crédito, parcela,
prazo, taxa, id da oferta.

**Falta verificar (primeira ação da execução):** medir tokens reais do output de
cada tool de descoberta com as fixtures de `__fixtures__/` e mapear quais campos
o system-prompt/exemplos referenciam. Se o output já for enxuto, o fix vira
no-op documentado — encerrar honesto.

## Correção proposta

| O quê | Onde |
|---|---|
| Medição baseline: tokens por tool-result usando as fixtures reais | script one-shot na execução |
| Separar "payload pro artifact" (rico, vai pro card) de "output pro modelo" (resumo decisório + ids leves) nos execute das tools de descoberta/simulação | `ai-sdk.ts` |
| Se necessário, variante `toModelSummary()` nos mappers | `offer-mapper.ts`, `partner-offer-mapper.ts` |

## Regressão exigida

- **Camada 1**: teste de shape do output pro modelo (campos essenciais presentes,
  campos cortados ausentes) + teste de que o payload do ARTIFACT continua rico
  (cards não podem perder dados — regressão visual seria FIX novo).
- **Camada 2**: cassettes existentes do reveal devem continuar verdes (os
  detectores grepam texto/artifacts, não tool-results — confirmar).
- **Camada 3**: nightly da jornada 1→5 continua verde — o modelo ainda consegue
  conversar sobre as ofertas com o resumo enxuto (é o teste de verdade do diet).
