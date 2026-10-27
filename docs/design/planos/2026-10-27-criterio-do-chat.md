# Critério do chat — medido por um dono chato, até zerar — Plano de implementação

**Goal:** o chat da `develop` do aja-agora medido por um dono chato até zerar: critério de fala em fonte única, medidor de duplicidade de **CONTEÚDO** (não de string), duas rodadas consecutivas com zero achado.
**Arquitetura:** três peças, nenhuma delas é guarda de fala no runtime — (1) o código para de reescrever o balão e para de tratar aviso LGPD como passo de aprovação; (2) matriz de critérios versionada em `docs/qa/`, cinco famílias, cada critério com seu medidor; (3) o medidor de duplicidade vive no **avaliador offline** (`src/lib/agent/pi/eval/golden.ts`) e no SQL, sobre transcrição gravada — `pnpm eval` e `eval-conduta --db` são o gate, a régua de zero é a rodada.
**Stack:** Next 16 + TypeScript, Vitest 4, Drizzle + Postgres (`aja-shared-pg` / `aja_agora_ws_develop`), runner de cenários por SSE (`scripts/eval-run.ts`), gateway LiteLLM (`tb-litellm-shared:4000` no container, `litellm.orb.local:4000` no host).

## Problema

O dono lê o chat como cliente e acha o que o medidor não acha: o agente **pede a mesma coisa duas vezes com palavras diferentes** e **repete o mesmo dado no texto e no card**. O medidor de hoje casa pergunta **por string exata** (`src/lib/agent/pi/eval/golden.ts:26-31`, regra `pergunta-repetida`) e no mesmo corpus acha **46 em 27 conversas** contra **472** do medidor por slot — o gate está verde sobre um instrumento cego. Somam-se uma trava que a premissa já revogou (reescrever o balão com aviso LGPD) e dois buracos medidos na web (o card que deveria salvar o telefone não pede o número; `lead_form` nunca apareceu).

## Solução

Alinhar o código à premissa (a trava de LGPD sai do balão, mascaramento e cifra ficam), escrever do zero a matriz de critérios em fonte única, trocar o medidor de string por medidor de **conteúdo** (slot pedido × turno, dado no texto × card), inflar o golden-set com 12 leads difíceis mais a camada de caminho nos dois canais até `contractClosed` com prova por SQL, e rodar até **duas rodadas consecutivas com zero achado** — com teto, porque rodada infinita não é plano.

## Grandes ideias

- **Nenhum documento deste projeto é fonte de verdade para teste.** Todo número é medido agora, no app e no banco, com o SQL colado no diário. O que não foi medido nesta rodada é `NÃO MEDIDO`, nunca `OK`.
- **Duplicidade é de conteúdo, não de string.** Slot pedido em turnos diferentes, com o cliente tendo respondido entre eles; e o mesmo dado no texto **e** no card do mesmo turno.
- **Medida de teste nunca vira guarda de runtime.** O medidor acusa na transcrição; não corta fala no `turno-livre.ts` (AGENTS.md, "Como se trabalha aqui").
- **Critério em fonte única, com medidor.** Cada id cita o arquivo/sonda que o mede ou está `NOVO`. Critério sem medidor é opinião escrita em `.md`.
- **Zero é medido duas vezes.** Uma rodada verde não fecha o plano: duas consecutivas, com sha + `AI_MODEL` + versão/label da caixa na mesma linha do diário.

## Variáveis

- RAIZ: `/Users/kairo/orca/workspaces/aja-agora/chefe-criterio-do-chat` · PROJETO: `aja-agora` · BASE: `develop` @ `a58f82bc` (branch da worktree `kairogyn/chefe-criterio-do-chat`; **não confirmei** o sha do HEAD — confira `git rev-parse --short HEAD` antes de colar no diário)
- APP SOB TESTE: `http://aja-chefe-criterio-do-chat.orb.local` — **não confirmei** que o container está de pé (não rodei comando). `scripts/eval/chat-client.mjs:18` usa `AJA_BASE_URL` com default `http://aja-app-develop.orb.local`; `scripts/qa/talk.mjs:12` e `scripts/qa/wa-talk.mjs:17` têm outro default. **Exporte `AJA_BASE_URL` em toda chamada.**
- GATEWAY: `tb-litellm-shared:4000` no container (`docker-compose.yml:80`); no host `.env.local:58` traz `http://litellm.orb.local:4000` (`scripts/_env-host.ts:35-45` traduz nome de serviço).
- MODELO: `AI_MODEL=qwen-35b` (`.env.local:68`). `scripts/eval-run.ts:74` cai em `claude-haiku-4-5` se `AI_MODEL` estiver vazio — esse modelo não está registrado no gateway local (probe HTTP 400); **não rodei o probe**, não confirmei.
- SUBAGENTES: `isolation: none`, sem worktree nova (worktree é do Orca).
- SEM push, sem deploy, sem PR. Produção só com as três condições do bloco 5 e rollback escrito antes.
- COMMIT: Conventional Commits **em inglês**. O template `padrao-de-docs/templates/plano.md` diz "(PT-BR)" no passo 5 — **divergência registrada: a regra da casa e o mandato mandam em inglês**.

