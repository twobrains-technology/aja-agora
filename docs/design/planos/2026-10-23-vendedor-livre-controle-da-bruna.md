# Vendedor livre com o controle na mão da Bruna — Plano de implementação

**Goal:** o motor Pi continua livre, mas volta a renderizar **todos** os cards do produto — e a Bruna
passa a editar sozinha, pelo painel, as perguntas e as opções que o agente oferece **antes** da
simulação, sem chamar o Kairo e sem deploy.

**Arquitetura:** o turno livre (`src/lib/agent/pi/turno-livre.ts`) continua sem funil: o modelo conduz
e escolhe quando usar cada card. O que muda é que ele ganha **uma** tool de card (`mostrar_card`) com
dois destinos — **escolha** (o payload é a pergunta e as opções, validado no servidor) e **fato** (o
payload é montado no servidor a partir de carta, proposta ou estado reais; o modelo só aponta a
referência). O controle da Bruna é a **caixa como tela**: a conduta já é um texto só, versionado por
label em `caixa_de_prompt`, com `publicarCaixa` e `prompts:check` prontos — a tela nova lê, publica
versão nova, mostra histórico e prévia o system exatamente como o modelo recebe. Nenhuma fonte de
verdade nova.

**Stack:** Next.js (App Router, `src/app`) + TypeScript + zod · Drizzle/Postgres
(`caixa_de_prompt`) · `@earendil-works/pi-coding-agent` (`executarBeat`,
`src/lib/agent/pi/converse.ts:40`) · vitest 4 + Biome (`pnpm lint` / `pnpm -s typecheck`) · admin com
shadcn/Tailwind e RBAC em `src/lib/admin/role-scope.ts`.

## Contexto

### O que ela pediu, com a chave do acervo

- **14/10, 15:01 — zap:** *"Embora o oráculo diga que precise mandar logo a simulação, eu ainda acho
  que precisamos fazer as perguntas"* / *"Ou mostrar e já falar, pode responder algumas perguntas
  para eu te ajudar na melhor opção?"* → as perguntas **antes** da simulação são dela, contra a
  recomendação do "oráculo".
- **15/10, 10:58 — zap:** *"precisamos achar um meio do caminho no agente… ter só a info do valor e
  tipo de consórcio e já dar opções de grupos, está um pouco distante do nosso posicionamento"* →
  ela quer o agente perguntando **mais**, não menos.
- **19/10, 10:25 — call `2026-10-19T102556`:** *"Sabe aquelas opções? Quando você falava assim, carro,
  qual o valor da carta? As opções embaixo eram, sei lá, até 80 mil e 120 mil. Não deixava colocar
  outro valor, eu tinha que escrever outro valor."* No mesmo dia, no zap: *"Mas agora acabei de testar
  e deixou eu escolher o valor"* → **já corrigido**; `src/components/chat/artifacts/value-picker.tsx`
  tem `inputMode="numeric"`. Este plano **não** reconserta: ele impede a regressão.
- **20/10, 14:44–15:52 — zap privado (`wa:5511998306550`):** *"Quando a gente consegue ver aquela opção
  do agente?"* → *"Das perguntas, lembra?"* → *"Antes de dar a simulação"* → Kairo: *"estamos fazendo
  uma mudanca grande aqui para deixar o agente totalmente do jeito que quisermos a qualquer momento"*
  → *"E fora que dá umas instabilidades, né?"*. A conversa **termina aí**: ela nunca recebeu resposta
  sobre as "instabilidades" nem notícia de que a mudança aconteceu. A mudança é esta branch. As
  "instabilidades" não têm nenhuma outra menção com conteúdo no acervo — é comentário genérico, sem
  caso; entra na frente C (contexto/prompt), que é a primeira hipótese que o `CLAUDE.md` manda olhar.
- **22/10, 12:29 — zap:** *"Essas extrações não consigo tirar do back para não ficar te chamando,
  né?"* → a dor é depender do Kairo para mexer no próprio produto. É o mesmo motivo do pedido de
  20/10, e é o que sustenta a escolha da porta (a).

### O que o código mostra hoje

| fato | onde está |
|---|---|
| O motor livre é o único; não há flag | `src/lib/agent/pi/turno-livre.ts` (`runTurnLivre`) |
| **22** tipos de card | `src/lib/chat/types.ts:478` (`ArtifactByType`), `:502` (`ArtifactType`) |
| Os 22 têm componente | `src/components/chat/artifact-renderer.tsx:55-99` (22 `case`) |
| A conduta é um texto só, com versão viva no banco | `src/lib/agent/prompt-do-vendedor.ts` (`PROMPT_DO_VENDEDOR`), reexportado como `SYSTEM_PROMPT` em `src/lib/agent/system-prompt.ts`; lido em `turno-livre.ts:181-190` |
| Publicação versionada por label, sem `UPDATE` | `src/lib/agent/box/caixa.ts` (`lerCaixa` `:84`, `publicarCaixa` `:124`, cache 60 s `:36`) |
| Tabela `caixa_de_prompt` | `src/db/schema.ts:1929-1945` (`nome, label, versao, texto, publicado_por, criado_em` + índice único `(nome,label,versao)`) |
| Não existe tela nem API da caixa | `src/app/admin/(dashboard)/` não tem `caixa/`; `src/app/api/admin/` não tem rota de caixa |
| O gate do projeto é curto | `AGENTS.md`: teste ao lado do arquivo + `pnpm -s typecheck`; a suíte inteira saiu em `d67ea102` |

### O achado: os cards foram perdidos na refatoração

`src/lib/agent/pi/tools-livres.ts` tem **4 tools** (`:372` — `buscar_cartas`, `fazer_proposta`,
`falar_com_humano`, `salvar_nome`), e `NOMES_DAS_TOOLS_LIVRES` (`:375-380`) é a lista que expõe tool ao
modelo (`toPiTools` com `so:`, `src/lib/agent/pi/tools.ts`, usado em `turno-livre.ts:231`). Nenhuma
delas apresenta card por escolha do modelo:

