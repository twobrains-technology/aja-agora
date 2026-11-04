# Observabilidade do Pi no Langfuse — plugin oficial, duas etapas, de ponta a ponta

**Goal:** o dono vê no Langfuse o que os agentes Pi fazem — cada chamada ao modelo (tokens, custo, tempo
até o primeiro token) e cada tool call com entrada e saída — em **dois lugares separados**: os agentes
**de trabalho** que mexem neste repositório (projeto `pi-agentes-aja`) e o **vendedor do aja em dev**
(projeto `aja-agora`, separado por `environment`).

**Decisão do dono (27/10/2026, 13:35):** *"pode implementar as duas etapas de ponta a ponta, chega com
ele em producao em dev por favor."* E a de 13:12, já no `AGENTS.md`: PII não barra nada, **nada de
mascaramento**. Segredo de verdade continua fora de log, trace e commit.

> **Este documento descreve o que foi construído, não o que se imaginou construir.** A primeira versão
> planejava carregar o plugin por `import()` e não setar `userId`; as duas coisas mudaram quando o build
> reprovou o import e quando a revisão mostrou que a identidade era possível por sessão. Onde o plano
> antigo divergiu, o texto abaixo diz o que ficou e por quê.

## Problema

O motor Pi é o vendedor (`src/lib/agent/pi/turno-livre.ts`) e, desde 19/10/2026, **não deixa rastro
nenhum** fora do banco do app: o que o modelo recebeu, quanto custou, qual ferramenta rodou e quanto
tempo levou só se sabia por `console.log` e pelo livro-caixa local. Não havia como abrir uma conversa e
ver o turno inteiro, comparar dois turnos, nem medir custo por ferramenta. A `main` (motor LangGraph)
manda trace ao Langfuse pelo SDK; o motor Pi, não.

## Solução

O plugin **oficial** `@langfuse/pi-observability-plugin@0.1.2`, sem fork, carregado de dois jeitos conforme
o host:

- **Etapa 1 — Pi de trabalho:** `pi install -l` na worktree. O CLI lê o pacote pelo campo `pi.extensions`
  do `package.json` dele e transpila com jiti. Nada global.
- **Etapa 2 — o app:** o mesmo pacote entra pelo **`additionalExtensionPaths`** do `DefaultResourceLoader`
  que já monta a sessão do turno (`src/lib/agent/pi/sessao.ts:178`) — o mecanismo do Pi que carrega
  extensão em TypeScript de um caminho, com jiti. Nenhuma linha de instrumentação nossa, nenhum span
  escrito à mão.

O que o app decide é só: **quando ligar**, **com que id de sessão**, **com que identidade** e **o que
nunca pode acontecer** (derrubar o turno).

**Stack:** Next.js 16 (App Router) + TypeScript · `@earendil-works/pi-coding-agent@1.3.0`
(`package.json:51`) · `@langfuse/pi-observability-plugin@0.1.2` (`package.json:54`; deps
`@langfuse/otel`/`@langfuse/tracing` `^5.10.0`, no `package.json:42-43` do plugin) · Langfuse
self-hosted da TwoBrains (`https://langfuse.twobrainstechnology.com`; a versão do servidor v4.6.0 foi
registrada em 27/10 e **não foi reconferida** nesta publicação — não sai de código) · vitest 4 + Biome ·
deploy por `.github/workflows/aws-ecr-deploy.yml` (env=dev).

## Grandes ideias

- **O interruptor é a flag + as três chaves.** `LANGFUSE_TRACING_ENABLED` em `true`/`1`/`yes`/`on`
  **e** `LANGFUSE_BASE_URL`/`PUBLIC_KEY`/`SECRET_KEY` presentes. Sem a flag, com as três chaves postas,
  continua desligado (`langfuse.ts:65-86`) — um app não começa a mandar trace porque alguém exportou uma
  chave. O plugin sozinho faria o contrário: ele só entende o literal `"false"` como desligado
  (`src/index.ts:89`), e sem chaves registra um hook de status e sai (`:442-452`).
- **A conversa é a sessão.** `SessionManager.inMemory(cwd, { id: conversationId }, entries)`
  (`sessao.ts:255-259`): o plugin pega o id em `ctx.sessionManager.getSessionId()` (`src/index.ts:605`),
  então dois turnos da mesma conversa caem na mesma sessão. O id passa por `ehIdDeSessaoValido()`
  (`langfuse.ts:99`) porque `assertValidSessionId` **lança** dentro do turno (`session-manager.js:15-19`).
