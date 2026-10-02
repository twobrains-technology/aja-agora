# Correções da frente Aja Agora — A/B do telefone, assertividade do agente, régua web e painel — Plano de implementação

**Goal:** o teste A/B do telefone fica **limpo para a Bruna ler com verba escalada**: divisão 50/50 de verdade, nada
da oferta aparece antes do telefone (nem na fala, nem em card), o B mostra o borrão sem janela legível. O agente
para de errar pelos três motivos medidos em produção: analyzer dependente de crédito da Anthropic, números do card
vindos da cabeça do modelo, retomada cobrando o gate errado. A régua passa a alcançar o lead da web, e a Performance
obedece ao período.
**Arquitetura:** tudo é **estado/código ancorado em fato do servidor**. A fonte única do desbloqueio é
`leituraDoDesbloqueio` (`src/lib/chat/telefone-ab-do-servidor.ts:79`). O modelo deixa de **receber** número de
oferta enquanto o telefone não chegou, em vez de ter a fala vigiada. O card desenha números que vêm do resultado da
tool, não do argumento do modelo. O analyzer usa o **mesmo modelo do agente** (`AI_MODEL`) pelo gateway LiteLLM.
A fila do A/B é um contador atômico no Postgres. Nenhuma frase nova fixa para o cliente: fala é do modelo, e texto
de cliente entra por cadastro/prompt.
**Stack:** Next.js (App Router) · LangGraph (`src/lib/agent/langgraph/`) · AI SDK (`generateObject`) · Drizzle/Postgres ·
BullMQ (worker) · Vitest (unit + integração com Postgres real; `happy-dom` para componente).

Cards: **FIX-432 a FIX-440**. Inbox de origem: `docs/correcoes/inbox/2026-10-02-*.md`. Validação, números de produção
e histórico das decisões: `.orientacao/diario.md` (seção "02/10 ~13:30 — validação"). Base desta frente: branch
`kairogyn/chefe-aja-correcoes`, `BASE=9bdb2040` (= `origin/main`, o que está em produção).

## Contexto (validado em 02/10 contra o código desta worktree e contra produção)

**Atualização 02/10 ~14:3x — o degrau de 02/10 é REAL e atingiu LEAD REAL.** O dono confirmou que as 3 conversas web
de 02/10 (`7b5082a1` "Guilherme", `db26cd54` anônima, `9b30b5ac` "Fernando") são lead, não teste. Reapurado **só com
`is_simulated=false`** (43 conversas de teste marcadas pelo dono): haiku **0,93** (141/151) · qwen antes do A/B **0,87**
(127/146) · qwen+A/B até 01/10 **0,78** (7/9 — quase todo o tráfego desses dias era teste) · **02/10 0,56 (9/16), p=0,005
contra o qwen antes do A/B.** Os 7 turnos que falharam, um a um (Langfuse prod, entrada e saída de cada geração):
- **Analyzer descartado:** nos 7, o analyzer respondeu sem erro e certo (categoria, valor do bem 210–220 mil, intenção).
  Ele não mudou (haiku fixo pela env desde antes de 20/09), nada foi deployado entre 30/09 14:54 e 02/10, e em 01/10 ele
  teve 29/50 erros com condução 0,94.
- **Braço B com contexto que mente (3 turnos — `db26cd54` 10:57:31, 11:04:40, e o cliente repetindo "Carrro de 220 mil
  reais"):** "as opções já estão na sua tela / dá uma olhada nas parcelas", com tudo borrado → **B1**.
- **qwen só com tool, sem texto, e com número inventado no card (2 turnos — `db26cd54` 11:05:20, 11:07:15)** → o número,
  **B5**; o turno sem fala continua sendo comportamento do modelo.
- **qwen fechando sem pergunta (2 turnos — `7b5082a1` 11:02:55, 772 caracteres sobre lance sem convite;
  `9b30b5ac` 11:09:05, fechamento "Show" e a pergunta sem "?"; `db26cd54` 11:03:16, fechamento sem pergunta no reveal).
  Em 10:57:31 o qwen chamou `search_groups`, tool que não existe no grafo.**
- ⇒ O que este PRD conserta (B1, B5) cobre o braço B e o número. **A qualidade de fala do qwen não é código:** é a decisão
  do `AI_MODEL` (`PENDENTE-KAIRO` nº 1, com estes números).

**Degradação: o que os dados dizem.** Condução entregue (`conducao_entregue`, Langfuse prod) por era:
haiku até 20/09 22h **0,904** (151/167) · qwen antes do A/B **0,869** (133/153, p=0,38) · qwen com A/B (29/09 23h15
→ 01/10) **0,919** (57/62) · 02/10 **0,56** (9/16, concentrado em 2 conversas). **O A/B não faz degrau na condução.**
O que de fato quebrou:

1. **01/10 10:50–11:52, durante a call:** o turn-analyzer (`claude-haiku-4-5` via LiteLLM) levou **29× HTTP 400 "Your
   credit balance is too low to access the Anthropic API"** (CloudWatch `/ecs/tb/prod`; único episódio em 9 dias;
   "Available Model Group Fallbacks=None"). `turn-analyzer.ts:345` cai em neutro sem avisar → `orchestrator/analyze.ts:225-232`
   usa `parseAssetValue(text)` → "Entre R$ 800 e R$ 1.200" (resposta a "quanto você pretende pagar por mês?") virou
   `creditMin=creditMax=800` (`0e5d777a`, 11:47:38 — o minuto exato do "ele não deveria terminar o valor do bem").
   "Consigo pagar R$ 680/mês" não foi capturado como parcela, e o agente perguntou de novo.
2. **O card mostra número inventado:** `converse.ts:1446` usa o **input do modelo** como payload do card. Em `db26cd54`
   (02/10 11:05) a tool `compare_with_financing` devolveu financiamento R$ 5.678,45/mês (Δ R$ 11,68), e o qwen passou ao
   `present_financing_comparison` **R$ 6.071 e Δ R$ 404,23**.
