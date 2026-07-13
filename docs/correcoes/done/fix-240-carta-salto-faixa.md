---
id: FIX-240
titulo: "Fecho confirma carta muito acima da ancorada sem aviso (CDC art. 30)"
status: done
bloco: bloco-r2-valor-compliance
arquivos:
  - src/lib/adapters/bevi/partner-offer-mapper.ts
  - src/lib/bevi/fulfillment.ts
  - src/lib/bevi/closing-presentation.ts
  - src/lib/whatsapp/formatter.ts
rodada: 2026-07-10 rodada 2 (Fable r1, gap P0 #2)
commit: 3936837
executado_em: "2026-07-10"
nota: >
  Escopo de arquivos divergiu do declarado no card (bevi-self-contract-proposal-gateway.ts/
  real-offer.tsx) — pickClosestOffer vive em partner-offer-mapper.ts, não no gateway; e o
  card já renderizava o aviso (FIX-197), faltava só o dado chegar via
  fulfillment.ts/closing-presentation.ts. Estendido também ao canal WhatsApp
  (formatter.ts), fora do escopo_arquivos original — mesmo gap de compliance, mesmo
  payload real_offer, dois canais.
---

## Gap (veredito Fable §D5.1, gap #2)
Pedido 120k → recomendada ITAÚ 150.000 → no `contract-submit` a `real_offer` veio
**211.258** (parcela 5.136,66) com "Essa é a sua carta real — confere e confirma". Sem
`rawCreditValue` no payload → o aviso de ajuste (FIX-197, `real-offer.tsx:87-101`) NÃO
renderizava. Oferta vinculante (CDC art. 30) com salto silencioso de faixa.

## Causa (provada no código)
1. `pickClosestOffer` (`partner-offer-mapper.ts`) escolhia a oferta mais próxima do
   pedido, mas quando havia `preferAdministradora` (marca recomendada na Descoberta —
   BUG-ADMIN-TROCADA-NO-FECHAMENTO), ignorava por completo a distância de valor dentro
   da marca preferida: se a única carta ITAÚ na simulação era 211k, ela era escolhida
   sem teto, mesmo havendo outras marcas mais próximas do pedido.
2. `StartContractResult` não carregava o "valor pedido" (`input.valor`) — e
   `realOfferPresentation` (`closing-presentation.ts`) nunca populava `rawCreditValue`
   no payload do artifact `real_offer`. O mecanismo do aviso (FIX-197) já existia e já
   era testado no componente, mas nunca recebia dado real nesse trilho.
3. O canal WhatsApp (`formatter.ts:realOfferToWhatsApp`) consome o MESMO payload e
   também não tinha linha de aviso — paridade de canal quebrada.

## Decisão do Kairo (rodada 2): clamp + aviso
- **Clamp**: `pickClosestOffer` agora abre mão da fidelidade de marca quando a melhor
  oferta da administradora preferida diverge >20% (relativo) do pedido **e** existe
  oferta (de qualquer marca) mais próxima — compliance pesa mais que continuidade de
  marca. Sem opção mais próxima em nenhuma marca, mantém a preferida (o aviso cobre).
- **Aviso obrigatório**: `startContract` devolve `requestedCreditValue = input.valor`;
  `realOfferPresentation` inclui `rawCreditValue` no payload sempre que a carta fechada
  diverge do pedido → FIX-197 renderiza no card web. `realOfferToWhatsApp` ganhou a
  mesma linha de aviso (`_Ajustamos essa carta de X pra sua faixa de ~Y._`).

## Regressão (TDD — vista falhar antes, verde depois)
- `partner-offer-mapper.test.ts`: 4 casos novos do clamp (admin preferida >20% + opção
  mais próxima → troca de marca; sem opção mais próxima → mantém; dentro de 20% →
  mantém fidelidade; sem admin preferida → geral já correto).
- `fulfillment.test.ts`: `startContract` devolve `requestedCreditValue = input.valor`.
- `closing-presentation.test.ts`: 3 casos (`rawCreditValue` presente quando diverge;
  ausente quando igual; ausente sem `requestedCreditValue` — não inventa).
- `formatter.real-offer.test.ts`: 3 casos de paridade WhatsApp (avisa quando diverge;
  não avisa sem `rawCreditValue`; não avisa quando igual).

## Achado extra corrigido de quebra
`tests/regression/agent-trajectory.test.ts` — teste `paridade web: route.ts do gate
lance manda no/maybe pro gate lance-embutido antes da busca` já estava quebrado no HEAD
antes deste fix (regressão da rodada anterior, FIX-236: o comentário do ramo
`so_parcela` alongou o bloco além da janela fixa de slice `route.slice(start, start +
1800)`). Confirmado pré-existente via stash+teste isolado; corrigido a janela pra 2600
(margem generosa) — não é mudança de comportamento, só destrava o gate local.