## Fluxo

1. **Planejar** — este arquivo: cinco blocos, gate por bloco, matriz de critérios, perguntas Q1..Q8.
2. **Construir** — na ordem dos blocos (1 código, 2 matriz, 3 medidor com teste que falha primeiro, 4 cenários + caminho, 5 rodadas); commit Conventional em inglês por unidade; nada fora da RAIZ; nenhuma guarda de fala no runtime.
3. **Verificar** — os gates de bloco, o `medidor-duplicidade.sql` colado no diário e as duas rodadas consecutivas com zero achado, cada uma com sha + `AI_MODEL` + versão/label da caixa.

## Restrições globais

1. **Documento não prova nada.** Prova é SQL colado no diário + transcrição do app rodando agora.
2. **`NÃO MEDIDO` ≠ `OK`.** Item sem número desta rodada fica `NÃO MEDIDO` e bloqueia o fechamento do bloco.
3. **Nada de regex ou guarda de fala nova no runtime.** O medidor novo é offline. Divergência registrada: já existe guarda de texto no runtime — `manterUmaPergunta` (`src/lib/agent/pi/uma-pergunta.ts:21`, chamada em `src/lib/agent/pi/turno-livre.ts:215`) — ela **fica**; nenhuma outra entra.
4. **Mascaramento e cifra ficam:** `turno-livre.ts:125-151`, `passaFinal` (`src/lib/agent/orchestrator/vazamento.ts:149`), `contract_form` com `identityOnFile`/`prefilledCpfMasked` (`src/lib/agent/pi/cards-livres.ts:776-793`).
5. **Teste pontual, ao lado do arquivo tocado, + `pnpm -s typecheck`.** A suíte inteira foi removida em 16/10/2026; `vitest.config.ts:22` inclui só `src/**/*.test.ts(x)`.
6. **Pulado nunca é verde.** `scripts/eval-run.ts:166` pula cenário com env ausente, `:288` avisa, `pass === 0` sai com exit 3 (`:303-306`). Cenário `skip-env` conta como não coberto.
7. **Credencial e CPF de teste nunca neste `.md` nem em commit** — só no vault.
8. **Onde o mandato divergir do código, o código manda**, e a divergência é registrada no diário.

---

### Bloco 1 — Código alinhado à premissa

**Gate:** `pnpm -s typecheck` **e** `pnpm vitest run src/lib/agent/pi/lgpd.test.ts` **e** `pnpm prompts:check`, os três verdes, saída colada no diário. `prompts:check` deve reportar "não há versão publicada" (`scripts/prompts-check.ts:36-45`, exit 0 não estrito) porque `caixa_de_prompt` = 0 linhas — **não executei a consulta, não confirmei**; se houver versão publicada, o gate exige as duas linhas.

#### Task 1a: a trava de LGPD sai do balão

**Files:**
- Modify: `src/lib/agent/pi/lgpd.ts` — `garanteAvisoLgpd` (`:65-84`) e `ResultadoDoAviso` (`:49-58`)
- Modify: `src/lib/agent/pi/turno-livre.ts:194-198` (o efeito que reescreve o texto) + `:1142` e `:1175` (encanamento de `avisoDado`)
- Modify: `src/lib/agent/pi/eval/golden.ts:154-157` (regra `dado-sem-aviso`) e a união `Achado.regra` (`:26-31`)
- Modify: `src/lib/eval/jornada-rubric.ts:189-193` (aceite LGPD como parte do passo 2) e `:226` (passo 5 "dados (CPF/celular/LGPD)")
- Test: `src/lib/agent/pi/lgpd.test.ts` — reescrever `:73-95` (`garanteAvisoLgpd`), `:100-119` (`avisoAplicado` em `montarTrechoDeSaida`) e `:124-131` (teste que lê a fonte de `turno-livre.ts` e **afirma** que a guarda é aplicada em cada trecho — `expect(corpo).toMatch(/montarTrechoDeSaida\(\{[^}]*texto:\s*pendente[^}]*avisoDado/)` e `expect(fonte).toMatch(/avisoDado = historico\.some/)`)
- Test: `src/lib/agent/pi/eval/golden.test.ts:63-70` ("dado pedido antes do aviso") — sai com a regra