3. **A oferta vaza na FALA antes do telefone, nos dois braços:** `7b5082a1` (A, 10:55:35, antes do telefone das 10:59):
   "Banco do Brasil… R$ 3.484 em 197 meses…"; `3a08bf32` (B, 01/10 11:46:37): "ITAÚ, carta de R$ 81.973, parcela de
   R$ 1.993". Os números entram no **contexto** do modelo sem condição de braço/telefone (`converse.ts:821-844`,
   `contexto-da-tela.ts:62-75` e `:289-307`, `converse.ts:955-963`), e as instruções dizem que os cards "JÁ estão na tela"
   (`converse.ts:1106-1108`, `:1765`). No B, isso faz o agente mandar o cliente "olhar as parcelas" que estão borradas
   (`db26cd54`: o cliente pediu "me mostre novamente as parcelas" três vezes).
4. **A retomada cobra o gate errado:** as "perguntas repetidas 3×" de 30/09 (`576e5b66` 12:16–12:22, `ef18fd09` 14:45–14:51)
   são o watchdog `gate-reengage`, com o cliente parado no card do telefone. Ele cobra o gate `credit` ("valor do bem")
   com a escada fixa (`gate-reengage.ts:177-186`, `gate-questions.ts:212`), mas o bloqueio real era o telefone.
   `pendingGateAfterTurn` (`gate-reengage.ts:70-83`) não conhece o desbloqueio.
5. Modelo do agente: `AI_MODEL=qwen3.8-flash` desde 20/09 ~22h30 (decisão do dono). O runtime LangGraph manda modelo
   não-Anthropic pelo `ChatAnthropic` (`langgraph/provider.ts`), justamente o caminho que `model-provider.test.ts` documenta
   como quebrado para `tool_choice`. Hipótese **não provada** para o turno truncado da `9b30b5ac` ("Beleza, essa é a sim",
   8 tokens, sem a tool exigida). **Fora desta onda** (ver Riscos).

**Cards de 01–02/10:**

- **A/B:** a atribuição é `FNV-1a(visitId) % 2` (`variante-da-visita.ts:62-94`). É uma moeda honesta, mas sem fila: dá
  para cair 4 vezes seguidas no mesmo braço.
  - **4 de 25 conversas web pós-FIX-403 estão sem braço** (`1758757e`, `d108a748`, `cc4f3bac`, `9b30b5ac`). Todas
    começaram pelo clique de categoria na home ("Automóvel"/"Imóvel"); todas têm `navigationStack`/`personasSeen`/
    `previousPersona` (caminho da troca de persona); e `persistMeta` grava o metadata inteiro, então o último a escrever
    ganha (`src/lib/conversation/meta.ts:11-19`). Ficam fora da leitura do teste.
  - O `?variante=` forçado grava como braço real, sem marca (`route.ts:351-365`).
  - `route.ts:361` apaga `desbloqueadoEm`/`recusado`.
- **B demora e vaza:** a ordem é busca → fala 1 → pausas → cards → fala 2 → card do telefone só no fim do turno
  (`adapter.ts:653-672`). Até lá os cards do B ficam **legíveis** (`chat-message.tsx:108-130`). Além disso,
  `present_simulation_result` e `present_group_card` não estão em nenhuma lista de trava (`adapter.ts:385`, `chat-message.tsx:107-123`).
- **Régua web nunca funcionou:** desde 18/09, **119 conversas web, 1 com `last_inbound_at`, zero na régua** (WhatsApp:
  6, das quais 5 na régua). A web nunca grava `last_inbound_at`, então cai em "ainda_em_silencio"
  (`motivo-de-exclusao.ts:238`). O lead 774 é `594e8850`/`e9a56c73`. As envs estão certas nas duas task definitions.
  O teste da entrada web é falso-verde: a fixture grava `lastInboundAt` para web (`remarketing-cycle.integration.test.ts:75-80`).
- **Performance:** só "Parados há mais de 24h (N)" ignora o período (`handoff-queries.ts:287, 333-337, 358-392`). O fetch
  da página não descarta resposta atrasada (`page.tsx:62-85`).
- **"Carro popular":** vem do modelo. Em produção o próprio atalho dele ofereceu "Um popular novo" (`8b64899b`).
  Nenhuma fonte de runtime tem o termo.
- **Teste já vermelho na base:** `src/lib/admin/handoff-queries.integration.test.ts` › "estágio sem saída registrada não
  vira tempo zero" (`qualificado: expected 0 to be greater than 0`), medido em `9bdb2040`.

## Decisões (implementar, não rediscutir)

