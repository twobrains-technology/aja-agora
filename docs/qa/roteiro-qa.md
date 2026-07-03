---
projeto: aja-agora
dominio: TwoBrains
atualizado: 2026-07-01
oraculo: docs/jornada/jornada-canonica.md
escopo_padrao: "carro (auto) no web, do sonho à proposta, ponta-a-ponta"
---

# Roteiro de QA do Dono — Aja Agora

> Fluxo de negócio + spec de teste do Aja Agora, usado pela skill global `qa-dono-produto` pra
> testar à mão com olho crítico de dono. **Oráculo** do comportamento esperado:
> `docs/jornada/jornada-canonica.md` (é REGRA, não referência — divergência código × jornada é
> defeito, salvo os não-bugs da seção 7 e as tensões T1/T2). Complementos:
> `docs/jornada/CONTEXT.md` (histórico/decisões D1–D22). O conceito do simulador (Bernardo)
> está consolidado na jornada canônica (passo 5). Mantenha este arquivo atualizado a cada rodada.

## 1. O que é o produto

Plataforma B2C de consórcio AI-first: o usuário **conversa com o agente** (a "Aja Agora") em vez
de preencher formulário — diz o que quer conquistar ("um carro de uns 80 mil") e recebe uma
**recomendação real e personalizada** com botão pra contratar, recebendo artefatos interativos
(cards clicáveis) a cada etapa. Sem corretor, sem redirect, sem tabela pra decifrar.

## 2. Ambiente de teste

- **Subir (worktree/branch limpo):**
  ```bash
  pnpm install                                                # deps no host (só p/ vitest/tsc)
  ./.claude/skills/local-dev/scripts/shared-up.sh             # one-time: rede tb-local-net + Letta
  ./.claude/skills/local-dev/scripts/bootstrap-workspace.sh   # sobe aja-pg-<ws> + aja-app-<ws>
  docker exec aja-app-<workspace> pnpm db:migrate             # migrations NÃO rodam sozinhas
  ```
- **URL do app:** `http://aja-<workspace>.orb.local` — `<workspace>` = **basename do worktree**
  (pasta `agent-chat-ui` → `http://aja-agent-chat-ui.orb.local`). Containers **não publicam porta
  no host**; DB em `aja-pg-<ws>.orb.local:5432`, banco `aja_agora`. Letta compartilhado
  (`tb-letta-shared:8283`).
- **Simulador WhatsApp + Bevi (2026-07-03):** o simulador gera waId sintético `SIM-<uuid>`, e a
  **Bevi VALIDA o celular contra o CPF no fechamento** — então o simulador precisa de um celular
  REAL pareado com o CPF de teste. Setar `SIMULATOR_TEST_CELULAR` no `.env.local` (número real do
  Kairo/CONTA1, gitignored/vault) e usar o CPF da MESMA conta. Sem isso, `Trilho A → CELULAR
  inválido`. Placeholder documentado no `.env.example`.
- **Contas de teste (SEMPRE usar, NUNCA inventar CPF):** `secrets.sh decrypt contas-teste` →
  `CONTA1_*` (Kairo, titular/operador) e `CONTA2_*` (Mirella). PII fica fora do git (vault
  SOPS+age). Nos E2E entram via `.env.test` → `E2E_TEST_CPF`/`E2E_TEST_CELULAR` e
  `SEED_CPF`/`SEED_CELULAR`. **Celular:** vault vem E.164-sem-`+` (13 dígitos); o runtime web
  (`normalizePhoneBR`) e WhatsApp (`waIdToCelular`) normalizam pra 11 — só curl direto na API de
  Parceiro precisa tirar o `55` (senão `400 CELULAR inválido`).
- **Admin/login:** admin criado por `src/scripts/seed-admin.ts` (`auth.api.signUpEmail` +
  `UPDATE user SET role='admin'` — o role tem `input:false`, não vai pelo signup). Login em
  `/admin/login`; better-auth em `/api/auth/[...all]`; sessão 24h.