- `CardLivre` está **fechado em dois tipos**: `type: "comparison_table" | "real_offer"`
  (`tools-livres.ts:51-53`), e o turno apaga a checagem com `artifactType: card.type as never`
  (`turno-livre.ts:292`).
- No turno livre só saem **2 dos 22**: `comparison_table` (`tools-livres.ts:203`) e `real_offer`
  (`:325-332`).
- `signature_handoff` e `atendimento_handoff` **saem por fora do turno**, no handler de confirmação:
  `closingPresentation` (`src/lib/bevi/closing-presentation.ts`) é chamado em
  `src/app/api/chat/route.ts:1368` (`offer-confirm`) e em `src/lib/whatsapp/interactive-handlers.ts:225`.
- **Bug de tipo no caminho do fecho:** `tools-livres.ts:329` faz
  `type: item.type === "real_offer" ? "real_offer" : "real_offer"` — ou seja, **colapsa qualquer tipo em
  `real_offer`**. Se `realOfferPresentation` devolver um `signature_handoff` (o tipo existe em
  `ClosingItem`, `closing-presentation.ts:9-15`), ele sai com o tipo errado.
- Os builders server-side do funil foram **apagados**: `src/lib/agent/orchestrator/` hoje tem 14
  arquivos e **não tem** `server-cards.ts`, `topic-catalog.ts`, `two-paths-payload.ts`,
  `scarcity-payload.ts`, `embedded-bid-payload.ts`, `simulation-payload.ts`. `buildScarcityCard`,
  `buildTwoPathsCard` e `stableSlotFromId` só existem como **menção em comentário**
  (`src/lib/chat/types.ts:450`, `src/lib/agent/orchestrator/directives.ts:178,214`,
  `src/lib/agent/orchestrator/dial-payload.ts:42`).

São **20 dos 22 sem caminho de emissão pelo motor**: 2 pelo turno, 2 pelo handler de confirmação, 18 sem
nenhum.

### Por que a caixa é a porta, e não uma tabela de opções

**(a) escolhida** — a conduta já é um texto, já está versionada por label no banco, já tem publicação e
comparador. O controle dela nasce ligado a mecanismo que existe: um lugar novo (a tela), zero fonte de
verdade nova. **(b) recusada** — tirar faixas de valor, categorias e tópicos para uma tabela editável
cria uma segunda fonte de verdade ao lado dos 22 cards, e as opções da pergunta são **texto do
vendedor** (conversa é do modelo, `CLAUDE.md`): virá-las dado editável é a trava em código que o dono
proibiu, com UI em cima.

## O que muda

### Frente A — o motor volta a renderizar todos os cards

1. **`src/lib/agent/pi/cards-livres.ts` (novo)** — a taxonomia e os montadores:
   - `DESTINO_DOS_CARDS: Record<ArtifactType, DestinoDoCard>`, exaustivo em compilação (tipo novo sem
     destino **quebra o `typecheck`**).
   - `validarCardDeEscolha(tipo, payload)` com zod por tipo, para `quick_reply`, `value_picker`,
     `topic_picker`.
   - `MONTADORES_DE_CARD`, um por tipo de FATO emitível, cada um lendo **só** a referência (`groupId`,
     `lancePercent`, `initialTargetMonth`) e montando o resto do servidor.
2. **`src/lib/agent/pi/tools-livres.ts` (modify)** — `CardLivre.type` passa a `ArtifactType`; entra a
   tool `mostrar_card` e ela entra em `NOMES_DAS_TOOLS_LIVRES`; `buscar_cartas` guarda o índice real do
   turno em `ctx.gruposRevelados` (hoje o `RevealGroupIndex` morre dentro do `execute`); corrige o
   colapso de tipo do fecho (`:329`) para respeitar `item.type`; e `DepsDasToolsLivres` ganha
   `simularCota` injetável, para o card de simulação ser testável sem rede.
3. **`src/lib/agent/pi/turno-livre.ts` (modify)** — `artifactType: card.type`, sem o `as never`.
4. **`src/lib/chat/desbloqueio-do-telefone.ts` (modify)** — `CARDS_QUE_REVELAM_OFERTA` ganha os tipos
   novos que carregam número de oferta (`contemplation_dial`, `embedded_bid`, `scarcity`), senão o
   braço A do experimento do telefone passa a revelar oferta por um card que a lista não conhece.

### Frente B — o controle na mão da Bruna

5. **`src/lib/agent/pi/system-do-vendedor.ts` (novo)** — `montarSystemDoVendedor()` extraído de
   `turno-livre.ts` (`linhaDeFato` + a composição do system), reusado pelo turno e pela prévia. Uma
   composição do system, dois consumidores.
6. **`src/lib/agent/box/caixa.ts` (modify)** — `listarVersoes()` (histórico com autor e data), ao lado
   de `lerCaixa` e `publicarCaixa`.
7. **`src/app/api/admin/caixa/route.ts` (novo)** — `GET` (versão viva + histórico) e `POST` (publica
   versão nova). **`src/app/api/admin/caixa/previa/route.ts` (novo)** — o system composto.
8. **`src/app/admin/(dashboard)/caixa/page.tsx` + `src/components/admin/caixa/editor-da-caixa.tsx`
   (novos)** — versão viva, editor, publicar, histórico, rollback (publicar de novo a versão antiga) e
   prévia. Entrada no menu em `src/components/admin/app-sidebar.tsx` e `/admin/caixa` em
   `ROTAS_SO_DE_ADMIN` (`src/lib/admin/role-scope.ts:95`).

### Frente C — o agente mais inteligente (prompt, não trava)

9. **`src/lib/agent/prompt-do-vendedor.ts` (modify)** — semente nova: perguntar **antes** de simular,
   uma coisa de cada vez, e oferecer as faixas de valor **na tela** em vez de exigir texto livre.
10. **`src/lib/agent/pi/skills/perguntar-com-opcoes/SKILL.md` (novo)** + `ORDEM` em
    `src/lib/agent/pi/skills/index.ts` — o catálogo de cards: qual usar em que situação, e que as
    opções da pergunta são dele, vendedor.

