# D-0056 · QA de ponta a ponta da dev e playground de comportamento (`/admin/playground`)

> Rascunho do plano (planner), 04/11/2026, **validado pelo chefe contra o código no mesmo dia** (ver "Validação do chefe", no fim). Fonte do pedido: Kairo, voz, 03/11 23:01 e 04/11 12:21–12:23 (aprovada, urgente).
> Escopo: **só dev**. Nada vai para produção. O número do CPF de E2E **não aparece neste arquivo nem em nenhum arquivo do repositório**: fica no vault (`01 - TwoBrains/projects/aja-agora.md`, linha 175) e entra por variável de ambiente do shell de quem roda o smoke.

## 0. Onde o código diverge do refino (o código manda)

| # | O refino diz | O código diz | Consequência no plano |
|---|---|---|---|
| D1 | O playground edita uma "persona de teste" da tabela `personas` (`personas-repo.ts`). | O motor vivo **não lê `personas`**. `runTurn` → `runTurnLivre` (`src/lib/agent/orchestrator/index.ts:14-16`) → `montarSystemDoVendedor` (`src/lib/agent/pi/system-do-vendedor.ts:62-93`), que monta **conduta (caixa) + skills + fato**. `grep persona` em `src/lib/agent/pi/` (fora de testes) só acha `import type` e o parâmetro `persona` de `persist-livre.ts:57-59`. `voiceTone`, `examples`, `forbiddenTopics` são campos mortos (`src/lib/eval/scorer.ts:187-189`; `docs/design/2026-10-17-campos-mortos-onde-e-por-que.md`). `ExpertiseLevel` (`src/lib/agent/personas.ts:11`) não é lido em `pi/`. | Editar `personas` não mudaria uma palavra do agente. A "persona de teste" vira uma **entidade nova** (perfil de comportamento) que o servidor **compila em texto** e injeta na conduta. O mecanismo de publicar/versionar já existe e é reaproveitado: `caixa_de_prompt` + `publicarCaixa` (`src/lib/agent/box/caixa.ts:206-236`). |
| D2 | Chat à direita usa a rota `/api/chat` da dev. | `/api/chat` (`src/app/api/chat/route.ts`, ~1.790 linhas) cria lead, mexe em pipeline e usa o gateway **singleton** (`getProposalGateway`, `src/lib/adapters/index.ts:109`). `createRunTurnLivre` só aceita `provider`, `busca`, `lerCartas` (`turno-livre.ts:1022-1029`); `simularCota` existe em `DepsDasToolsLivres` (`tools-livres.ts:601`) mas **não é repassado** (`turno-livre.ts:1490` passa só `buscarGrupos`); `startContract` é chamado sem gateway (`tools-livres.ts:946`). **Confirmado pelo chefe:** `fulfillment.ts` recebe `gateway: ProposalGateway = getProposalGateway()` como **parâmetro com default** em três funções (`:170` `startContract`, `:329` escolha/fecho, `:396` upload de documento); o seam já existe lá, falta só o `tools-livres.ts` repassar. | Rota própria `/api/admin/playground/chat`, que chama `createRunTurnLivre({...})` direto com **seams por chamada**. Bloco 1 repassa `gateway` nas **três** chamadas de `fulfillment.ts`. Nada de `__setProposalGatewayForTests` (é global do processo e contaminaria conversa real na mesma task da dev). |
| D3 | "Bevi pelo dublê" em runtime na dev. | `src/lib/adapters/index.ts:12-16` e `:98-103`: dado mockado em runtime é **proibido** (diretiva Kairo 04/06/2026, citada para `docs/jornada/CONTEXT.md`, arquivo que **não existe neste worktree** — não confirmei). O dublê vive em `tests/helpers/` (fora de `src/`, fora do `include` do vitest, `vitest.config.ts:27`). **Confirmado pelo chefe:** `src/` **pode** importar `tests/helpers` do ponto de vista de build (`tsconfig.json` `include` = `**/*.ts`, sem `exclude` de `tests`; `.dockerignore` não exclui `tests/`; `Dockerfile` faz `COPY . .`; os JSON de fixture que o dublê lê estão em `src/lib/adapters/bevi/__fixtures__/`, import estático). Nenhum arquivo de `src/` importa `tests/` hoje. | Ordem nova do Kairo (03/11) vence a de 04/06 **para o playground, só dev**, sem violar o desenho: a dublê entra por injeção explícita numa rota guardada, nunca por `PROPOSAL_GATEWAY` (o `case "mock"` continua lançando, `index.ts:98-103`). Mesmo podendo importar de `tests/`, o plano **move o código para `src/lib/playground/dubles/`** e `tests/helpers/*` passam a reexportar (produção importando de pasta de teste é cheiro e fica frágil a limpeza de `tests/`). Ver Q2. |
| D4 | "Suíte 1.632 unit + 81 integration" como bateria do QA. | `AGENTS.md` do projeto: teste é **pontual** e a suíte inteira "foi removida em 16/10/2026 — não ressuscite". Há `*.test.ts` ao lado do código (ex.: `src/lib/agent/pi/turno-*.test.ts`), `scripts/e2e-web-livre.ts`, `scripts/smoke-pi-livre.ts`, `scripts/test-jornada.sh`, `pnpm eval`. | O QA usa: testes pontuais dos arquivos tocados, `typecheck`, `e2e-web-livre.ts`, `smoke-pi-livre.ts` e `pnpm eval` contra a dev. **Não** roda `vitest run` inteiro. |
| D5 | "Scale-to-zero do dev-gate". | Nada no repo menciona `dev-gate` (grep em `src`, `scripts`, `.github`, `Dockerfile`: sem acertos). O workflow mostra só cluster `tb-cluster` e serviço `aja-agora-dev` (`.github/workflows/aws-ecr-deploy.yml`, passo "Force ECS service to pull new image"). | O "como acordar" fica em duas camadas: checagem objetiva por `aws ecs describe-services` e o acordar pelo mecanismo do dev-gate, **não confirmei** onde ele vive (Q3). |
| D6 | "Detector anti-promessa de contemplação (Camada 2)". | A "Camada 2" aparece só em comentário de `directives.ts:633` ("detector do cassette"); `grep cassette` em `src/scripts/tests` não acha código. O detector existente é `promessaDeContemplacao` em `src/lib/validations/whatsapp-template.ts:~222-243`, **declaradamente estreito** (2 padrões) e "NÃO é guard de conversa". | Não confirmei a Camada 2. O plano cria um detector próprio e **mais largo**, com testes, e deixa o do template intacto. Ver Q4. |
| D7 (novo) | "Conversa de teste fica fora de pipeline/leads/régua pelo `SIM-`." | **A marca é `conversations.is_simulated` (`src/db/schema.ts:413`) e `leads.is_simulated` (`:511`), não o `SIM-`.** `SIM-<uuid>` é só o `waId` sintético de conversa **WhatsApp** simulada (`src/app/api/admin/simulator/sessions/route.ts:44`); a sessão web do simulador nasce com `waId=null` e `isSimulated: true` (`:49-51`). O lead herda a marca: `createLeadFromConversation` (`src/lib/admin/lead-stage-tracker.ts:82-110`). Métricas, exportação e sinais do funil filtram `is_simulated = false` (`agora-queries.ts:45-132`, `sinais-do-funil.ts:39-346`, `exportacao/conversas.ts:200`, `custo-de-mensagem.ts:113`). **Mas o pipeline mostra simulados** (comentário em `lead-stage-tracker.ts:72-75`: "pipeline mostra ambos"), e `GET /api/admin/simulator/sessions` lista todas as `is_simulated=true` (`route.ts:128`). **O que o turno faz com o celular:** `turno-livre.ts:1062-1069` chama `saveContactWhatsapp` sempre que `captura.recebeuCelular`, **sem checar canal nem simulação**; a função (`src/lib/leads/contact-capture.ts:212-270`) reescreve `conversations.waId` com o telefone, cria/atualiza o lead (herda `is_simulated`), promove para `engajado` e dispara `registrarLeadIdentificado`. Além disso `storeIdentity` (`conversation/identity.ts:121`) vincula o celular ao lead no canal web. `conversions/hash.ts:36-38` só ignora telefone `SIM-`, então um web simulado com celular real **pode** emitir conversão: não confirmei. | A conversa do playground nasce **`channel=web`, `isSimulated=true`, `metadata.playground=true`**. Isso a tira de métricas, exportação e funil, mas **não** de Conversas/Pipeline/Simulador (aparece marcada como TESTE). O critério 8 foi reescrito para o que é verdadeiro. Ver Q5. |