**Interfaces:** Consome `montarTrechoDeSaida({ texto, avisoDado, cardsDoTurno, handoff })` (`turno-livre.ts:182-187`). Produz `montarTrechoDeSaida({ texto, cardsDoTurno, handoff })`: `avisoDado` e `avisoAplicado` deixam de existir e `garanteAvisoLgpd` é removida. `PEDE_DADO_RE` (`lgpd.ts:37`) e `AVISO_LGPD_RE` (`lgpd.ts:20`) **continuam exportados** — `resolverAceiteLgpd` (`lgpd.ts:236`) e `src/lib/whatsapp/formatter.ts:997-1012` os consomem.

- [ ] Passo 1: teste que falha — `montarTrechoDeSaida({ texto: "Me passa seu CPF?" })` devolve o texto **sem** aviso injetado.
- [ ] Passo 2: `pnpm vitest run src/lib/agent/pi/lgpd.test.ts` e ver falhar.
- [ ] Passo 3: implementar o mínimo — apagar `turno-livre.ts:194-198`, `avisoDado` de `:1142`/`:1175`, `garanteAvisoLgpd` e `ResultadoDoAviso`; tirar `dado-sem-aviso` da união e do corpo de `avaliarConversa`; reescrever `jornada-rubric.ts:189-193` para o passo 2 não tratar o aviso como passo de aprovação (a nota D1 continua válida para a **ordem da coleta**, não para o aviso).
- [ ] Passo 4: ver passar `lgpd.test.ts` + `eval/golden.test.ts` + `pnpm -s typecheck`.
- [ ] Passo 5: commit `fix(agent): stop rewriting the balloon to inject the LGPD notice`.

**O que NÃO sai (ponto que o validador vai abrir):** o portão de consentimento da tool fica — `resolverAceiteLgpd` em `src/lib/agent/pi/tools-livres.ts:839-855` recusa `fazer_proposta` com `aviso-nao-dado`, `falta-o-aceite` ou `aceite-revogado`. Enquanto existir, o aviso continua **funcionalmente necessário** para a proposta sair; a skill `src/lib/agent/pi/skills/proposta-com-dados-do-cliente/SKILL.md:7` e o texto injetado no card do WhatsApp (`formatter.ts:999-1012`) são o que produz o aviso. Vigiado por `lgpd.test.ts:133-139` e `src/lib/agent/pi/skills/skills.test.ts:37`. É a `Q1`.

#### Task 1b: P6 na web — o card que salva o lead

**Files:**
- Modify: `scripts/qa/medidor-duplicidade.sql` — perguntas Q6..Q9 do funil web do telefone (`whatsapp_optin` por conversa, `lead_form` por conversa, `leads.phone` preenchido, ordem entre o primeiro balão que pede o número e o card)
- Modify condicional: `src/lib/agent/pi/cards-livres.ts:796-803` (`whatsapp_optin`) e/ou `src/components/chat/artifacts/whatsapp-optin.tsx:47-48` — **só depois de medir**
- Test: `src/lib/agent/pi/cards-livres.test.ts`

**Interfaces:** Consome `ctx.telefoneMascarado` (`cards-livres.ts:407`). Produz `WhatsappOptinPayload { conversationId?, knownPhone? }` (`src/lib/chat/types.ts:255-260`): com `knownPhone` o card é confirmação de clique (`whatsapp-optin.tsx:97`); sem `knownPhone` abre input de coleta (`whatsapp-optin.tsx:48`, `showConfirm = !!knownPhone && !collectMode`).

- [ ] Passo 1: rodar as perguntas novas contra `aja_agora_ws_develop` e colar. Números da rodada (medidos pelo orquestrador; **li o SQL, não executei, não confirmei os valores**): `whatsapp_optin` em **21 de 346** conversas web; telefone **antes** do card em 21, **depois** em 0; `lead_form` em **0**; telefone existe em **73/346**.
- [ ] Passo 2: pela matriz definir o que "P6 cumprido" quer dizer na web — `Q4`.
- [ ] Passo 3: só então mexer. Se a decisão for "o agente pede o número no balão e o card só confirma", **nenhum código muda**: muda `src/lib/agent/prompt-do-vendedor.ts` e a régua passa a medir `leads.phone` (`src/db/schema.ts:507`).
- [ ] Passo 4: `pnpm -s typecheck` + `pnpm vitest run src/lib/agent/pi/cards-livres.test.ts`.
- [ ] Passo 5: commit `fix(web): make the whatsapp opt-in card carry the lead phone`, ou `docs(prompt): …` se a mudança for só de conduta.

#### Task 1c: P3 na régua — a frase de rendição

**Files:**
- Modify: **nada em código**, salvo se a medição achar a frase. Instrução-fonte: `src/lib/agent/prompt-do-vendedor.ts:73` ("Se não for o momento da pessoa, deixe a porta aberta sem insistir.") — conferi, é a linha 73.
- Modify: `scripts/qa/medidor-duplicidade.sql` — pergunta nova que procura fala de rendição em `messages.content` de `role = 'assistant'`.