| # | Decisão |
|---|---|
| D1 | **Sem telefone, sem número — nos dois braços.** Com `leituraDoDesbloqueio(...).estado` ∈ {`pede-antes`, `borrado`} (canal web), o modelo **não recebe** carta, parcela, prazo, taxa, contemplações nem lance da oferta: nem nos blocos de contexto, nem por tool de número. No lugar, recebe o fato verdadeiro: as opções já foram buscadas e aparecem quando o cliente informar o WhatsApp no card (no B, embaçadas), e ele não tem os valores agora. Fonte: o combinado da Bruna (11:39:05, "mostra a borrada e só desbloqueia quando der o telefone") e a doc `desbloqueio-do-telefone.ts:10-11` ("sem valor legível"). Quando o telefone chega, o turno seguinte volta a receber tudo. **Guard de regex sobre a fala: proibido** (CLAUDE.md). |
| D2 | **Todo card que revela número de oferta obedece à trava**, com uma lista única exportada de `desbloqueio-do-telefone.ts` e lida por servidor e cliente: `comparison_table`, `recommendation_card`, `simulation_result`, `group_card`, `financing_comparison`, `scenarios`. No A fica retido; no B fica borrado. |
| D3 | **B sem janela legível:** o card do telefone sai **junto do primeiro card de oferta**, como o A já faz (`adapter.ts:483-494`). Nada de placeholder nem copy nova: a copy do card é do dono. |
| D4 | **Fila do A/B:** alternância estrita A, B, A, B por **conversa web nova**, via contador atômico no Postgres por experimento (`UPDATE … SET proximo = proximo + 1 RETURNING`). Todo caminho de criação web grava o braço (inclusive o clique de categoria), e nenhum writer posterior pode apagá-lo. O `?variante=` continua forçando, **não consome a fila**, grava `forcada: true` e fica **fora do teste**: o resultado (`resultado-do-teste-do-telefone.ts`) e o filtro do painel (`filtro-variante.ts`) tratam a conversa como "sem variante". Conversa já com braço mantém o braço. |
| D5 | **Analyzer = o modelo padrão do projeto.** O turn-analyzer deixa de ter modelo próprio fixo e herda o padrão: **`AI_ANALYZER_MODEL ?? AI_MODEL ?? default do projeto`** (cada um com `?.trim() ||`), lido num ponto só, `modeloDoAnalisador()` em `src/lib/llm/model-provider.ts`, com teste da precedência. O `AI_ANALYZER_MODEL` fica como **override opcional**, não como modelo próprio: ausente, o analyzer roda no `AI_MODEL` (hoje `qwen3.8-flash`). A rota segue a regra que o código já usa (`isNativeAnthropicModel`): `claude-*` vai pelo provider Anthropic do gateway; o resto pelo cliente OpenAI-compatível do gateway (`createGatewayOpenAI`, `/v1/chat/completions`). Ordens do dono, 02/10: "ajusta isso já para ficar homogêneo" e a direção das 12:5x (precedência + `PENDENTE-KAIRO` de produção). **Em produção nada muda até tirar `AI_ANALYZER_MODEL=claude-haiku-4-5` da `environment` das task definitions `aja-agora-prod` e `aja-agora-worker-prod`** (a env vence): comando exato no `PENDENTE-KAIRO`. Fato medido em 02/10: o `AI_MODEL` **chega** ao container pelo bloco `secrets` (`valueFrom` do secret `tb/prod/aja-agora/env`, `qwen3.8-flash`); o agente NÃO roda no default `claude-sonnet-5`. |
| D6 | **Analyzer fora do ar não troca parcela por valor do bem.** O fallback neutro passa a carregar `indisponivel: true`. Nesse modo: (a) texto com marcador mensal (`MONTHLY_MARKER` de `parse-asset-value.ts`) vira `parcelaAlvo`/`alvoDeBusca="parcela"` pelo parser determinístico, nunca `creditMax`; (b) valor parseado abaixo de `CREDIT_BOUNDS[categoria].min` não vira valor do bem. Sinal determinístico: score `analisador_indisponivel` (BOOLEAN) em todo turno de cliente, no mesmo trace do `conducao_entregue`. |
| D7 | **Número do card vem da tool.** Para `financing_comparison`, `simulation_result` e `scenarios`, o payload numérico sai do **resultado mais recente da tool de origem** (`compare_with_financing`, `simulate_quota`, `compute_scenarios`) no histórico de mensagens do grafo, para o mesmo grupo/carta. O argumento do modelo só fornece chave (categoria, groupId). Sem resultado de origem, o card **não sai** e fica um log `[card-sem-fonte]`. |
| D8 | **Retomada não cobra gate com desbloqueio pendente.** `pendingGateAfterTurn` recebe o estado do desbloqueio: com `pede-antes`/`borrado` não arma gate de coleta. O worker `gate-reengage-poll` confere de novo antes de enviar e consome o marcador sem mandar nada. O lembrete do telefone **não** ganha texto novo nesta onda (copy é do dono: `PENDENTE-KAIRO`). |
| D9 | **Régua web:** "silêncio do cliente" e "janela de 24h da Meta" viram dois fatos separados. Para conversa web, o silêncio conta da **última mensagem do cliente** (`messages.role='user'`); `last_inbound_at` segue só do WhatsApp e continua governando a janela de texto livre, e por isso conversa web vai sempre por template. Tela (`motivo-fora-da-regua.ts`) e worker usam a mesma função. A ordenação de candidatos não pode jogar a web para o fim (`NULLS LAST` + limite). |
| D10 | **Performance:** "Parados há mais de 24h" passa a ser a população **do período** (leads criados no período e parados há mais de 24h), com rótulo escrito dizendo isso. A lista global ("todos os períodos") vai para `/admin/remarketing`, como bloco próprio, atendendo ao "uma só de remarketing" do dono. O fetch da Performance descarta resposta atrasada, no padrão de `teste-do-telefone.tsx:119-145`. |
| D12 | **Toque da régua: carimbo honesto e visível** (card `2026-10-02-regua-carimba-toque-e-a-meta-recusa`, ordem do dono de 02/10). (a) O carimbo continua **antes** do envio (carimbar só depois do `wamid` abre envio duplicado e irreversível se o processo cair no meio), mas com **compensação**: falha síncrona (`resolveAndSend` sem `messageId` ou com `error`) restaura step/`ultimo_toque_em`/`touches_30d` com `WHERE ultimo_toque_em = $agora` e empurra `next_touch_at` para um backoff; o `wamid` do sucesso fica em `remarketing_touches.ultimo_wamid`; o webhook de status `failed` devolve a cota de forma **idempotente** pelo `wamid`. (b) Códigos da Meta: **131049** devolve a cota e reagenda com backoff de dias; **131050/131026** encerram a régua (`motivo_saida`); demais falhas, compensação + backoff. (c) **O toque por template vira mensagem do assistente em `messages`** (`template_name` + texto renderizado), para o painel e o agente enxergarem o que foi enviado (hoje a "ausência de fala" é o sinal de template, `remarketing-queries.ts:258-259`). (d) O painel volta a enxergar os toques: o `LIKE 'remarketing_oportunidade_%'` (`remarketing-queries.ts:290`) não casa as chaves reais `remarketing_<fase>_*`. **Fora:** a régua não manda texto livre fora da janela (provado no código) e os dois 131047 de 02/10 vieram de outro remetente. |
| D11 | **Vocabulário por prompt:** uma linha na seção "## Tom e Personalidade" do `SYSTEM_PROMPT` (`system-prompt.ts:14-25`, fora do trecho que o `leanSystemPrompt` corta): carro se diz "carro novo" e "seminovo" (sem hífen), nunca "carro popular"/"popular", inclusive nos atalhos. Publicação via `pnpm sync-prompts` = `PENDENTE-KAIRO`. Tabela/cadastro novo descartado: seria a 3ª fonte de verdade, e as personas já não chegam ao grafo. |