## 1. Contexto

- **Produto** (`AGENTS.md` do projeto): vendedor de consórcio com IA, web e WhatsApp, objetivo único vender. Premissas P1–P7 valem para qualquer ajuste de comportamento.
- **Cérebro do vendedor hoje**: `PROMPT_DO_VENDEDOR` (`src/lib/agent/prompt-do-vendedor.ts:10`, exportado como `SYSTEM_PROMPT` em `system-prompt.ts:10`) é o fallback; a conduta viva vem de `caixa_de_prompt` (`src/db/schema.ts:1929-1945`, versão imutável por `(nome, label, versao)`), label por ambiente via `CAIXA_LABEL` (`caixa.ts:40-43`, default `production`). Já existem `GET/POST /api/admin/caixa` (`src/app/api/admin/caixa/route.ts`, `requireRole("admin")`, label sempre do servidor, mínimo 200 caracteres) e a prévia `GET /api/admin/caixa/previa`.
- **Guarda "só dev" que já existe**: `isSimulatorEnabled()` (`src/lib/utils/env.ts:12-23`) é **permissiva por padrão** (`TB_ENV` ausente = habilitado) e tem override `SIMULATOR_FORCE_ENABLE`. Serve ao simulador, **não serve** ao playground, que mexe em conduta: exige guarda estrita (ver Bloco 2). **`TB_ENV` na dev:** o repositório só o define em `docker-compose.yml:47` (`local`); nem o workflow nem o `Dockerfile` nem `.env.example` o setam, então o valor da dev vive só no secret `tb/dev/aja-agora/env` (não confirmei; ver decisão Q3).
- **Menu admin**: item "Simulador" em `src/components/admin/app-sidebar.tsx:99`; "Agentes" (`/admin/personas`) em `:104`.
- **Deploy de dev**: `.github/workflows/aws-ecr-deploy.yml` — push em `develop` **não** builda nem deploya (`if:` do job `build`); deploy de dev = `workflow_dispatch` com `env=dev` (default do input já é `dev`). O job `build` força o serviço `aja-agora-dev` no cluster `tb-cluster` e espera o rollout provar o digest da tag `sha-<commit>`. O job `check-prompt-sync` roda sempre e compara com o **banco de produção** (`tb/prod/aja-agora/env`); ele não bloqueia o `build` (que só depende de `check-migrations`).
- **Migrations**: `drizzle/` vai até `0068_concerned_scorpion.sql`; a nova sai de `pnpm db:generate` (`package.json:16`); em runtime roda `db:migrate:runtime` (`package.json:19`). O job `check-migrations` barra DROP/TRUNCATE/ALTER TYPE: a migration nova deve ser **só aditiva**.

## 2. O que muda

### 2.1 Frente A — QA de ponta a ponta da dev

Duas provas, uma com dublê e uma real, mais o relatório.

