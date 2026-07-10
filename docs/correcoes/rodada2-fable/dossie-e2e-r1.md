# Dossiê E2E consolidado — rodada 1 (condução via API, determinística)

Método: condução programática da jornada via `POST /api/chat` (actions `kind:"gate"` reais),
inspecionando os artifacts + payloads emitidos. Mais confiável que o browser (o Haiku travou
em cliques). App: base integrada `integ/agente-vendas-consorcio`, Bevi + LLM reais.

## Fluxo A (Madalena — junta dinheiro): jornada COMPLETA até decisão
Sequência: carro → nome(action) → desejo(texto) → motivation(texto) → consent → identify(CPF real)
→ credit(120k) → [busca] → gostei → experience(first) → timeframe(6m) → lance(no) → lance-embutido(yes)
→ simulator-offer(yes) → seguir.

**Cards emitidos:** recommendation_card, simulation_result, comparison_table (T7); contemplation_dial (T13); decision_prompt (T14).
**Payloads reais:**
- recommendation_card: CANOPUS · crédito R$120.000 · parcela R$1.288,73 · prazo 116m · avgBidValue R$95.172 · contempladosMes 2 · availableSlots 2
- contemplation_dial: historicalWinningBidPct **79,31%** (= 95.172/120.000, derivado POR OFERTA ✓) · referenceMonth 6 · initialTargetMonth 6
- simulation_result.embeddedBid: percent 50, embeddedBidValue 0, receivedCredit=creditValue (omite quando sem lance — coerente)

**✓ Validado ao vivo:** ordem nova (experience PÓS-search, timeframe REINTRODUZIDO pós-recomendação), motivation espelhada 1x ("quando o carro dá trabalho, atrapalha tudo"), copy pt-BR impecável, compliance ("contemplação por sorteio ou lance — não tem como garantir prazo"), valores exatos (nunca arredonda), avgBidValue por oferta, contemplação = contagem (não taxaContemplacao).

## Fluxo B (Mario — sem lance)
Cards: recommendation_card (ÂNCORA 90k, parcela R$1.073,52), simulation_result, comparison_table.
`two_paths` NÃO disparou — a confirmar se é a sequência (não cheguei ao gate decision com hasLance=so_parcela) ou gap.

## GAPS (viram a rodada 2)
| # | Gap | Severidade | Causa |
|---|---|---|---|
| G1 | **`present_embedded_bid` nunca aparece** | ALTA (card do handoff) | tool+componente+coerção existem e testam, mas NENHUM directive instrui o LLM a chamá-lo (só há directive pra two_paths). Órfão. |
| G2 | **`present_scarcity` nunca aparece** | ALTA (card do handoff) | idem G1 — órfão, sem directive/gate que o acione. |
| G3 | `two_paths` não visto no Fluxo B | MÉDIA (a confirmar) | provável sequência incompleta (não atingiu decision); directive existe. |
| G4 | `real_offer` (proposta co-branded) não alcançado | BAIXA | fecho vem após decision→contract; não conduzido até lá nesta passada. |

## Diagnóstico da causa de G1/G2
Divisão de blocos separou "criar card" (bloco-cards-ui: tool+componente+coerção+tool-policy) de
"ligar no funil" (bloco-jornada: directives). A ligação de `two_paths` foi feita
(`buildLanceSoParcelaDirective`), mas `embedded_bid` (gate lance-embutido) e `scarcity` (pós-recomendação)
ficaram sem directive — caíram no vão entre os dois blocos. Spec: `docs/02-cards-novos.md`.

## Determinístico (contraparte objetiva)
test:unit 2983/2983 ✓ · test:integration 270/270 ✓ (os cards órfãos TÊM testes de componente que passam —
o gap é só a ATIVAÇÃO no funil, não a implementação do card).