### Anti-padrões proibidos

- Regex/guard sobre a fala do agente para esconder número (D1 resolve no contexto).
- Frase nova fixa para o cliente no servidor.
- Derivar braço por hash e gravar como fato.
- `persistMeta` sobrescrevendo chave que outro writer é dono.
- Teste que liga a flag/estado que produção não tem (o falso-verde da régua).
- `skip`/`.only`/`@ts-ignore`/`as any` para fechar gate.
- Suíte inteira como gate.
- Worktree nova.

## Como o enxame roda

- **Um subagente por bloco, `cwd` = esta worktree, `isolation: 'none'`.** Nenhuma worktree nova: nem por bloco, nem
  "base de integração".
- Subagentes simultâneos têm os **arquivos disjuntos** listados em cada bloco. Até 4 por vez. Quem precisar de arquivo
  de outro bloco avisa o gerente e espera a onda dele.
- **Subagente não commita.** O gerente roda o gate do bloco aqui e commita só os arquivos do bloco
  (`git add <arquivos> && HUSKY=0 git commit`). Onda assentada ⇒ `pnpm -s typecheck`.
- TDD por bloco: teste primeiro, ver falhar, corrigir, ver passar. Commit `test+fix(<área>): …` em PT-BR.

## Restrições globais

- Texto visível em **português correto** (acento, cedilha, til). Estado nunca só por cor: rótulo/ícone junto (o dono é daltônico).
- **Nenhum disparo real de WhatsApp** (mockar na borda da fila de saída); PII falsa em teste; nenhum evento novo para a Meta.
- Integração contra o banco do workspace (`.env.local` → `aja_agora_ws_develop` em `127.0.0.1:5433`). `ECONNREFUSED`/coluna
  inexistente é ambiente, nunca gate verde.
- Migration: **só** a do B3 (`drizzle/0062_*`, gerada por `pnpm db:generate`), aplicada **no banco local do workspace** com
  `pnpm db:migrate`. Em produção ela roda pelo `migrate-guard` no deploy. Nunca na mão contra RDS.
- Conventional Commits PT-BR (imperativo minúsculo, título < 72, sem ponto final), `HUSKY=0`.
- Sem deploy, push, PR, `sync-prompts` contra produção ou merge em `develop`/`main`.

## O que NÃO muda (conferido por comando — C12)

1. **Ordem do funil:** `src/lib/agent/qualify-state.ts` (`nextGate`) intocado.
2. **Bevi:** `src/lib/adapters/bevi/**` e `src/lib/bevi/**` intocados.
3. **Prompts:** em `system-prompt.ts`, só a linha de vocabulário (D11). `BASE_SYSTEM_INSTRUCTION` (`turn-analyzer.ts`) e
   `src/lib/observability/langfuse/prompts.ts` intocados.
4. **Copy do card do telefone:** os textos de `src/components/chat/artifacts/telefone-do-desbloqueio.tsx` não mudam.
5. **Âncora do filtro A/B (FIX-404 D1/D2):** a atribuição por identificação continua. Só muda que conversa `forcada`
   conta como "sem variante" (D4).
6. **Runtime do agente:** `src/lib/agent/langgraph/provider.ts` intocado nesta onda (Riscos).
7. **WhatsApp continua sem A/B.** `.github/workflows/**` intocado. `drizzle/` só ganha a `0062`.

## Contrato (cravado aqui; os blocos consomem)

- `leituraDoDesbloqueio(conversationId): Promise<LeituraDoDesbloqueio | null>`: **assinatura estável**. B1, B6 e B2 só leem.
- `CARDS_QUE_REVELAM_OFERTA: ReadonlySet<ArtifactType>` exportado de `src/lib/chat/desbloqueio-do-telefone.ts` (B2 cria).
- `modeloDoAgente(): string` (= `process.env.AI_MODEL?.trim() || "claude-sonnet-5"`) e
  `modeloAiSdkDoGateway(id: string): LanguageModel` em `src/lib/llm/model-provider.ts` (B4 cria).
- `TurnAnalysis` ganha `indisponivel?: true` (só no fallback). `NEUTRAL_FALLBACK` passa a carregá-lo (B4).
- `pendingGateAfterTurn({ …, desbloqueioPendente: boolean })` (B6).

## Ondas

| Onda | Blocos (subagentes simultâneos, arquivos disjuntos) |
|---|---|
| 1 | **B3** · **B4** · **B2** · **B7** (até 4) → depois **B8** · **B9** |
| 2 | **B1** (`converse.ts`) · **B6** (`persist.ts`, `gate-reengage*`) · **B8b** (ponteiro do e-mail do SLA) · **B9b** (tirar o nº do card do prompt) · **B4c** (precedência do modelo do analyzer), em paralelo, até 4 por vez |
| 3 | **B5** (`converse.ts` de novo, depois de B1) · **B11** (régua: carimbo compensado e toque visível), em paralelo |
| 4 | **B10** (cards e docs) |

---