- [ ] Passo 1: rodar e colar. Medido na rodada: **0 falas** de rendição (**não executei, não confirmei**).
- [ ] Passo 2: com 0 falas não há código a mudar — P3 vira critério medido (`P-xx`), não correção; no diário `NÃO MEDIDO EM RODADA` até a rodada do bloco 5 contar as conversas que morreram sem retomada.
- [ ] Passo 3: se a linha 73 for lida pelo modelo como "desista", a correção é de conduta, na ordem de causa do bloco 5, com `pnpm prompts:check` no gate.

---

### Bloco 2 — Matriz de critérios em fonte única

**Gate:** todo id cita o medidor (arquivo, sonda ou regra do `golden.ts`) ou está `NOVO`. Critério sem as duas opções reprova o bloco.

#### Task 2a: `docs/qa/criterios-do-chat.md`

**Files:** Create `docs/qa/criterios-do-chat.md`

**Interfaces:** Consome as premissas P1–P7 de `AGENTS.md`. Produz a tabela que os blocos 3, 4 e 5 citam, com cinco famílias — `CAMINHO P-xx`, `FALA C-xx`, `DUPLICIDADE D-xx`, `FLUIDEZ F-xx`, `PRODUTO R-xx` — e quatro colunas: **(a)** o que o cliente vê, **(b)** como se mede (`determinístico: <arquivo:regra>` ou `juiz: <arquivo/sonda>`), **(c)** o não-pode, **(d)** premissa P1–P7 e canal (`web` / `whatsapp` / ambos).

- [ ] Passo 1: escrever as cinco famílias com numeração fechada. Mínimo: `D-01` pedido repetido por slot, `D-02` dado no texto e no card do mesmo turno, `D-03` dado repetido em dois turnos — as três apontam para `src/lib/agent/pi/eval/golden.ts` (bloco 3).
- [ ] Passo 2: cada `FALA C-xx` sem medidor sai `NOVO` com a sonda proposta — nunca "ok".
- [ ] Passo 3: P1–P7 aparecem na coluna (d) de pelo menos um critério cada; premissa sem critério fica `(em aberto)`.
- [ ] Passo 4: commit `docs(qa): add the chat criteria matrix with a measurement per id`.

#### Task 2b: `docs/qa/matriz-do-caminho.md` e `docs/qa/roteiro-de-venda.md`

**Files:** Create `docs/qa/matriz-do-caminho.md`, Create `docs/qa/roteiro-de-venda.md`

**Interfaces:** `matriz-do-caminho.md` produz a matriz canal × degrau (primeira fala → qualificação → reveal → escolha → identidade → proposta → `contractClosed`) com o artifact esperado em cada degrau nos dois canais; é o que os `expectArtifacts` do bloco 4 citam. `roteiro-de-venda.md` é o texto do vendedor difícil que os 12 cenários encenam — escrito do zero, não herdado de relatório.

- [ ] Passo 1: extrair os degraus do código, não de doc: `ArtifactType` em `src/lib/chat/types.ts:478-500`, `contractClosed` em `conversations.metadata` (`src/db/schema.ts:412`), terminal em `src/lib/whatsapp/interactive-handlers.ts:211-246`.
- [ ] Passo 2: escrever os dois arquivos; cada degrau cita o artifact literal que o `pnpm eval` cobra.
- [ ] Passo 3: commit `docs(qa): add the path matrix and the sales script`.

**Divergência registrada:** `padrao-de-docs` não tem `docs/qa/` no mapa canônico (QA efêmero em `.processo/qa/`, comportamento durável em `docs/jornadas/`). O mandato crava `docs/qa/`; sigo o mandato e registro (`Q3`).

---

### Bloco 3 — Medidor de duplicidade de CONTEÚDO

**Gate:** `pnpm vitest run src/lib/agent/pi/eval/` + `pnpm -s typecheck` verdes, com a contagem do fixture nos dois lados (4 achados com defeito, 0 sem defeito) colada no diário.

#### Task 3a: `pedido-repetido` por slot

**Files:** Modify `src/lib/agent/pi/eval/golden.ts`; Test `src/lib/agent/pi/eval/golden.test.ts`

**Interfaces:** Consome `TurnoDeConversa { role, content, cards, valores? }` (`golden.ts:15-23`) e `agruparEmTurnos` (`golden.ts:96-115`). Produz `"pedido-repetido"` na união `Achado.regra` (`:26-31`) e `slotsPedidosNoTurno(texto: string): Slot[]`, com `type Slot = "nome" | "valor" | "parcela" | "cpf" | "tipo_de_bem" | "lance" | "aceite"` — os mesmos sete slots do Q1 do SQL (`scripts/qa/medidor-duplicidade.sql:16-24`), para as contagens serem comparáveis.