1. **Acordar a dev** (pré-passo de todo o QA; ver 6.3).
2. **Prova com Bevi mockada** (sem tocar a Bevi real): teste de jornada completa que injeta, por seams, `buscarGrupos`/`simularCota` com `fixtureDiscoveryAdapter` (`tests/helpers/fixture-discovery-adapter.ts`, capturas reais de AUTOS e IMOVEL) e `gateway = new MockProposalGateway()` (`tests/helpers/mock-proposal-gateway.ts`). Passos: oi → bem+valor → cartas (`comparison_table`/hero) → simulação → escolha → identidade → `fazer_proposta` → proposta → fecho. Depende do Bloco 1 (seams). Arquivo novo: `src/lib/agent/pi/jornada-dubla.test.ts` (dentro de `src/**` para o vitest incluir).
3. **Prova real na dev com o CPF autorizado do Kairo** (vault, linha 175; usa só em E2E da jornada, cria proposta real na loja-piloto e consulta bureau): `scripts/qa/jornada-dev.ts` (novo, no molde de `scripts/e2e-web-livre.ts`), alvo `E2E_BASE=<url da dev>`, CPF por `E2E_CPF` e celular por `SIMULATOR_TEST_CELULAR` (`src/lib/whatsapp/identify-capture.ts:133-146`), ambos lidos do ambiente, **nunca** gravados em arquivo/log (o `passaFinal`/máscara do turno já cobre o texto do agente, `turno-livre.ts:288-296`). Uma jornada canônica por categoria: auto, imóvel, moto (decisão barata sugerida no refino, Lacuna 2).
4. **Relatório**: `docs/design/planos/evidencias/2026-11-04-qa-dev-d0056.md` (novo), um passo por linha com `PASSOU`/`FALHOU` (rótulo em texto, nunca só cor), o request e o trecho da conversa. Falha real vira card de correção, não vira remendo neste plano.

### 2.2 Frente B — Playground de comportamento

**Modelo mental.** Um **perfil de comportamento** = 4 atributos em seletores + orientação em texto. O servidor **compila** o perfil num bloco de texto determinístico e o acrescenta à conduta (caixa) **só na conversa do playground**. Publicar = gravar uma versão nova em `caixa_de_prompt` (conduta base + bloco), com autor e histórico.

**Atributos** (seletores discretos com rótulo escrito; sem slider 0–100, para não depender de cor nem de precisão falsa):

| Atributo | Níveis | Origem |
|---|---|---|
| Agressividade comercial | `suave` · `equilibrada` · `insistente` | pedido do Kairo |
| Proatividade de follow-up | `baixa` · `media` · `alta` | pedido do Kairo (aqui só **fala** do agente: propor próximo contato; a cadência real da régua é outro sistema, `/admin/remarketing/config`, fora de escopo) |
| Tecnicidade | `leigo` · `neutro` · `expert` | reaproveita o tipo `ExpertiseLevel` (`personas.ts:11`) |
| Tom | `formal` · `neutro` · `coloquial` | pedido do Kairo |

**Compilação** (`compilarPerfil`, função pura): cada nível vira 1–3 frases de instrução em pt-BR, mais a orientação livre, sob o título `# Ajuste de comportamento (playground)`. Invariantes que o compilador e os testes travam:
- Nenhum nível contradiz P1–P7: `insistente` = conduzir ao próximo passo e tratar objeção sem recuar na primeira, **nunca** empurrar ao fecho sem o cliente pedir (P5), nunca desistir do lead (P3/P7), nunca inventar número (AGENTS.md "O que não se faz").
- O bloco é delimitado por marcadores (`<!-- playground:inicio -->` … `<!-- playground:fim -->`); `aplicarBloco(conduta, bloco)` remove bloco anterior antes de acrescentar (idempotente: publicar duas vezes não empilha).
- O bloco entra **depois** da conduta e **antes** das skills (a ordem do `system` é contrato: conduta → skills → fato, `system-do-vendedor.ts:1-9`), sem alterar skills nem a linha de fato.

**Detector anti-promessa de contemplação** (`src/lib/playground/detector-de-promessa.ts`, novo): roda no servidor sobre a orientação em texto **ao salvar, ao rodar o chat e ao publicar** (a UI só espelha). Casos recusados no mínimo: "contemplação garantida", "garantia de contemplação", "garanta/prometa que será contemplado", "vai ser contemplado em N meses/dias", "contemplado certamente/com certeza", data/mês cravado de contemplação (inclui as formas do `whatsapp-template.ts`). Casos que **passam**: explicar o que é contemplação, sorteio e lance sem prometer resultado. Recusa devolve o motivo em texto. Também varre a **fala do agente** no painel direito e marca a bolha com o rótulo "PROMESSA DE CONTEMPLAÇÃO" (texto, não só cor) — mede o efeito da orientação sem barrar a conversa (decisão do Kairo 10/08: no chat o assunto é do vendedor; o guard é só na orientação).

**Persistência** (migration nova, só `CREATE TABLE`):
- `playground_perfis` — `id` uuid, `nome`, `atributos` jsonb, `orientacao` text, `versao` int (otimista, como `PersonaVersionConflictError`, `personas-repo.ts:176-186`), `criado_em`, `atualizado_em`, `atualizado_por`.
- `playground_perfil_versoes` — `perfil_id`, `versao`, `atributos`, `orientacao`, `bloco_compilado`, `salvo_por`, `criado_em`, `caixa_versao` (nulo até publicar; preenchido com a `versao` devolvida por `publicarCaixa`). É o **histórico de versões**: cada "salvar" cria uma linha; "publicar" carimba a linha.
- O perfil "de produção" **não é tabela**: é a conduta viva da `caixa_de_prompt` do ambiente (a verdade já existente). Não há segunda fonte.

**Publicar** (`POST /api/admin/playground/perfis/[id]/publicar`, botão explícito "Publicar", com confirmação em texto mostrando o diff conduta-viva × conduta-resultante): lê a conduta viva com `lerCaixa({ semCache: true })`, `aplicarBloco`, valida ≥200 caracteres (mesmo piso de `caixa/route.ts:36-42`), chama `publicarCaixa({ texto, label: labelDaCaixa(), publicadoPor: session.user.email })` — label **do servidor**, nunca do corpo (lição de 17/10, `caixa/route.ts:16-19`). Desfazer = republicar um snapshot anterior (a caixa é imutável).