### B1 · FIX-432 — sem telefone, o modelo não recebe número de oferta (D1)
**Files:** Modify `src/lib/agent/langgraph/nodes/converse.ts` (leituras do turno ~618-656; blocos 662, 701, 821-844,
955-963; instruções 1106-1108 e 1765; bind de tools ~505), `src/lib/agent/langgraph/nodes/contexto-da-tela.ts` (se os
números saírem de lá). Test: Create `src/lib/agent/langgraph/nodes/converse.desbloqueio.integration.test.ts` (no estilo de
`src/lib/agent/langgraph/testing/scenario.ts`; se o `scripted-model.ts` não guardar as mensagens recebidas, estender
**só** para gravá-las).
**Interfaces:** Consome `leituraDoDesbloqueio`. Produz o bloco de fato "opções prontas, aguardando o WhatsApp" (contexto
do modelo, não fala).
- [ ] Teste: conversa web braço **A** sem lead, turno de busca com ofertas injetadas ⇒ nenhuma mensagem de sistema do
  `converse` contém a carta, a parcela ou o prazo das ofertas injetadas; as tools de número (`simulate_quota`,
  `compare_with_financing`, `compute_scenarios`, `simulate_contemplation`, `ajustar_por_parcela`, `get_group_details`,
  `get_rates`, `present_simulation_result`, `present_group_card`, `present_comparison_table`,
  `present_financing_comparison`, `present_scenarios`) não estão no bind. O mesmo para o braço **B**. Controle: com
  telefone no lead, números e tools voltam. Ver falhar.
- [ ] Implementar; ver passar; `test+fix(agente): sem telefone o modelo não recebe número da oferta`.
**Gate:** `pnpm -s vitest run src/lib/agent/langgraph/nodes/converse.desbloqueio.integration.test.ts src/lib/agent/langgraph/nodes && pnpm -s typecheck`

### B2 · FIX-433 — trava cobre todo card com número + B sem janela legível (D2, D3)
**Files:** Modify `src/lib/chat/desbloqueio-do-telefone.ts` (lista `CARDS_QUE_REVELAM_OFERTA`), `src/lib/web/adapter.ts`
(385, 476-497, 649-672), `src/components/chat/chat-message.tsx` (107-130), `src/lib/chat/types.ts` (tirar `melhorOpcao`
se ficar órfão). Test: Create `src/lib/web/adapter.desbloqueio-b.integration.test.ts` (writer falso, banco real, padrão de
`adapter.fix-268-text-boundary.test.ts`); Modify o teste de componente do `chat-message` existente ou crie `chat-message.trava.test.tsx`.
- [ ] Teste: braço B sem lead ⇒ o card do telefone é escrito **antes** do primeiro card de oferta (hoje falha); A e B sem
  lead ⇒ `simulation_result` e `group_card` são retidos (A) ou borrados (B) como `comparison_table`; com telefone ⇒ todos livres.
- [ ] Implementar; `test+fix(chat): trava cobre todo card de oferta e o b não fica legível`.
**Gate:** `pnpm -s vitest run src/lib/web src/components/chat src/lib/chat/desbloqueio-do-telefone && pnpm -s typecheck`

### B3 · FIX-434 — fila 50/50, braço gravado em toda entrada, forçada fora do teste (D4)
**Files:** Create `src/lib/experimentos/fila.ts` + `fila.integration.test.ts`. Modify `src/db/schema.ts` (tabela
`experimento_fila`: `experimento text pk`, `proximo bigint not null default 0`) + `drizzle/0062_*.sql` + `drizzle/meta/*`
(via `pnpm db:generate`), `src/lib/chat/variante-da-visita.ts`, `src/app/api/chat/route.ts` (só o trecho de
criação/override, ~300-400), `src/lib/chat/telefone-ab-do-servidor.ts` (sem mudar a assinatura de `leituraDoDesbloqueio`),
`src/lib/chat/resultado-do-teste-do-telefone.ts`, `src/lib/admin/filtro-variante.ts`, e o writer que apaga o braço
(hipótese: troca de persona/`persistMeta` em `src/lib/conversation/meta.ts` ou `src/lib/agent/orchestrator/transition.ts`;
**se a prova apontar `src/lib/agent/langgraph/nodes/persist.ts`, avise o gerente: é do B6, na onda 2**).
- [ ] Teste 1 (integração): 2N conversas web novas criadas **em paralelo** ⇒ `|A − B| ≤ 1`, e em série alternam
  A, B, A, B. `?variante=A` ⇒ braço A com `forcada: true`, sem consumir a fila. Conversa existente mantém o braço.
  O override não apaga `desbloqueadoEm`/`recusado` (`route.ts:361`).
- [ ] Teste 2 (integração, reproduz `1758757e`): 1ª mensagem por clique de categoria ("Automóvel") com troca de persona
  ⇒ depois do turno, `telefoneDoDesbloqueio.variante` continua gravado.
- [ ] Teste 3: conversa `forcada` não entra em `resultado-do-teste-do-telefone` e cai em "sem variante" no `filtro-variante`.
- [ ] Ver falhar; implementar; `pnpm db:migrate` no banco local; ver passar; `test+fix(chat): fila do a/b e braço gravado em toda entrada`.
**Gate:** `pnpm -s vitest run src/lib/experimentos src/lib/chat/variante-da-visita.test.ts src/lib/chat/telefone-ab-do-servidor src/lib/chat/resultado-do-teste-do-telefone src/lib/admin/filtro-variante && pnpm -s typecheck`

### B4 · FIX-435 — analyzer no modelo do agente + degradação graciosa + sinal (D5, D6)
**Files:** Modify `src/lib/llm/model-provider.ts` (+ `.test.ts`), `src/lib/agent/turn-analyzer.ts` (modelo, `indisponivel`,
timeout só se a sonda mandar), `src/lib/agent/orchestrator/analyze.ts` (modo indisponível: parcela pelo marcador mensal,
piso da categoria), `src/lib/agent/parse-asset-value.ts` (parser determinístico da parcela, se não existir),
`src/lib/agent/langgraph/nodes/analyze.ts` (emitir o score), `scripts/sonda-intent-aceite.ts` (parar de ler
`AI_ANALYZER_MODEL`). Create `src/lib/observability/langfuse/analisador-scores.ts` (padrão de `conducao-scores.ts`),
`scripts/sonda-analisador.ts`. Test: `src/lib/agent/orchestrator/analyze.indisponivel.test.ts` (ou integração da área).
- [ ] Unit: `modeloAiSdkDoGateway("qwen3.8-flash").provider` é o OpenAI-compatível do gateway; `("claude-haiku-4-5")` é o
  Anthropic; `modeloDoAgente()` lê `AI_MODEL` com `?.trim() ||`. O analyzer usa `modeloDoAgente()` e nenhum código lê
  `AI_ANALYZER_MODEL` (`grep` vazio).
