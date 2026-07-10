---
id: FIX-259
titulo: "P1: fechamento troca a MARCA em silêncio (confirmou ITAÚ, veio BANCO DO BRASIL) + promessa em loop"
status: todo
bloco: bloco-r5-fechamento-gates
arquivos: [src/lib/adapters/bevi/partner-offer-mapper.ts, src/lib/agent/orchestrator/directives.ts]
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
