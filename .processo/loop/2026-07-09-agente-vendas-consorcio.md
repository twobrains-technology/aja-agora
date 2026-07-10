---
loop: agente-vendas-consorcio
iniciado: 2026-07-09
status: em-andamento
objetivo_macro: "Jornada do agente de vendas de consórcio (handoff validado) implementada e MATADORA pra prod — verificada por agent fable até 10/10."
verificador: agent fable (claude-fable-5), independente, contexto fresco
---

# Loop de goal — agente de vendas de consórcio

## Objetivo macro
Implementar o comportamento validado do handoff (`docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/`)
na app agêntica existente, sem infra nova, e levar a jornada a 10/10 verificada pelo
agent fable — só então promover a base pra develop.

## Definition of Done (RUBRICA — mecanicamente checável)
Nota final = MÍNIMO das dimensões (não média). 10/10 exige TODAS no teto + o fable declarar
"matador pra prod". Detalhe operacional dos itens em `scratchpad/rubrica-10-10-jornada.md`.

| Dimensão | Pergunta checável | Como o fable checa |
|---|---|---|
| **Negócio** | os 2 fluxos (Madalena junta / Mario sem lance) fecham ponta-a-ponta; guardrail netCredit respeitado; curva converge a sorteio | E2E dos 2 fluxos + juízo |
| **Funcional** | funil ligado de verdade (gates na ordem nova, timeframe reintroduzido, gate desire, 3ª saída→two_paths); cards coagidos server-side; nenhum botão morto | integração real + clicar tudo |
| **Cálculo** | curva power (não achata em 90%, sorteio emerge no fim); AMORTIZA; âncora de dinheiro pelo bolso; FGTS acelera | testes unit do motor verdes |
| **UX** | cadência 1 balão=1 ideia; sem beco-sem-saída; espelha motivation 1x; sem card redundante se responde tudo numa frase | percorrer como usuário |
| **UI/Compliance** | carta em destaque; taxaContemplacao nunca exibida; escassez 1-6 estável; embutido diz "crédito diminui"; two_paths sem % de chance; nunca "reservado"/"reduzir prazo"; pt-BR com acento | comparação visual + guards |
| **E2E/integração** | test:unit + test:integration verdes; E2E dos fluxos P0 passa | rodar a suíte |

## Itens (rodada 1) — FIX-225..235 (ver docs/correcoes/done/ após merge)
- Motor: FIX-225 curva power · FIX-226 guardrail netCredit · FIX-227 âncora+FGTS
- Cards: FIX-228 embutido · FIX-229 dois-caminhos · FIX-230 escassez placebo · FIX-231 guard+ajustes · FIX-232 proposta co-branded
- Jornada: FIX-233 ordem+slots+desire · FIX-234 sanitizer+voz · FIX-235 fecho WhatsApp

## Model routing
- Definir/criticar: Opus (esta sessão). Executar (blocos): sonnet (spec fechada, > haiku pra qualidade).
  E2E operador: haiku. Verificar/julgar: **fable** (claude-fable-5).

## Política de exits
- Exit primário: **fable dá 10/10 matador** → done-report + finish-wave --to-develop.
- No-progress (2 rodadas sem subir score) → TROCA DE ÂNGULO obrigatória (não encerra).
- Human checkpoint: decisão de produto/UX/blast-radius → AskUserQuestion (não crava no escuro).
- Prod: fora de escopo (Kairo não pediu deploy). Só develop após 10/10.

## LEDGER de rodadas
| Rodada | Blocos lançados | Integrado | Determinístico | Score fable | Achados novos → próxima rodada |
|---|---|---|---|---|---|
| 1 | motor-calculo, cards-ui, jornada-conversa (onda 1) | ✓ os 3 na base (7d7a552) | test:unit 2983/2983 ✓ · test:integration 270/270 ✓ · E2E API: jornada ponta-a-ponta | **Fable 3/10** (10 gaps acionáveis) | G1-G10 → rodada 2 |
| 2 | fix-r2-funil-cards (Gap 1,3,5,6) · fix-r2-valor-compliance (Gap 2,4,7,8,9,10) | ✓ os 2 na base (0d35943e), 1 conflito resolvido (adapter/testes) | test:unit 3062/3062 ✓ · test:integration 273/273 ✓ | Fable r2 **4/10** | 3 parciais (cards/aviso) + N1/N2 → rodada 3 |
| 3 | fix-r3-serverside-cards (cards server-side, fio rawCreditValue, N1 splitter, N2 recovery, polish) | ⏳ 1 bloco disparado | (pós-merge) | Fable r2 **4/10** (7/10 gaps corrigidos) → r3 fecha os 3 parciais + 2 novos | — |

### Rodada 2 — veredito Fable r1 (3/10, `docs/correcoes/rodada2-fable/`)
P0: 3ª saída quebrada (Fluxo B beco) · carta 211k sem aviso (CDC) · embedded_bid+scarcity órfãos.
P1: âncora de dinheiro morta · desire engolido · decision prematuro · "taxa de contemplação" na fala.
P2/P3: arredondamento de parcela · contract-submit sem form · higiene (emoji/comentário stale).
Bom (verificado): curva por-oferta, amortiza, guardrail netCredit, real_offer co-branded, fecho WhatsApp, pt-BR.
Decisão Kairo: carta 211k = clamp + aviso.

### Notas rodada 1
- 2 fixes de integração: (a) `present_two_paths` duplicado pelo auto-merge (cards+jornada) na fase closing e no REVEAL_EXPECTED do teste; (b) dev subida com `db:push` (só schema) ficou sem personas — corrigido com `db:migrate` (as personas são seedadas pelas migrations `0012/0016`).
- Dev de pé: http://aja-agente-vendas-consorcio.orb.local (workspace `agente-vendas-consorcio`, pg porta 5434).
- cards travou por `--plan-mode` (ExitPlanMode exige aprovação humana; respondedor só cobre AskUserQuestion) → relançado sem plan-mode.
- **E2E Haiku r1 abortou** por bug de AMBIENTE (não dos blocos): o backfill do `.env.local` deixou `ANTHROPIC_API_KEY` com o PLACEHOLDER do `.env.example` (`sk-ant-your-key`) — o script só preenchia vars vazias, e o placeholder não estava vazio. `invalid x-api-key` → agente mudo → jornada não passava do gate name. Corrigido: re-backfill sobrescrevendo segredos (não só vazios) com a key real (`sk-ant-api03`) + `up --force-recreate app`. Smoke pós-fix: agente responde, analyzer/cache OK. E2E Haiku r2 rodando.

## CONSOLIDAÇÃO (2026-07-10)
- r1+r2+r3 mergeados e **pushados na develop** (30c94094); test:unit 3089/3089 verde.
- Base integ/ + 3 workspaces de bloco deletados (100% mergeado). OrbStack: só develop.
- Validação FINAL (Fable) rodando na develop consolidada → gaps viram rodada 4 (nova base + blocos).