**Chat ao vivo** (`POST /api/admin/playground/chat`, stream): cria/usa uma conversa de playground (**`channel=web`, `isSimulated=true`, `metadata.playground=true`**, D7), monta `caixa` = conduta viva + bloco do perfil em edição (passa por `args.caixa` de `montarSystemDoVendedor`, já injetável, `system-do-vendedor.ts:56`), roda `createRunTurnLivre({ caixa, busca, simularCota, gateway })` com a dublê. **Antes × depois**: o mesmo texto do usuário é enviado a **duas** conversas, "antes" (conduta viva pura, ou um snapshot escolhido) e "depois" (perfil em edição), renderizadas lado a lado. Há "Reiniciar conversa" e "Reproduzir roteiro" (lista de falas fixas para comparar perfis sem digitar). Aviso fixo na tela: dois turnos de modelo não provam diferença estatística; a medida é o `pnpm eval`/o relatório de comparação (Bloco 6). A tela avisa também que, se a fala de teste trouxer celular, o motor grava contato/lead de teste (D7); o roteiro padrão usa só o celular de teste.

**Tela** `/admin/playground` (`src/app/admin/(dashboard)/playground/page.tsx`, novo; `notFound()` quando `!isPlaygroundEnabled()`, como em `simulator/web/page.tsx:6-8`): duas colunas — esquerda: seletor de perfil, 4 seletores com rótulo escrito, textarea de orientação com contador e erro do detector, botões "Salvar" e "Publicar", lista do histórico; direita: duas colunas de chat (Antes/Depois), campo de envio único, rótulo do modo ("Bevi: dublê"). Item "Playground" no menu (`app-sidebar.tsx`, junto de "Simulador", visível só quando habilitado).

**Guarda "só dev"** (`isPlaygroundEnabled`, novo): verdadeiro **apenas** se `TB_ENV` ∈ {`dev`,`local`} (explícito; ausente = falso; **sem** override do tipo `SIMULATOR_FORCE_ENABLE`). Aplicada na página, nas três rotas e na ativação da dublê; em prod devolve 404. Soma-se a `requireRole("admin")`. **Pré-condição:** a dev precisa ter `TB_ENV=dev` no secret; se não tiver, o playground fica 404 na dev (falha segura) e o fato vira item de infra, não afrouxamento da guarda.

### 2.3 Frente C — PPT

Deck sobre a diferença de comportamento entre perfis de agente, pela skill `tb-pptx`. **Conteúdo medido, não opinado**: `scripts/playground/comparar-perfis.ts` (novo) roda o mesmo roteiro fixo contra N perfis (ex.: `suave/formal/leigo` × `insistente/coloquial/expert`) com a dublê, grava transcrições e métricas objetivas (nº de balões, tamanho médio, perguntas por mensagem, uso de card, presença de promessa de contemplação pelo detector). O deck cita esses números com a fonte ao lado (nome do arquivo de saída), mostra pares antes/depois e fecha com o que cada perfil muda e o que **não** muda (P1–P7). Entregável fora do repositório (pasta da demanda, `proposals/`), não versionado.

## 3. O que NÃO muda

- A tabela `personas`, o CRUD `/admin/personas`, `personas-repo.ts` e o editor por IA: intocados (D1). Nenhuma escrita em `personas`.
- `PROMPT_DO_VENDEDOR`, as skills (`pi/skills/*/SKILL.md`) e a linha de fato: intocados. O playground só **acrescenta** um bloco delimitado.
- `GET/POST /api/admin/caixa` e `/previa`: intocados; o playground consome `lerCaixa`/`publicarCaixa` direto.
- `/api/chat`, `createGateway()` e o `case "mock"` proibido (`adapters/index.ts:98-103`): intocados. A dublê nunca é alcançável por variável de ambiente nem por `/api/chat`.
- `fulfillment.ts`: intocado (o seam de `gateway` já é parâmetro); só `tools-livres.ts` passa a repassá-lo.
- Bevi real, Langfuse (desligado), BullMQ/workers, régua de remarketing: fora.
- Produção: nenhum deploy, nenhuma publicação em `label=production` de produção. Publicar do playground grava na `caixa_de_prompt` **do banco da dev**.
- Treino do Charles (D-0022): fora; o playground é o mecanismo que ele usará depois.
- PII: segue a decisão de 27/10 (não mascarar por LGPD); segredo (CPF de E2E não é segredo de código, mas **o número vem do vault**) não entra em commit.

## 4. Critério de pronto (verificável)

**Risco**: **alto** para a Frente A item 3 (cria proposta real na loja-piloto e consulta bureau com CPF real) e para o Bloco 3 (grava conduta viva — `caixa_de_prompt` — e migration); **alto também para o Bloco 1** (toca o turno do cliente em produção, mesmo com default idêntico); **baixo** para UI, PPT e compilador. Gate rápido por bloco (ver 7); gate lento (`pnpm eval`, E2E na dev) só nos itens de risco alto e uma vez, no fechamento.

1. `pnpm -s typecheck` verde e `pnpm exec biome check` verde nos arquivos tocados.
2. `compilarPerfil`: os 3×3×3×3 = 81 combinações geram bloco determinístico, sem os marcadores aninhados, e nenhum contém termo de promessa (teste por varredura com o detector).
3. Detector: tabela de casos (recusa/passa) verde, inclusive os 2 padrões de `whatsapp-template.ts` e frases informais ("te garanto que sai logo").
4. Seams: teste mostra a jornada completa com `gateway` e `busca` injetados e **zero** chamadas a `getProposalGateway()`/`BeviSelfContractClient` reais (espiões).
5. Playground: com `TB_ENV=prod` página e rotas dão 404; com `TB_ENV` ausente também; com `dev` respondem. Teste dedicado.
6. Mudar agressividade `suave`→`insistente` muda a conduta enviada ao modelo (teste de `system` montado: bloco difere) e, na dev, a fala no painel "Depois" difere da do "Antes" (print com legenda).
7. A conduta viva só muda depois de "Publicar": antes do clique `lerCaixa({semCache:true}).versao` fica igual; depois sobe exatamente 1 e o histórico mostra o autor.
8. **(reescrito, D7)** Toda conversa e todo lead criados pelo playground têm `is_simulated = true` e `metadata.playground = true`; por SQL antes/depois, `COUNT` de `conversations`/`leads` com `is_simulated = false` **não muda**, e as consultas de métricas/exportação/funil (`agora-queries.ts`, `sinais-do-funil.ts`, `exportacao/conversas.ts`) não contam a conversa. Declarado fora do critério: a conversa **aparece** em Pipeline e em `/admin/simulator` como TESTE (o código as mostra); quem lista simuladas no simulador filtra `metadata.playground` para não poluir.
9. Relatório de QA com cada passo `PASSOU`/`FALHOU`, para auto, imóvel e moto, e smoke real com a proposta criada citada (id), sem CPF no arquivo.
10. Dev deployada pelo `workflow_dispatch env=dev` com digest `sha-<commit>` provado, `/admin/playground` carregando na dev, e o PPT entregue.
11. Nada em `git diff main` toca `.github/workflows`, `personas*`, `prompt-do-vendedor.ts`, `skills/**`, `fulfillment.ts`; `git grep` pelos 11 dígitos do CPF de E2E retorna vazio (o executor roda o grep com o número do ambiente, sem imprimi-lo).

