# Observabilidade do Pi no Langfuse — plano de implementação (D-0014, etapas 1 e 2)

**Goal:** todo turno do vendedor em **dev** aparece no Langfuse como **uma sessão por conversa**, com
as chamadas ao modelo (tokens, custo, tempo) e as tools, e a observabilidade **nunca** derruba a fala
do cliente. Etapa 1 (agentes de trabalho do aja) já está provada e congelada; este plano fecha a etapa 2
e escreve a receita da etapa 3 (produção).

**Arquitetura:** o trabalho é do plugin oficial `@langfuse/pi-observability-plugin@0.1.2`, pinado, sem
fork. O app **não instrumenta nada à mão**: `src/lib/agent/pi/langfuse.ts` decide só três coisas —
quando ligar (as três chaves presentes), com que id de sessão (`conversationId`, para uma conversa ser
UMA sessão no Langfuse) e que falha de observabilidade não custa o turno. A extensão entra como mais
uma factory no `DefaultResourceLoader` de `src/lib/agent/pi/sessao.ts`, e o id entra pelo
`SessionManager.inMemory(cwd, { id }, entries)`, porque o plugin lê `ctx.sessionManager.getSessionId()`
(`node_modules/@langfuse/pi-observability-plugin/src/index.ts:605`). Desligado por padrão: sem as
chaves, a lista de fábricas é vazia e a sessão é a de sempre.

**Stack:** Next.js App Router + TypeScript · `@earendil-works/pi-coding-agent@1.3.0` ·
`@langfuse/pi-observability-plugin@0.1.2` (pinado, `package.json:54`) · vitest 4 + Biome (`pnpm lint`) ·
Langfuse v4.6.0 self-hosted TwoBrains (`https://langfuse.twobrainstechnology.com`).

## Problema

O motor Pi é o vendedor (`src/lib/agent/pi/turno-livre.ts`) e hoje **não deixa rastro nenhum**: o que o
modelo recebeu, quanto custou, qual tool rodou e quanto tempo levou só se sabe pelo `console.log` de
`[pi-livre] uso conv=… input=… output=…` (`turno-livre.ts:1419`). Desde que o LangGraph e o Langfuse
saíram do produto (19/10/2026) existe o livro-caixa local em banco, mas **nenhuma visão de trace**: não
dá para abrir uma conversa e ver o turno inteiro, nem comparar dois turnos, nem custo por tool. A etapa
1 já provou que o plugin funciona neste host — falta o vendedor.

## Solução

Ligar o plugin **pelo caminho que ele mesmo declara** (`pi.extensions: ["./src/index.ts"]`), carregado
pelo **jiti do próprio Pi** (`additionalExtensionPaths` do `DefaultResourceLoader`), com três decisões
explícitas em `langfuse.ts`: gate pelas chaves, `session_id = conversationId` e falha isolada.
A conversa inteira vira uma sessão no Langfuse; o `environment=dev` separa do tráfego real no **mesmo**
projeto `aja-agora`, que é o desenho pedido. O `userId` fica **ausente de propósito**: o plugin só o
aceita por `LANGFUSE_USER_ID`/`~/.pi/agent/langfuse.json` — **um valor por processo**
(`src/index.ts:108`) —, e inventar um valor por processo criaria corrida entre turnos; a pessoa
continua ligada à conversa no banco pelo `conversationId`.

## Grandes ideias

- **O interruptor é ter as chaves, não uma flag.** `LANGFUSE_TRACING_ENABLED` só desliga no literal
  `"false"` (`src/index.ts:89`); sem `publicKey`/`secretKey` a factory registra um hook e sai
  (`src/index.ts:442-452`). Logo "ligado pela metade" é um estado que gasta o turno sem mandar nada —
  `configDoLangfuse()` exige as três (`langfuse.ts:56-71`).
- **O `session_id` tem de entrar pelo `SessionManager`.** A factory não recebe opção nenhuma
  (`export default function (pi: ExtensionAPI)`, `src/index.ts:442`); o único caminho é
  `NewSessionOptions { id }` (`session-manager.d.ts:13-16`) no `SessionManager.inMemory`
  (`session-manager.d.ts:386`, usado em `sessao.ts:236`).