- [ ] Teste (reproduz `0e5d777a` e `8b64899b`), com analyzer indisponível e categoria auto: "Entre R$ 800 e R$ 1.200" ⇒
  `creditMax` indefinido; "Quero um carro. Consigo pagar R$ 680/mês." ⇒ `parcelaAlvo=680`, `alvoDeBusca="parcela"`,
  `creditMax` indefinido; "carro de 80 mil" ⇒ `creditMax=80000` (o caminho bom não regride). Com analyzer disponível,
  nada muda (casos atuais verdes).
- [ ] Score `analisador_indisponivel` emitido `true` no fallback e `false` no caminho normal (teste no padrão do de `conducao-scores`).
- [ ] `scripts/sonda-analisador.ts`: roda `analyzeTurn` sobre ≥8 frases fixas (parcela com e sem "/mês", valor do bem
  "80 mil"/"R$ 80.000", faixa, categoria, troca explícita) e imprime por caso: latência, campos e OK/FALHA contra o
  esperado, mais p50/p95. **Quem roda contra o gateway real é o chefe** (túnel); o subagente só garante que roda.
  Structured output no OpenAI-compatível: se `json_schema` estrito não passar pelo qwen, usar o modo que a sonda provar
  (registrar no diário-enxame).
- [ ] `test+fix(agente): analyzer no modelo do agente e sem trocar parcela por valor do bem`.
**Gate:** `pnpm -s vitest run src/lib/llm src/lib/agent/orchestrator src/lib/agent/turn-analyzer src/lib/observability/langfuse && pnpm -s typecheck && ! grep -rn "AI_ANALYZER_MODEL" src scripts`

### B4c · FIX-435 (complemento) — precedência do modelo do analyzer (D5, direção do dono das 12:5x; onda 2)
**Files:** Modify `src/lib/llm/model-provider.ts` (+ `modeloDoAnalisador()`), `src/lib/llm/model-provider.test.ts`,
`src/lib/agent/turn-analyzer.ts` (usar `modeloDoAnalisador()`), `scripts/sonda-intent-aceite.ts` e
`scripts/sonda-analisador.ts` (imprimir o modelo efetivo do analyzer).
- [ ] Unit (ver falhar antes): `AI_ANALYZER_MODEL=x` + `AI_MODEL=y` ⇒ `x`; só `AI_MODEL=y` ⇒ `y`; nenhum ⇒ o default do
  projeto (`MODELO_DO_AGENTE_PADRAO`); string vazia/espaços em qualquer um ⇒ cai para o próximo. O analyzer chama
  `modeloDoAnalisador()`, e `AI_ANALYZER_MODEL` é lido **só** em `model-provider.ts`.
- [ ] `test+fix(agente): analyzer herda o modelo padrão com override opcional`.
**Gate:** `pnpm -s vitest run src/lib/llm src/lib/agent/turn-analyzer && pnpm -s typecheck && test "$(grep -rln AI_ANALYZER_MODEL src scripts | grep -v '\.test\.' )" = "src/lib/llm/model-provider.ts"`

### B5 · FIX-436 — número do card vem da tool (D7)
**Files:** Create `src/lib/agent/langgraph/numeros-do-card.ts` + `numeros-do-card.test.ts`. Modify
`src/lib/agent/langgraph/nodes/converse.ts` (o ramo `PRESENTATION_TOOLS` ~1446, chamando o módulo novo).
- [ ] Unit (reproduz `db26cd54`): resultado de `compare_with_financing` = financ. 5678.45/266886.98, Δ −11.68/−548.79;
  args do modelo 6071/278372, Δ −404.23/−12033.81 ⇒ payload final com os números da tool. O mesmo para `simulation_result`
  ← `simulate_quota` e `scenarios` ← `compute_scenarios`. Sem resultado de origem ⇒ `null` (card não sai) + log `[card-sem-fonte]`.
- [ ] Integração no `converse` (cenário roteirizado): o artifact emitido carrega os números da tool.
- [ ] `test+fix(agente): número do card vem do resultado da tool`.
**Gate:** `pnpm -s vitest run src/lib/agent/langgraph && pnpm -s typecheck`

### B6 · FIX-437 — retomada não cobra gate com desbloqueio pendente (D8)
**Files:** Modify `src/lib/agent/gate-reengage.ts` (`pendingGateAfterTurn`), `src/lib/agent/langgraph/nodes/persist.ts`
(passar o estado), `src/lib/workers/gate-reengage-poll.ts` (reconferir antes de enviar). Test: os `.test.ts` existentes
de `gate-reengage` + Create `src/lib/workers/gate-reengage-poll.desbloqueio.integration.test.ts`.
- [ ] Unit: `desbloqueioPendente: true` ⇒ `null` para qualquer gate de coleta; `false` ⇒ comportamento de hoje.
- [ ] Integração (reproduz `576e5b66`): conversa web braço A sem lead com `pendingGate=credit` vencido ⇒ o poll **não**
  insere mensagem do assistente e consome o marcador. Controle: com telefone, cobra como hoje.
- [ ] `test+fix(retomada): não cobra gate com o desbloqueio do telefone pendente`.
**Gate:** `pnpm -s vitest run src/lib/agent/gate-reengage src/lib/workers/gate-reengage-poll src/lib/agent/langgraph/nodes/persist && pnpm -s typecheck`

