---
bloco: bloco-i-vendedor-proativo
branch: fix/vendedor-lance-embutido-escassez
campanha: .processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md (ITENS 4 e 5)
itens: [FIX-366, FIX-367]
executado_em: 2026-07-22
commits:
  - 944790b4 (test+fix: FIX-367 — availableSlots propagado pro card de escassez)
  - 279e2be3 (docs: fix-367 movido pra done/)
  - 50eb2f0b (test+fix: FIX-366 — decisão Bevi sequencial + sugestão proativa)
  - c0b44dee (docs: fix-366 movido pra done/, bloco-i removido)
---

# Bloco I — Vendedor proativo: lance embutido + escassez

## Resumo

Os dois itens tinham uma investigação obrigatória antes de qualquer correção — ambos
foram investigados por **leitura de código + testes** (sem precisar de acesso à Bevi
real). Resultado: **FIX-367 era um bug de código genuíno** (não dado externo faltando,
como o fix doc suspeitava); **FIX-366(a) confirmou que paralelizar é inseguro** (mantido
sequencial, sem mudança funcional) e **FIX-366(b/c) foi resolvido via reforço de
prompt** (não regex).

`pnpm typecheck` limpo. `biome check` limpo nos arquivos tocados. 40 testes rodados
isoladamente (arquivos tocados, não a suíte inteira, por instrução de urgência) — todos
verdes.

## FIX-367 — por que o card de escassez não aparecia

**Causa real (investigada, não é nenhum dos 3 caminhos do fix doc original — é uma
4ª variante, híbrida de (b)/(c)):** `groupId` estava CORRETAMENTE ancorado (a regra dura
"recommendation_card + comparison_table são inseparáveis no ramo 2+ grupos" garante
isso). O bug real: `buildScarcityCard` (server-cards.ts) resolve o grupo pós-reveal via
`meta.recommendedOffer` — um snapshot que **nunca capturou `availableSlots`**, mesmo
quando a Bevi trazia o dado real no `recommendation_card`/`group_card`. Pior: quando o
snapshot ancora num `simulation_result` (prioridade dada ao par de lance, FIX-C2), o
`simulate_quota` **nunca devolve `availableSlots`** — o número de vagas real capturado
no reveal se perdia no primeiro what-if.

Confirmado contra as fixtures reais da Bevi (`docs/integracoes/assets/segmentos/*/
offers.json`): 16 de 17 ofertas reais (incluindo moto) trazem `monthlyAwardedQuotas >
0`. O gap não era a Bevi não devolver o dado — era o código nunca propagar o que já
tinha.

**Correção:**
- `RecommendedOfferSnapshot` (dial-payload.ts) e `ConversationMetadata.recommendedOffer`
  (personas.ts) ganharam `availableSlots?: number`.
- `offerSnapshotFromArtifact` extrai o campo quando o payload traz.
- `resolveSnapshotAvailableSlots` (nova, pura): quando o anchor é `simulation_result`
  (sem o campo), cai pro `recommendation_card`/`group_card` do MESMO turno.
- `preserveAvailableSlotsAcrossResim` (nova, pura): numa re-simulação (what-if),
  preserva o número conhecido SÓ quando é o MESMO grupo — nunca herda de outro.
- `buildScarcityCard` agora propaga `offer.availableSlots` pro índice que
  `coerceScarcityPayload` usa.

TDD strict: RED confirmado antes do fix (`server-cards.test.ts` falhava com `undefined`
em vez do número real) → GREEN depois. 12 testes novos entre `server-cards.test.ts` e
`dial-payload.fix-367-available-slots.test.ts`.

## FIX-366 — paralelização Bevi + sugestão proativa

**Decisão (a) — NÃO paralelizar `offersForValue` com `Promise.all`.** O adapter opera
com 1 proposta ativa e o cookbook (`bevi-self-contract-adapter.ts:351-369`) documenta
**re-PATCH sequencial**. As duas variantes (sem/com embutido) mutam a MESMA proposta
via `setSegment`/`client.simulate()` — rodar concorrente arrisca corromper a
distinção "sem"/"com" (a Bevi processa 1 proposta = 1 estado de simulação por vez;
2 PATCHes concorrentes podem devolver o MESMO estado vencedor pras duas chamadas,
misturando os dados). Sem sandbox/token pra testar ao vivo, o blast radius de
corromper uma oferta financeira real mostrada ao cliente é alto demais pra arriscar
sem evidência. **Nenhuma mudança de comportamento** — o código já era sequencial e
correto; adicionei 1 teste de regressão que TRANCA essa invariante (prova que as duas
chamadas de `client.simulate` nunca se sobrepõem no tempo).