- **O pacote não tem `main`/`exports`/`types`** — `node_modules/@langfuse/pi-observability-plugin/package.json`
  declara só `"pi": { "extensions": ["./src/index.ts"] }`. Um `import()` de especificador nu não
  resolve, e **`import()` do caminho explícito num `.ts` nosso quebra o `next build`**: o `tsc` passa a
  checar o fonte do plugin, que não compila contra o Pi 1.3.0 (defeito #54). Por isso a carga é por
  **caminho, via jiti** — medido, ver Bloco B2.
- **Observabilidade é acessório.** Qualquer falha do plugin (módulo ausente, id inválido, factory
  estranha) cai no `catch` de `caminhoDoPluginDoLangfuse()` e o vendedor fala.
- **O id do Langfuse é o id da conversa, e ele é validado antes.** `assertValidSessionId` **lança**
  dentro do turno (`session-manager.d.ts:179`); `ehIdDeSessaoValido()` (`langfuse.ts:84-87`) é a guarda
  que transforma "id esquisito" em "sem observabilidade", não em turno quebrado.

## Variáveis

- RAIZ: `/Users/kairo/orca/workspaces/aja-agora/chefe-langfuse-pi`
- PROJETO: `aja-agora` · BASE: `develop` · BRANCH DE TRABALHO: `kairogyn/chefe-langfuse-pi`
- MODELO: o do app (`AI_MODEL`, via LiteLLM) — os blocos não trocam modelo
- LANGFUSE (etapa 2): `LANGFUSE_BASE_URL=https://langfuse.twobrainstechnology.com`,
  `LANGFUSE_TRACING_ENVIRONMENT=dev`, projeto `aja-agora`
- LANGFUSE (etapa 1, já provada): projeto `pi-agentes-aja` (id `cmvqx71nk0003mv06kw334gcq`), trace
  `9e8875e385cdf1cedcc81f8fca06ad26`; print em
  `docs/design/planos/evidencias/2026-10-27-langfuse-etapa1-trace.png`
- Gate do projeto: teste **ao lado do arquivo tocado** + `pnpm -s typecheck` + `pnpm lint`; a suíte
  inteira não volta (removida em `d67ea102`, registrado no `AGENTS.md`).

## Contexto — o que já existe (medido nesta worktree, não herdado)

| fato | onde está |
|---|---|
| `langfuse.ts` — gate, guarda de id, caminho do plugin e identidade por sessão | `src/lib/agent/pi/langfuse.ts:42` (`ConfigDoLangfuse`), `:54` (`MAX_CHARS_PADRAO = "40000"`), `:65-86` (`configDoLangfuse`, com a flag obrigatória), `:88` (`langfuseLigado`), `:99` (`ehIdDeSessaoValido`), `:128` (`caminhoDoPluginDoLangfuse`), `:181` (`comIdentidadeDoTurno`), `:212` (`userIdDoTurno`) |
| `sessao.ts` — `additionalExtensionPaths` + `{ id }` guardado + identidade em volta do reload | `src/lib/agent/pi/sessao.ts:27-29` (imports), `:118` (`conversaId?`), `:122` (`userId?`), `:162` (`pluginDoLangfuse`), `:178` (`additionalExtensionPaths`), `:184` (`comIdentidadeDoTurno(…, loader.reload)`), `:246-258` (`idDaSessao` + `SessionManager.inMemory`) |
| `converse.ts` — repassa `conversaId` e `userId` | `src/lib/agent/pi/converse.ts:26` e `:29` (`BeatArgs`), `:68-69` (`abrirSessao({…})`) |
| `turno-livre.ts` — o turno entrega id da conversa e identidade da pessoa | `src/lib/agent/pi/turno-livre.ts:25` (import), `:1265-1269` (`executarBeat({ …, conversaId, userId: userIdDoTurno(…) })`) |
| testes | `src/lib/agent/pi/langfuse.test.ts` (19 casos), `src/lib/agent/pi/sessao.test.ts` (6) |
| `session.dispose()` existe em 1.3.0 e **ninguém chama** | `agent-session.d.ts:387`; `grep -rn dispose src/lib/agent/pi` → nada. O plugin só desliga o provider no hook `session_shutdown` com `reason === "quit"` (`src/index.ts:972-981`) → provider vivo até o processo morrer |
| o plugin lê config também de `~/.pi/agent/langfuse.json` | `src/index.ts:96-111` (`readConfigFile` → `getAgentDir()`), precedência: env > arquivo |
| `LANGFUSE_HOST` é fallback **dentro do plugin** (`src/index.ts:100-101`), mas o gate do app só lê `LANGFUSE_BASE_URL` (`langfuse.ts:56-71`) | divergência real (Q1) |
| `.env.example` e `docker-compose.yml` passaram a trazer a flag, o environment e o teto de caracteres | `.env.example:146-156`, `docker-compose.yml:147-156` |
| deploy de **dev** é `workflow_dispatch` com `env=dev`; as envs vêm do secret `tb/dev/<app>/env` | `.github/workflows/aws-ecr-deploy.yml:10`, `:180-185` |
| Etapa 1 provada | `docs/design/planos/evidencias/2026-10-27-langfuse-etapa1-trace.png` |

**Fatos do pacote que eu abri na fonte** (`node_modules/@langfuse/pi-observability-plugin/src/index.ts`):
`:29` `PI_LANGFUSE_MAX_CHARS` lido no **load do módulo**, default 20.000; `:89` kill switch só no
literal `"false"`; `:100-101` `LANGFUSE_BASE_URL` → `LANGFUSE_HOST`; `:108` `userId` só por env/arquivo;
`:109` `environment` por `LANGFUSE_TRACING_ENVIRONMENT`; `:404` `new NodeTracerProvider` por runtime;
`:442` factory default sem opções; `:605` e `:870` `sessionId = ctx.sessionManager.getSessionId()`;
`:965` flush no `agent_settled`; `:972-981` shutdown só no `session_shutdown` com `reason === "quit"`.

**Não confirmei** (e cada um vira medição no bloco, nunca afirmação): que `transpilePackages` do Next 16
transpila um `.ts` dentro de `node_modules` no build de produção; a chave exata do vitest 4 para inlinar
o pacote (`test.server.deps.inline`); que o projeto `aja-agora` do Langfuse tem chaves próprias
distintas do `pi-agentes-aja`; se `src/lib/agent/pi/langfuse.ts` já está commitado (arquivo recém-criado
pelo chefe nesta worktree); que `~/.pi/agent/langfuse.json` exista em algum host de dev.

## Fluxo

1. **Planejar** — este arquivo. Ele é o mandato: cada bloco nomeia `arquivo:linha`, o critério de aceite
   verificável e o teste que **falha** se o bloco não existir.
2. **Construir** — um bloco por vez, na ordem de B1 a B6, TDD quando há comportamento novo, **um commit
   por bloco** com Conventional Commits em inglês, só com os arquivos do bloco, e só **depois** do gate
   verde. O executor não faz push nem merge: quem faz é o chefe, no B5, com GO.
3. **Verificar** — o gate de cada bloco roda contra o arquivo tocado e contra o plano, não contra o
   relatório do executor. O parecer final é do `reviewer` com contexto limpo, contra o diff de
   `develop`.

## Os blocos

### Bloco B1 — `langfuse.ts`: gate, normalização e id (com teste que morde)

**Files**
- Create: `src/lib/agent/pi/langfuse.test.ts`
- Modify: `src/lib/agent/pi/langfuse.ts` (`configDoLangfuse` `:56-71`; o `??=` de `PI_LANGFUSE_MAX_CHARS` em `:105`)

**Interfaces**
- Consome: o `carregar` injetável de `extensoesDoLangfuse` (`langfuse.ts:100`), que existe justamente
  para testar o caminho de falha sem mock de módulo ESM.
- Produz: nada de novo em API pública — o bloco **endurece** `configDoLangfuse(env)`,
  `langfuseLigado(env)`, `ehIdDeSessaoValido(id)` e `extensoesDoLangfuse(env, carregar)`.

**Passo a passo (TDD)**
1. Escrever `langfuse.test.ts` com os casos que mordem (cada um com o `expect` explícito):
   - **morde hoje: `LANGFUSE_HOST` sozinho liga.** `configDoLangfuse({ LANGFUSE_HOST: "https://x", LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" })` não é `null` e devolve
     `baseUrl: "https://x"`. O plugin aceita `LANGFUSE_HOST` como fallback (`src/index.ts:100-101`);
     hoje o gate do app devolve `null` e o turno fica **mudo sem avisar**.
   - `configDoLangfuse({})` → `null`; `configDoLangfuse` com duas das três chaves → `null`.
   - `LANGFUSE_TRACING_ENABLED: "false"` com as três chaves → `null` (o plugin só desliga no literal,
     `src/index.ts:89`; `"False"`/`"0"` **não** desligam — assere os dois lados).
   - `LANGFUSE_BASE_URL` com barra final → o valor sai como veio (a normalização de barra é do plugin,
     `src/index.ts:106`); o teste só garante que o app **não** inventa transformação.
   - **morde hoje: `PI_LANGFUSE_MAX_CHARS` em `process.env`.** Chamar `extensoesDoLangfuse(envInjetado, carregarFalso)` com as três chaves num objeto env **que não é `process.env`** e asserir
     `process.env.PI_LANGFUSE_MAX_CHARS === "40000"` depois da chamada. Hoje o `??=` escreve no objeto
     injetado (`langfuse.ts:105`), e o plugin lê `process.env` (`src/index.ts:29`) — em teste e em
     qualquer chamada com env próprio o default não chega ao plugin.
   - `extensoesDoLangfuse({}, …)` → `[]` e **não** chama o carregador (contador no espião = 0).
   - carregador que lança → `[]`, `console.error` chamado e **nenhum** throw.
   - carregador que devolve `{}` (sem default) → `[]`.
   - carregador que devolve `{ default: () => {} }` → `[funcao]`.
   - `ehIdDeSessaoValido`: `"4a1af177-3b4b-4f3c-9d3b-2f9a1c0e77aa"` ✅, `""` ❌, `"a b"` ❌,
     `"x/"` ❌, `null` ❌, `undefined` ❌.
2. Implementar até verde: aceitar `LANGFUSE_HOST` no gate (na ordem BASE_URL → HOST, igual ao plugin) e
   escrever o default de `PI_LANGFUSE_MAX_CHARS` em `process.env` (`process.env.PI_LANGFUSE_MAX_CHARS ??= MAX_CHARS_PADRAO`),
   mantendo a leitura de `env` para as chaves.
3. Rodar o gate e commitar (`fix(pi): honra LANGFUSE_HOST e fixa PI_LANGFUSE_MAX_CHARS no env do processo`).

**Critério de aceite:** `pnpm vitest run src/lib/agent/pi/langfuse.test.ts` verde com os casos acima;
`grep -n "LANGFUSE_HOST" src/lib/agent/pi/langfuse.ts` mostra leitura (não só comentário);
`grep -n "process.env.PI_LANGFUSE_MAX_CHARS" src/lib/agent/pi/langfuse.ts` mostra o `??=` no objeto do
processo.

**Teste que morde:** sem a mudança do gate, o caso "`LANGFUSE_HOST` sozinho liga" falha; sem a mudança do
`??=`, o caso do env injetado falha. Se alguém reverter `langfuse.ts`, esses dois ficam vermelhos.

**Gate do bloco**
```
pnpm vitest run src/lib/agent/pi/langfuse.test.ts && pnpm -s typecheck && pnpm lint
```
Saída esperada: testes verdes, `tsc` sem saída, Biome sem erro.

### Bloco B2 — o carregador vence a falta de `main`/`exports` (risco principal)

> **EXECUTADO — o P1 foi tentado e FALHOU no build; ficou o P2.** Medido em 27/10/2026 14:37:
> `import("@langfuse/pi-observability-plugin/src/index")` num `.ts` nosso + `transpilePackages` fez o
> `next build` morrer em **"Failed to type check"** com `node_modules/@langfuse/pi-observability-plugin/src/index.ts:606`
> (`Property 'prompt' does not exist on type 'BeforeAgentStartEvent'` — o defeito #54). `declare module`
> não resolve: quando o especificador RESOLVE para um arquivo, o arquivo ganha do ambiente. Mapear
> `paths` também não: o Next lê os `paths` do `tsconfig.json` como alias do **bundler**, e um alias
> para `.d.ts` mataria o import em runtime.
>
> Ficou o **P2**, com o número que importava medir: `additionalExtensionPaths: [<absoluto>]` carrega
> em **53 ms na primeira vez e 4-5 ms nas seguintes** (jiti com `moduleCache: false`, mas o conteúdo
> do módulo fica quente). Nenhuma instalação em tempo de turno (caminho absoluto → `parseSource` →
> `local`), `errors: []` no loader, e a extensão aparece com `hasExtensionHandlers("before_agent_start")
> === true`. Sem `transpilePackages`, sem `paths`, sem patch no pacote: o fonte do plugin nunca entra no
> programa do `tsc`.

**O problema, por extenso.** `node_modules/@langfuse/pi-observability-plugin/package.json` **não tem
`main`, `exports` nem `types`**: o único entrypoint é `"pi": { "extensions": ["./src/index.ts"] }`. Um
`import("@langfuse/pi-observability-plugin")` de especificador nu estoura (`ERR_MODULE_NOT_FOUND` /
`ERR_PACKAGE_PATH_NOT_EXPORTED`). O comentário já registra as duas medições de 27/10/2026 em
`langfuse.ts:123-131`: caminho nu → `ERR_MODULE_NOT_FOUND`; caminho explícito no Node cru →
`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Ou seja: o caminho explícito **resiste**, mas depende de
alguém transformar o `.ts` — o bundler (Next) e o vitest.

**Files**
- Modify: `next.config.ts` (`transpilePackages` — hoje **não** existe no arquivo; ver `next.config.ts:25-41` `outputFileTracingIncludes`/`serverExternalPackages`)
- Modify: `vitest.config.ts` (inline do pacote; hoje o arquivo não tem `server`/`deps`)
- Create: `src/lib/agent/pi/carregador-do-langfuse.test.ts`

**Caminho primário (P1) — o que já está escrito em `langfuse.ts:133`**
- `next.config.ts` ganha `transpilePackages: ["@langfuse/pi-observability-plugin"]` (o pacote é
  `"type": "module"` e o entry é TypeScript; sem isso o build nem resolve o `.ts`).
- `vitest.config.ts` ganha o inline do pacote. Chave para o vitest 4: `test.server.deps.inline`
  (`["@langfuse/pi-observability-plugin"]`) — **não confirmei a chave na doc**; o worker confirma e, se
  a chave for outra, registra no diário qual foi.
- `carregador-do-langfuse.test.ts` prova o resolve e o load de verdade.

**Alternativa (P2) — se o P1 não resolver no build.** Usar o **carregador do próprio Pi**:
`DefaultResourceLoaderOptions.additionalExtensionPaths?: string[]`
(`node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.d.ts`), que lê o
`pi.extensions` do `package.json` e transpila com jiti (`jiti@2.7.0` é dependência do pacote do Pi,
`package.json:57`; `resolveExtensionEntries` em `dist/core/extensions/loader.js:593-621`). O caminho tem
de ser **absoluto e vindo de `createRequire`** — um especificador nu seria tratado como pacote npm e
poderia **instalar** em tempo de turno (`dist/core/package-manager.js:1000-1041`, `installMissing`);
caminho absoluto cai em `parseSource` → `{ type: "local" }` (`:1183-1185`) e **não** instala. Nesse
caminho, `extensoesDoLangfuse()` deixa de devolver fábricas e passa a devolver **caminhos**, some o
`transpilePackages`, e entra `outputFileTracingIncludes` para o diretório do pacote e das dependências
dele (`@langfuse/*`, `@opentelemetry/*`) no standalone — **não confirmei** que o tracing do Next segue
`require` feito por jiti em runtime.
- **Se P1 e P2 falharem:** `pnpm patch @langfuse/pi-observability-plugin@0.1.2` adicionando
  `"main"`/`"exports"` ao `package.json` do pacote (patch versionado em `patches/`, versão continua
  0.1.2, **nenhuma linha de código do plugin alterada**) + o `transpilePackages` do P1. Vendoring do
  arquivo para dentro do repo (`src/…/langfuse-plugin/index.ts`) **não** se faz sem GO do dono: é fork.

**Passo a passo (TDD)**
1. Escrever `carregador-do-langfuse.test.ts`:
   - **morde hoje:** `const fabricas = await extensoesDoLangfuse({ LANGFUSE_BASE_URL: "http://127.0.0.1:1", LANGFUSE_PUBLIC_KEY: "pk-lf-fake", LANGFUSE_SECRET_KEY: "sk-lf-fake" })`
     (sem injetar `carregar`) → `expect(fabricas).toHaveLength(1)` e
     `expect(typeof fabricas[0]).toBe("function")`. Hoje esse teste não existe, e é ele que prova o
     caminho real. Base URL em porta fechada é de propósito: o teste **não** faz prompt, então não há
     span para exportar; se algum dia exportar, a conexão é recusada na hora e não pendura a suíte
     (`testTimeout: 20_000`, `vitest.config.ts`).
   - o caminho resolve: `createRequire(import.meta.url).resolve("@langfuse/pi-observability-plugin/package.json")`
     e `existsSync(join(dirname(p), "src/index.ts"))` → verdadeiro.
   - o `package.json` do pacote **não** tem `main`/`exports` e **tem** `pi.extensions` — este caso é a
     documentação executável do motivo do caminho explícito; no dia em que o upstream publicar `main`,
     ele fica vermelho e avisa que o caminho pode simplificar.
2. Ajustar `next.config.ts` e `vitest.config.ts` até verde.
3. Provar o build uma vez (`pnpm -s build`) — o build é o único lugar onde o `transpilePackages` mostra
   se funciona. Se o build não passar por causa do pacote, **cai para P2** e registra no diário.
4. Gate e commit (`build(pi): carrega o plugin do Langfuse por caminho explícito`).

**Critério de aceite:** o teste de load devolve **uma função**; `pnpm -s build` termina; `grep -n
transpilePackages next.config.ts` mostra o pacote (se P1); se P2, `grep -n additionalExtensionPaths
src/lib/agent/pi/sessao.ts` mostra o caminho absoluto e o teste de load passa pelo loader do Pi.

**Teste que morde:** "o pacote real carrega e devolve uma factory" — hoje vermelho (o import do `.ts` em
`node_modules` não é transformado). Sem ele, um `catch` silencioso em `langfuse.ts:115-120` esconde o
problema e "tudo passa" sem nenhum trace.

**Gate do bloco (como rodou)**
```
pnpm vitest run src/lib/agent/pi/langfuse.test.ts   # 11 verdes
pnpm -s typecheck && pnpm lint                      # sem saída
pnpm -s build                                       # "Finished TypeScript in 8.1s" e segue
```
O `pnpm build` local **não** termina por falta de `DATABASE_URL` (coleta de page data) — isso não tem
relação com este bloco: o typecheck do Next passou, que era o que travava. A prova de build de verdade
é o deploy do B5.

### Bloco B3 — `sessao.ts`: o id da sessão só quando ligado e válido

**Estado atual (não é para reescrever, é para provar):** `sessao.ts:113` declara `conversaId?`;
`:225-228` calcula `idDaSessao = langfuseLigado() && ehIdDeSessaoValido(args.conversaId) ? args.conversaId : undefined`;
`:236` passa `{ id: idDaSessao }` só quando existe; `:150-165` injeta `...(await extensoesDoLangfuse())`
depois da factory das tools.

**Files**
- Modify: `src/lib/agent/pi/sessao.test.ts` (três casos novos, no molde do `servidorFalso` já existente)
- Modify: `src/lib/agent/pi/sessao.ts` **só se** um teste apontar defeito (ex.: ordem das fábricas)

**Passo a passo (TDD)**
1. Casos novos em `sessao.test.ts`:
   - **com as três envs e um uuid:** `abrirSessao({ system, tools: [], conversaId: "<uuid>", provider: falso })`
     → `session.sessionManager.getSessionId()` é **exatamente** aquele uuid. (Prova a ponta que o
     Langfuse lê em `src/index.ts:605`.) As envs do teste entram com `vi.stubEnv` e são restauradas no
     `afterEach` — nunca `process.env` sujo entre testes.
   - **sem as envs:** mesmo uuid → `getSessionId()` **não** é o uuid (é o id gerado pelo Pi). Prova que o
     comportamento fora do Langfuse é o de sempre.
   - **id inválido (`"x/"`) com as envs:** `getSessionId()` não é `"x/"` e **o `prompt` conclui** — a
     guarda de `langfuse.ts:84` impede o `assertValidSessionId` de lançar dentro do turno.
2. Rodar; se algum falhar, corrigir `sessao.ts` no mínimo necessário.
3. Gate e commit (`test(pi): prova o session id da conversa no Langfuse`).

**Critério de aceite:** os três casos verdes; nenhum `expect` sobre ids gerados pelo Pi (frágil) — só
"é / não é o uuid".

**Teste que morde:** o caso "com as envs, o id é o da conversa" fica vermelho se alguém remover o
`{ id }` de `sessao.ts:236`; o caso do id inválido fica vermelho se alguém trocar a guarda por
`args.conversaId` cru (o turno explodiria no `assertValidSessionId`).

**Gate do bloco**
```
pnpm vitest run src/lib/agent/pi/sessao.test.ts && pnpm -s typecheck && pnpm lint
```
Saída esperada: 5 testes verdes (2 antigos + 3 novos); `tsc` e Biome limpos.

### Bloco B4 — `turno-livre.ts` passa o `conversationId` ao beat

**Files**
- Modify: `src/lib/agent/pi/turno-livre.ts` (uma linha dentro da chamada `executarBeat({ … })` em `:1253-1265`)
- Modify: `src/lib/agent/pi/converse.test.ts` (dois casos)

**Interfaces**
- Consome: `conversationId` já desestruturado no topo do turno (`turno-livre.ts:936`), `BeatArgs.conversaId`
  (`converse.ts:26`), `abrirSessao({ conversaId })` (`converse.ts:65`).
- Produz: nada novo — uma linha `conversaId: conversationId,` na chamada do beat.

**Passo a passo (TDD)**
1. Casos em `converse.test.ts` (mesmo molde de servidor falso de `sessao.test.ts`):
   - `executarBeat({ …, conversaId: "x/" })` com as envs do Langfuse presentes **não lança** e devolve
     `texto` — o id ruim não pode custar a fala;
   - `executarBeat` **sem** `conversaId` continua funcionando (o campo é opcional; nenhum chamador é
     obrigado a saber de observabilidade).
2. Adicionar a linha em `turno-livre.ts:1255` (junto de `system`/`historico`, antes de `tools`).
3. Gate e commit (`feat(pi): passa o id da conversa ao beat de fala`).

**Critério de aceite:** `grep -n "conversaId: conversationId" src/lib/agent/pi/turno-livre.ts` acha a
linha dentro do objeto de `executarBeat`; os dois casos de `converse.test.ts` verdes; `pnpm -s typecheck`
limpo.

**Teste que morde:** o caso do id inválido morre se a guarda de `sessao.ts:225-228` for removida; e o
`grep` acima é o critério verificável de que o turno **de fato** entrega o id (sem ele, o trace sai com
id de sessão aleatório por turno e o problema só aparece no Langfuse, em B5).

**Gate do bloco**
```
pnpm vitest run src/lib/agent/pi/converse.test.ts src/lib/agent/pi/sessao.test.ts && pnpm -s typecheck && pnpm lint
```
Saída esperada: verdes; `tsc` e Biome limpos.

### Bloco B5 — merge, push, deploy dev, as 4 envs e o trace real

Este é o bloco que exige **GO do dono** (push em branch compartilhada e deploy). Nada aqui é feito por
subagente sem a ordem do chefe.

**Files**
- Modify: `docker-compose.yml` (linha nova junto de `:144-146`): `LANGFUSE_TRACING_ENVIRONMENT: ${LANGFUSE_TRACING_ENVIRONMENT:-}`
- Modify: `.env.example` (na seção `:135-151`): documentar `LANGFUSE_TRACING_ENVIRONMENT` (`dev` em dev,
  `production` em produção) e `PI_LANGFUSE_MAX_CHARS` (default 40.000, posto pelo app — não precisa ir
  para o secret)
- Create: `docs/design/planos/evidencias/2026-10-27-langfuse-etapa2-dev.json` (o trace cru) e
  `…-etapa2-dev.png` (print da tela)
- **Não** toca `src/lib/` — se precisar de código, é defeito de bloco anterior.

**Passo a passo**
1. Gate completo da branch: `pnpm -s typecheck && pnpm lint && pnpm vitest run src/lib/agent/pi`.
2. Merge de `kairogyn/chefe-langfuse-pi` em `develop` (squash ou commits do bloco — a decisão é do
   chefe) e push. **GO.**
3. Secret `tb/dev/aja-agora/env` recebe **quatro** chaves, sem imprimir valor em terminal nem em log:
   `LANGFUSE_BASE_URL=https://langfuse.twobrainstechnology.com`, `LANGFUSE_PUBLIC_KEY=<projeto aja-agora>`,
   `LANGFUSE_SECRET_KEY=<projeto aja-agora>`, `LANGFUSE_TRACING_ENVIRONMENT=dev`. Receita à prova de
   perda: leia o secret, faça `jq` adicionando/atualizando as quatro, grave com
   `aws secretsmanager put-secret-value` — **nunca** um `--secret-string` montado à mão com as outras
   chaves (o secret tem dezenas de outras). Credencial só no secret/vault, nunca em arquivo versionado
   (`AGENTS.md`).
4. Disparar o deploy de dev (`workflow_dispatch`, `env=dev` — `.github/workflows/aws-ecr-deploy.yml:180-185`)
   e esperar a taskdef subir.
5. **Prova de ponta a ponta:** abrir o app de dev, mandar **uma** mensagem que force tool (uma busca de
   carta), e então — com `LANGFUSE_*` no ambiente do shell, sem ecoar chave — consultar a API pública:
   ```
   curl -s -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
     "$LANGFUSE_BASE_URL/api/public/traces?sessionId=<conversationId>&limit=5" | jq '{n: (.data|length), ids: [.data[].id], env: [.data[].environment]}'
   ```
   Esperado: **1** trace com aquele `sessionId`, `environment: "dev"`; e o detalhe do trace com uma
   `generation` `LLM Call` (com `usage`) e a observação de tool. Salvar o JSON e o print em
   `evidencias/`.
6. Rodar um segundo turno **da mesma conversa** e conferir que o `sessionId` se repete (a promessa "uma
   conversa = uma sessão").
7. Registrar no diário: bloco, commit, gate, saída, o que ficou fora.

**Critério de aceite (verificável, não narrativo):** o `curl` do passo 5 devolve ao menos um trace com
`environment: "dev"` e o `sessionId` igual ao `conversations.id` da conversa usada; o trace tem pelo
menos uma `generation` com `totalCost`/`usage`; o `curl` do passo 6 mostra **o mesmo** `sessionId` com
dois traces. Print e JSON em `docs/design/planos/evidencias/`.

**Teste que morde:** sem o `{ id }` de B3, o `sessionId` do trace seria diferente por turno e o passo 6
ficaria vermelho; sem as envs no secret, o `curl` volta vazio (e o log do container mostra
`[langfuse] plugin indisponível` ou nada); sem o `docker-compose.yml`, o container não recebe
`LANGFUSE_TRACING_ENVIRONMENT` e o trace sai sem `environment`.

**Gate do bloco**
```
pnpm -s typecheck && pnpm lint && pnpm vitest run src/lib/agent/pi
# e a prova remota:
curl -s -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" "$LANGFUSE_BASE_URL/api/public/traces?sessionId=<conversationId>&limit=5" | jq '.data | length'
```
Saída esperada: gates locais limpos; `curl` ≥ 1.

### Bloco B6 — receita de produção (documento, não código)

**Files**
- Create: `docs/design/2026-10-27-langfuse-pi-em-producao.md`

**Conteúdo obrigatório do documento** (cada item com o comando que confere):
1. **As quatro envs no `tb/prod/aja-agora/env`** com `LANGFUSE_TRACING_ENVIRONMENT=production`, e a
   ordem de ligar só **depois** do deploy que já contém o plugin (env antes do código = nada; código
   antes da env = turno normal sem trace).
2. **O kill switch de verdade.** `LANGFUSE_TRACING_ENABLED=false` desliga no plugin (`src/index.ts:89`),
   mas o compose/taskdef precisa repassar essa env; alternativa sem deploy: remover
   `LANGFUSE_SECRET_KEY` do secret. Documentar as duas e qual é a recomendada.
3. **O provider que nunca desliga.** O plugin cria um `NodeTracerProvider` por runtime
   (`src/index.ts:404`) e só chama `provider.shutdown()` no hook `session_shutdown` com
   `reason === "quit"` (`src/index.ts:972-981`). Como cada turno abre uma sessão nova e
   `session.dispose()` **não** emite esse hook (`agent-session.d.ts:387`; `grep -rn dispose src/lib/agent/pi`
   → nada), em produção isso é **um provider por turno, vivo até o processo morrer**. Mitigações, na
   ordem: (a) chamar `session.dispose()` no fim do beat em `converse.ts` (lugar já existe, depois de
   `getSessionStats()`), (b) abrir issue upstream no repositório do plugin, (c) limitar
   `PI_LANGFUSE_MAX_CHARS` para o payload não crescer. O documento diz qual foi medido e qual ficou de
   dívida — **sem inventar número de memória**.
4. **PII em claro é decisão do dono** (`AGENTS.md`, 27/10/2026): o trace leva nome, telefone e CPF em
   claro, sem máscara. O documento registra isso e a consequência prática (quem tem acesso ao projeto
   `aja-agora` no Langfuse lê PII), sem propor mascaramento.
5. **Custo e volume:** o trace entra em cada turno; o custo do Langfuse self-hosted é armazenamento.
   O documento aponta onde se mede (a UI do projeto) e **não** estima número.
6. **Etapa 1 fica como está:** agentes de trabalho do aja usam `pi install -l` **por projeto**, projeto
   `pi-agentes-aja`, **nunca global**. O documento repete a regra e a prova (trace
   `9e8875e385cdf1cedcc81f8fca06ad26` e o print).

**Critério de aceite:** documento existe; cada uma das 6 seções com o comando/arquivo que a confere;
`grep -n "pi install -l" docs/design/2026-10-27-langfuse-pi-em-producao.md` acha a regra do "nunca
global"; nenhuma credencial no arquivo (`grep -E "pk-lf-|sk-lf-"` → vazio).

**Teste que morde:** não é teste de código — é o `reviewer` (ou o dono) executando os comandos do
documento contra o repo. O que morde é a seção 3: se o documento afirmar que o provider é desligado e o
código não o desliga (`src/index.ts:972-981`), o parecer é `CONFIRMED` e o bloco volta.

**Gate do bloco**
```
pnpm lint
grep -c "^## " docs/design/2026-10-27-langfuse-pi-em-producao.md   # 6 seções
grep -E "pk-lf-|sk-lf-" docs/design/2026-10-27-langfuse-pi-em-producao.md || echo "sem credencial"
```

## O que NÃO muda

Cada item com o comando que o confere:

1. **Sem as chaves, nada muda no turno.** `grep -n "langfuseLigado() &&" src/lib/agent/pi/sessao.ts` →
   só a linha do `idDaSessao`; e o teste "sem as envs, o session id não é o uuid" verde.
2. **O vendedor continua livre** (sem funil, sem gate em código): nenhum bloco toca
   `src/lib/agent/pi/tools-livres.ts` nem `prompt-do-vendedor.ts` —
   `git diff --name-only develop | grep -E "tools-livres|prompt-do-vendedor"` → vazio.
3. **O livro-caixa local continua sendo a fonte de custo do produto.**
   `grep -n "registrarUsoDeIa" src/lib/agent/pi/turno-livre.ts` → intacto (`:1426`); o Langfuse é
   observabilidade, **não** contabilidade.
4. **`userId` ausente de propósito.** `grep -rn "LANGFUSE_USER_ID" src/ .env.example` → nada. A pessoa é
   ligada à conversa no banco, pelo `conversationId`.
5. **Credencial fora do repo.** `git diff --name-only develop | xargs grep -lE "pk-lf-|sk-lf-" 2>/dev/null || echo "sem chave"`.
6. **Etapa 1 não é tocada.** `git diff --name-only develop | grep -E "pi-agentes-aja"` → vazio.
7. **Suíte inteira não volta.** `grep -n '"test"' package.json` → só o script existente (`:30`); nenhum
   bloco adiciona `test:all` nem mexe em CI de testes.

## Definição de pronto

- [ ] `pnpm -s typecheck`, `pnpm lint` e `pnpm -s build` verdes na branch.
- [ ] `src/lib/agent/pi/langfuse.test.ts` e `src/lib/agent/pi/carregador-do-langfuse.test.ts` existem e
      estão verdes; `sessao.test.ts` e `converse.test.ts` com os casos novos verdes.
- [ ] O caminho de carga do plugin está **decidido, escrito e provado** (P1, P2 ou patch), com a escolha
      registrada no diário e o motivo no comentário do código.
- [ ] `grep -n "conversaId: conversationId" src/lib/agent/pi/turno-livre.ts` acha a linha.
- [ ] Em dev, um trace real com `environment: "dev"`, `sessionId` = `conversations.id`, com ao menos uma
      `generation` de custo e uma tool; **dois turnos da mesma conversa no mesmo `sessionId`**.
- [ ] Print + JSON em `docs/design/planos/evidencias/2026-10-27-langfuse-etapa2-dev.{png,json}`.
- [ ] `docker-compose.yml` e `.env.example` com `LANGFUSE_TRACING_ENVIRONMENT`.
- [ ] `docs/design/2026-10-27-langfuse-pi-em-producao.md` com as 6 seções, sem credencial.
- [ ] Um commit por bloco, Conventional Commits em inglês, gate verde antes de cada commit.
- [ ] Parecer do `reviewer` contra o diff de `develop` anexado, com achados por severidade.
- [ ] Gap declarado: o que **não** foi coberto e por quê (ex.: se P2 for usado, o tracing do standalone
      fica como risco medido só no deploy).

## Como você será avaliado

- **Nota contínua:** um ponto por item da Definição de pronto e por gate de bloco, cada um com
  evidência colável (comando + saída). Relatório sem saída não conta.
- **Falha imediata:** afirmar que o plugin carrega sem o teste de load verde; declarar o trace provado
  sem o `curl`/print; setar `LANGFUSE_USER_ID` (decisão do chefe: **não**); mascarar PII ou bloquear por
  LGPD (decisão do dono, `AGENTS.md`); pôr credencial em arquivo versionado; vendar o código do plugin
  no repo (fork) sem GO; tocar produção do aja; push/merge/deploy sem GO; abrir worktree nova;
  ressuscitar a suíte inteira; commitar com gate vermelho ou com `--no-verify`.
- **Falha imediata:** escrever número (custo, volume, latência) que não veio de medição. Número no
  relatório é sempre "medido em <data>, comando <x>".
- **Problemas de revisão** se reportam por severidade (maior / menor). Achado `CONFIRMED` vira bloco
  novo, não conserto na mão.
- Se causar uma falha sem querer: pare na hora, registre no diário e reporte.

## Comandos de validação

```bash
# chão
pnpm install --frozen-lockfile
pnpm -s typecheck && pnpm lint

# B1
pnpm vitest run src/lib/agent/pi/langfuse.test.ts
grep -n "LANGFUSE_HOST" src/lib/agent/pi/langfuse.ts
grep -n "process.env.PI_LANGFUSE_MAX_CHARS" src/lib/agent/pi/langfuse.ts

# B2
pnpm vitest run src/lib/agent/pi/carregador-do-langfuse.test.ts
grep -n "transpilePackages" next.config.ts            # P1
grep -n "additionalExtensionPaths" src/lib/agent/pi/sessao.ts   # P2, se for o caso
pnpm -s build

# B3 / B4
pnpm vitest run src/lib/agent/pi/sessao.test.ts src/lib/agent/pi/converse.test.ts
grep -n "conversaId: conversationId" src/lib/agent/pi/turno-livre.ts

# B5 — prova remota (chaves vêm do ambiente, nunca do arquivo)
curl -s -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
  "$LANGFUSE_BASE_URL/api/public/traces?sessionId=<conversationId>&limit=5" \
  | jq '{n: (.data|length), ids: [.data[].id], env: [.data[].environment]}'

# invariantes
git diff --name-only develop | grep -E "tools-livres|prompt-do-vendedor" || echo "motor intacto"
grep -rn "LANGFUSE_USER_ID" src/ .env.example || echo "sem userId — como decidido"
git diff --name-only develop | xargs grep -lE "pk-lf-|sk-lf-" 2>/dev/null || echo "sem chave no repo"
```

## Riscos

| risco | mitigação |
|---|---|
| **O pacote não tem `main`/`exports`** — e o import do `.ts` depende de bundler (RISCO PRINCIPAL) | P1 (`transpilePackages` + vitest inline) provado pelo teste de load **e** pelo `pnpm -s build`; P2 (`additionalExtensionPaths` + jiti do Pi, caminho absoluto via `createRequire`) como alternativa com seu próprio custo de tracing; `pnpm patch` como terceira via, sem tocar código do plugin |
| O `catch` de `langfuse.ts:115-120` esconder o plugin quebrado e o time achar que "está ligado" | teste de load **sem** `carregar` injetado (B2) + trace real em dev (B5); log explícito já existe |
| Trace por turno em vez de por conversa (perde o sentido de sessão) | `{ id }` no `SessionManager` (B3) + passo 6 do B5 com dois turnos no mesmo `sessionId` |
| Id inválido derrubar o turno | `ehIdDeSessaoValido` antes (`langfuse.ts:84`) + caso de teste com `"x/"` em B3 e B4 |
| `~/.pi/agent/langfuse.json` na máquina de dev injetar `userId`/`baseUrl` alheios | env vence o arquivo (`src/index.ts:96-111`) e o container não tem o arquivo; ver Q2 |
| Provider de OTel por turno, vivo até o processo morrer | B6 §3 com as três mitigações; `session.dispose()` é a única barata e pode entrar em bloco futuro com teste |
| Trace com prompt inteiro (o system passa de 20 mil chars) | `PI_LANGFUSE_MAX_CHARS=40000` posto antes do load (`langfuse.ts:104-105`, `src/index.ts:29`) — sem ele o corte é em 20.000 |
| Env no secret antes do código (ou depois) fazer o time achar que "não funciona" | B5 passo 3 e B6 §1 fixam a ordem |
| PII em claro no trace | decisão do dono (`AGENTS.md`); o plano não mascara e registra em B6 §4 |
| `additionalExtensionPaths` com especificador nu tentar instalar em tempo de turno | caminho **absoluto** (`parseSource` → `type: "local"`, `dist/core/package-manager.js:1183`) |

## Decisões tomadas neste plano

- **`userId` não é setado.** O plugin só o aceita por env/arquivo, um valor por **processo**
  (`src/index.ts:108`), e o app roda vários turnos em paralelo — qualquer valor seria mentira ou corrida.
  A pessoa continua identificável pelo `conversationId` no banco.
- **O gate do app espelha a resolução do plugin** (`LANGFUSE_BASE_URL` → `LANGFUSE_HOST`), em vez de
  inventar regra própria: dois gates divergentes criam "ligado para o plugin, desligado para o app".
- **`PI_LANGFUSE_MAX_CHARS` é do app, não do secret:** é default técnico (40.000), posto antes do load;
  colocá-lo no secret só cria mais uma chave para manter.
- **Teste de load contra o pacote real, com URL em porta fechada:** prova o que interessa (resolve +
  factory) sem rede e sem pendurar a suíte; o teste **não** faz prompt, logo não exporta span.
- **O `environment` separa o dev do real no mesmo projeto**, como pedido; projeto separado para dev é
  Q3.
- **Produção é documento, não código** (B6): ligar em produção é decisão do dono, com PII em claro já
  decidida e o vazamento de provider conhecido.

## Perguntas em aberto

**Q1 — O gate aceita `LANGFUSE_HOST`? — RESPOSTA: não, e de propósito.** O app lê `LANGFUSE_BASE_URL` e mais nada. Aceitar `LANGFUSE_HOST` criaria duas envs para a mesma coisa e a chance de metade do time usar uma e metade a outra; o plugin aceita o fallback, mas quem liga esta integração é o secret `tb/dev/aja-agora/env`, que é nosso e usa `LANGFUSE_BASE_URL`. O plugin aceita (`src/index.ts:100-101`); o gate do app hoje só
lê `LANGFUSE_BASE_URL` (`langfuse.ts:56-71`). Recomendação: **aceitar**, na mesma ordem do plugin
(B1 faz isso). Fecha com "sim" ou "só `LANGFUSE_BASE_URL`".

**Q2 — Neutralizar o `~/.pi/agent/langfuse.json` do host? — RESPOSTA: aceito o risco, com olho nele.** No container do dev/prod esse arquivo não existe. Na máquina de quem desenvolve, ele só existe se a pessoa criou; e mesmo assim o efeito é o plugin achar chaves/link quando as envs faltam — o que, no nosso caso, ele já não faz porque o caminho só é devolvido quando as três envs do processo existem (`langfuseLigado()` roda ANTES da resolução). Ou seja: a env sempre vence o arquivo, e sem env o plugin nem é carregado. Mexer em `PI_AGENT_DIR` seria mais uma variável global disputando com o resto do app. O plugin lê esse arquivo
(`src/index.ts:96-111`) e o `agentDir` da sessão (`sessao.ts:117`) é temporário, mas o `getAgentDir()`
do plugin aponta para o `~/.pi` **real**. No container não existe; na máquina de dev de alguém pode
existir e injetar `userId`/`baseUrl` de outro projeto. Recomendação: setar `PI_AGENT_DIR` para o
`agentDir` temporário da sessão **só quando** o Langfuse está ligado, com teste que morde. Fecha com
"sim" ou "aceito o risco".

**Q3 — Dev vai para o projeto `aja-agora`, separado por `environment=dev` — RESPOSTA: mesmo projeto.** É o desenho do pedido do dono, e o `environment` é exatamente a dimensão que a v4 usa para separar. O projeto `aja-agora` existe em produção e as chaves estão no vault (`credentials-langfuse.md`) — conferido por API em 27/10/2026. O que muda é que agora as MESMAS chaves vão também para o secret de dev. É o desenho
literal do pedido, e implica que as chaves do projeto de produção ficam no secret de **dev**. Não
confirmei que o projeto `aja-agora` já exista no Langfuse v4.6.0 com chaves próprias. Alternativa:
projeto `aja-agora-dev`. Fecha com "mesmo projeto" ou "projeto separado".

**Q4 — `session.dispose()` entra agora? — RESPOSTA: depois, documentado.** `dispose()` fecha listeners e aborta o agente, mas **não** emite `session_shutdown`, então sozinho não desliga o provider do plugin. Mexer nisso muda o caminho de TODOS os turnos (com e sem observabilidade) por um ganho que não está medido. Fica no passo de produção (B6) e no diário. Ele existe (`agent-session.d.ts:387`) e ninguém chama; sozinho
ele **não** desliga o provider (o plugin só desliga em `session_shutdown` com `reason === "quit"`), mas
fecha listeners e evita lixo por turno. Recomendação: documentar em B6 e **não** mexer agora — é mudança
no caminho de todos os turnos, não só dos com observabilidade. Fecha com "depois" ou "agora, com teste".

**Q5 — GO do B5. — RESPOSTA: dado pelo dono.** Ordem literal de 27/10/2026 13:35: *"pode implementar as duas etapas de ponta a ponta, chega com ele em producao em dev por favor."* Cobre merge na `develop`, push da `develop` e deploy de dev. Não cobre `main`, produção do aja nem `tb/prod/aja-agora/env`. Merge em `develop`, push e `workflow_dispatch env=dev` (com escrever quatro chaves no
secret `tb/dev/aja-agora/env`) são as ações que o Portão de permissão bloqueia. Recomendação: GO único
cobrindo os três passos, com o `curl` do trace como prova apresentada depois. Sem GO, B5 fica parado em
"pronto para disparar".

## Conferência de linhas

Reverificado **contra o código commitado** (`0460c970` e os commits que fecharam esta rodada), não
contra o rascunho que existia quando o plano foi escrito. A primeira versão desta seção citava
`extensoesDoLangfuse()`/`import()` — código que o Bloco B2 abandonou quando o `next build` reprovou o
caminho de import. Fica registrado porque **plano que cita linha que não existe é pior que plano sem
linha**: dá aparência de conferido a quem não vai abrir o arquivo.

- `src/lib/agent/pi/langfuse.ts` — `Ambiente` `:39`, `ConfigDoLangfuse` `:42`, `MAX_CHARS_PADRAO` `:54`,
  `texto()` `:56`, `configDoLangfuse` `:65-86` (flag obrigatória em `:72-73`), `langfuseLigado` `:88`,
  `ehIdDeSessaoValido` `:99`, `caminhoDoPluginDoLangfuse` `:128`, a fila `filaDaIdentidade` `:179`,
  `comIdentidadeDoTurno` `:181`, `userIdDoTurno` `:212`.
- `src/lib/agent/pi/sessao.ts` — imports `:27-29`, `abrirSessao` com `conversaId?` `:118` e `userId?`
  `:122`, `pluginDoLangfuse` `:162`, `additionalExtensionPaths` `:178`, `comIdentidadeDoTurno(…,
  loader.reload)` `:184`, `idDaSessao` `:246`, `SessionManager.inMemory(cwd, { id } | undefined,
  entries)` `:255-259`.
- `src/lib/agent/pi/converse.ts` — `BeatArgs.conversaId` `:26`, `userId` `:29`, repasse `:68-69`.
- `src/lib/agent/pi/turno-livre.ts` — import `:25`, `executarBeat({ …, conversaId, userId })`
  `:1265-1269`.
- `src/lib/agent/pi/langfuse.test.ts` / `sessao.test.ts` — 19 e 6 casos; os que mordem: "sem a flag,
  com as três chaves, continua desligado", "duas conversas simultâneas NÃO se contaminam" e "sem as envs
  o id não é o da conversa e `hasExtensionHandlers("before_agent_start")` é `false`".
- `node_modules/@langfuse/pi-observability-plugin/package.json` — **sem** `main`/`exports`/`types`;
  `"pi": { "extensions": ["./src/index.ts"] }`; deps `@langfuse/otel`, `@langfuse/tracing`,
  `@opentelemetry/*`. Pinado em `package.json:54` e `pnpm-lock.yaml`.
- `…/pi-observability-plugin/src/index.ts` — `:29` `PI_LANGFUSE_MAX_CHARS` (default 20000), `:89` kill
  switch, `:96-111` config (env > arquivo; `:100-101` BASE_URL→HOST, `:108` userId, `:109` environment),
  `:373-410` runtime/provider, `:404` `new NodeTracerProvider`, `:442` factory default, `:605` e `:870`
  `getSessionId()`, `:965` flush em `agent_settled`, `:972-981` shutdown em `session_shutdown`.
- `@earendil-works/pi-coding-agent` — `NewSessionOptions { id }` `dist/core/session-manager.d.ts:13-16`;
  `newSession()` usa `options.id` `dist/core/session-manager.js:691-695`; `assertValidSessionId`
  `:15-19`; jiti carrega extensão `dist/core/extensions/loader.js:22-26,468-479`;
  `additionalExtensionPaths` em `dist/core/resource-loader.js:258,414`;
  `before_agent_start` com `prompt` para turno de usuário `dist/core/agent-session.js:1664` e o handler
  protegido por `try/catch` em `dist/core/extensions/runner.js:1151`.

## Resultado medido (27/10/2026)

O que está de pé, com o comando que prova — não com relato:

| Prova | Como | Resultado |
|---|---|---|
| Projeto `pi-agentes-aja` em produção | `GET /api/public/projects` com o par novo | `200` — devolve só `pi-agentes-aja` (`cmvqx71nk0003mv06kw334gcq`) |
| Etapa 1: trace do Pi com generation **e** tool call | trace `9e8875e385cdf1cedcc81f8fca06ad26`, print em `evidencias/2026-10-27-langfuse-etapa1-trace.png` | `Conversational Turn` 3,54 s ∑ **$0,000525**; `LLM Call` 184→60 (61.940) $0,000249; **`Tool: bash`**; `LLM Call` 264→4 (78.348) $0,000276; env `agents` |
| Nenhum `pi install` global | `pi list` fora das worktrees do aja | o plugin não aparece |
| Chaves fora de arquivo versionado | `git status` + `secrets.sh` | vault (`credentials-langfuse.md`) + bundle cifrado `pi-agentes-aja-langfuse.env.enc`; nada no repo |
| Gate do app | `pnpm vitest run src/lib/agent/pi/langfuse.test.ts src/lib/agent/pi/sessao.test.ts` | 16 verdes |
| Sem as envs, nenhum efeito | `sessao.test.ts` — `hasExtensionHandlers("before_agent_start")` | `false` sem envs, `true` com elas |
| Uma conversa = uma sessão | `sessao.test.ts` — `sessionManager.getSessionId()` | igual ao `conversationId` com envs; id do Pi sem elas |
| Id de conversa fora do formato não derruba o turno | `sessao.test.ts` | sessão nasce com id gerado, turno roda |
| Build do Next | `pnpm -s build` | typecheck do Next passa (o P1 do B2 morria aqui) |

### B5 fechado — o turno real de dev

Conversa `dea48023-61f3-4692-bc81-a5b4ed742140`, dois turnos reais em
`https://tb-dev-aja-agora.twobrainstechnology.com/api/chat`:

| trace | o que tem |
|---|---|
| `abe65b72001e3fae361e5b3bd3f841cb` | `Conversational Turn` 19,8 s · `LLM Call` 1,77 s · **`Tool: buscar_cartas`** 14,4 s · `LLM Call` 2,67 s |
| `0d114102c583e6f6bd02f6eb687da421` | `Conversational Turn` 4,1 s · `LLM Call` 1,84 s · **`Tool: mostrar_card`** · `LLM Call` 2,19 s |

Os dois na **mesma sessão** (`session_id = conversationId`), `environment=dev`, projeto `aja-agora` — a
tela da sessão mostra `Total traces: 2 · Total cost: $0,030566`
(`evidencias/2026-10-27-langfuse-dev-sessao-dois-turnos.png`).

**Identidade da pessoa no trace** (o requisito que a revisão exigiu): conversa
`f6239b96-1a5c-4851-b595-407b618a2c96`, trace `8b21dd5645297ef7989b0cad9c594083` — a tela mostra
`User ID: uid-d0014-revisao-1793125864` (o cookie daquele turno), `Session: f6239b96-…`, `Env: dev`,
`13.548 prompt → 297 completion`, `$0,015033`, com `Tool: buscar_cartas` e as duas `LLM Call`
(`evidencias/2026-10-27-langfuse-dev-userid-trace.png`). O `userId` chega lá pela fila de
`comIdentidadeDoTurno` em volta do `loader.reload()` — o plugin o lê no `loadConfig()` da factory.

**Duas armadilhas de operação que o deploy ensinou** (as duas custaram uma volta cada):

1. O workflow renderiza a task definition **no início da run**: gravar o secret depois de disparar o
   deploy deixa as chaves de fora. Grave o secret **antes**.
2. O workflow **não registra task definition nova** — só `--force-new-deployment` (troca a imagem). Chave
   nova no secret só chega ao container com **revisão nova** registrada. Em dev: `aja-agora-dev:13`,
   reversível para `:12`.
3. E a terceira, de imagem: o file tracer do Next não enxerga um módulo carregado por caminho — o
   `Dockerfile` copia os escopos `@langfuse`/`@opentelemetry` à mão.