- **Envs que mordem no boot:** `BETTER_AUTH_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`,
  `BEVI_SELFCONTRACT_HASH` (`6a1756d4bef180c41e909c07`), `BEVI_PRODUCT_ID`
  (`6986245b3518ceb00e7844da`), `BEVI_API_TOKEN`, `IDENTITY_ENC_KEY` (base64 de 32 bytes:
  `openssl rand -base64 32`), `SENDGRID_*`.
- **⚠️ Ambiente Bevi/Conexia = HOMOLOGAÇÃO (inviolável).** Não existe prod da Bevi. Fechar
  proposta / criar lead / rodar Trilho A com CPF de teste é **seguro e esperado**. NÃO travar QA
  "por falta de sandbox" — a loja toda é o sandbox. (Kairo travou um P0 achando ser produção em
  26/06; não repetir.)
- **Gate de merge (todo-blocks):** `pnpm test:unit` — **NÃO** typecheck (o `tsc` whole-repo já
  está vermelho na develop por dívida em test files).
- **Regressão de agent — 3 camadas OBRIGATÓRIAS** (CLAUDE.md do projeto): (1) structural em
  `src/**/*.test.ts`, (2) cassette determinístico em `tests/regression/agent-trajectory.test.ts`
  (MockLanguageModelV2), (3) eval nightly em `tests/eval/`. **Não aceitar fix de comportamento de
  agent sem cassette na Camada 2.** Pre-commit hook (husky) roda Camadas 1+2.
- **Pular o funil pra testar Passo 5+:** `scripts/seed-recomendacao.ts` semeia
  identidade+qualificação (`searchDispatched=false`).

## 3. Jornada canônica — passos, artefatos e critérios de aceite

Mesma jornada nos dois canais (regra-mãe de paridade). A **ordem dos gates é determinística** e
vem do orquestrador (servidor), `src/lib/agent/qualify-state.ts` (`nextGate`):
`name → experience → (doubts-wait/consent) → identify → credit → lance → lance-value(se sim) →
lance-embutido → search → [reveal] → simulator-offer → decision → [contratar]`. Na **web**, o
`identify` foi movido pra **antes do `credit`** (FIX-53). O agente LLM só **reage curto e para**;
quem renderiza o próximo gate é o servidor.

### Passo 1 — Entender a necessidade
- **Usuário faz:** abre o chat e diz/escolhe o que quer (bem). Web: clica um dos 3 cards de
  categoria. Ou digita "quero um carro de 80 mil".
- **Produto entrega:** 3 categorias (**Imóvel / Carro(auto) / Moto** — só essas 3); pergunta o
  nome ("Como posso te chamar?"); ecoa o objetivo.
- **Critério de aceite:** categorias corretas visíveis e **`Outros` com count 0**; nome capturado
  em 1 turno; sem pedir prazo aqui (FIX-103).
- **Seletores:** `getByRole("dialog", {name:/conversa com a aja agora/i})`; botões `Imóvel` /
  `Carro` / `Moto`; testids `name-input`, `name-submit`.
- **Rubrica:** o convite é acolhedor? entende-se o que fazer sem instrução? entra rápido no valor?

### Passo 2 — Entender o cliente
- **Usuário faz:** responde se já participou de consórcio; informa **valor do bem** (só o valor);
  responde sobre lance.
- **Produto entrega:** experiência (`Já conheço`/primeira vez/dúvidas) → **educação** se leigo
  (sem juros, taxa adm, sorteio/lance) → **valor** (web: agulha simples `value_picker`) →
  **lance** (Sim/Não/Talvez) → [valor do lance se "sim"] → **educação de lance embutido pra
  QUALQUER resposta** (D10/FIX-4).
- **Critério de aceite:** prazo NÃO é perguntado (FIX-103); educação aparece pra leigo; educação
  de lance embutido aparece pros 3 caminhos de lance; valor default do bem coerente (auto 80k).