### B7 · FIX-438 — a régua alcança o lead da web (D9)
**Files:** Modify `src/lib/remarketing/motivo-de-exclusao.ts`, `src/lib/workers/remarketing-cycle.ts` (seleção/ordenação
de candidatos e vencidas), `src/lib/remarketing/regua.ts` (agendamento; template para web),
`src/lib/admin/regua-por-conversa.ts` e `src/lib/admin/motivo-fora-da-regua.ts` (a tela concorda com o worker),
`src/lib/workers/remarketing-cycle.integration.test.ts` (corrigir a fixture falso-verde).
- [ ] Teste (reproduz o lead 774): conversa web, `last_inbound_at` NULL, contato com telefone válido (fora de
  `TELEFONES_DA_EQUIPE`), fala do cliente às 00:00 BRT, `REMARKETING_ATIVO=1` e `REMARKETING_ENTRADA_WEB=true` ⇒ entra na
  régua com próximo toque às 01:30, dispara como **template** às 09:00 (horário comercial). Hoje falha com
  "ainda_em_silencio". A fixture não grava mais `lastInboundAt` para web. A tela mostra o mesmo motivo/estado do worker.
  Sem a flag web ⇒ "conversa_web", como hoje. Disparo **mockado**.
- [ ] `test+fix(remarketing): régua alcança o lead da web`.
**Gate:** `pnpm -s vitest run src/lib/remarketing src/lib/workers/remarketing-cycle src/lib/admin/regua-por-conversa src/lib/admin/motivo-fora-da-regua && pnpm -s typecheck`

### B8 · FIX-439 — Performance obedece ao período (D10) + o teste vermelho da base
**Files:** Modify `src/lib/admin/handoff-queries.ts` (`computeLeadsParados` com período opcional; global sem período),
`src/components/admin/performance/funil-de-handoff.tsx` (rótulo), `src/app/admin/(dashboard)/performance/page.tsx`
(descartar resposta atrasada), `src/app/api/admin/performance/route.ts`, `src/app/admin/(dashboard)/remarketing/page.tsx`
+ `src/app/api/admin/remarketing/route.ts` (bloco "Parados — todos os períodos"),
`src/lib/admin/handoff-queries.integration.test.ts`.
- [ ] Integração: lead parado há 10 dias + conversa de hoje, período "Hoje" ⇒ os parados do período não incluem o antigo;
  a global inclui. Componente: dois fetches resolvendo fora de ordem ⇒ a tela fica com o do período selecionado.
- [ ] O teste "estágio sem saída registrada não vira tempo zero" (vermelho em `9bdb2040`): provar a causa (teste ou
  produto) e corrigir, sem `skip`. Registrar a causa no diário-enxame.
- [ ] `test+fix(admin): parados da performance obedecem ao período`.
**Gate:** `pnpm -s vitest run src/lib/admin/handoff-queries.integration.test.ts src/lib/admin/performance-queries.integration.test.ts src/components/admin/performance 'src/app/admin/(dashboard)/performance' && pnpm -s typecheck`

### B9 · FIX-440 — vocabulário "carro novo"/"seminovo" pelo prompt (D11)
**Files:** Modify `src/lib/agent/system-prompt.ts` (uma linha em "## Tom e Personalidade"),
`src/lib/agent/langgraph/nodes/lean-prompt-entrega-as-regras.test.ts`.
- [ ] Teste: `leanSystemPrompt(SYSTEM_PROMPT)` contém a regra (entrega do texto ao modelo, não a fala). Ver falhar; adicionar a linha; ver passar.
- [ ] `fix(agente): vocabulário de carro novo e seminovo no prompt`. `pnpm prompts:check` vai acusar divergência até o
  `sync-prompts`: esperado, `PENDENTE-KAIRO`.
**Gate:** `pnpm -s vitest run src/lib/agent/langgraph/nodes/lean-prompt-entrega-as-regras.test.ts && pnpm -s typecheck`

### B11 · FIX-441 — toque da régua: carimbo compensado, visível e com os códigos da Meta (D12; onda 3, em paralelo com B5)
**Contexto medido (prod, 02/10 14:00):** a reentrada pôs 15 na régua; o ciclo carimbou 10 (`disparados: 10`,
`teto_30_dias: 5`). O log tem `Status: sent` para 9 e `delivered` para pelo menos 8; **1 falhou com 131049**
(`8b8f3244`, final 6246) e perdeu a cota. Nenhuma linha em `messages`: o template nunca é gravado. Nenhuma mensagem de
régua foi persistida desde que ela existe; os 14 templates do histórico são `aja_agora_atendente_retomada`.
**Files:** Modify `src/lib/whatsapp/template-dispatch.ts` (devolver o resultado; falha = sem `messageId` ou com `error`),
`src/lib/workers/remarketing-cycle.ts` (`enviarTemplate` devolve o resultado; compensação no `catch`/falha; gravar o
template em `messages`), `src/app/api/webhook/whatsapp/route.ts` (status `failed` → compensação por `wamid`),
`src/lib/admin/remarketing-queries.ts` (chaves reais + a fala gravada), `src/db/schema.ts` + `drizzle/0063_*` + `meta/`
(`remarketing_touches.ultimo_wamid text`, `envio_status text`). Create `src/lib/remarketing/status-do-toque.ts` (+ teste).
Test: `src/lib/workers/remarketing-cycle.envio.integration.test.ts` (Postgres real, `REMARKETING_ATIVO=1`, fetch da Meta
mockado com `vi.stubGlobal("fetch")`, **nenhum envio real**).
- [ ] (a) Lead com inbound há 5 dias + `remarketing_inicio_generico` APPROVED; o fetch devolve 400 com código 131049 ⇒
  depois de `runRemarketingCycle`: step, `ultimo_toque_em` e `touches_30d` como antes, `next_touch_at` = backoff; um 2º
  ciclo logo em seguida **não** chama o fetch.
- [ ] (b) O fetch devolve 200 com `wamid` ⇒ step 1, `ultimo_wamid` gravado, o corpo enviado é `type: "template"` (nunca
  `text`) e existe **uma** mensagem do assistente em `messages` com `template_name` e o texto renderizado.
- [ ] (c) POST no webhook com `failed 131049` para esse `wamid` ⇒ a cota volta; repetir o mesmo payload não muda nada
  (idempotente). `failed 131050` ⇒ régua encerrada com `motivo_saida`.