## 5. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Dublê em runtime fere a diretiva de 04/06 | regressão de regra do dono | Guarda estrita `TB_ENV` dev/local, injeção por chamada, `createGateway` intacto, teste que prova que prod nunca monta a dublê (Q2) |
| Seam global `__setProposalGatewayForTests` | contamina conversa real na mesma task | proibido neste plano; só parâmetros por chamada |
| Conversa de playground vira lead real (turno captura celular → `saveContactWhatsapp`, `turno-livre.ts:1062-1069`, sem checar simulação) | lead de teste no Pipeline, `waId` reescrito, conversão emitida com celular real (`conversions/hash.ts:36-38` só ignora `SIM-`; não confirmei o efeito em `registrarLeadIdentificado`) | Conversa nasce `isSimulated=true` (o lead herda, `lead-stage-tracker.ts:82-110`); o Bloco 1 **confirma por teste** que `registrarLeadIdentificado` não dispara para `is_simulated` e, se disparar, pula com flag; roteiro usa só o celular de teste; critério 8 por SQL |
| Publicar na dev sobrescreve a conduta que o QA está testando | QA inconsistente | QA lê `versao` viva no início e no fim do relatório; publicar é por botão e fica no histórico |
| CPF de E2E real cria proposta e bureau | efeito externo | só `scripts/qa/jornada-dev.ts`, uma jornada por categoria, autorizado pelo titular (04/06, vault l.175); número por env, nunca em arquivo/log/commit; o `startContract` já barra identidade da vitrine (`fulfillment.ts:171-187`) |
| Orientação em texto contorna o detector com paráfrase | agente promete contemplação | detector largo + varredura da fala do agente com rótulo + `eval` do PPT mede; limite declarado: regex não prova ausência |
| Não-determinismo do modelo no "antes × depois" | diferença aparente sem causa | roteiro fixo, aviso na tela, métricas agregadas no Bloco 6 |
| Migration nova na dev | task nova morre no migrate-guard e o ECS reverte (já aconteceu em prod, comentário do workflow) | migration só aditiva; conferir o rollout pelo digest, não por `COMPLETED` |
| Dev em scale-to-zero | QA falha por 502/timeout, não por bug | passo 0 obrigatório (6.3) |
| `TB_ENV` ausente/errado no secret da dev | playground 404 na dev | ler a chave no secret antes do deploy (6.1, passo 0); corrigir é item de infra |
| `check-prompt-sync` compara prod com o código | falso vermelho no dispatch | ele não bloqueia `build`; registrar no relatório se falhar, sem "consertar" |
| Rota `/api/chat` ≠ rota do playground | QA do playground não prova o caminho do cliente | o QA da Frente A usa `/api/chat` real (`e2e-web-livre.ts`, `jornada-dev.ts`); o playground é provado à parte |

## 6. Operação

### 6.1 Deploy de dev (`workflow_dispatch env=dev`)
0. **Antes do deploy**, ler só a chave `TB_ENV` do secret `tb/dev/aja-agora/env` (`aws secretsmanager get-secret-value --secret-id tb/dev/aja-agora/env --region sa-east-1`, extrair a chave `TB_ENV`, sem imprimir o resto). Esperado: `dev`. Diferente ou ausente: parar e pedir o ajuste de infra; não afrouxar a guarda.
1. Branch com o trabalho integrado e `typecheck`/testes dos blocos verdes, commit feito, worktree limpa. Push, merge e deploy pedem GO (AGENTS.md "Como se trabalha aqui"): o pedido de Kairo cobre **dev**; o orquestrador confirma a fonte antes.
2. `gh workflow run "AWS ECR Deploy (sa-east-1, arm64)" --ref <branch> -f env=dev` (o `--ref` é a branch com o código; `env=dev` é o default do input). Push em `develop` **não** deploya.
3. Acompanhar `gh run watch`: `check-migrations` → `build` (ARM64) → "Force ECS service" (`aja-agora-dev`, `tb-cluster`) → "Wait ECS rollout" (falha se o ECS reverter; o passo imprime `Esperado em execucao: sha-<commit>`).
4. Provar: a imagem esperada é a do commit (digest da tag `sha-<commit>` do repositório ECR `twobrains/aja-agora/dev`), `/admin/playground` responde 200 logado na dev e 404 em prod.
5. Segredo/env novo na dev: nenhum previsto além de `TB_ENV` já existir (passo 0). Se faltar, é item de infra pedido, não edição deste plano.

### 6.2 Reversão
Rollback = novo `workflow_dispatch env=dev` do commit anterior; conduta publicada errada = republicar a versão anterior da caixa (imutável). Tabelas novas são aditivas e ficam.