## O que NÃO muda

Cada item com o comando que o confere (rodar no fim e colar no diário).

1. **O agente é livre — não volta funil, gate, `nextGate`, lista de "não diga X" nem regex de frase.**
   `git diff develop -- src/lib/agent/orchestrator/directives.ts` → vazio; `grep -rn "nextGate"
   src/lib/agent/pi` → nada.
2. **Card é componente do produto e continua renderizando; quem escolhe é o modelo.**
   `pnpm vitest run src/lib/agent/pi/cards-livres.prova.test.ts` (22 tipos com destino declarado, 17
   emitíveis) + `grep -c 'case "' src/components/chat/artifact-renderer.tsx` → 22.
3. **Número, parcela, prazo e administradora só saem de tool.**
   `pnpm vitest run src/lib/agent/pi/cards-livres.test.ts` inclui o caso "payload de FATO com número do
   modelo é ignorado": o card sai com o número da carta real, e sem carta real **não sai**.
4. **CPF e identidade nunca chegam ao modelo.**
   `grep -n "scrubCpf" src/lib/agent/pi/turno-livre.ts` + `pnpm vitest run
   src/lib/agent/pi/identidade-do-texto.test.ts` verde; nenhum bloco toca
   `capturarIdentidadeDoTexto`.
5. **O experimento A/B do telefone continua decidindo**, não o modelo.
   `grep -n "telefone_do_desbloqueio" src/lib/agent/pi/cards-livres.ts` → só na entrada
   `fora-do-motor`; a prova de card cobre o motivo.
6. **A conduta continua vindo da caixa, e o texto do código é só semente/fallback.**
   `pnpm prompts:check` e `grep -n "lerCaixa" src/lib/agent/pi/turno-livre.ts`.
7. **O `value_picker` com valor livre não regride (defeito de 19/10).**
   `git diff --name-only develop | grep value-picker` → **vazio**.
8. **Português do Brasil com acento em tudo que o cliente e a Bruna leem.** Revisão dos textos da tela e
   do prompt; `grep -rn "voce\|nao\|opcao" src/app/admin/\(dashboard\)/caixa src/components/admin/caixa`
   → vazio.

## Restrições globais

- **Nada de deploy, push ou PR.** Trabalho fica na branch `kairogyn/chefe-vendedor-livre`.
- **Nenhuma worktree nova.** `orca worktree create`, `git worktree` e `worktree: true` do pi-subagents
  estão proibidos; o enxame roda aqui.
- **Um commit por bloco**, só com os arquivos do bloco, e só **depois** do gate verde. O subagente não
  commita: quem commita é o chefe.
- **Invariante verificável vira código; conversa é do modelo.** Nenhum guard de frase, nenhum regex de
  tom, nenhum "não diga X" (`CLAUDE.md`).
- **Payload de FATO é allowlist**: do `payload` que o modelo manda só se lê `groupId`, `lancePercent` e
  `initialTargetMonth`; todo número de oferta é reconstruído no servidor (mesma disciplina de
  `coerceRevealCota`, `src/lib/agent/orchestrator/recommendation-payload.ts`).
- **Sem fonte, sem card**: card de FATO que não consegue o dado real devolve texto de recusa ao modelo e
  **não** emite artifact.
- **Cache da caixa é 60 s por processo** (`caixa.ts:36`); `publicarCaixa` limpa o cache do processo que
  publica. A tela diz isso em vez de prometer efeito instantâneo.
- **Teste comedido**: o teste ao lado do arquivo mudado, e só ele.
- **Banco dos gates**: Postgres descartável do workspace (`aja-pg-chefe`, porta 55432), já migrado com
  as 67 migrations do repo; `DATABASE_URL` no `.env.local` (gitignored).

## Os blocos

### Bloco A1 — a tool `mostrar_card` e os cards de ESCOLHA

**Files**
- Create: `src/lib/agent/pi/cards-livres.ts`
- Create: `src/lib/agent/pi/cards-livres.test.ts`
- Modify: `src/lib/agent/pi/tools-livres.ts` (`CardLivre` `:51-53`; `ContextoDasTools` — novo campo
  `gruposRevelados`; tool nova; correção do colapso em `:329`; retorno `:372`;
  `NOMES_DAS_TOOLS_LIVRES` `:375-380`)
- Modify: `src/lib/agent/pi/turno-livre.ts` (`:292`)

**Interfaces**
- Consome: `ArtifactType` (`src/lib/chat/types.ts:502`), `QuickReplyPayload` (`:183`),
  `ValuePickerPayload` (`:201`), `TopicPickerPayload` (`:210`), `ClosingItem` (`:9-15` do
  `closing-presentation.ts`), `ContextoDasTools`, `CardLivre`, zod.
- Produz, em `cards-livres.ts`:
  - `type DestinoDoCard = { classe: "emitivel"; origem: "escolha" | "fato" } | { classe: "fora-do-motor"; motivo: string }`
  - `const DESTINO_DOS_CARDS: Record<ArtifactType, DestinoDoCard>`
  - `function validarCardDeEscolha(tipo: "quick_reply" | "value_picker" | "topic_picker", payload: unknown): { ok: true; payload: Record<string, unknown> } | { ok: false; erro: string }`
  - `function cardDeEscolha(tipo, payload): { ok: true; card: CardLivre } | { ok: false; erro: string }`
- Produz, em `tools-livres.ts`: a tool `mostrar_card`, com `inputSchema` `{ tipo: z.enum([...]), payload:
  z.record(z.string(), z.unknown()) }` e descrição que lista os cards disponíveis. Inválido devolve
  **texto** (não lança), explicando o que fazer.

