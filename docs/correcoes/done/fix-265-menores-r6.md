---
id: FIX-265
titulo: "Menores r6: acento ITAU no fecho, snapshot ancora what-if, 'te mandei WhatsApp' só enfileirou, dial repete no clique"
status: done
bloco: bloco-r6-mencao-polish
arquivos: [src/lib/adapters/bevi/partner-offer-mapper.ts, src/lib/agent/orchestrator/choose-offer.ts, src/lib/agent/orchestrator/runner.ts, src/lib/bevi/closing-presentation.ts, src/lib/bevi/fecho-pedir-oi.ts, src/app/api/chat/route.ts]
rodada: 2026-07-10 rodada 6 (Fable r5, menores)
---
## Gaps (veredito r5, menores)
- "ITAU" sem acento na copy do fecho (catálogo parceiro) — normalizar acentuação (inviolável PT).
- snapshot ancorou em what-if de 161k não pedido — snapshot só de oferta confirmada.
- "te mandei WhatsApp" dito quando só ENFILEIROU (sem janela) — copy condicional ao envio real.
- dial repete 1× no próximo afirmativo (clique não seta `simulatorOfferAnswered`) — setar no clique.
## Regressão (TDD)
- acento correto nos nomes de administradora no fecho.
- clique simulator-offer seta simulatorOfferAnswered → dial não repete.
- copy de WhatsApp condicional (enviado vs enfileirado).

## Implementado (2026-07-10, rodada 6)

### #1 — Acento "ITAU"→"ITAÚ" no fecho — `partner-offer-mapper.ts`
O trilho de DESCOBERTA (`offer-mapper.ts`, FIX-255) já normalizava acento dos códigos crus da
Bevi; o trilho de FECHAMENTO (`partnerOfferToRealOffer`) não — passava `offer.administradora`
cru direto pro `RealOffer`, que alimenta `snapshot.administradora` (fulfillment.ts) e toda a
copy do fecho (closing-presentation.ts: intro, reforço, signature_handoff). Fix: reusa
`normalizeAdministradoraName` (mesmo mapa `ITAU→ITAÚ`/`ANCORA→ÂNCORA`/`TRADICAO→TRADIÇÃO`) —
ponto único, tudo que consome `RealOffer` herda o nome certo. Testes atualizados em
`fulfillment.test.ts` (2 asserts que codificavam o bug corrigidos pra "ITAÚ").

### #2 — Snapshot não ancora what-if exploratório — `choose-offer.ts` + `runner.ts`
Novo `isCreditValueMentioned(text, creditValue)` (choose-offer.ts) — reusa a mesma extração/
tolerância (≤10%) de `resolveOfferByMention`. No bloco "FIX-6 what-if" do runner.ts: quando o
texto do usuário NÃO resolveu por nome/valor já exibido (`mentioned` null) E o crédito da nova
simulação diverge >15% do snapshot atual E o valor não está explicitamente citado no texto →
NÃO re-ancora (mantém `recommendedOffer` anterior; a simulação ainda aparece como card
informativo). O caminho legítimo (FIX-6/FIX-251/252 — what-if pedido por nome ou valor já
exibido) fica intocado: `runner.ancora-fechamento.integration.test.ts` (r4) continua verde.
Novo teste `runner.snapshot-whatif-exploratorio.integration.test.ts` reproduz o cenário exato
do achado N6 (pedido 100k, what-if especulativo 161.258 sem citação) e prova que o snapshot
fica em 100.000.

### #3 — Copy condicional do fecho WhatsApp (enviado vs enfileirado) — `fecho-pedir-oi.ts` + `closing-presentation.ts` + `route.ts`
`sendFechoPedirOi` agora devolve também `channel` (o resultado real de `resolveAndSend`:
`free_text`/`template`/`queued`/`undefined`). `closingPresentation` ganha `opts.whatsappChannel`
opcional — `queued` troca "acabei de te mandar" por "assim que a janela abrir, eu te mando";
sem opts (callers não migrados, ex. `interactive-handlers.ts`), mantém o texto de sempre
(retrocompatível). `route.ts` (handler `offer-confirm`) agora chama `sendFechoPedirOi` ANTES
de montar `closingPresentation`, pra ela já saber o canal real.

### #4 — Dial duplicado: clique agora seta `simulatorOfferAnswered` — `route.ts`
O branch `action.gate === "simulator-offer"` em route.ts marcava só `simulatorOfferDispatched`;
`simulatorOfferAnswered` só era setado pelo texto afirmativo subsequente (index.ts), abrindo a
janela cross-turn (clique → 1º "sim" do turno seguinte re-emitia o dial). Fix: seta as duas
flags juntas no clique, cobrindo os ramos "yes" e "no".

### Testes novos (estruturais, sem DB, nome não começa com "route" — convenção test:unit)
- `src/app/api/chat/simulator-offer-answered-gate.test.ts` (#4)
- `src/app/api/chat/offer-confirm-whatsapp-channel-gate.test.ts` (#3, ordem + wiring do route.ts)

### Gotcha de ambiente encontrado e corrigido
`.env.local` do worktree tinha `IDENTITY_ENC_KEY=` (vazio) — mesma classe da lição
`empty-env-compose`: 5 testes de integração falhavam com "IDENTITY_ENC_KEY ausente" por causa
disso, não por regressão de código. Backfill do valor do clone principal + recreate do
container (`docker compose --env-file .env.local --profile containerized up -d app`) resolveu;
`test:integration` (69 arquivos) e `test:unit` (338 arquivos/3184 testes) verdes no container
`aja-app-r6-mencao-polish` depois.