- **Seletores:** botão `Já conheço`; consent `Bora!`; `value-input-credit` + `Buscar opções`;
  lance `Por enquanto não`; lance-embutido `Não, prefiro sem lance embutido`.
- **Rubrica:** carga cognitiva (quantas perguntas antes de valor?); jargão explicado antes de
  cobrado; a educação é útil ou enche linguiça?

### Passo 3 — Identidade (gate antes da busca)
- **Usuário faz:** informa CPF + telefone + aceita LGPD.
- **Produto entrega:** gate de identidade **antes de qualquer `search_groups`** (P6/FIX-114). Na
  web, sobe pra antes do valor (FIX-53).
- **Critério de aceite:** nenhuma busca real dispara sem identidade; no DB
  `conversations.metadata.identityCollected=true`.
- **Seletores:** testids `identify-cpf`, `identify-phone`, `identify-lgpd`, `identify-submit`.
- **Rubrica:** pedir CPF é um momento de fricção/confiança — o produto justifica o porquê? o
  aceite LGPD é honesto e legível?

### Passo 4 — Buscar alternativas (real, sem mock)
- **Usuário faz:** nada (o servidor dispara `search` com identidade+valor+lance prontos).
- **Produto entrega:** sweep no **Trilho B (self-contract) da Bevi ao vivo** (ADR 2026-06-28: B
  descobre, A fecha); retorna **≥1 carta REAL, nunca mock**.
- **Critério de aceite:** cartas reais (ao vivo: auto 80k → ~24 grupos; imóvel 250k → ~22); o
  agente **não narra o mecanismo** ("deixa eu buscar"/"vou usar a ferramenta"); no DB
  `searchDispatched=true`.
- **Rubrica:** o tempo de espera é tolerável (< 3s idealmente)? há feedback de progresso sem
  meta-narrativa?