Não implementei uma alternativa de latência (fire-and-forget/2ª proposta) — o retorno
combinado (sem+com, síncrono) de `offersForValue` é dependência ativa do scoring/dedup
(`recommendation.ts`, `embutidoGuardrail` FIX-226) e de 6 testes de regressão do
FIX-219; desacoplar isso é mudança de escopo maior, com risco de regressão em lógica
já validada. Fica **PENDENTE-KAIRO**: se o `gapMs` (400ms, nunca calibrado — o próprio
código admite) incomodar na prática, medir ao vivo antes de redesenhar.

**Correção (b/c) — sugestão proativa via prompt.** A infra já existia (`hasLance:"no"`
já roteava pro gate `lance-embutido`) — faltava o agente oferecer com o ângulo
vendedor. Reforçado:
- `system-prompt.ts` — novo parágrafo instruindo o modelo a puxar a sugestão
  PROATIVAMENTE quando o cliente sinalizar que não tem aporte, com o trade-off
  completo (parcela normal até contemplar → cai depois pela amortização → crédito
  líquido menor agora), nunca inventando número, respeitando quem recusar.
- `embedded-bid-payload.ts` (`EMBEDDED_BID_DISCLAIMER`) — reforçado com a mecânica
  "parcela segue normal até contemplar e cai na sequência" (mesmo cálculo do dial,
  `contemplation-dial.ts`). É dado de contexto pro modelo — o card `embedded-bid.tsx`
  já hardcoda seu próprio disclaimer regulatório por design (FIX-228), não foi tocado.

Sem TDD nesta parte (comportamento de conversa, não invariante mecânica) — conforme
o próprio `_prompt.md` do bloco. Validação fica pro juiz da campanha nos 3 cenários E2E.

## Decisões técnicas tomadas durante a implementação

- **Escopo de arquivos ampliado além do `escopo_arquivos` do `_bloco.md`** —
  `dial-payload.ts`, `server-cards.ts`, `runner.ts`, `personas.ts` não estavam
  listados, mas são onde a causa-raiz real do FIX-367 vive. Verifiquei que nenhum
  outro bloco da onda (`bloco-f`, `bloco-h`) toca esses arquivos antes de editar.
- **FIX-367 não é nenhum dos 3 caminhos (a/b/c) previstos no fix doc** — é uma 4ª
  causa (código nunca propaga o dado real, não é ausência de dado nem so_parcela).
  Documentei isso explicitamente no `done/fix-367-*.md` pra não confundir quem ler
  depois.
- **FIX-366(a): escolhi NÃO implementar a alternativa de latência** (fire-and-forget)
  depois de mapear o blast radius real (scoring/dedup + 6 testes) — decisão técnica
  documentada como PENDENTE-KAIRO em vez de forçar uma mudança arriscada sob "modo de
  urgência". Prioridade: não quebrar lógica financeira já validada por velocidade.

## Testes

- **Novo**: `src/lib/agent/orchestrator/server-cards.test.ts` (3 testes) — RED→GREEN
  do bug do FIX-367.
- **Novo**: `src/lib/agent/orchestrator/dial-payload.fix-367-available-slots.test.ts`
  (9 testes) — extração/fallback/preservação de `availableSlots`.
- **Novo**: describe "FIX-366" em `bevi-self-contract-adapter.test.ts` (1 teste) —
  trava a invariante de execução sequencial.
- Suíte completa dos arquivos tocados (24 + 12 + 4 rodados em conjunto) — 40 testes
  verdes, `pnpm typecheck` limpo, `biome check` limpo.

## Gaps honestos

- FIX-366(a): não medi a latência real do `gapMs`/round-trip da Bevi em produção —
  a decisão de não paralelizar é baseada em documentação (cookbook), não em teste ao
  vivo (não há sandbox/token disponível neste ambiente).
- FIX-366(b/c): a qualidade da sugestão proativa (tom, timing, se soa "vendedor" ou
  "forçado") só será avaliada no loop de verificação da campanha — não há como
  confirmar isso mecanicamente nesta sessão.
