# 06 — Plano de implementação (do mais barato ao mais caro)

Cada item é um PR independente. Ordem escolhida para dar valor cedo e derrubar risco antes.

---

## PR 0 — Substituir a curva do lance (D0)
**Esforço: baixo · Risco: médio (muda todos os números da agulha) · Valor: MÁXIMO**

A curva atual (`raw = winningBid * anchorMonth / targetMonth`) achata os primeiros 6 meses em 90% (clamp) e nunca converge para o modo sorteio no fim do prazo. Ver tabela comparativa em `03-regras-calculo.md`.

- [ ] Substituir a curva em `contemplation-dial.ts:89-96` pela power curve calibrada (spec completa em `03`).
- [ ] Derivar `winningBidPct = averageBid / creditValue` **por oferta** (nunca % fixo, nunca reaproveitar entre cartas).
- [ ] **Manter** o modelo AMORTIZA (`:116-122`) e a faixa `<8% → sorteio` — só a curva muda.
- [ ] **Remover** `likelihood` (heurística de 3 faixas sem base de dado).
- [ ] Suite de testes de `03-regras-calculo.md` → "Testes que devem acompanhar a troca".
- [ ] Confirmar com a Bevi se existe `referenceMonth` (Pendência P5). Sem ele, `anchorMonth` segue como constante ajustável.

**Ordem:** este PR vem antes de tudo. Todo número que a agulha, os cenários e a copy mostram depende dele.

## PR 1 — Guardas e limpeza (nenhum comportamento novo)
**Esforço: baixo · Risco: baixo · Valor: alto (evita regressão)**

- [ ] Remover qualquer exibição de `taxaContemplacao` (cards, copy, prompt).
- [ ] Teste que falha se `taxaContemplacao` aparecer em payload de artifact.
- [ ] Adicionar padrões proibidos ao `sanitizer.ts`: `/reduzir o prazo|terminar antes/i`, `/cota (está )?garantida|reservad[ao]/i`.
- [ ] Confirmar no `offer-mapper` que `averageBid` é normalizado e **por oferta** (nunca % fixo reaproveitado entre cartas).

## PR 2 — Guardrail de crédito líquido (D6)
**Esforço: baixo/médio · Risco: baixo · Valor: MUITO alto (é a falha silenciosa mais grave)**

- [ ] Em `recommendation.ts`: quando a candidata usar embutido, filtrar por `netCredit >= creditMax`.
- [ ] Aproveitar o sweep `[0.7, 1.0, 1.3]×` já existente para achar a carta maior.
- [ ] Teste: bem de 120k + embutido 30% → nunca recomendar carta que resulte em `netCredit < 120k`.

## PR 3 — Ordem dos gates (D1) + slots de desejo (D2)
**Esforço: médio · Risco: médio (mexe no funil) · Valor: alto**

- [ ] `qualify-state.ts`: mover `experience` para depois de `search`; mover `timeframe` para depois da recomendação.
- [ ] Novos slots em `ConversationMetadata.qualifyAnswers`: `desiredItem`, `motivation`, `monthlySavings`.
- [ ] Gate `desire` (não bloqueante, sem card).
- [ ] `qualify-config.ts` + prompt: as duas perguntas de desejo.
- [ ] Teste de ordem: um lead que responde tudo numa frase não deve ver cards redundantes (`decideShowGate`).

## PR 4 — Cadência e tom (D9)
**Esforço: baixo · Risco: baixo · Valor: alto (é o que faz parecer humano)**

- [ ] `system-prompt.ts` `<voice>`: regra "1 balão = 1 ideia completa (2–3 linhas)".
- [ ] `<examples>`: incluir os pares ❌/✅ de `04-copy-fluxos.md`.
- [ ] Banir léxico: "saco", "furar a fila", "carro-problema", "na sua cabeça".
- [ ] Emoji: no máximo 1 a cada 3–4 balões.

## PR 5 — Card `embedded_bid` (D3)
**Esforço: médio · Risco: baixo**