**Passo a passo (TDD)**
1. Escrever `cards-livres.test.ts` primeiro, com os casos que mordem:
   - `quick_reply` válido (2 opções com `label`) entra em `ctx.cards` com o tipo certo e as opções
     intactas;
   - `quick_reply` com `options: []` → `ok: false` e **nenhum** card;
   - `quick_reply` com 5 opções → recusa (teto 4, ver Decisões);
   - `value_picker` com `max <= min` → recusa; `default` fora da faixa → recusa; `category:
     "servicos"` → recusa (o payload só admite `imovel|auto|moto`);
   - `topic_picker` sem `topics` → recusa; `includeBackButton` ausente → recusa;
   - `mostrar_card({tipo:"real_offer"})` → recusa com a frase "esse card sai de dado de tool, não de
     escolha";
   - `DESTINO_DOS_CARDS` tem 22 chaves — `expect(Object.keys(DESTINO_DOS_CARDS)).toHaveLength(22)`;
   - o fecho de `fazer_proposta` respeita `item.type` (um `signature_handoff` sai como
     `signature_handoff`, não como `real_offer`).
2. Implementar até verde.
3. Alargar `CardLivre`, registrar `mostrar_card`, tirar o `as never` de `turno-livre.ts:292`, corrigir o
   colapso de `:329`.
4. Rodar o gate e commitar.

**Gate do bloco**
```
pnpm vitest run src/lib/agent/pi && pnpm -s typecheck
```
Saída esperada: todos os arquivos de `src/lib/agent/pi` verdes (os 5 existentes + o novo) e `tsc` sem
saída.

### Bloco B1 — a API da caixa e o system composto

**Files**
- Create: `src/lib/agent/pi/system-do-vendedor.ts`
- Create: `src/lib/agent/pi/system-do-vendedor.test.ts`
- Modify: `src/lib/agent/pi/turno-livre.ts` (remove `linhaDeFato`; usa `montarSystemDoVendedor`)
- Modify: `src/lib/agent/box/caixa.ts` (`listarVersoes`, depois de `lerCaixa`)
- Create: `src/app/api/admin/caixa/route.ts`
- Create: `src/app/api/admin/caixa/previa/route.ts`

**Interfaces**
- Consome: `lerCaixa`, `labelDaCaixa`, `publicarCaixa`, `caixaDoCodigo` (`caixa.ts`),
  `skillsParaPrompt` (`src/lib/agent/pi/skills/index.ts`), `requireRole`
  (`src/lib/admin/require-role.ts`).
- Produz:
  - `montarSystemDoVendedor(args: { channel: "web"|"whatsapp"; contactName: string | null; identidade: { cpf: string; celular?: string } | null; caixa?: Caixa; skills?: string }): { system: string; partes: { conduta: string; skills: string; fato: string } }`
  - `listarVersoes(nome: string, label: string): Promise<Array<{ versao: number; texto: string; publicadoPor: string | null; criadoEm: Date }>>`
  - `GET /api/admin/caixa` → `{ label, vivo: { versao, texto, origem, criadoEm }, historico: [...] }`;
    `requireRole("admin")`.
  - `POST /api/admin/caixa` corpo `{ texto: string }` → `{ versao, label }`; `requireRole("admin")`;
    `publicadoPor` = `session.user.email`; zod recusa vazio com mensagem no campo. **A label é a do
    servidor** (`labelDaCaixa()`), nunca a do corpo.
  - `GET /api/admin/caixa/previa` → `{ system, partes }`; `requireRole("admin")`.

**Passo a passo (TDD)**
1. `system-do-vendedor.test.ts`: o system é `conduta + skills + fato` **nesta ordem**; caixa vazia cai no
   texto do código; a linha de fato diz `CPF: recebido e guardado` / `ainda não informado` e **nunca**
   contém o CPF em dígitos (passar um CPF e assertar `not.toContain("11144477735")`).
2. Extrair `linhaDeFato` sem mudar uma vírgula do texto — o teste da etapa 1 é o que prova que a
   extração não regrediu; o turno passa a chamar o módulo novo.
3. `listarVersoes` em `caixa.ts` + teste no banco do workspace (uma linha inserida por `publicarCaixa`,
   lida de volta com autor e data).
4. Rotas, no padrão de `src/app/api/admin/remarketing/config/route.ts` (zod no corpo, mensagem por
   campo).
5. Gate e commit.

**Gate do bloco**
```
pnpm vitest run src/lib/agent/pi src/lib/agent/box && pnpm -s typecheck
```
Saída esperada: verdes; nenhuma saída de `tsc`. Prova de ponta a ponta (o `curl` com sessão de admin
entra no diário):
```
curl -s -b "$COOKIE_ADMIN" http://localhost:3000/api/admin/caixa | jq '{label, vivo: .vivo.versao, versoes: (.historico|length)}'
```

### Bloco A2 — os cards de FATO e a prova de card

**Files**
- Modify: `src/lib/agent/pi/cards-livres.ts` (montadores + uso por tipo)
- Create: `src/lib/agent/pi/cards-livres.prova.test.ts`
- Modify: `src/lib/agent/pi/tools-livres.ts` (`buscar_cartas` guarda `ctx.gruposRevelados`;
  `mostrar_card` despacha para os montadores de FATO; `simularCota` em `DepsDasToolsLivres`)
- Modify: `src/lib/chat/desbloqueio-do-telefone.ts` (`CARDS_QUE_REVELAM_OFERTA`)

**Interfaces**
- Consome (tudo já existe e sobreviveu à refatoração):
  `indexRevealGroups` / `buildComparisonTableFromRevealGroups` / `coerceRevealCota` /
  `coerceRecommendationPayload` / `buildRecommendationCardFromRevealGroup`
  (`src/lib/agent/orchestrator/recommendation-payload.ts`) · `offerSnapshotFromArtifact` /
  `coerceDialPayload` (`src/lib/agent/orchestrator/dial-payload.ts`) · `compareWithFinancing` +
  `DEFAULT_FINANCING_RATES` (`src/lib/finance/pmt.ts:31,71`) ·
  `BeviSelfContractAdapter.simulateQuota` (`src/lib/adapters/bevi/bevi-self-contract-adapter.ts:214`) →
  `QuotaSimulation` (`src/lib/adapters/types.ts:42`) · `loadAdministradoraLogoMap`
  (`src/lib/consorcio/administradora-logo-repo`).
