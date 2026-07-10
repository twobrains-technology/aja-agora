---
id: FIX-259
titulo: "P1: fechamento troca a MARCA em silêncio (confirmou ITAÚ, veio BANCO DO BRASIL) + promessa em loop"
status: done
bloco: bloco-r5-fechamento-gates
arquivos: [src/lib/bevi/fulfillment.ts, src/lib/bevi/closing-presentation.ts, src/lib/whatsapp/formatter.ts, src/lib/whatsapp/contract-capture.ts, src/app/api/chat/route.ts, src/lib/adapters/bevi/partner-offer-mapper.ts, src/lib/agent/system-prompt.ts]
rodada: 2026-07-10 rodada 5 (Fable r4, P1 #2)
---
## Gap (veredito r4 §P1 #2)
O catálogo do fechamento não tem a administradora confirmada na faixa → `pickClosestOffer`
(`partner-offer-mapper.ts:139-151`) cai pro global best (BANCO DO BRASIL, parcela +37-40% vs a
confirmada) SEM UMA PALAVRA de explicação. Questionado, o agente NEGA a proposta registrada e
promete "refazer com ITAÚ" → re-serve a MESMA proposta (loop do r3 em forma nova, com valor certo).
## Correção
- Se o fechamento tiver que trocar a marca confirmada, AVISAR explicitamente (copy determinística:
  "A ITAÚ não tem grupo disponível nessa faixa agora — a opção equivalente é BANCO DO BRASIL, com
  parcela X") ANTES de fechar; nunca trocar em silêncio.
- MATAR a promessa impossível: se não dá pra fechar com a marca pedida, não prometer "refazer com
  ITAÚ" (é loop). Oferecer o próximo passo real (aceitar a equivalente OU escolher outra da tabela).
## Regressão (TDD + E2E)
- fechamento que troca marca → emite o aviso de troca (não silêncio).
- não promete refazer com marca indisponível (sem loop).

## Implementado (2026-07-10, rodada 5)
- `fulfillment.ts`: `startContract` compara (normalizado, acento/caixa-insensível via
  `normalizeAdmin` exportada de `partner-offer-mapper.ts`) a administradora fechada com
  `input.administradoraPreferida` → `administradoraChanged` + `previousAdministradora` no
  `StartContractResult`.
- `closing-presentation.ts` (web) e `formatter.ts` (`realOfferToWhatsApp`, WhatsApp): quando
  `administradoraChanged`, o texto/copy troca de "Confirmei com a X" liso pro aviso
  determinístico "A {previousAdministradora} não tem grupo disponível nessa faixa agora — a
  opção equivalente é a {administradora}..." — nunca em silêncio, nos DOIS canais.
- `route.ts` e `contract-capture.ts`: corrigido o destructuring pra não descartar os campos
  novos antes de chegar no artifact/copy (mesma classe de bug do FIX-247/rawCreditValue) —
  coberto por teste de integração `route.fix-259-administradora-changed-fio.integration.test.ts`
  (fio ponta-a-ponta, `describeIfDb`).
- `system-prompt.ts` (`SPECIALIST_BASE_PROMPT`, regra estática): mata a promessa impossível —
  proíbe negar a oferta/proposta registrada e proíbe prometer "refazer"/"trocar"/"simular de
  novo" com outra administradora; oferece os 2 próximos passos reais.
- Testes: `fulfillment.test.ts`, `closing-presentation.test.ts`, `formatter.real-offer.test.ts`,
  `system-prompt.fix-259.test.ts` (TDD, RED confirmado antes da implementação) +
  `route.fix-259-administradora-changed-fio.integration.test.ts` (fio, DB).
- `pnpm test:unit` verde (330 arquivos / 3127 testes) após a mudança.