- [ ] (d) A query do painel conta o toque por template (chave `remarketing_inicio_generico`).
- [ ] Ver falhar; implementar; `pnpm db:migrate` no banco local; ver passar; `test+fix(remarketing): toque compensado e visível quando a meta recusa`.
**Gate:** `pnpm -s vitest run src/lib/workers/remarketing-cycle src/lib/remarketing src/app/api/webhook/whatsapp src/lib/admin/remarketing-queries src/lib/whatsapp/template-dispatch && pnpm -s typecheck`

### B10 · cards e docs (onda 4)
**Files:** Create `docs/correcoes/done/fix-432-…md` a `fix-440-…md`, no padrão de `docs/correcoes/done/fix-403-*`.
`git mv` dos 7 cards de 02/10 do inbox para `done/` (o da `develop` **fica** no inbox, com `PENDENTE-KAIRO`), com
`_evidencia/` junto.
**Gate:** `ls docs/correcoes/done | grep -cE "fix-4(3[2-9]|40)"` = 9 e `ls docs/correcoes/inbox | grep -c 2026-10-02` = 1.

## Critérios de pronto (rodados pelo chefe nesta worktree, saída colada no diário)

| # | Critério | Comando |
|---|---|---|
| C1 | Compila | `pnpm -s typecheck` |
| C2 | Sem telefone, sem número (D1) | `pnpm -s vitest run src/lib/agent/langgraph/nodes/converse.desbloqueio.integration.test.ts` |
| C3 | Trava total e B sem janela (D2/D3) | `pnpm -s vitest run src/lib/web src/components/chat src/lib/chat/desbloqueio-do-telefone` |
| C4 | Fila 50/50 e braço em toda entrada (D4) | `pnpm -s vitest run src/lib/experimentos src/lib/chat src/lib/admin/filtro-variante` |
| C5 | Analyzer no modelo padrão e degradação (D5/D6) | `pnpm -s vitest run src/lib/llm src/lib/agent/orchestrator src/lib/agent/turn-analyzer src/lib/observability/langfuse` + `grep -rln AI_ANALYZER_MODEL src scripts \| grep -v '\.test\.'` = só `src/lib/llm/model-provider.ts` |
| C6 | Analyzer vivo no qwen pelo gateway | `pnpm tsx scripts/sonda-analisador.ts` com o túnel do LiteLLM (chefe): todos os casos OK, p95 registrado |
| C7 | Card com número da tool (D7) | `pnpm -s vitest run src/lib/agent/langgraph` |
| C8 | Retomada (D8) | `pnpm -s vitest run src/lib/agent/gate-reengage src/lib/workers/gate-reengage-poll` |
| C9 | Régua web (D9) | `pnpm -s vitest run src/lib/remarketing src/lib/workers/remarketing-cycle src/lib/admin/regua-por-conversa src/lib/admin/motivo-fora-da-regua` |
| C10 | Performance (D10) + base verde | `pnpm -s vitest run src/lib/admin/handoff-queries.integration.test.ts src/lib/admin/performance-queries.integration.test.ts src/components/admin/performance` |
| C11 | Vocabulário (D11) | `pnpm -s vitest run src/lib/agent/langgraph/nodes/lean-prompt-entrega-as-regras.test.ts` |
| C12 | O que NÃO muda | `git diff --stat $BASE..HEAD -- src/lib/agent/qualify-state.ts src/lib/adapters/bevi src/lib/bevi src/lib/observability/langfuse/prompts.ts src/lib/agent/langgraph/provider.ts src/components/chat/artifacts/telefone-do-desbloqueio.tsx .github` vazio; `git diff $BASE..HEAD -- src/lib/agent/system-prompt.ts` = só a linha de D11; `git diff --name-only $BASE..HEAD -- drizzle` = só `0062_*`, `0063_*` + `meta/` |
| C17 | Toque da régua (D12) | `pnpm -s vitest run src/lib/workers/remarketing-cycle src/app/api/webhook/whatsapp src/lib/admin/remarketing-queries` |
| C13 | Lint | `pnpm -s biome check $(git diff --name-only --diff-filter=AM $BASE..HEAD -- src scripts)` |
| C14 | Integração do caminho do dinheiro | `pnpm test:caminho-do-dinheiro` verde (é o que o husky rodaria e o `HUSKY=0` pula) |
| C15 | Revisão | `/code-review high` sobre `$BASE..HEAD`; achados CONFIRMED voltam ao gerente |
| C16 | Sem worktree aninhada | `git worktree list` e `orca worktree list` sem worktree nova desta frente |

## Riscos

- **Latência do analyzer no qwen:** as gerações do agente no qwen levam de 3 s a 17 s. Com o timeout de 6 s, o analyzer
  pode cair em neutro com mais frequência; D6 amortece, mas o número decide. A sonda (C6) mede p50/p95, e o timeout se
  ajusta ao dado, com registro no diário.
- **Structured output pelo OpenAI-compatível do gateway:** não provado para o qwen. Se o `json_schema` estrito falhar, usar
  o modo que a sonda provar. Se nenhum modo passar, o B4 entrega o resto (sinal + degradação), o analyzer volta a
  `claude-haiku-4-5` por uma única constante e isso vira `PENDENTE-KAIRO` com a evidência. Nunca deixar o analyzer quebrado.
- **Runtime do agente no qwen pela rota Anthropic** (`langgraph/provider.ts`): hipótese, não prova, para o turno truncado.
  Trocar o client do grafo inteiro sem prova é risco alto. Fica para a próxima rodada, com medição antes.
- **Régua web no deploy:** ao subir, os leads web com telefone dos últimos 7 dias que nunca receberam toque entram de uma
  vez. O chefe mede quantos antes de entregar (`PENDENTE-KAIRO` com a lista).
- **Fila sob concorrência:** o dono não vai ver A e B alternando nas próprias entradas se alguém entrar no meio. Para
  conferir os dois braços existe o `?variante=` (que agora fica fora da conta).
- **Ambiente:** integração depende do banco local migrado (`aja-pg-forward` em 5433). `ECONNREFUSED` é ambiente, não código.