- [ ] Passo 1: teste que falha — dois balões pedindo `parcela` em turnos diferentes, com o cliente respondendo entre, acusam **1**; sem a resposta entre, acusam **0**.
- [ ] Passo 2: `pnpm vitest run src/lib/agent/pi/eval/golden.test.ts` e ver falhar.
- [ ] Passo 3: implementar o mínimo — detector de slot por balão + janela "o cliente falou entre os dois balões". Fraseado diferente não salva.
- [ ] Passo 4: ver passar.
- [ ] Passo 5: commit `feat(eval): detect repeated slot requests instead of repeated strings`.

#### Task 3b: `dado-repetido` (texto × card, e turno × turno)

**Files:** Modify `src/lib/agent/pi/eval/golden.ts`; Test `src/lib/agent/pi/eval/golden.test.ts`

**Interfaces:** Produz `"dado-repetido"` na união `Achado.regra`. Acusa (i) o mesmo dado no `content` **e** no payload do card do **mesmo turno** — reusa `valores` de `TurnoDeConversa` e `extraiNumeros` de `scripts/eval-conduta.ts:41-44`; (ii) o mesmo dado em **dois turnos** distintos do agente.

- [ ] Passo 1: teste que falha — balão "a parcela fica em R$ 733" com `comparison_table` mostrando 733 no mesmo turno acusa 1; balão que comenta o card sem repetir número acusa 0.
- [ ] Passo 2: ver falhar.
- [ ] Passo 3: implementar o mínimo.
- [ ] Passo 4: teste do **fixture completo** — conversa com defeito produz exatamente **4 achados** (2 `pedido-repetido` + 2 `dado-repetido`) e a mesma conversa sem defeito produz **0**. É o número que o gate cola no diário.
- [ ] Passo 5: commit `feat(eval): flag the same datum repeated in text and card`.

**Regra inegociável:** medida de teste, nunca guarda de runtime. Nada daqui entra em `turno-livre.ts`, `uma-pergunta.ts` ou `vazamento.ts`.

**Comparação obrigatória no diário** (rodada, corpus `aja_agora_ws_develop`, **484 conversas**; números medidos pelo orquestrador, **não executei, não confirmei**): pedido repetido por slot **472** (414 com resposta entre) em **90** conversas — `tipo_de_bem` 181, `parcela` 128, `lance` 88, `cpf` 39, `valor` 23, `nome` 13; dado no texto **e** no card do mesmo turno **28 turnos / 41 números / 24 conversas**; dado repetido em ≥2 turnos **470 / 80 conversas**; CPF em claro na fala **0**; o medidor de string acha **46 em 27 conversas**. Se o medidor TS divergir do SQL, registra-se a divergência e o SQL manda até se prove o contrário.

---

### Bloco 4 — 12 leads difíceis + camada de caminho nos dois canais

**Gate:** `pnpm eval -- --only <cenário>` verde **por cenário** — `--only` casa o campo `cenario` do JSON, não o nome do arquivo (`scripts/eval-run.ts:186-188`) — e `pnpm eval` completo sem `skip-env`. **Pulado nunca é verde**: a contagem de `SKIPPED` vai colada no diário.

#### Task 4a: os 12 cenários

**Files:** Create `scripts/eval/golden/golden-dificil-<slug>.json` × 12; Modify `scripts/eval-run.ts` (campo `canal`, Task 4b)

**Interfaces:** Consome o formato em uso (`scripts/eval/golden/golden-pede-humano.json`): `{ cenario, descricao, caRefs, requiresEnv?, turns[], asserts }`, `turns[]` de `{ type: "text" | "action", text?, action?, label?, repeat? }`, `asserts.turns[]` de `GoldenTurnAsserts` (`src/lib/eval/golden-asserts.ts:60-95`: `expectArtifacts`, `forbidArtifacts`, `forbidDuplicateOffers`, `minCreditValue`, `forbidRepeatedAgentText`, `forbidUngroundedMoney`, `recommendationMustMinimize`) mais `GoldenExpectations.maxConsecutiveSameGate` (`:107`).

- [ ] Passo 1: escrever os 12, um arquivo por cenário, `cenario` = `golden-dificil-<slug>`: `muda-de-assunto-duas-vezes-e-volta-ao-valor`, `sei-la-a-tudo`, `preco-tres-vezes-com-palavras-diferentes`, `pede-humano-no-turno-2`, `cpf-errado`, `e-se-eu-nao-for-contemplado-duas-vezes`, `some-e-volta`, `pergunta-se-e-golpe`, `tudo-numa-frase-so`, `grupo-novo-versus-em-andamento`, `quer-lance`, `nao-entendi-duas-vezes`.
- [ ] Passo 2: cada um cita na matriz o critério que exercita; cenário que não cita critério é descartado.
- [ ] Passo 3: `pnpm eval -- --only golden-dificil-<slug>` por cenário, com `EVAL_VERBOSE=1` para colar a trajetória (`scripts/eval-run.ts:253-260`).
- [ ] Passo 4: commit por lote de 3–4 cenários: `test(eval): add hard-lead scenarios for the chat criteria`.