### 6.3 Como o QA acorda a dev (scale-to-zero)
1. Checar: `aws ecs describe-services --cluster tb-cluster --services aja-agora-dev --region sa-east-1 --query 'services[0].{desired:desiredCount,running:runningCount,rollout:deployments[?status==\`PRIMARY\`].rolloutState}'`.
2. `desired=0` ou `running=0` → acordar pelo mecanismo do **dev-gate** (onde vive e como se chama: **não confirmei**, Q3; fora do repositório, provável `tb-aws-platform`/vault). Alternativa direta, só se o dev-gate não existir ou falhar e o escopo de IAM permitir: `aws ecs update-service --cluster tb-cluster --service aja-agora-dev --desired-count 1 --region sa-east-1`.
3. Esperar `running=1` e a URL da dev responder (rota de saúde: **não confirmei** — `find health*` em `src/app` não acha; usar `GET /` ou `/api/auth/get-session` e registrar qual foi). Timeout de 10 min (como o passo de rollout do workflow).
4. Registrar no relatório hora do pedido de acordar, hora do primeiro 200 e `desiredCount` final. A dev pode voltar a zero sozinha: o script `jornada-dev.ts` repete a checagem antes de cada categoria.

## 7. Blocos paralelizáveis

Contratos que destravam o paralelismo (congelados no início, **em arquivo próprio do Bloco 2**): `src/lib/playground/tipos.ts` (tipos `AtributosDoPerfil`, `PerfilDoPlayground`, `VersaoDoPerfil`, níveis como união de strings e rótulos pt-BR). Dependências reais: **1 e 2 independentes**; **3 depende de 1 (seams) e de 2 (tipos, compilador, detector, dublês em `src`)**; **4 depende só dos tipos do 2** (pode começar contra um mock da API); **5 (A.2) depende de 1**; 5 (A.3) depende do deploy; **6 depende de 3**.

**Ordem (ajustada pelo chefe):** onda 1 = {1, 2} em paralelo → onda 2 = {3, 4, 5-A.2} em paralelo (3 consome 1 e 2; 4 consome 2; 5-A.2 consome 1) → integração → deploy dev → 5-A.3 (QA real) → 6. Mudança frente ao rascunho: o Bloco 5 saiu da primeira onda (A.2 não roda verde sem os seams) e os dublês migraram do Bloco 3 para o Bloco 2, para que 3 e 5 não disputem o mesmo arquivo.

### Bloco 1 — Seams do motor (risco alto: toca o turno do cliente)
Arquivos (exclusivos): `src/lib/agent/pi/turno-livre.ts` (`createRunTurnLivre` deps, `:1022-1029`; repasse `:1186` para `caixa`; `:1490` para `simularCota` e `gateway`), `src/lib/agent/pi/tools-livres.ts` (`DepsDasToolsLivres` `:594-607`; `startContract` `:~946` e o `confirmOffer` do fecho `:~366`; e o upload de documento, que chama `fulfillment.ts:396`), `src/lib/agent/pi/turno-livre.seams.test.ts` (novo).
Entrega: deps opcionais `caixa?: Caixa`, `simularCota?`, `gateway?: ProposalGateway` (default = comportamento atual, byte a byte; `fulfillment.ts` **não muda**, o seam já é parâmetro nas linhas `:170`, `:329`, `:396`). Teste que prova o que o turno faz com conversa `isSimulated=true` que recebe celular (Q5/D7): lead criado herda `is_simulated`, e `registrarLeadIdentificado` não emite conversão para ela (se emitir, pular com flag e registrar).
GATE: `pnpm -s typecheck && pnpm exec vitest run src/lib/agent/pi/turno-livre.seams.test.ts src/lib/agent/pi/tools-livres.lgpd.test.ts src/lib/agent/pi/turno-c.test.ts src/lib/agent/pi/turno-d.test.ts` → verde (os dois últimos são regressão do motor sem seams).

### Bloco 2 — Domínio do playground (puro, sem banco)
Arquivos (exclusivos): `src/lib/playground/tipos.ts`, `src/lib/playground/compilar-perfil.ts`, `src/lib/playground/detector-de-promessa.ts`, `src/lib/playground/ambiente.ts` (`isPlaygroundEnabled`), `src/lib/playground/dubles/` (código movido de `tests/helpers/mock-proposal-gateway.ts` e `fixture-discovery-adapter.ts`; os arquivos em `tests/helpers/` passam a **reexportar**, sem mudar os testes atuais), e um `*.test.ts` ao lado de cada.
Entrega: `compilarPerfil`, `aplicarBloco`, `detectarPromessaDeContemplacao(texto) → { ok } | { ok:false, motivo }`, guarda estrita, dublês em `src`.
GATE: `pnpm -s typecheck && pnpm exec vitest run src/lib/playground` → verde (critérios 2, 3, 5-guarda); mais os testes existentes que usam `tests/helpers/*` seguem verdes (ex.: `pnpm exec vitest run src/lib/agent/pi/fecho.test.ts`).

### Bloco 3 — Persistência e API (risco alto: migration + grava conduta viva)
Arquivos (exclusivos): `src/db/schema.ts` (apenas as 2 tabelas novas, no fim), `drizzle/0069_*.sql` + `drizzle/meta/*` (gerados), `src/lib/playground/repo.ts` (+ teste com banco, no molde de `caixa.test.ts`), `src/app/api/admin/playground/perfis/route.ts`, `.../perfis/[id]/route.ts`, `.../perfis/[id]/publicar/route.ts`, `.../chat/route.ts`, `.../*.test.ts`. Filtro em `GET /api/admin/simulator/sessions` (`route.ts:128`) para ocultar `metadata.playground` (mudança de uma linha, ao lado do Bloco 3).
Entrega: CRUD com concorrência otimista, detector em salvar/rodar/publicar, publicar via `publicarCaixa`, chat em stream com duas conversas (antes/depois, `isSimulated=true`), 404 fora de dev.
GATE: `pnpm -s typecheck && pnpm exec vitest run src/lib/playground src/app/api/admin/playground src/lib/agent/box/caixa.test.ts` → verde; mais `pnpm db:generate` sem diff pendente e `grep -Ei 'DROP|TRUNCATE|ALTER TABLE .* (DROP|ALTER COLUMN)' drizzle/0069_*.sql` vazio (critérios 5, 7, 8).