- Produz: `MONTADORES_DE_CARD: Record<TipoEmitivel, (ctx, ref) => { ok: true; card } | { ok: false; motivo }>`,
  onde `TipoEmitivel` é o subconjunto de `ArtifactType` com `classe: "emitivel"` (17).

Regra de cada montador, e a fonte do número:

| tipo | de onde vem o payload |
|---|---|
| `group_card` | `coerceRevealCota({id: groupId}, grupoReal, logos)` — grupo real do turno |
| `recommendation_card` | `buildRecommendationCardFromRevealGroup(grupo, logos, valorPedido)` |
| `simulation_result` | `simularCota` (adapter real; injetável no teste) → `QuotaSimulation` + administradora |
| `financing_comparison` | `compareWithFinancing({...grupo, category})` — categoria `imovel/auto/moto` |
| `contemplation_dial` | `coerceDialPayload({initialTargetMonth}, snapshotDoGrupo, perfilDeclarado)` |
| `embedded_bid` | teto de embutido e lance necessário **da oferta real**; `cartaNecessaria = valorDoBem / (1 - pct)`, a mesma conta de `tools-livres.ts` |
| `two_paths` | `{ monthlyPayment, administradora, disclaimer }` do grupo real |
| `scarcity` | `availableSlots` pelo hash determinístico do id — **nunca** `Math.random()` |
| `lead_form` | `{ conversationId, prefilledName }` do estado da conversa |
| `contract_form` | `{ conversationId, administradora, identityOnFile, prefilledCpfMasked }` — CPF **mascarado** |
| `whatsapp_optin` | `{ conversationId, knownPhone }` do estado |
| `decision_prompt` | `{ administradora }` da oferta real; opções canônicas de `DECISION_PROMPT_OPTIONS` |

**Passo a passo (TDD)**
1. `cards-livres.prova.test.ts` primeiro:
   - percorre `Object.keys(DESTINO_DOS_CARDS)` (22) e exige destino declarado; `fora-do-motor` precisa
     de `motivo` com 20+ caracteres;
   - todo `emitivel` tem montador (`MONTADORES_DE_CARD[tipo]` é função);
   - card de FATO **com** grupo real sai com o número da carta (comparar com o grupo injetado);
   - card de FATO **sem** grupo real devolve `ok: false` e **não** produz card;
   - `payload` do modelo com `creditValue: 999999` **não** vaza: o valor no card é o do grupo;
   - todo `emitivel` que carrega oferta está em `CARDS_QUE_REVELAM_OFERTA`.
2. Implementar montador a montador, rodando o teste a cada um.
3. Atualizar `CARDS_QUE_REVELAM_OFERTA`.
4. Gate e commit.

**Gate do bloco**
```
pnpm vitest run src/lib/agent/pi && pnpm -s typecheck
```
Saída esperada: `cards-livres.prova.test.ts` verde com a contagem 22 / 17 impressa; `tsc` sem saída.

### Bloco B2 — a tela da caixa

**Files**
- Create: `src/app/admin/(dashboard)/caixa/page.tsx` (server: lê a caixa e passa para o cliente)
- Create: `src/components/admin/caixa/editor-da-caixa.tsx` (client: editor, publicar, histórico,
  rollback, prévia)
- Modify: `src/lib/admin/role-scope.ts` (`ROTAS_SO_DE_ADMIN` ganha `"/admin/caixa"`)
- Modify: `src/components/admin/app-sidebar.tsx` (`settingsItems`, item "Conduta do agente" com
  `href: "/admin/caixa"`)

**Interfaces**
- Consome: `GET/POST /api/admin/caixa`, `GET /api/admin/caixa/previa`, `lerCaixa`, `listarVersoes`.
- Produz: a tela `/admin/caixa` com quatro partes — versão viva (número, autor, data), editor com o
  texto, histórico com botão "voltar para esta versão" (que **publica de novo**, não faz `UPDATE`), e
  prévia do system com as três partes destacadas (`conduta`, `skills`, `fato`). Texto de interface em
  pt-BR acentuado. Aviso honesto: "vale em até 60 segundos nos servidores que já estão no ar".

**Passo a passo**
1. `page.tsx` lê a caixa no servidor e entrega pronto (sem fetch no cliente no primeiro render), como
   `src/app/admin/(dashboard)/remarketing/config/page.tsx`.
2. `editor-da-caixa.tsx` no molde de `src/components/admin/remarketing/config-da-regua.tsx`: estado
   local, `POST`, erro por campo, sucesso recarrega o histórico.
3. Rollback = `POST` com o texto da versão escolhida, avisando "isso cria a versão N+1".
4. `ROTAS_SO_DE_ADMIN` + menu.
5. Gate e commit.

**Gate do bloco**
```
pnpm -s typecheck && pnpm lint
```
Saída esperada: nenhuma saída de `tsc`; Biome sem erro. Depois, com o app de pé: `/admin/caixa` logado
como admin (200) e como `attendant` (redireciona para `/admin`).

### Bloco C — a semente nova e a skill do catálogo de cards

**Files**
- Modify: `src/lib/agent/prompt-do-vendedor.ts`
- Create: `src/lib/agent/pi/skills/perguntar-com-opcoes/SKILL.md`
- Modify: `src/lib/agent/pi/skills/index.ts` (`ORDEM`)
- Modify: `src/lib/agent/pi/skills/skills.test.ts` (a lista exata de skills muda — é a garantia que
  muda, não um teste a ser driblado)
- **NÃO** mexe em `next.config.ts`: `outputFileTracingIncludes` já é `"/api/**"` e `"/**"` com
  `src/lib/agent/pi/skills/**/*.md`, e o glob cobre a pasta nova.