**Armadilha registrada:** `scripts/eval/golden-v2/` tem 15 cenários que **nenhum runner lê** — `GOLDEN_DIR` em `scripts/eval-run.ts:38` aponta só para `scripts/eval/golden/` e não há consumer de `golden-v2`. Os 12 novos vão em `scripts/eval/golden/`. O destino do set é a `Q5`.

#### Task 4b: camada de caminho até `contractClosed`, nos dois canais

**Files:** Modify `scripts/eval-run.ts:88-108` (a sessão de simulador é fixa `channel: "web"` na linha `:104`; precisa do `canal` do cenário); Create `scripts/eval/prova-caminho.ts`; Create `scripts/qa/prova-caminho.sql`; Reaproveitar `scripts/qa/talk.mjs` (SSE web) e `scripts/qa/wa-talk.mjs` (simulador WhatsApp, `--new`, `--btn`).

**Interfaces:** `prova-caminho.ts` consome `{ conversationId, canal }` e produz `provarCaminho(conversationId: string): Promise<Achado[]>` — `Achado` de `golden.ts:25-32` — lidos do banco: `contractClosed = true` em `conversations.metadata` (`src/db/schema.ts:412`), `leads.phone` preenchido (`src/db/schema.ts:507`), `bevi_proposals.lead_id = leads.id` (`src/db/schema.ts:601-607`), CPF em claro na fala = 0, fala mascarada, uma pergunta por balão.

- [ ] Passo 1: escrever `prova-caminho.sql` com as cinco perguntas e rodar contra uma conversa que já fechou no dev; colar.
- [ ] Passo 2: escrever `prova-caminho.ts` chamando o `Achado` do `golden.ts` — placar um só.
- [ ] Passo 3: ligar no runner: campo `canal`, `channel` em `createSimulatedConversation`, `provarCaminho` depois do último turno.
- [ ] Passo 4: rodar um cenário web e um WhatsApp até `contractClosed` e colar as duas provas (SQL + `--only`).
- [ ] Passo 5: commit `feat(eval): prove the closed path in both channels by SQL`.

**Bloqueio real:** `E2E_TEST_CPF` e `E2E_TEST_CELULAR` estão vazias em `.env.example:272-273` e **não definidas** em `.env.local` nem `.env` desta worktree (grep). Todo cenário que fecha com CPF é `SKIPPED` (`src/lib/eval/env-do-cenario.ts:36-45`). `startContract` dispara consulta de bureau real: mock em runtime é proibido (`src/lib/bevi/fulfillment.ts:9`) e o CPF da vitrine é recusado (`fulfillment.ts:136`). É a `Q2`.

---

### Bloco 5 — Rodadas até zerar

**Gate:** duas rodadas consecutivas com **0 achado**, cada uma com sha + `AI_MODEL` + versão/label da caixa na mesma linha do diário. Teto: **3 ondas** de correção e **até 5 rodadas**. Estourou o teto com achado sobrando: pare, reporte e abra `PENDENTE-KAIRO` — rodada seis não existe.

#### Task 5a: a rodada

- [ ] Passo 1: `pnpm eval` completo. O runner grava `.eval/relatorio-gate-<sha>-<ts>.json` com `sha`, `aiModel` e `labelDaCaixa` (`scripts/eval-run.ts:271-291`).
- [ ] Passo 2: `pnpm tsx scripts/eval-conduta.ts --db` — as 10 conversas mais recentes do dev (`scripts/eval-conduta.ts:46-60`), o mesmo escopo do Q5 do `medidor-duplicidade.sql`.
- [ ] Passo 3: `docker exec aja-shared-pg psql -U postgres -d aja_agora_ws_develop -f scripts/qa/medidor-duplicidade.sql` e colar a saída inteira — é a régua de conteúdo, não o placar do `golden.ts`.
- [ ] Passo 4: registrar na mesma linha do diário `git rev-parse --short HEAD`, `AI_MODEL` e a versão/label da caixa (`pnpm prompts:check` imprime "Origem da caixa em uso: <origem> (versão <n>)"; tabela `caixa_de_prompt` em `src/db/schema.ts:1930`).
- [ ] Passo 5: commit `chore(qa): record round <n> of the chat criteria measurement`.

#### Task 5b: causa, na ordem

