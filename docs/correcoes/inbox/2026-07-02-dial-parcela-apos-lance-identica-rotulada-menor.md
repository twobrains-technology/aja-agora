# Bug — dial mostra parcela "após o lance" idêntica à de antes, mas rotulada "menor"

- **Data:** 2026-07-02 · **Achado em:** QA dono-de-produto, jornada MOTO, canal WEB, PRODUÇÃO · **Superfície:** simulador (contemplation-dial / `simulation_result`), passo 4
- **Severidade:** MÉDIA — contradição visível entre rótulo e número; confunde e mina a percepção de transparência.

## Cenário
No simulador (dial) da oferta BANCO DO BRASIL (bem R$ 23.610, 15m, lance declarado R$ 5.000), o card de comparação exibe:
- **ATÉ CONTEMPLAR:** "R$ 2.141 · por ~6 meses"
- **APÓS RECEBER:** "R$ 2.141 · menor, depois do lance"

Os dois valores são IDÊNTICOS (R$ 2.141), mas o segundo é rotulado "menor, depois do lance".

## Esperado × Atual
- **Esperado:** ou o valor "após receber" é de fato menor (e o número reflete isso), ou — se pela regra C4/D18 (lance embutido reduz crédito, não dívida; só lance em dinheiro abate saldo) a parcela pós-contemplação NÃO muda — o rótulo NÃO deve prometer "menor". Rótulo e número têm que concordar.
- **Atual:** rótulo diz "menor" com número igual → contradição.

## Evidência
- Screenshot: `_evidencia/moto-06-simulador-dial.png` (blocos "ATÉ CONTEMPLAR R$ 2.141" e "APÓS RECEBER R$ 2.141 menor, depois do lance").

## Causa raiz (hipótese)
Provável efeito do lance ser majoritariamente EMBUTIDO (reduz crédito, não a dívida) somado a arredondamento — a parcela pós-contemplação calculada ficou igual, mas o rótulo estático "menor, depois do lance" foi mantido. Verificar `contemplation-dial.tsx` / `coerceSimulationPayload` (C3/C4).

## Tratamento sugerido
Camada 1 (unit do componente) + cassette se a origem for texto do agente. Tornar o rótulo condicional: só dizer "menor" quando `paymentAfterContemplation < paymentBefore`; caso contrário, rótulo neutro ("parcela após a contemplação") ou explicar por que não muda (lance foi embutido).