**Interfaces**
- Consome: `mostrar_card` (A1/A2), `PROMPT_DO_VENDEDOR` (fallback), `skillsParaPrompt`.
- Produz: semente com o que a Bruna pediu (perguntar antes de simular; uma coisa de cada vez; oferecer as
  faixas na tela) e uma skill que ensina **quando** usar cada card — inclusive quando **não** usar card
  nenhum.

**Passo a passo (TDD)**
1. Escrever os testes antes:
   - `skillsParaPrompt()` contém `<skill name="perguntar-com-opcoes">` (atualiza `skills.test.ts` para a
     lista de 3);
   - `PROMPT_DO_VENDEDOR` cita `mostrar_card` e a ideia "pergunte antes de simular";
   - conduta + skills ficam **abaixo de 20.000 caracteres** (guardrail de contexto; o teste imprime o
     tamanho).
2. Editar a semente. **Sem** nenhuma regra de frase: é conduta, não trava.
3. Escrever a `SKILL.md` com frontmatter `name`/`description` em bloco escalar (`description: >-`),
   porque a description tem dois-pontos.
4. Gate e commit.

**Gate do bloco**
```
pnpm vitest run src/lib/agent/pi/skills && pnpm -s typecheck && pnpm prompts:check
```
Saída esperada: skills verdes; `tsc` sem saída; `prompts:check` imprimindo a label e `Origem da caixa em
uso` (exit 0 com versão publicada ou com o aviso ℹ️ de fallback).

## Ordem de ondas

**Onda 1 — A1 e B1, em paralelo.** Disjuntos, com uma ressalva honesta: os dois tocam
`turno-livre.ts` (A1 na linha do `artifactType`; B1 em `linhaDeFato`/composição do system). Para não
haver dois escritores no mesmo arquivo, **A1 roda primeiro e B1 depois** — A1 é caminho crítico do
produto e B1 é independente. O resto do par (`cards-livres.ts` + `tools-livres.ts` ×
`system-do-vendedor.ts` + `caixa.ts` + rotas) é disjunto.

**Onda 2 — A2 e B2, em paralelo.** A2 depende de A1 e mexe em `cards-livres.ts`, `tools-livres.ts`,
`desbloqueio-do-telefone.ts`. B2 depende de B1 e mexe em `src/app/admin/(dashboard)/caixa/`,
`src/components/admin/caixa/`, `role-scope.ts`, `app-sidebar.tsx`. Zero arquivo em comum.

**Onda 3 — C.** Depende de A1/A2 (a skill ensina a tool, e o teste cita `mostrar_card`). Mexe em
`prompt-do-vendedor.ts`, `skills/`, `skills.test.ts`.

**Fechamento.** `subagent` com `agent: "reviewer"` contra o diff de `develop`, foco em correção. Achado
`CONFIRMED` vira brief de bloco novo — não é corrigido na mão.

## Critério de pronto

Cada item verificável por comando (os 8 do mandato):

1. `pnpm -s typecheck` → sem saída.
2. Cada bloco com o teste ao lado do arquivo rodado e a saída colada em `.orientacao/diario.md`.
3. **Prova de card**: `pnpm vitest run src/lib/agent/pi/cards-livres.prova.test.ts` → 22 tipos com
   destino, 17 emitíveis, 5 fora-do-motor com motivo; e `grep -c 'case "' 
   src/components/chat/artifact-renderer.tsx` → 22.
4. **Prova do controle da Bruna**, ponta a ponta: `POST /api/admin/caixa` com texto novo → `GET`
   devolve a versão nova → `GET /api/admin/caixa/previa` mostra a conduta nova no system montado → o
   turno seguinte lê a mesma versão (`pnpm prompts:check` mostra `versao N`). Curl e saída no diário.
   Banco: o do workspace (`aja-pg-chefe`).
5. `pnpm prompts:check` rodado, saída no diário.
6. Seção **"O que NÃO muda"** conferida item a item, com os 8 comandos no diário.
7. `.orientacao/diario.md` com uma linha por bloco: bloco, commit, gate rodado, saída, o que ficou fora.
8. Revisão final com `subagent agent: "reviewer"` contra `develop`, e o parecer anexado.

## Riscos

| risco | mitigação |
|---|---|
| `mostrar_card` virar funil disfarçado (o modelo usa card no lugar de conversa) | a skill C ensina **quando não** usar card; nenhuma regra em código; o log `[pi-livre] saida` mostra a frequência |
| número do modelo vazar em payload de FATO | allowlist de três campos (`groupId`, `lancePercent`, `initialTargetMonth`); teste que injeta `creditValue: 999999` e exige o número do grupo |
| card novo revelando oferta antes do telefone no braço A | `CARDS_QUE_REVELAM_OFERTA` atualizado no A2 + teste que exige decisão explícita para todo emitível que carrega oferta |
| `scarcity` sem fonte real (placebo 1-6 por decisão de produto, `src/lib/chat/types.ts:453-459`) | hash determinístico do id — **nunca** aleatório — e o card só sai com grupo real |
| publicar na label errada (17/10: dev mudou produção) | `POST` publica só na label do servidor; a label nunca vem do corpo; a tela mostra qual label está editando |
| efeito não ser imediato em todas as instâncias | cache de 60 s por processo; a tela avisa |
| regressão do `value_picker` (defeito de 19/10) | nenhum bloco toca `value-picker.tsx`; gate com `git diff --name-only develop \| grep value-picker` vazio |
| contexto do modelo inflar com 3 skills + catálogo | teste de tamanho (≤ 20.000 caracteres) e catálogo em tabela curta |
| `servicos` no enum de `buscar_cartas` sem categoria nos payloads de card | não ampliar o payload: `value_picker`/`financing_comparison` recusam `servicos`; a busca fica como está, registrado no diário |
| dois escritores em `turno-livre.ts` na onda 1 | A1 primero, B1 depois (nunca simultâneos) |

## Como você será avaliado

- **Nota contínua**: um ponto por item do Critério de pronto e por gate de bloco, cada um com evidência
  (comando + saída).