### Bloco 4 — Tela `/admin/playground`
Arquivos (exclusivos): `src/app/admin/(dashboard)/playground/page.tsx`, `src/components/admin/playground/*.tsx` (seletores, editor, histórico, chat lado a lado), `src/components/admin/app-sidebar.tsx` (uma linha, junto de `:99`).
Entrega: duas colunas, rótulos em texto, estados de erro do detector, confirmação do "Publicar" com diff, "Reiniciar", "Reproduzir roteiro", aviso "Bevi: dublê" e aviso do celular (D7).
GATE: `pnpm -s typecheck && pnpm exec biome check src/components/admin/playground "src/app/admin/(dashboard)/playground" src/components/admin/app-sidebar.tsx` → verde, mais teste de componente do seletor/erro (`*.test.tsx`) verde e print da página na dev (critério 6, na integração).

### Bloco 5 — QA (Frente A)
Arquivos (exclusivos): `src/lib/agent/pi/jornada-dubla.test.ts`, `scripts/qa/jornada-dev.ts`, `scripts/qa/acordar-dev.sh`, `docs/design/planos/evidencias/2026-11-04-qa-dev-d0056.md`.
Entrega: A.2 depende do Bloco 1 (onda 2); A.3 e `acordar-dev.sh` (6.3) só rodam após o deploy de dev.
GATE (A.2): `pnpm exec vitest run src/lib/agent/pi/jornada-dubla.test.ts` → verde. GATE (A.3, **lento e de risco alto, uma vez**, só após deploy de dev): `bash scripts/qa/acordar-dev.sh && E2E_BASE=<dev> E2E_CPF="$(<lido do vault>)" pnpm exec tsx scripts/qa/jornada-dev.ts` → 3 categorias `PASSOU`, id das propostas no relatório.

### Bloco 6 — Comparação de perfis e PPT (Frente C)
Arquivos (exclusivos): `scripts/playground/comparar-perfis.ts`, `scripts/playground/roteiros/*.json`, saída em `docs/design/planos/evidencias/2026-11-04-comparacao-perfis/` (transcrições e métricas), deck fora do repo.
Depende do Bloco 3 (compilador e seams; roda contra a dev ou local com a dublê).
GATE: `pnpm exec tsx scripts/playground/comparar-perfis.ts --roteiro scripts/playground/roteiros/basico.json --perfis suave-formal-leigo,insistente-coloquial-expert --saida /tmp/d0056-cmp` → gera 2 transcrições + `metricas.json`; e `test -s <deck>.pptx` com ≥ 1 slide por perfil e cada número com a fonte (arquivo) ao lado.

### Fechamento (orquestrador, não é bloco)
`git status` limpo, commits Conventional Commits em inglês sem `--no-verify`, dispatch de dev (6.1), A.3, relatório, PPT, e a lista das **Perguntas em aberto** respondidas ou escaladas.

## 8. Como você será avaliado

Casos que o `reviewer` confere (cada um com comando ou arquivo):

1. **D1 respeitada**: `git diff <base>..HEAD --stat` não tem `personas-repo.ts`, `schema.ts` na tabela `personas`, nem `/admin/personas`; existe `compilar-perfil.ts`; `grep -rn "personas" src/lib/playground` só acha `ExpertiseLevel` (tipo).
2. **Compilação**: teste cobre as 81 combinações, idempotência de `aplicarBloco` (aplicar 2× = 1×) e ordem conduta → bloco → skills → fato.
3. **Detector**: ≥ 12 casos de recusa e ≥ 8 de passagem, incluindo "contemplação garantida", "vai ser contemplado em 6 meses", "te garanto a contemplação", e passagens como "o sorteio é mensal e ninguém garante o mês".
4. **Servidor manda**: o corpo de `publicar`/`perfis` com texto proibido devolve 4xx mesmo sem passar pela UI (teste de rota); label sempre `labelDaCaixa()`.
5. **Guarda dev**: `TB_ENV` = `prod`, `production`, ausente, `staging` → 404 em página e 3 rotas; `dev` e `local` → ok; `SIMULATOR_FORCE_ENABLE=1` **não** habilita o playground.
6. **Dublê isolada**: teste prova que `createGateway()` com `PROPOSAL_GATEWAY=mock` ainda lança, e que a jornada com seams não chama `getProposalGateway`/`BeviSelfContractClient` reais (espiões em zero); `fulfillment.ts` sem diff.
7. **Publicar é explícito**: `versao` viva antes == depois de "Salvar"; +1 depois de "Publicar"; linha em `playground_perfil_versoes.caixa_versao` carimbada; histórico lista autor e data.
8. **Marca de teste (D7)**: SQL antes/depois do chat do playground: conversas e leads novos com `is_simulated = true` e `metadata.playground`; contagem `is_simulated = false` inalterada; teste do Bloco 1 prova o comportamento de `saveContactWhatsapp`/`registrarLeadIdentificado` para conversa simulada. Não se exige ausência no Pipeline (o código mostra simulados).
9. **QA**: relatório com 3 categorias × passos, rótulos `PASSOU`/`FALHOU`, ids de proposta, `desiredCount` e hora de acordar; sem CPF no arquivo (`git grep` com o número do ambiente, vazio).
10. **Antes×depois em tela**: print com legenda mostrando as duas falas, mesmo roteiro, perfis diferentes; o painel diz "Bevi: dublê".
11. **Deploy**: run do `workflow_dispatch` com `env=dev` verde, `Esperado em execucao: sha-<commit>` no log, e nenhuma ação em `prod`; `TB_ENV=dev` lido do secret antes.
12. **PPT**: arquivo existe, cada número tem a fonte, afirma o que o perfil **não** muda (P5: ninguém é empurrado ao fecho sem pedir).
13. **Higiene**: `pnpm -s typecheck` verde; commits em inglês; nada de `vitest run` inteiro como "prova".

