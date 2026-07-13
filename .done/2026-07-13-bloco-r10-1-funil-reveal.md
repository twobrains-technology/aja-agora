# Bloco r10-1 funil-reveal — FIX-296 + FIX-297

## Resumo

Os 2 itens deste bloco reordenam o funil pré-reveal e recoreografam o reveal em cima da
nova ordem, fiéis ao mockup `docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html`
(cenários Madalena/Mario) e ao estudo de causa-raiz
`docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md` (rodada 10 do
loop-de-goal consórcio). Fusão deliberada num bloco só — os dois mexem na MESMA máquina de
estados (`qualify-state.ts`) e no mesmo branch de reveal do orquestrador.

- **FIX-296** — o funil pedia CPF/celular logo após o motivo (mesmo turno), antes de trocar
  qualquer ideia sobre o valor do bem. Reversão consciente do FIX-53 ("dados antes do valor")
  — o mockup novo pede "valor antes dos dados".
- **FIX-297** — o reveal emitia o hero (`recommendation_card`) junto com a lista
  (`comparison_table`), sem pausa nem consentimento — o agente "escolhia uma administradora"
  sem pedir permissão.

## FIX-296 — reordena o funil pré-reveal

### O que mudou

- `qualify-state.ts`: `credit` (valor do bem) passa a preceder `identify` (CPF+celular) no
  `nextGate()` — reversão da posição fixada pelo FIX-53. O invariante que **nunca mudou**:
  identidade continua sempre obrigatória antes do `search` (D1 Bevi) — só a posição relativa
  ao `credit` mudou.
- Novo beat de **espelho + objetivo**: depois que o motivo ("por que agora") chega, o funil
  segura mais um turno — sem nenhum card — pro LLM espelhar o motivo com empatia E declarar o
  objetivo na mesma frase (`shouldMirrorMotivation`, não-bloqueante, mesmo padrão de
  `shouldAskMotive`). Substitui o antigo FIX-275, que forçava o card de identidade no MESMO
  turno do motivo (o "atropelo" que o Kairo apontou).
- Copy do `credit` referencia o bem específico ("E quanto custa esse Corolla hoje?") quando o
  `desiredItem` já foi capturado no gate `desire`.
- Moldura do `identify` (canal web) justifica o pedido antes de fazê-lo: "Pra eu trazer as
  ofertas reais das administradoras, preciso do seu CPF e celular."

### Descoberta que reduziu o escopo

A abertura por categoria com divider ("Rafael entrou na conversa — Especialista em
automóveis") **já existia** no código (`orchestrator/transition.ts` + `TransitionDivider` em
`chat-message.tsx`) e já dispara corretamente no primeiro contato — verificado antes de agir,
não recriado. O card FIX-296 apontava isso como root cause, mas a investigação mais funda
(feita durante a execução) mostrou que já estava resolvido por outro caminho.

## FIX-297 — reveal em dois tempos com consentimento

### Decisão de design

Ver ADR completa: [`docs/decisoes/blocos/2026-07-12-bloco-r10-1-funil-reveal.md`](../docs/decisoes/blocos/2026-07-12-bloco-r10-1-funil-reveal.md).

- **Decidi** implementar `reco-consent` como novo valor no enum `Gate` **em vez de** um
  sub-passo ad-hoc do `experience` **porque** reaproveita 100% da infraestrutura genérica de
  renderização (nenhum card novo) e o compilador TS força atualizar cada switch sobre `Gate`
  (rede de segurança, não risco extra) — decisão levada ao Kairo via `AskUserQuestion`
  (opção recomendada), respondida confirmando a recomendação.
- **Decidi NÃO plugar** o sinal de "usuário se autosselecionou da lista" (que no mockup faz o
  Mario pular `experience`/`reco-consent`/hero direto pro `two_paths`) **em vez de** estender
  `nextGate` com esse sinal novo **porque** o Kairo escolheu a opção mais simples via
  `AskUserQuestion` — aceitando conscientemente que o caminho Mario diverge do mockup nesse
  ponto específico (ele ainda vê o gate `experience`). O caminho sem-lance
  (`hasLance="so_parcela"`, capturado oportunisticamente a qualquer momento) continua pulando
  `reco-consent`/hero — só não pula `experience`.
- **Decidi** capturar e persistir o payload coagido do hero (`meta.pendingRecommendationCard`/
  `pendingSimulationResult`) no turno da busca original, em vez de recalculá-lo no momento do
  consentimento **porque** os dados reais do grupo (`revealGroupsById`) só existem durante
  aquele turno específico — sem isso, a emissão determinística pós-consentimento não teria
  como reconstruir os números reais muitos turnos depois.