- **Falhas imediatas**: reconstruir funil, `nextGate`, gate em código ou lista de "não diga X"; aceitar
  número vindo do modelo em card de FATO; CPF em dígitos no system, no payload ou no log; não emitir
  card que já existia; tocar `value-picker.tsx`; publicar conduta sem versão nova (ou com `UPDATE` na
  tabela); texto de tela sem acento; commitar com gate vermelho ou "resolver" com `HUSKY=0` sem
  registrar o motivo de ambiente; teste que fica verde quando a garantia é removida; deploy, push ou PR
  sem ordem; abrir worktree nova.
- Se causar falha sem querer: pare, registre no diário e reporte.

## Comandos de validação

```bash
# chão
pnpm install --offline --frozen-lockfile
pnpm -s typecheck

# onda 1
pnpm vitest run src/lib/agent/pi
pnpm vitest run src/lib/agent/box

# onda 2
pnpm vitest run src/lib/agent/pi/cards-livres.prova.test.ts
pnpm vitest run src/lib/agent/pi
grep -c 'case "' src/components/chat/artifact-renderer.tsx   # 22
pnpm lint

# onda 3
pnpm vitest run src/lib/agent/pi/skills
pnpm prompts:check

# invariantes que não mudam
git diff --name-only develop | grep value-picker || echo "value-picker intocado"
git diff develop -- src/lib/agent/orchestrator/directives.ts
grep -rn "nextGate" src/lib/agent/pi || echo "sem funil no motor"
```

## Decisões e o que ficou fora

### Destino dos 22 cards

| # | tipo | destino | de onde sai o payload |
|---|---|---|---|
| 1 | `comparison_table` | emitível / fato | já sai em `buscar_cartas` (`tools-livres.ts:203`) |
| 2 | `real_offer` | emitível / fato | já sai em `fazer_proposta` (`tools-livres.ts:325-332`) |
| 3 | `group_card` | emitível / fato | `coerceRevealCota` sobre o grupo real do turno |
| 4 | `recommendation_card` | emitível / fato | `buildRecommendationCardFromRevealGroup` |
| 5 | `simulation_result` | emitível / fato | `simularCota` → `QuotaSimulation` |
| 6 | `financing_comparison` | emitível / fato | `compareWithFinancing` (`pmt.ts:71`) |
| 7 | `contemplation_dial` | emitível / fato | `coerceDialPayload` sobre o snapshot da oferta |
| 8 | `embedded_bid` | emitível / fato | teto de embutido e lance necessário da oferta real |
| 9 | `two_paths` | emitível / fato | parcela e administradora do grupo real |
| 10 | `scarcity` | emitível / fato | hash determinístico do id do grupo (placebo 1-6, ADR de 09/07) |
| 11 | `lead_form` | emitível / fato | `conversationId` + `prefilledName` do estado |
| 12 | `contract_form` | emitível / fato | estado da conversa + CPF **mascarado** |
| 13 | `whatsapp_optin` | emitível / fato | `conversationId` + `knownPhone` |
| 14 | `decision_prompt` | emitível / fato | `administradora` da oferta; opções canônicas de `DECISION_PROMPT_OPTIONS` |
| 15 | `quick_reply` | emitível / escolha | opções escritas pelo modelo, validadas no servidor |
| 16 | `value_picker` | emitível / escolha | faixas de valor escritas pelo modelo, validadas no servidor |
| 17 | `topic_picker` | emitível / escolha | tópicos escritos pelo modelo, validados no servidor |
| 18 | `signature_handoff` | **fora do motor** | sai do handler de confirmação (`route.ts:1368` e `interactive-handlers.ts:225`), depois de `confirmOffer` — antes dela não existe `proposalUrl`, e o card exige |
| 19 | `atendimento_handoff` | **fora do motor** | idem: o fecho é do handler de confirmação; emitir no turno duplicaria o beat |
| 20 | `telefone_do_desbloqueio` | **fora do motor** | o experimento A/B decide (`desbloqueio-do-telefone.ts`); escolha do modelo quebraria a medição que a Bruna usa |
| 21 | `document_upload` | **fora do motor** | retirado do fecho por decisão do Kairo em 21/07/2026; quem pede documento é o atendente da adesão |
| 22 | `scenarios` | **fora do motor** | os 3 cenários exigem `expectedTermMonths` por cenário, projeção **sem fonte real**; fabricar violaria "número só de tool". Volta quando houver fonte |

Contagem: **17 emitíveis** (2 já no turno + 15 pela tool nova) e **5 fora-do-motor** com motivo.

### Decisões tomadas neste plano

- **Uma tool, dois destinos.** `mostrar_card` com `tipo` + `payload` frouxo; o servidor decide se valida
  como escolha ou se reconstrói como fato. Schema pequeno para o modelo, validação concentrada num
  arquivo.
- **`decision_prompt` é FATO, não ESCOLHA:** as opções são canônicas em código
  (`DECISION_PROMPT_OPTIONS`) e o payload só carrega contexto. O modelo escolhe **quando**, não **o
  quê**.
- **`signature_handoff`/`atendimento_handoff` fora do motor:** nascem do handler de confirmação e
  dependem de `proposalUrl` gerado depois de `confirmOffer`.
- **Teto de 4 opções** em `quick_reply`, `topic_picker.topics` e `value_picker.fields` — mesmo motivo de
  `MAX_OPCOES_NA_COMPARACAO = 4`: card é decisão, não menu. Quem quiser mais opções as oferece na
  conversa. Número num lugar só (`cards-livres.ts`).
- **Tela e API da caixa são `admin`** (precedente: `whatsapp/configuracao` também é `ROTAS_SO_DE_ADMIN`,
  porque muda algo que o cliente vê). Se a conta da Bruna estiver como `viewer`, dar `admin` a ela é uma
  mudança de conta, não de código.
- **`POST` publica só na label do servidor**, nunca numa label do corpo — mata o footgun de 17/10.
- **Raiz do valor do `value_picker`:** os números ali são a **pergunta** (faixa de intenção), não oferta;
  por isso podem vir do modelo — com sanidade (`min > 0`, `max > min`, `default` dentro da faixa, `max ≤
  1.000.000`) e sem `servicos`.