### Passo 5 — Avaliar, simular e definir
- **Usuário faz:** lê a recomendação; brinca no simulador; decide.
- **Produto entrega:** `recommendation_card` (recomendada em destaque + score + "Tenho
  interesse") + `comparison_table` (carrossel, `highlightBestIndex=0`) + `simulation_result`.
  Depois `simulator-offer` → `contemplation_dial` (agulha 3/6/12 meses recalcula lance/crédito/
  parcela ao vivo, com ressalva "estimativa" — CDC art. 30/37) → `decision_prompt` (contratar /
  ver outras / especialista). **"Tenho interesse" pós-reveal = avanço direto** ao contrato, sem
  card de decisão extra (FIX-38).
- **Critério de aceite:** recomendada primeiro; ≥2 "outras opções" reais; simulador recalcula;
  disclaimer de estimativa presente; após "Tenho interesse", `decision-contratar` tem **count 0**
  (avanço direto).
- **Seletores:** texto `Recomendação` (exact), `Parcela mensal`, valor `/R\$\s?[\d.,]+\/mês/`,
  botão `Tenho interesse`; outras `/^Simular .+ por mês$/` (≥2); simulador `Quero ver!`/`Agora
  não`, slider `Mês alvo de contemplação`, testid `dial-disclaimer` (contém "estimativa"/"não é
  garantida"); `decision-contratar`.
- **Rubrica:** os números batem entre card/simulação/contrato? a recomendada reflete o que o
  usuário pediu? a curadoria (1+2) evita paradoxo da escolha? é um **momento de encantamento**?
- **⚠️ Comportamento-alvo (decidido 2026-07-01, "palavra nova vence"):** o reveal deixa de ser
  "recomendada + 2 fixas". Passa a ser **hero fixo + seletor de cotas** — tocar um chip promove
  aquela cota ao hero e recalcula o simulador **no lugar** (client-side), e "Seguir com <cota>"
  carrega o `groupId` real → contrato sem re-resolução pelo agente. Escolher outra cota por
  **texto livre** (que hoje dispara o loop de meta-narrativa) passa a ser **defeito**. Spec:
  `docs/design/specs/2026-07-01-reveal-hero-seletor-cotas-design.md`. Amarra no Bloco 1 da onda.

### Passo 6 — Contratar
- **Usuário faz:** confirma a oferta; envia/pula documentos.
- **Produto entrega:** re-simula se TTL venceu; `contract_form` (CPF+celular+LGPD, ou confirmação
  se identidade on file); `real_offer` (re-simulada pela Bevi); `document_upload` (RG/CNH
  frente+verso, opcional, "pular"); aciona **Trilho A** (`api.uxvision.tech/.../credithub`) →
  PDF da proposta.
- **Critério de aceite:** **assinatura NÃO é self-service** (DES-1) — o card mostra "Ver minha
  proposta" (PDF), nunca promete "assinatura"/"assinar"; erro do Trilho A degrada gracioso.
- **Seletores:** testids `contract-stored`/`contract-cpf`, `contract-lgpd`, `contract-submit`;
  `offer-confirm`; erro amigável `/problema ao falar com a administradora|habilitação com a
  administradora|valor mínimo/i`.
- **Rubrica:** a fricção de documentos chega no momento certo (valor já demonstrado)? a transição
  é honesta sobre proposta × assinatura?

### Passo 7 — Confirmação + handoff
- **Produto entrega:** "Parabéns! Mais perto da sua conquista"; resumo por WhatsApp; opt-in de
  continuidade (`whatsapp_optin`).
- **Critério de aceite:** texto `Parabéns`; `signature-link` contém "proposta"; **nenhuma**
  ocorrência de `/assinatura|assinar/i` (DES-1); PII (CPF) não trafega no WhatsApp.
- **Seletores:** texto `Parabéns`; `signature-link`.

### Parte 2 — Mesa de operação (pós-contratação)
Kanban de leads `novo → engajado → qualificado → em_negociacao → proposta_enviada →
na_administradora → em_atendimento → aguardando_pagamento → fechado_ganho/perdido`
(`src/lib/admin/lead-stages.ts`). Transbordo → broadcast aos atendentes → "Vou atender" (claim
atômico) → copiloto guia o atendente com o PDF. Testável no simulador de atendente.

## 4. Artefatos / telas (registry: `src/components/chat/artifact-renderer.tsx`; tipos: `src/lib/chat/types.ts`)

`group_card`, `comparison_table`, `simulation_result`, `recommendation_card`,
`contemplation_dial` (agulha do Bernardo), `scenarios`, `financing_comparison`, `value_picker`
(agulha de valor), `topic_picker`, `decision_prompt`, `lead_form`, `contract_form`, `real_offer`,
`signature_handoff`, `document_upload`, `whatsapp_optin`, `quick_reply`. Gates de entrada
(fora da união, via `gate-renderer.tsx`): `welcome-categories`, `name-prompt`,
`gate-identity-form`, `gate-quick-reply`. Tools que emitem: `present_*` em
`src/lib/agent/tools/ai-sdk.ts`.

## 5. Canais — web × WhatsApp

Mesma jornada, mesma ordem, mesmas regras. Web tem componentes interativos (agulha, cards,
botões); WhatsApp usa botões nativos + conversa + marcos textuais. **Testar WhatsApp sem
WhatsApp real:** simuladores no admin — `/admin/simulator` (hub), `/admin/simulator/whatsapp`
("Cliente no WhatsApp", mesmo código do canal real), `/admin/simulator/web`,
`/admin/simulator/attendant`. Divergências a caçar (mapa em `jornada-canonica.md:258-285`):
D5 (WhatsApp manda faixas em vez de conversa no valor), D11 (WhatsApp promete "assinatura"),
D13 (WhatsApp ignora upload inbound), D18 (card de decisão intercalado no 1º "Tenho interesse"),
D19 (pula educação de lance embutido pra no/maybe), D22 ("Ver outras opções" sem handler). Vários
com fix aplicado (FIX-116/117/119/120/122) mas **validação de tela WhatsApp pendente**.

## 6. Fluxos críticos (E2E de tela é TETO obrigatório)

- **Golden path web — carro do sonho à proposta** (Passos 1–7). Ref. specs:
  `tests/e2e/specs/**/golden-path-web.spec.ts`, `passo5-7-golden-path.spec.ts`.
- **Reveal com dados reais da Bevi** (Passo 4/5) — cartas reais, sem mock, sem meta-narrativa.
- **Fechamento Trilho A** (Passo 6) — aceita `offer-confirm` OU erro amigável (degradação).
- **Entrada geral do chat:** `getByLabel("Digite sua mensagem")` + `getByLabel("Enviar
  mensagem")`. Retomada: `Começar` → `Voltar à conversa`. Reset oculto: comando `/reset` (D17).

## 7. Não-bugs conhecidos (NÃO tratar como defeito) — decisões VIGENTES, não eternas

> Estas são decisões **atuais**. A **palavra nova do Kairo vence**: se ele mandar mudar qualquer
> uma delas (ou qualquer coisa definida na jornada — ex.: **a quantidade de cards no reveal**,
> hoje "recomendada + 2"), isso é **mudança de jornada**, não uma crítica a rebater com "mas já
> estava definido". Alerte o conflito (cite onde estava), discuta só se houver risco real, e —
> confirmado — reescreva o oráculo + este roteiro na hora; o comportamento antigo vira defeito.

- **T1** — jornada põe Trilho A como primário na descoberta × ADR 2026-06-28 (B descobre, A
  fecha). Tensão aberta, PENDENTE-Kairo (recalibrar). Discordou? vira MELHORIA.
- **T2** — lance embutido: jornada diz que amortiza dívida × CONTEXT D18/C4 + código dizem que
  reduz crédito líquido. Tensão aberta, PENDENTE-Bernardo.
- **DES-1** — assinatura self-service **não existe**; a efetivação é da mesa (manual). Card mostra
  "Ver minha proposta", não "assinatura". (No WhatsApp, D11 ainda promete — isso É defeito.)
- **Simulador do Passo 4/5 = conceito do Bernardo** (stakeholder). Não implementar versão final
  sem o aval dele.
- **D10 — Trilho A trava ao vivo** (`400` productId/AGX). ⚠️ **2026-07-01: NÃO reproduziu** — a
  rodada fechou **proposta real** (grupo 1797, proposalId `6a45bf1d45fa79d9c4d7ab5f`,
  `proposal_status=documentos`, link `uselink.me`). A homologação está fechando de verdade;
  manter só como degradação possível, não como estado atual. A spec segue aceitando
  `offer-confirm` OU erro amigável.
- **1 proposta ativa por loja/device** — `create-proposal` devolve `400 Duplicated Hash` mesmo
  com `ignoreOngoingProposals:true`; retome a ativa (`get-multi-proposal/{cpf}`) ou aguarde.

## 8. Armadilhas de teste (falso-bug)

- **Selagem FIX-49:** só o turno ATIVO é interativo; cards antigos ficam `pointer-events-none +
  inert + opacity-60`. Clicar card selado do histórico = **falso-bug**. Teste "Tenho interesse" e
  "simulador" em **conversas separadas**.
- **Meta-narrativa é defeito, não ruído:** `/vou (buscar|usar a ferramenta)|dificuldade (técnica|
  em acessar)/i` no histórico = bug de comportamento (exige regressão 3 camadas).
- **Criar atendente sequestra sessão do admin** (better-auth `signUpEmail` + `nextCookies`) —
  achado conhecido, PENDENTE-KAIRO; não confundir com bug novo.

## 9. Histórico de rodadas

- **2026-07-03 — Carro × WhatsApp (LOCAL, simulador), conta Kairo. Fechamento PASS.** Rodada
  "garantindo os fixes" (reforma de conversa FIX-210/211/212 + celular). **3 defeitos achados e
  corrigidos (todos com regressão Camada 1, gate 2708 verde, na develop):**
  1. **Fechamento `CELULAR inválido` no simulador** — o waId sintético `SIM-<uuid>` fazia
     `waIdToCelular` extrair 24+ dígitos do UUID; e a **Bevi VALIDA o celular contra o CPF**
     (não basta formato). FIX: `SIMULATOR_TEST_CELULAR` (número real de teste, env/vault) pareado
     com o CPF. **Validado E2E: Trilho A `insert_proposal` → 201 ok, proposta REAL criada** (grupo
     540, ÂNCORA). Commit `1ee533c5`.
  2. **Valor monetário quebrado** — "R$ 100.000,00" saía "R$ 100.\\n\\n000,00" (LLM lê o ponto de
     milhar como fim de frase, gatilho da regra "1-2 frases" do FIX-212). FIX determinístico no
     `formatTextForWhatsApp`: ponto/vírgula entre dígitos nunca quebra. Commit `1bb416d4`.
  3. **Emoji `Olá 👋` na saudação** — gap do FIX-212 (👋 no `CONCIERGE_PROMPT_BODY`, fora da
     varredura). FIX: removido + varredura anti-emoji estendida (emoji-em-aspas). Commit `21154b86`.
  4. **Passo 5.2 não renderizava no simulador** (assinatura + documento + Parabéns sumiam) — o
     simulador não chama `updateLastInboundAt` → `lastInboundAt` null → `isWindowOpen` sempre
     fechada → `resolveAndSend` enfileirava como template pendente. FIX: `resolveAndSend` free-texta
     pra waId simulado (a saída é interceptada, nunca vai pra Meta). Commit `9c38c755`. **Validado
     E2E: Passo 5.2 completo renderiza** (reforço + link real de proposta `uselink.me` + convite
     RG/CNH sem emoji + "Parabéns!"). WhatsApp real intacto (janela atualizada em todo inbound).
  5. **Upload RG/CNH inbound — COBERTO (PASS).** O simulador só roteia texto/clique
     (`processTextMessage`/`processInteractiveReply` em `send/route.ts`) — **NÃO trata imagem**, então
     o upload não é testável pela UI (limitação do backend do simulador; possível melhoria futura:
     rotear `image` pro `handleDocumentInbound`). Exercitei o path real via `scripts/qa-document-inbound.ts`
     (download da Graph MOCKADO, upload REAL) contra a conversa fechada: FRENTE → "Recebi a frente.
     Agora me manda o *verso*"; VERSO → "Recebi. Sua ficha está completa!". **Sem emoji** (o `✅` antigo
     saiu). **O documento vai pro `gateway.uploadDocument` (link Bevi/Conexia `uselink.me` do Trilho A),
     NÃO pro nosso S3** — correto (a administradora recebe o RG/CNH). O bucket `aja-client-docs` é do
     despacho desacoplado (bloco-a), path separado.
  - **Jornada Passo 1→7 (+ upload) validada 100% ponta-a-ponta no simulador** (busca real → reveal →
    decisão → contrato → carta real 201 → assinatura/documento/Parabéns → upload frente+verso ok).
  - **Copy menor (não-bug, PENDENTE-KAIRO):** reação pós-interesse repete o nome e emenda frases
    ("Show, Kairo! Então deixa eu confirmar: Fechou, Kairo, esse plano encaixa bem...") — polir depois.
  - **Observações — decisão de PRODUTO, não bug (Kairo: registrar, ajustar depois, não mexer agora):**
    - (a) **"3 opções" × 10 grupos achados.** Kairo (2026-07-03): a **curadoria** (recomendada + 2,
      pra não afogar o cliente em opção) é **proposital e OK**. PORÉM, se a copy afirmar "3 opções"
      como se fosse o **TOTAL disponível**, é **copy enganosa** → **ajustar TEXTO depois** (dizer que
      são as 3 mais aderentes, não o total). Não é bug; é copy. PENDENTE-KAIRO (ajuste de texto).
    - (b) card de decisão apareceu no "tenho interesse" por TEXTO livre (o avanço direto FIX-38 é pro
      BOTÃO) — provável esperado. PENDENTE-KAIRO.
    - (c) no path SEEDADO o card de recomendação com botões não renderizou no WhatsApp, só o texto —
      a confirmar vs funil completo. PENDENTE-KAIRO.
  - **Gap de cobertura:** o simulador usa waId sintético → **não exercita o bug REAL do 9º dígito**
    (esse só num webhook WhatsApp real). Validado por unit + o fechamento real de prod (2026-07-02).
- **2026-07-02 — Imóvel × WhatsApp (PROD), branch `qa/imovel-whatsapp`. 🚫 BLOQUEADO.** O
  simulador `/admin/simulator/*` é **404 em produção por design** (`isSimulatorEnabled()` →
  `false` quando `TB_ENV=production`, `src/lib/utils/env.ts:12-16`). Login admin prod OK, mas
  GET/POST `/api/admin/simulator/sessions` deram 404; jornada não pôde ser dirigida. DEV AWS
  (`tb-dev-aja-agora…`) está de pé com simulador habilitado, mas as credenciais de admin do
  prod não valem lá. QA de canal precisa de DEV (com creds próprias) ou local. Único achado:
  MELHORIA de UX (inbox mostra "HTTP 404" cru em vez de "simulador indisponível neste
  ambiente"). Ledger: `.processo/qa/2026-07-02-imovel-whatsapp-ledger.md`. Consistente com a
  sessão irmã `qa/moto-whatsapp` (mesmo bloqueio).
- **2026-07-01** — Roteiro criado (semente) pela skill `qa-dono-produto` a partir do mapa da
  jornada canônica. Estado do repo: inbox com 15 cards (vários já resolvidos — triar antes de
  montar bloco), `docs/correcoes/done/` com 133 fixes, 3 blocos em `todo/`.
- **2026-07-01 — 1ª rodada real (carro web, conta Kairo), conversa `fe2e8a09-…`.** Jornada
  completou ponta-a-ponta e **fechou proposta real** (Trilho A ok, D10 não reproduziu).
  Passos 1–4, 6, 7 = PASS; Passo 5 = PARCIAL. Achados principais:
  - **P0 (defeito)** — na conversão ("quero seguir com o BB"), o agente despejou meta-narrativa
    e **admitiu falha técnica ao cliente** ("esse grupo deu um problema", "tive um problema ao
    acessar os grupos", "preciso trazer os IDs reais") e entrou em **loop**; só saiu com
    confirmação manual. Casa com o padrão proibido §8. Raiz: não re-resolveu o grupo/ID da
    recomendação (ligado ao defeito do card).
  - **Defeito** — `recommendation_card` é o único artefato do reveal **sem coação server-side**
    (números model-typed; `runner.ts` empurra `payload=input`, sem `coerceRecommendation*`).
    Confirma [[project_aja_tela_recomendacao_dados_reais]].
  - **Defeito** — selo **"Orçamento 100%"** calculado contra um orçamento que o cliente **nunca
    informou** (schema `recommend_groups` exige `budget` → modelo inventa ≈ parcela). Risco CDC.
  - Menores: IPCA 4,5% hardcoded (`offer-mapper.ts:188`); dial "Após receber" estático/mislabel
    e "valor que recebe" reduz crédito mesmo "sem lance" (**entangled T2/Bernardo — não corrigir
    no escuro**); slider sem teclado (a11y); "Quanto custa o carro?" no balão do gate de CPF.
  - **Dúvidas abertas:** "36 contemplados/mês" é real-Bevi ou alucinado (I/O do `recommend_groups`
    não persiste — a confirmar); `maxStageReached` ficou "qualificado" apesar de proposta real;
    persona "Rafael entra na conversa" é decisão de produto? whatsapp_optin não apareceu no web.
  - Evidências (screenshots): `.playwright-mcp/qa-carro-web/`.