- [ ] Passo 1: para cada achado, a causa na ordem — **código** (o servidor tem um fato que a fala contradiz) → **texto de conduta** (`src/lib/agent/prompt-do-vendedor.ts`) → **`PENDENTE-KAIRO`** (decisão de produto). Nunca pular para a terceira.
- [ ] Passo 2: correção de código volta ao gate do bloco 1 ou 3; correção de conduta roda `pnpm prompts:check` e, se publicar versão na caixa, o gate de promoção é `pnpm eval` verde.
- [ ] Passo 3: produção só com as três condições — (i) duas rodadas consecutivas com 0 achado, (ii) `pnpm eval` sem `skip-env`, (iii) rollback escrito antes no diário — e mesmo assim pede GO do Kairo.

---

## Definição de pronto

- [ ] `garanteAvisoLgpd` não existe mais e `turno-livre.ts:194-198` não reescreve balão; mascaramento (`:125-151`) e cifra (`cards-livres.ts:776-793`) seguem lá, com teste passando.
- [ ] `dado-sem-aviso` não existe mais em `golden.ts` nem como passo de aprovação em `jornada-rubric.ts:189-193`.
- [ ] `docs/qa/criterios-do-chat.md` existe com as cinco famílias (`P-xx`, `C-xx`, `D-xx`, `F-xx`, `R-xx`) e as quatro colunas; `matriz-do-caminho.md` e `roteiro-de-venda.md` escritos do zero.
- [ ] Cada id da matriz cita o medidor (`arquivo:regra` ou sonda) ou está `NOVO`. Nenhum id sem as duas opções.
- [ ] `pedido-repetido` e `dado-repetido` existem em `golden.ts`; o fixture com defeito devolve **4** achados e sem defeito **0**, nos dois sentidos provados por teste.
- [ ] Os 12 cenários existem em `scripts/eval/golden/` e passam em `pnpm eval -- --only <cenario>`; `pnpm eval` completo com `0 SKIPPED`.
- [ ] A camada de caminho prova por SQL nos dois canais: `contractClosed=true`, `leads.phone` preenchido, `bevi_proposals.lead_id=leads.id`, CPF em claro na fala = 0, fala mascarada, uma pergunta por balão.
- [ ] **Duas rodadas consecutivas com 0 achado**, cada uma com sha + `AI_MODEL` + versão/label da caixa na linha do diário, e o `medidor-duplicidade.sql` colado por extenso.
- [ ] Nenhum `OK` sem número desta rodada; o que não foi medido está escrito `NÃO MEDIDO`.
- [ ] Teto respeitado: no máximo 3 ondas e 5 rodadas; se sobrar achado no teto, existe `PENDENTE-KAIRO`, não uma sexta rodada.
- [ ] Commits Conventional em inglês, sem `--no-verify`; worktree limpa; **sem push, sem PR, sem deploy**.

## Como você será avaliado

- Nota contínua: um ponto por item da Definição de pronto e um por gate de bloco (1, 2, 3, 4, 5).
- **Falha imediata:** escrever fora da RAIZ, tocar outra lane ou criar worktree (`git worktree` / `nohup`).
- **Falha imediata:** número sem SQL colado no diário; citar relatório, paper ou dossiê como prova é a falha que este plano existe para matar.
- **Falha imediata:** `OK` no lugar de `NÃO MEDIDO`.
- **Falha imediata:** cenário `SKIPPED` contado como verde, ou `pnpm eval` com `pass === 0` tratado como passou.
- **Falha imediata:** o medidor novo virar guarda de fala no runtime.
- **Falha imediata:** remover `resolverAceiteLgpd` (`tools-livres.ts:839-855`) sem decisão do Kairo registrada.
- **Falha imediata:** sexta rodada ou quarta onda.
- Se causar uma falha sem querer: pare na hora e reporte. Não conserte em silêncio.

## Comandos de validação

```bash
export AJA_BASE_URL=http://aja-chefe-criterio-do-chat.orb.local   # senão o runner fala com outro app

# Bloco 1
pnpm -s typecheck
pnpm vitest run src/lib/agent/pi/lgpd.test.ts
pnpm prompts:check

# Bloco 3
pnpm vitest run src/lib/agent/pi/eval/
pnpm -s typecheck

# Bloco 4
pnpm eval -- --only golden-dificil-quer-lance
pnpm eval                        # 0 SKIPPED, senão o gate não cobre o caminho
pnpm tsx scripts/eval/prova-caminho.ts --conv <conversationId>

# Bloco 5 — a rodada
pnpm eval
pnpm tsx scripts/eval-conduta.ts --db
docker exec aja-shared-pg psql -U postgres -d aja_agora_ws_develop -f scripts/qa/medidor-duplicidade.sql
git rev-parse --short HEAD && echo "AI_MODEL=$AI_MODEL"
```

## O que NÃO muda