### Mecânica

1. `search` → `comparison_table` (lista) sai imediata, sempre server-side (FIX-290
   preservado). `recommendation_card`/`simulation_result` (quando 2+ grupos) são
   **suprimidos** pela nova regra `hero-awaits-reco-consent` em `artifact-guard.ts` — o
   payload já coagido (mesma coerção do caminho permitido, Lei 1) é capturado em `runner.ts`
   e persistido em meta.
2. `experience` resolve normalmente (posição intacta).
3. Gate `reco-consent` ("Posso te mostrar a opção que eu recomendo?") — pulado quando
   `hasLance="so_parcela"` já resolveu.
4. Resposta afirmativa por TEXTO (mesmo mecanismo `detectYesNoText` do
   simulator-offer/lance-embutido) libera o hero pendente via `emitServerCard` em
   `orchestrator/index.ts` — nunca depende de o LLM chamar tool.

### Testes

- **Unitário (TDD strict):** `qualify-state.fix-297-reco-consent.test.ts` reproduziu a
  ausência do gate falhando antes da correção (nextGate pulava direto pro timeframe).
- **Integração (DB real):** `runner.fix-290-comparison-forced.integration.test.ts` reescrito
  para provar o invariante NOVO — `recommendation_card` some do turno original (pendente),
  `comparison_table` continua sempre presente, e `meta.pendingRecommendationCard` sobrevive
  no banco com os dados reais do grupo. `index.fix-280-whatsapp-optin-server-side` também
  ajustado (whatsapp_optin continua determinístico e independente do hero).
- **Ripple grande em fixtures:** ~25 arquivos de teste pré-existentes tiveram metas ajustadas
  (`recoConsentDispatched: true`) para continuar representando "funil genuinamente pós-reco-
  consent" — sem isso, eles próprios exercitariam o novo gate em vez do que cada um testava.

## Gate

- `pnpm test:unit`: **365 arquivos / 3357 testes, 100% verde** (rodado no host — worktree tem
  Postgres do workspace acessível via `.orb.local`, ver `aja-shared-pg` / convenção local-dev
  v2).
- `pnpm test:integration`: **79 arquivos / 312 testes, 100% verde** (3 skipped, env-gated) —
  cobre especificamente os cenários dos FIX-294 (denylist `present_whatsapp_optin`) e FIX-295
  (re-emissão de `identify` na supressão de `contract_form` pré-reveal), que continuam verdes.
- Push: `fix/r10-1-funil-reveal` — commits `6ac23ce1` (fix FIX-296), `658827e5` (docs done
  FIX-296), `8fe104b3` (feat FIX-297), `a4de086e` (docs done FIX-297 + limpeza do bloco).

## Gaps honestos

- **Cenário Mario diverge do mockup**: no script exato do mockup, Mario pula
  `experience`/`reco-consent`/hero inteiramente (ele se autosseleciona da lista). Por decisão
  explícita do Kairo (mais simples, sem sinal novo na máquina de estados), Mario ainda passa
  por `experience` neste bloco — só pula `reco-consent`/hero quando `hasLance="so_parcela"`
  resolver. Registrado como divergência CONSCIENTE, não como bug.
- **Catálogo canônico de dúvida** ("o que é lance?", "como funciona o sorteio?") do mockup é
  escopo do FIX-300 (bloco separado) — não implementado aqui.
- **Sonda adversarial com modelo fraco** (Qwen) não rodou nesta sessão — fora do escopo deste
  bloco de execução autônoma (`_prompt.md` proíbe smoke/QA de browser). A garantia de "hero
  sempre server-forced, nunca depende do LLM chamar tool" está provada por teste de
  integração determinístico, não por sonda ao vivo contra um modelo real.
- **WhatsApp**: a coreografia nova (reco-consent) foi só validada estruturalmente — o gate
  cai no caminho textual (`WHATSAPP_TEXT_GATES`) sem card dedicado, sem regressão de
  comportamento, mas também sem produto de UX pensado pro canal (fora de escopo explícito do
  estudo original: "este estudo só mexe na coreografia web e em invariantes compartilhados").
- Não validei E2E ao vivo (browser) — fora do escopo deste bloco de execução autônoma
  (integração fica pro orquestrador da onda, conforme instrução do `_prompt.md`). A prova é
  via TDD + integração com DB real (agente mocado).