- **O colapso de tipo do fecho (`tools-livres.ts:329`) é bug e entra no A1**, não numa onda futura.

### Perguntas que o plano levantou, e a decisão (o mandato manda decidir)

- **Q1 — A Bruna tem role `admin`?** A tela e a API ficam `admin`-only, por precedente do projeto. Se a
  conta dela for `viewer`, quem dá `admin` é o Kairo, no painel de atendentes — mudança de conta, não de
  código. Registrado no diário.
- **Q2 — Teto de opções:** 4, num lugar só. Se a preferência dela for 6, muda uma constante.
- **Q3 — Publicar em outra label pela tela?** Não. A tela publica só na label do ambiente. Escolher
  label na UI é o acidente de 17/10 com um botão a mais.
- **Q4 — `scenarios` volta com qual fonte?** Sem fonte definida, segue fora do motor. É a única exceção
  em que "mais um card" custaria inventar número.
- **Q5 — O placebo de `scarcity` (1-6 por hash do id) continua valendo?** Sim: a decisão está
  documentada no próprio tipo (`src/lib/chat/types.ts:453-459`, ADR de 09/07/2026 D3) e o componente é o
  único consumidor. O arquivo do ADR não existe nesta worktree — fica registrado como dívida de
  documentação, não como motivo para remover o card.

## Conferência de linhas

Conferido por leitura nesta worktree (`kairogyn/chefe-vendedor-livre`, de `develop` em `0a364281`):

- `src/lib/chat/types.ts`: `:150` `LeadFormPayload`, `:183` `QuickReplyPayload`, `:201`
  `ValuePickerPayload`, `:210` `TopicPickerPayload`, `:218` `ScenarioPayload`, `:227` `ScenariosPayload`,
  `:266` `DecisionPromptPayload`, `:270` `DECISION_PROMPT_OPTIONS`, `:295` `ContractFormPayload`, `:360`
  `SignatureHandoffPayload`, `:369` `AtendimentoHandoffPayload`, `:419` `EmbeddedBidPayload`, `:440`
  `TwoPathsPayload`, `:453` `ScarcityPayload`, `:473` `TelefoneDoDesbloqueioPayload`, `:478`
  `ArtifactByType`, `:502` `ArtifactType` — 22 membros ✅
- `src/components/chat/artifact-renderer.tsx:55-99` — 22 `case` ✅
- `src/lib/agent/pi/tools-livres.ts` — `CardLivre` `:51-53`; `CATEGORIAS` `:85`; `buildToolsLivres`
  `:97`; `buscar_cartas` `:98` (push do card `:203`); `fazer_proposta` `:225`; `realOfferPresentation`
  `:325`; colapso de tipo `:329`; `falar_com_humano` `:351`; `salvar_nome` `:363`; retorno `:372`;
  `NOMES_DAS_TOOLS_LIVRES` `:375-380` ✅
- `src/lib/agent/pi/turno-livre.ts` — `linhaDeFato` `:125`; `lerCaixa` `:181`; system `:181-190`;
  `so: [...NOMES_DAS_TOOLS_LIVRES]` `:231`; `scrubCpf` `:236`; `artifactType: card.type as never` `:292`;
  `runTurnLivre` `:330` ✅
- `src/lib/agent/box/caixa.ts` — `NOME_DA_CAIXA` `:22`, `labelDaCaixa` `:42`, `lerCaixa` `:84`,
  `publicarCaixa` `:124`, `limparCacheDaCaixa` `:151`, TTL `:36` ✅
- `src/db/schema.ts:1929-1945` `caixa_de_prompt` ✅
- `src/lib/admin/role-scope.ts:95` `ROTAS_SO_DE_ADMIN`; `podeAcessarRota` `:117`; `ROTAS_POR_ROLE` `:75`
  ✅; `src/app/api/admin/remarketing/config/route.ts` `GET` `:43` (`admin`,`viewer`), `PUT` `:56`
  (`admin`) ✅
- `src/lib/agent/orchestrator/` — 14 arquivos, **sem** `server-cards.ts` / `scarcity-payload.ts` /
  `simulation-payload.ts` / `two-paths-payload.ts` / `embedded-bid-payload.ts` / `topic-catalog.ts` ✅;
  `recommendation-payload.ts`: `coerceRevealCota`, `MAX_OPCOES_NA_COMPARACAO` ✅
- `src/lib/finance/pmt.ts` — `DEFAULT_FINANCING_RATES` `:31`, `compareWithFinancing` `:71` ✅
- `src/lib/adapters/bevi/bevi-self-contract-adapter.ts:214` `simulateQuota` ✅; `src/lib/adapters/types.ts:42`
  `QuotaSimulation` ✅
- `src/lib/chat/desbloqueio-do-telefone.ts:95-102` `CARDS_QUE_REVELAM_OFERTA` ✅
- `src/lib/bevi/closing-presentation.ts` — `ClosingItem` `:9-15`, `realOfferPresentation` `:40`, artifact
  `:109-110`, `closingPresentation` `:188`, `atendimento_handoff` `:213-215`, `signature_handoff`
  `:249-252` ✅; chamado em `src/app/api/chat/route.ts:1368` e `src/lib/whatsapp/interactive-handlers.ts:225`
  ✅
- `src/lib/agent/pi/skills/index.ts` `ORDEM` ✅; `next.config.ts:17-20` `outputFileTracingIncludes` já
  cobre `src/lib/agent/pi/skills/**/*.md` ✅
- `package.json`: `typecheck` `:15`, `lint` `:13`, `prompts:check` `:39` ✅
- **Não confirmado**: que o adapter de WhatsApp renderize `quick_reply` com teto próprio de botões; que
  `prepararPropostaParaEnvio` seja o único caminho de gerar `proposalUrl`; e o conteúdo do ADR
  `docs/decisoes/blocos/2026-07-09-agente-vendas-consorcio.md`, que **não existe nesta worktree**.