- **Mascaramento e cifra de identidade:** `turno-livre.ts:125-151`, `passaFinal` (`vazamento.ts:149`), `contract_form` com `identityOnFile`/`prefilledCpfMasked` (`cards-livres.ts:776-793`). LGPD sai do **balão**, não do **encanamento**.
- **O portão de consentimento da tool:** `resolverAceiteLgpd` (`tools-livres.ts:839-855`) e o juiz `decideConfirmStage` da main. Sai com decisão do Kairo (`Q1`).
- **`AVISO_LGPD_RE` (`lgpd.ts:20`) e `PEDE_DADO_RE` (`lgpd.ts:37`):** continuam exportados — `formatter.ts:997-1012` e `lgpd.ts:236` os consomem.
- **Uma pergunta por balão:** `manterUmaPergunta` (`uma-pergunta.ts:21`, `turno-livre.ts:215`) fica; nenhuma outra guarda entra.
- **O motor livre:** `runTurnLivre` (`turno-livre.ts`). Não volta gate, fila de pergunta nem card escolhido pelo código — o funil em código morreu em 20/10/2026.
- **Cards escolhidos pelo modelo:** `ArtifactType` (`src/lib/chat/types.ts:478-500`), payload em `cards-livres.ts`. Este plano não acrescenta tipo de card.
- **As outras regras do avaliador:** `pergunta-repetida`, `pergunta-fechada-sem-chip`, `contexto-nao-dito` e `card-relistado` ficam; só `dado-sem-aviso` sai.
- **Os asserts de trajetória** (`golden-asserts.ts:60-95`) e a regra da casa: assert de prosa não existe, qualidade de fala é do juiz.
- **A régua de teste:** pontual, ao lado do arquivo tocado, + `pnpm -s typecheck`. A suíte inteira continua removida.
- **Schema e canal:** nenhuma migration nova; `leads`, `bevi_proposals` e `conversations.metadata` lidos como estão.
- **Nada vai para produção neste plano:** sem push, sem PR, sem deploy.

## Perguntas em aberto

- **Q1 — o portão de consentimento da tool fica?** `resolverAceiteLgpd` (`tools-livres.ts:839-855`) recusa `fazer_proposta` sem aviso + aceite. Se ficar, o aviso continua obrigatório na conversa e o bloco 1 só tira a reescrita do balão e a métrica; se sair, saem junto o texto injetado no card (`formatter.ts:999-1012`), a instrução da skill (`proposta-com-dados-do-cliente/SKILL.md:7`) e os testes `lgpd.test.ts:133-139` / `skills.test.ts:37`. Proponho: **fica** (é portão de consulta de bureau, não de fala) e o aviso deixa de ser medido como passo de aprovação. Fecha?
- **Q2 — com que CPF e telefone o caminho fecha?** `E2E_TEST_CPF`/`E2E_TEST_CELULAR` vazias nesta worktree e `startContract` faz consulta de bureau real (mock proibido, CPF da vitrine recusado). Preciso de identidade homologada na Bevi para o dev, pelo vault (nunca em `.md`), ou da autorização para a camada de caminho parar **antes** de `startContract` e medir `contractClosed` só em conversa real do banco. Proponho: identidade homologada no vault; sem ela o item fica `NÃO MEDIDO`.
- **Q3 — `docs/qa/` é o lugar?** O mandato crava `docs/qa/`; `padrao-de-docs` não tem essa pasta no mapa. Proponho: matriz em `docs/qa/`, diários de rodada em `.processo/qa/`.
- **Q4 — o que conta como "P6 cumprido" na web?** Medido: `whatsapp_optin` em 21/346, telefone antes do card em 21, `lead_form` em 0, telefone em 73/346. Aceitação é (a) `leads.phone` preenchido em toda conversa web que chegou ao reveal, (b) o card sempre com input quando o número é desconhecido, ou (c) o agente pede o número no balão e o card só confirma? Proponho: (a) como régua e (c) como conduta, sem código novo.
- **Q5 — o que fazer com `scripts/eval/golden-v2/`?** 15 cenários que nenhum runner lê. Proponho: migrar os que ainda valem para `scripts/eval/golden/` no mesmo trabalho e apagar o diretório; set morto dá impressão de cobertura.
- **Q6 — "zero achado" é de qual medidor?** Zero em `pnpm eval` + `eval-conduta --db` (regras do `golden.ts`), ou zero também no `medidor-duplicidade.sql` (472 achados por slot hoje)? Proponho: zero nos dois, com o SQL como régua final — isso define quantas rodadas o teto de 5 comporta.
- **Q7 — repetição de slot é sempre defeito?** O cliente que pergunta o preço três vezes faz o agente reaparecer com `valor`. Preciso do "não-pode" do dono para a família `D-xx`. Proponho: acusar só quando o balão pede o slot e o cliente já tinha respondido aquele slot sem pedir de novo.
- **Q8 — o app sob teste está de pé?** Não confirmei `http://aja-chefe-criterio-do-chat.orb.local` (não rodei comando). Se não estiver, os blocos 4 e 5 não começam. Proponho: subir pelo fluxo do Orca/local-dev antes de fechar o bloco 1.