## 9. Perguntas em aberto

Todas já subiram os dois primeiros degraus (plano/refino e `AGENTS.md`). Decisões do chefe na seção 10 (adotou as recomendações do PRD); a coluna "ainda aberto" lista o que só a máquina/o Kairo fecha.

- **Q1 — O que é "persona de produção" numa feature só-dev.** `parou em: premissa`. Recomendação: é a conduta viva da `caixa_de_prompt` **do banco da dev**; levar para a produção real é o fluxo já existente (`/admin/caixa` em prod) e pede GO.
- **Q2 — Onde mora a dublê da Bevi em runtime.** `parou em: premissa`. Recomendação: código em `src/lib/playground/dubles/`, ativado só por injeção na rota guardada; `tests/helpers/*` reexportam.
- **Q3 — Dev-gate e `TB_ENV`.** `parou em: máquina`. Nome/forma de acordar o dev-gate, URL da dev, rota de saúde e valor de `TB_ENV` na dev.
- **Q4 — "Camada 2" do detector.** `parou em: premissa`. Não achei o código; detector próprio.
- **Q5 — Como uma conversa de teste fica fora de pipeline, leads e régua.** Respondida pela máquina (D7).
- **Q6 — "Que está com o P"** (Lacuna 1 do refino) sem resposta; não bloqueia.
- **Q7 — Destino do PPT.** Pasta da demanda (`proposals/`), fora do repositório.

## 10. Validação do chefe (04/11/2026, contra o código da worktree)

**O que confirmei e o que corrigi no PRD**

| Ponto | Resultado | Onde ficou |
|---|---|---|
| Seams de `createRunTurnLivre`, `simularCota` e `startContract` sem gateway | Confirmado (já conferido). Acréscimo: o gateway é **parâmetro com default** em `fulfillment.ts:170`, `:329`, `:396`; o Bloco 1 repassa nas três, sem mexer em `fulfillment.ts` | D2, Bloco 1, 3 |
| Q5: o `SIM-` marca a conversa fora de pipeline/leads/régua? | **Não.** A marca é `conversations.is_simulated` (`schema.ts:413`) e `leads.is_simulated` (`:511`); `SIM-` é só o `waId` do WhatsApp simulado (`simulator/sessions/route.ts:44`). Métricas/exportação/funil filtram `is_simulated=false`; o **pipeline e `/admin/simulator` mostram** simulados (`lead-stage-tracker.ts:72-75`, `route.ts:128`) | D7, critério 8 reescrito, Bloco 3 |
| O que o turno faz com `saveContactWhatsapp` | `turno-livre.ts:1062-1069` chama **sempre** que há celular na fala, sem checar canal/simulação; reescreve `waId`, cria/atualiza lead (herda `is_simulated`), promove a `engajado` e dispara `registrarLeadIdentificado`. O plano antigo citava `:~1019-1030` (errado) | D7, risco 3, Bloco 1 |
| Conversão com celular real em conversa simulada | **Não confirmei**: `conversions/hash.ts:36-38` só ignora `SIM-`. Vira teste no Bloco 1 | Risco 3, Bloco 1 |
| `TB_ENV` na dev | **Não confirmável pelo repo**: só `docker-compose.yml:47` (`local`). Vive no secret `tb/dev/aja-agora/env`. Passo 0 do deploy lê a chave; guarda estrita falha segura (404) se faltar | 1, 2.2, 6.1 |
| `src/` pode importar `tests/helpers`? | **Pode** (`tsconfig.json` `include **/*.ts`; `.dockerignore` não exclui `tests/`; `Dockerfile` `COPY . .`; fixtures JSON estão em `src/lib/adapters/bevi/__fixtures__/`). Hoje nada em `src/` importa `tests/`. Mesmo assim, move-se para `src/lib/playground/dubles/` com reexport | D3, Bloco 2 |
| Ordem dos blocos | Corrigida: onda 1 = {1, 2}; onda 2 = {3, 4, 5-A.2}; depois deploy → 5-A.3 → 6. Dublês foram do Bloco 3 para o 2 | Seção 7 |
| Risco do Bloco 1 | Subido a **alto** (toca o turno do cliente) | Seção 4 |

**Decisões Q1–Q7 (adotadas as recomendações do PRD)**

- **Q1 — decidido.** "Produção" no playground = conduta viva da `caixa_de_prompt` do banco **da dev**. Levar a conduta ao ambiente real é o fluxo de `/admin/caixa` em prod e pede GO do Kairo; este plano não faz.
- **Q2 — decidido.** Dublê em `src/lib/playground/dubles/`, só por injeção na rota guardada (`TB_ENV` dev/local); `createGateway` e o `case "mock"` intactos; `tests/helpers/*` reexportam.
- **Q3 — decidido o caminho, aberto o dado.** `TB_ENV` lido do secret da dev no passo 0 (comando do 6.1); o dev-gate e a rota de saúde o executor descobre na máquina (`aws ecs describe-services` e, se zerado, o acordar do dev-gate; senão `update-service --desired-count 1`). Se `TB_ENV` não for `dev`, vira pedido de infra na fila, e o resto segue.
- **Q4 — decidido.** Detector próprio e mais largo em `src/lib/playground/detector-de-promessa.ts`; o do `whatsapp-template.ts` fica intacto. Se a "Camada 2" aparecer em outro repo, reaproveitar a lista depois.
- **Q5 — decidido (D7).** Conversa do playground nasce `channel=web`, `isSimulated=true`, `metadata.playground=true`; fora de métricas/exportação/funil por construção; aparece no Pipeline e no simulador como TESTE (o simulador filtra `metadata.playground`). O Bloco 1 testa o efeito do celular e das conversões.
- **Q6 — decidido.** Não bloqueia; o QA cobre o agente inteiro. Segue sem resposta, anotado.
- **Q7 — decidido.** PPT na pasta da demanda (`proposals/`), fora do repo; o envio ao grupo é do orquestrador pelo canal do refino (domínio TwoBrains).