- **A pessoa é o `userId`, por sessão.** O plugin lê `LANGFUSE_USER_ID` no `loadConfig()` da factory
  (`src/index.ts:108,444`), que roda **por sessão** — dá para variar. `comIdentidadeDoTurno`
  (`langfuse.ts:181`) põe a env em volta do `loader.reload()` e devolve o ambiente como estava, sob fila
  que **só existe com a observabilidade ligada** e dura um reload (4-5 ms com o jiti quente). A regra é a
  do `origin/main` (`lib/observability/langfuse/turn.ts`), em `userIdDoTurno` (`langfuse.ts:212`): cookie
  `AJA_UID` na web, `wa:<telefone>` no WhatsApp, `conversationId` como último recurso.
- **A extensão nunca custa o turno.** `caminhoDoPluginDoLangfuse()` (`langfuse.ts:128`) resolve o caminho
  e, se não achar, loga e devolve `null` — a sessão nasce sem observabilidade e o cliente recebe a fala
  do mesmo jeito.
- **Truncamento generoso, sem mascarar.** `PI_LANGFUSE_MAX_CHARS=40000` (o prompt do vendedor passa de 20
  mil caracteres — o caso em `langfuse.test.ts:84` assere `> 20_709`; o default do plugin é 20.000 e
  cortaria o input). PII em claro, por decisão do dono.

## Variáveis

| variável | para quê | dev |
|---|---|---|
| `LANGFUSE_TRACING_ENABLED` | o interruptor; sem ela nada liga | `true` |
| `LANGFUSE_BASE_URL` | host do Langfuse | `https://langfuse.twobrainstechnology.com` |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | par do projeto | do vault |
| `LANGFUSE_TRACING_ENVIRONMENT` | separa tráfego no mesmo projeto | `dev` |
| `PI_LANGFUSE_MAX_CHARS` | teto por campo no trace | `40000` |

Todas no secret `tb/dev/aja-agora/env-sd6Axo` (sa-east-1) **e** documentadas em `.env.example:147-156`
(as três últimas em `:154`, `:155`, `:156`) e passthrough em `docker-compose.yml:147-155` (as três em
`:151`, `:152`, `:155`).

## Contexto — o que existe hoje, verificado no código commitado

| fato | onde está |
|---|---|
| gate, guarda de id, caminho do plugin, identidade e regra de userId | `src/lib/agent/pi/langfuse.ts:42` (`ConfigDoLangfuse`), `:54` (`MAX_CHARS_PADRAO`), `:56` (`texto()`), `:65-86` (`configDoLangfuse`), `:88` (`langfuseLigado`), `:99` (`ehIdDeSessaoValido`), `:128` (`caminhoDoPluginDoLangfuse`), `:179` (fila), `:181` (`comIdentidadeDoTurno`), `:212` (`userIdDoTurno`) |
| sessão: id guardado, extensão por caminho, identidade em volta do reload | `src/lib/agent/pi/sessao.ts:26-31` (imports), `:118` (`conversaId?`), `:122` (`userId?`), `:162` (`pluginDoLangfuse`), `:178` (`additionalExtensionPaths`), `:184` (`comIdentidadeDoTurno(…, loader.reload)`), `:246-259` (`idDaSessao` + `SessionManager.inMemory`) |
| repasse no beat | `src/lib/agent/pi/converse.ts:26` (`conversaId`), `:29` (`userId`), `:64-70` (chamada `abrirSessao`, com `conversaId` em `:68` e `userId` em `:69`) |
| o turno entrega id e identidade | `src/lib/agent/pi/turno-livre.ts:25` (import), `:1254` (chamada `executarBeat`), `:1265` (`conversaId`), `:1266-1270` (`userId: userIdDoTurno({…})`) |
| testes | `src/lib/agent/pi/langfuse.test.ts` (19 casos), `src/lib/agent/pi/sessao.test.ts` (6) |
| imagem standalone leva os pacotes | `Dockerfile:87-88` (`COPY … /app/node_modules/@langfuse` e `/@opentelemetry`) |
| `session.dispose()` existe e ninguém chama | `agent-session.d.ts:387`; nenhum `.dispose()` em `src` (`grep -rn "\.dispose()" src` → nada); o plugin só desliga o provider no `session_shutdown` com `reason === "quit"` (`src/index.ts:972-981`) → provider vivo até o processo morrer |