- [ ] Payload em `chat/types.ts`; tool `present_embedded_bid`; schema Zod.
- [ ] Coerção no `runner.ts` (números vêm da oferta, não da LLM).
- [ ] Componente + case no `artifact-renderer.tsx`.
- [ ] Registrar em `tool-policy.ts` (fase `reveal`).
- [ ] Regra dura: o card **sempre** diz que o crédito recebido diminui.

## PR 6 — Card `two_paths` (D5)
**Esforço: médio · Risco: baixo · Valor: alto (converte quem chega defensivo)**

- [ ] Nascer como variant de `decision-prompt.tsx` ou componente novo.
- [ ] Terceira saída no gate `lance`: "só a parcela".
- [ ] Comportamento: agente **não recomenda** um dos dois; devolve a decisão.
- [ ] Proibido: qualquer métrica de chance de contemplação no card.

## PR 7 — Card `scarcity` (D4)
**Esforço: médio · Risco: médio (dado pode faltar)**

- [ ] Só renderiza se `availableSlots` presente e `<= 5`.
- [ ] Exibir **"restam apenas N"**; **nunca** o total.
- [ ] Barra é decorativa (largura fixa), não razão `N/total`.
- [ ] Se ausente → não renderiza. Sem fallback.

## PR 8 — Âncora de dinheiro na agulha
**Esforço: médio/alto · Risco: baixo · Valor: alto (diferencial de produto)**

- [ ] Entradas: `lanceValue`+`lanceMonth` (pontual) e `monthlySavings` (recorrente).
- [ ] Mês-alvo sugerido = primeiro mês em que o dinheiro cobre o **bolso** (não o lance total).
- [ ] Narração equivalente no WhatsApp (mesma função, sem visual).
- [ ] Vertical imóvel: perguntar FGTS (entra como embutido).

## PR 9 — Fecho WhatsApp (D8)
**Esforço: médio · Risco: médio (integração)**

- [ ] Copy do fecho (`04-copy-fluxos.md`), sem "reservado".
- [ ] Disparar mensagem no WhatsApp + pedir o "oi".
- [ ] Tratar o caso "cliente não responde" → fila de template (`whatsapp_outbound_queue`).
- [ ] Encaminhar pra especialista de cadastros ("em alguns minutos") via `createMesaHandoff` ou `handoffToAgents`, conforme a política de vocês.

## PR 10 — Proposta co-branded refinada
**Esforço: baixo/médio · Risco: baixo**

- [ ] `real-offer.tsx`: header Aja Agora + administradora, selo "0% de juros", chips de credibilidade.
- [ ] Se exibir economia vs financiamento, exibir **com a premissa** (taxa/CET de `finance/pmt.ts`).

---

## Ordem sugerida

```
PR0 → PR1 → PR2 → PR3 → PR4   (fundação: fórmula, guardas, invariante, funil, voz)
PR5 → PR6 → PR7               (cards novos)
PR8 → PR9 → PR10              (diferencial e fecho)
```

**Se só der pra fazer três:** PR0, PR2 e PR4.
PR0 conserta a matemática que sustenta a agulha inteira. PR2 evita vender uma carta que não compra o bem. PR4 é o que faz o agente soar humano — e é quase de graça.

---

## Antes de começar, confirmar com o time

| # | Pergunta | Bloqueia |
|---|---|---|
| P1 | O abatimento vira parcela menor em **todas** as administradoras? (`PENDENTE-Bernardo`) | número do "após a contemplação" |
| P2 | `maxEmbutidoPct` é 30% em todo grupo, ou vem por contrato? | guardrail D6 |
| P3 | `availableSlots` chega confiável da Bevi? | PR7 |
| P4 | Quem é a "especialista em cadastros" no sistema — mesa ou proxy? | PR9 |
| P5 | A Bevi entrega o **mês** do lance histórico (`referenceMonth`)? | calibração da curva (PR0) |