**Fatos do pacote** (`node_modules/@langfuse/pi-observability-plugin/src/index.ts`): `:29`
`PI_LANGFUSE_MAX_CHARS` lido no **load do módulo** (default 20.000); `:87-112` `loadConfig()`, com `:89`
kill switch só no literal `"false"`, `:100-101` **`LANGFUSE_BASE_URL`** com `LANGFUSE_HOST` de fallback,
`:108` `userId`, `:109` `environment`, e `:121-133` `readConfigFile()` (`~/.pi/agent/langfuse.json`);
`:373-410` provider próprio + `setLangfuseTracerProvider` (`:404` `new NodeTracerProvider`, `:409`
`setLangfuseTracerProvider`); `:442-452` factory default sem opções que, sem chaves, registra um hook de
status e sai; `:605` e `:870` `getSessionId()`; `:606-608` o `event.prompt` sem estreitar a variante
`custom` (o defeito #54 do plugin); `:965` flush em `agent_settled`; `:972-981` shutdown só em
`session_shutdown` com `reason === "quit"`. O `package.json` do pacote **não tem** `main`/`exports`/`types`
— só `"pi": { "extensions": ["./src/index.ts"] }` (`package.json:26-30`), a versão é `0.1.2`
(`package.json:3`) e o publicado é TypeScript cru.

## Fluxo

`POST /api/chat` → `runTurnLivre` → `executarBeat` → `abrirSessao({ conversaId, userId })`:
1. `caminhoDoPluginDoLangfuse()` decide se há observabilidade (flag + 3 chaves) e devolve o caminho
   absoluto do `src/index.ts`;
2. `DefaultResourceLoader` recebe as tools inline **e** o `additionalExtensionPaths`;
3. `comIdentidadeDoTurno(userId, () => loader.reload())` — a factory roda aqui, e é o único instante em
   que o `LANGFUSE_USER_ID` precisa estar certo;
4. `SessionManager.inMemory(cwd, { id: conversationId }, entries)` — a conversa vira a sessão;
5. `session.prompt(...)` emite `before_agent_start` e o plugin abre o `Conversational Turn`, uma
   `generation` por chamada e uma observação `tool` por ferramenta; `agent_settled` faz o flush.

## Os blocos

### B1 · Gate, guarda de id e regra de identidade — `langfuse.ts`

Puro, sem carregar o plugin. `configDoLangfuse()`, `langfuseLigado()`, `ehIdDeSessaoValido()`,
`userIdDoTurno()`, `comIdentidadeDoTurno()`.

**Gate:** `pnpm vitest run src/lib/agent/pi/langfuse.test.ts && pnpm -s typecheck && pnpm lint`

**Teste que morde:** "com duas das três chaves, desligado (não existe meio-ligado)"
(`langfuse.test.ts:34`) e "`LANGFUSE_TRACING_ENABLED=false` desliga mesmo com as três" (`:56`) — se
alguém voltar ao "as chaves bastam", caem; "duas conversas simultâneas NÃO se contaminam" (`:155`) — se
alguém tirar a fila, cai; "sem chave e sem telefone, cai no `conversationId`" (`:125`).

**Gap declarado:** não há caso que tire **só a flag** mantendo as três chaves (a constante `LIGADO`, no
topo do teste, já inclui `LANGFUSE_TRACING_ENABLED: "true"`). O comportamento está no código
(`langfuse.ts:65-86`, o primeiro `if`), mas não tem teste próprio — ver Q1.

### B2 · Carregar o plugin que não tem `main`/`exports` e não compila contra o Pi 1.3.0

**Dois caminhos foram medidos, e o primeiro falhou.** `import("@langfuse/pi-observability-plugin/src/index")`
num `.ts` nosso + `transpilePackages` fez o `next build` morrer em **"Failed to type check"**
(`node_modules/…/src/index.ts:606-608`, `Property 'prompt' does not exist on type 'BeforeAgentStartEvent'`
— o defeito #54 do plugin). `declare module` não resolve (o arquivo resolvido ganha do ambiente) e mapear
`paths` também não (o Next usa `paths` como alias do bundler; um alias para `.d.ts` mataria o import em
runtime). O nome nu não resolve (`ERR_MODULE_NOT_FOUND`) e o caminho cru no Node não carrega
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`).

**O que ficou:** caminho absoluto via `createRequire(join(process.cwd(), "noop.js"))` resolvendo
`@langfuse/pi-observability-plugin/package.json`, e o Pi carrega com jiti. Medido: **53 ms na primeira vez,
4-5 ms nas seguintes**, `errors: []`, nenhuma instalação em tempo de turno (caminho absoluto →
`parseSource` → `local`). E a imagem precisa dos pacotes: `COPY` explícito no `Dockerfile:87-88`, porque o
file tracer do Next não vê módulo carregado por caminho (o dev provou: `Cannot find module
'@langfuse/pi-observability-plugin/package.json'`; `outputFileTracingIncludes` com glob de
`node_modules` não resolveu — `next.config.ts:37-39`).

**Gate:** `pnpm vitest run src/lib/agent/pi/langfuse.test.ts` (o caso "ligado devolve o caminho absoluto
do fonte do plugin", `langfuse.test.ts:84`) `&& pnpm -s build` (o typecheck do Next tem de passar).

**Teste que morde:** o caminho resolvido tem de terminar em
`node_modules/@langfuse/pi-observability-plugin/src/index.ts`; se alguém voltar ao `import()`, o
`pnpm -s build` volta a morrer.

### B3 · A sessão: id da conversa + extensão + identidade

`sessao.ts` recebe `conversaId` e `userId`, resolve o caminho uma vez, e passa `{ id }` **só** com a
observabilidade ligada e o id válido — fora disso o comportamento é o de antes, byte por byte.

**Gate:** `pnpm vitest run src/lib/agent/pi/sessao.test.ts`

**Teste que morde:** com as envs, `session.sessionManager.getSessionId()` **é** o `conversationId` e
`hasExtensionHandlers("before_agent_start")` é `true` (`sessao.test.ts:180,184`); sem as envs, o id é o do
Pi e o handler é `false` (`:198,200`); id fora do formato não estoura o turno (`:225`); a identidade não
fica no ambiente depois (`:203`).

### B4 · O turno entrega id e identidade

`turno-livre.ts` calcula `userIdDoTurno({ userKey: input.userKey, waId: conv?.waId, conversaId })` — o
WhatsApp não manda `userKey` no `TurnInput`, então o telefone sai do `waId` da conversa, que é a mesma
fonte que a `main` usava no adapter.

**Gate:** `pnpm vitest run src/lib/agent/pi/converse.test.ts src/lib/agent/pi/sessao.test.ts`
`&& pnpm -s typecheck && pnpm lint`

### B5 · Merge, push, env no dev e deploy

`develop` empurrada, as 6 envs no secret `tb/dev/aja-agora/env-sd6Axo`, deploy por
`workflow_dispatch env=dev`.

**Três armadilhas medidas, na ordem em que custaram tempo:**
1. o workflow **renderiza a task definition no início da run** — gravar o secret depois de disparar deixa
   as chaves de fora (aconteceu às 17:40);
2. o workflow **não registra task definition nova**, só `--force-new-deployment`: chave nova no secret
   exige revisão registrada na mão (`aja-agora-dev:13`, reversível para `:12`);
3. a imagem standalone não leva o plugin sem o `COPY` no `Dockerfile`.

**Gate:** `gh run view <id>` verde + trace real no environment `dev` (tabela abaixo).

### B6 · Passo de produção

Não é deste mandato (a produção roda a `main`, motor LangGraph). A receita está em
**`docs/design/2026-10-27-langfuse-pi-em-producao.md`**, com as 6 chaves, a revisão de task definition e
o risco do provider por turno.

## O que NÃO muda

- A condução do vendedor: nenhuma linha do prompt ou das tools foi tocada.
- Sem as envs (ou com a flag desligada), o turno é exatamente o de antes — inclusive o id de sessão do Pi.
- Nada na `main`, nada em `tb/prod/aja-agora/env`, nada no serviço `aja-agora-prod`.

## Definição de pronto

- [x] Projeto `pi-agentes-aja` existe no Langfuse de produção (`cmvqx71nk0003mv06kw334gcq`; registrado em
      `.orientacao/diario.md:68`); chaves só no vault cifrado (`credentials-langfuse.md` + bundle
      `pi-agentes-aja-langfuse`).
- [x] Etapa 1: trace `9e8875e385cdf1cedcc81f8fca06ad26` no `pi-agentes-aja`, environment `agents`, com
      duas `generation` (tokens e custo) e `Tool: bash`; nenhum `pi install` global (`pi list` fora das
      worktrees do aja não lista o plugin).
- [x] Etapa 2: turno do chat de dev gera trace no projeto `aja-agora`, environment `dev`, com
      generation, `Tool: buscar_cartas`, `session_id` = `conversationId` e `userId` do cookie; dois turnos
      da mesma conversa na **mesma** sessão; sem as envs, nenhum efeito (teste em `sessao.test.ts`).
- [x] `develop` empurrada e dev deployado com as envs (runs registradas em `.orientacao/diario.md:175-220`;
      contagem de runs não reconferida nesta publicação); turno real rastreado.
- [x] Diário com o passo de produção (`docs/design/2026-10-27-langfuse-pi-em-producao.md` e
      `.orientacao/diario.md`).
- [x] Gate de cada bloco por comando, todos verdes; `pnpm -s build` passa o typecheck (ver "Estado do gate
      na publicação").

## Como você será avaliado

Pelo trace real no Langfuse (id do trace e o que ele mostra), não pelo relatório. Gate verde sem trace é
não pronto.

## Comandos de validação

```bash
# chão
pnpm -s typecheck && pnpm lint

# B1/B2 (gate + caminho do plugin + identidade)
pnpm vitest run src/lib/agent/pi/langfuse.test.ts

# B3/B4 (sessão = conversa, ligado/desligado, id inválido, identidade não vaza)
pnpm vitest run src/lib/agent/pi/sessao.test.ts src/lib/agent/pi/converse.test.ts

# B2 no build de verdade (é aqui que o import() morria)
pnpm -s build

# invariantes
git log --oneline origin/main -1          # intocado
pi list | grep -i langfuse || echo "sem plugin global (correto)"
grep -rn "pk-lf-\|sk-lf-" --include=*.ts --include=*.md src docs | grep -v teste || echo "nenhuma chave real"
```

## Riscos

| risco | tratamento |
|---|---|
| provider OTel por turno nunca desligado (`session.dispose()` não emite `session_shutdown`) | flush acontece em `agent_settled`; o provider sobra vazio. Medir RSS na primeira semana de produção (B6) |
| `~/.pi/agent/langfuse.json` do host injetar config alheia | env vence o arquivo (`src/index.ts:87-112`; o arquivo é lido em `:121-133`) e o container não tem o arquivo |
| fila da identidade virar gargalo | só existe com a observabilidade ligada e dura um reload (4-5 ms medidos) |
| plugin mudar e quebrar a carga | versão **exata** (`0.1.2`) no `package.json:54` e no `pnpm-lock.yaml` |

## Decisões tomadas neste plano

- **`userId` é setado por sessão**, com fila em volta do `loader.reload()` — depois de a revisão mostrar
  que o "impossível" era só o caminho global do `process.env`. Descartadas com motivo: getter com
  `AsyncLocalStorage` no `process.env` (o Node recusa, `ERR_INVALID_OBJECT_DEFINE_PROPERTY`), env sem
  proteção (corrida entre conversas → atribuição errada) e `langfuse.json` por sessão (mesma corrida, via
  `PI_CODING_AGENT_DIR`).
- **`LANGFUSE_HOST` não é aceito no gate.** O plugin aceita como fallback, mas quem liga esta integração é
  o secret, que usa `LANGFUSE_BASE_URL`; duas envs para a mesma coisa convidam a metade do time usar cada
  uma. O nosso código não lê `LANGFUSE_HOST` em lugar nenhum (`grep -n LANGFUSE_HOST src` → nada).
- **A env é `LANGFUSE_BASE_URL`** (com underline) — o mandato escreveu `LANGFUSE_BASEURL`.
- **Transporte por caminho, não por factory.** Ver B2.
- **`environment=dev`** no mesmo projeto `aja-agora`, que é o desenho pedido.

## Resultado medido (27/10/2026)

As linhas desta tabela vêm das medições de 27/10 registradas em `.orientacao/diario.md` e no arquivo de
evidência citado; **não foram re-medidas nesta publicação** (sem acesso ao Langfuse nem ao cluster nesta
sessão). O que foi reconferido agora é o código, na seção "Contexto".

| prova | como | resultado |
|---|---|---|
| projeto `pi-agentes-aja` | `GET /api/public/projects` com o par novo | `200`, id `cmvqx71nk0003mv06kw334gcq` (`.orientacao/diario.md:68`) |
| Etapa 1 | trace `9e8875e385cdf1cedcc81f8fca06ad26` | `Conversational Turn` 3,54 s ∑ **$0,000525**; `LLM Call` 184→60 (61.940) $0,000249; **`Tool: bash`**; `LLM Call` 264→4 (78.348) $0,000276; env `agents` — `evidencias/2026-10-27-langfuse-etapa1-trace.png` |
| Etapa 2, dois turnos, uma sessão | conversa `dea48023-61f3-4692-bc81-a5b4ed742140` | traces `abe65b72001e3fae361e5b3bd3f841cb` (`buscar_cartas`) e `0d114102c583e6f6bd02f6eb687da421` (`mostrar_card`), `session_id` igual nos dois, `Total traces: 2 · $0,030566` — `evidencias/2026-10-27-langfuse-dev-sessao-dois-turnos.png` |
| **`userId` no trace** | conversa `f6239b96-1a5c-4851-b595-407b618a2c96`, trace `8b21dd5645297ef7989b0cad9c594083` | `User ID: uid-d0014-revisao-1793125864`, `Session: f6239b96-…`, `Env: dev`, 13.548→297 tokens, `$0,015033`, `Tool: buscar_cartas` — `evidencias/2026-10-27-langfuse-dev-userid-trace.png` |
| sem as envs, nenhum efeito | `sessao.test.ts:187-200` | `hasExtensionHandlers("before_agent_start")` `false`; id do Pi |
| nenhum `pi install` global | `pi list` fora das worktrees do aja | o plugin não aparece |
| build | `pnpm -s build` | typecheck do Next passa (o `import()` morria aqui) — registrado em `.orientacao/diario.md:160-162` |
| dados brutos das observações | `evidencias/2026-10-27-langfuse-etapa2-dev.json` | o que a API do Langfuse devolveu, colado sem edição |

## Correções desta publicação

Cada linha foi conferida no código desta worktree, em 27/10/2026, e traz o comando que provou. O rascunho
anterior citava `extensoesDoLangfuse()` e o arquivo `carregador-do-langfuse.test.ts` — **isso não existe
no código**: `grep -rn "extensoesDoLangfuse" src` e `grep -rn "carregador-do-langfuse" src` não devolvem
nada, e o arquivo não está em `src/lib/agent/pi/` (`ls` do diretório). As menções foram removidas.

| o que estava | o que é | como provei |
|---|---|---|
| `.env.example:146-156` | `.env.example:147-156` (146 é linha em branco) | `grep -n LANGFUSE .env.example` → `154`, `155`, `156`; leitura de `138-165` |
| `docker-compose.yml:147-156` | `docker-compose.yml:147-155` | `grep -n LANGFUSE docker-compose.yml` → `151`, `152`, `155` |
| `sessao.ts:27-29` (imports) | `sessao.ts:26-31` | leitura de `sessao.ts:24-35` (bloco `import {` em 26, `} from "./langfuse";` em 31) |
| `converse.ts:68-69` (chamada `abrirSessao`) | `converse.ts:64-70` (chamada), `conversaId` em `:68`, `userId` em `:69` | leitura de `converse.ts:62-73` |
| `turno-livre.ts:1265-1269` | `:1254` (chamada `executarBeat`), `:1265` (`conversaId`), `:1266-1270` (`userIdDoTurno({…})`) | leitura de `turno-livre.ts:1252-1273` |
| pacote `:96-111` (config) | `:87-112` (`loadConfig()`), e `readConfigFile()` em `:121-133` | `grep -n "function loadConfig\|function readConfigFile" …/src/index.ts` + leitura de `121-134` |
| pacote `:606` (defeito #54) | `:606-608` | `grep -n "event.prompt\|event.images" …/src/index.ts` |
| `Dockerfile` do `COPY` sem linha | `Dockerfile:87-88` | `grep -n "@langfuse\|@opentelemetry" Dockerfile` |
| B1 citava um teste "sem a flag, com as três chaves" que **não existe** | citados os testes reais (`langfuse.test.ts:34`, `:56`, `:125`, `:155`) e declarado o gap | `grep -n "it(" src/lib/agent/pi/langfuse.test.ts` (19 casos) e leitura de `1-66` |
| B3 citava os testes sem linha | `sessao.test.ts:180,184,198,200,203,225` | `grep -n "it(\|hasExtensionHandlers\|getSessionId" src/lib/agent/pi/sessao.test.ts` |
| versão `v4.6.0` do Langfuse afirmada sem fonte | marcada como registrada em 27/10 e **não reconferida** | não sai de código: `grep -rn "4\.6\.0"` só acha este documento |
| secret `tb/dev/aja-agora/env` | `tb/dev/aja-agora/env-sd6Axo` (o sufixo é gerado pela AWS) | `.orientacao/diario.md:214` |
| "4 runs verdes" | contagem de runs não reconferida nesta publicação; os run ids ficam no diário | `.orientacao/diario.md:175-220` |

Conferido e **mantido** sem mudança: todos os símbolos citados existem com esses nomes
(`ConfigDoLangfuse` `:42`, `MAX_CHARS_PADRAO` `:54`, `texto` `:56`, `configDoLangfuse` `:65`,
`langfuseLigado` `:88`, `ehIdDeSessaoValido` `:99`, `caminhoDoPluginDoLangfuse` `:128`,
`comIdentidadeDoTurno` `:181`, `userIdDoTurno` `:212`; `additionalExtensionPaths` `sessao.ts:178`;
`comIdentidadeDoTurno(…, loader.reload)` `sessao.ts:184`; `SessionManager.inMemory` `sessao.ts:255`;
`conversaId`/`userId` `converse.ts:26,29`; `userIdDoTurno` `turno-livre.ts:25,1266`); a contagem de
casos nos dois arquivos de teste (19 e 6) e a versão `0.1.2` do plugin (`package.json:54`, e
`node_modules/@langfuse/pi-observability-plugin/package.json:3`).

## Estado do gate na publicação

Rodado nesta worktree (`kairogyn/chefe-langfuse-pi`) depois da publicação, por quem tem shell:

| comando | resultado (27/10/2026, 15:42) |
|---|---|
| `pnpm vitest run src/lib/agent/pi/langfuse.test.ts src/lib/agent/pi/sessao.test.ts src/lib/agent/pi/converse.test.ts` | **29 verdes** (20 + 6 + 3), 3 arquivos |
| `pnpm -s typecheck` | sem saída, exit 0 |
| `pnpm lint` | "Checked 921 files … No fixes applied" |
| `pnpm -s build` | "Finished TypeScript in 8.1s" e segue; falha depois só por falta de `DATABASE_URL` local na coleta de page data — nada a ver com esta entrega |
| mordida do teste do interruptor | removendo a linha da flag em `configDoLangfuse`, **2 casos ficam vermelhos** ("com as TRÊS chaves e SEM a flag, continua DESLIGADO" e "recusa false/0/no/off/vazio"); devolvida a linha, 20 verdes |

O verificador que publicou este arquivo não tinha shell e registrou "não conferido" — corretamente. Quem
confirma é a tabela acima, com o comando colado.

## Perguntas em aberto

**Q1 — o caso "só as três chaves, sem a flag" tinha teste?** Não tinha — e o verificador achou. A
constante `LIGADO` do teste já trazia a flag, então o caso central do "desligado por padrão" não estava
provado. **Corrigido**: dois casos novos em `langfuse.test.ts` (o de "com as três e sem a flag continua
desligado" e o de recusa de `false/0/no/off/vazio`), com a mordida verificada — tirando a checagem da
flag do código, os dois ficam vermelhos.

**Q2 — quem assina o gate?** Quem tem shell. A tabela "Estado do gate na publicação" acima tem os
comandos e o resultado, e o último resultado fica no `.orientacao/diario.md`.
