---
id: FIX-404
titulo: "O painel respondia 'quantos', não 'por qual A/B' — e o desfecho do teste inventava braço por hash"
status: done
bloco: filtro-ab-painel
arquivos:
  - src/lib/experimentos/registro.ts
  - src/lib/experimentos/registro.test.ts
  - src/lib/admin/filtro-variante.ts
  - src/lib/admin/filtro-variante.test.ts
  - src/lib/admin/filtro-variante.integration.test.ts
  - src/lib/admin/sinais-do-funil.ts
  - src/lib/admin/performance-queries.ts
  - src/lib/admin/performance-types.ts
  - src/lib/admin/handoff-queries.ts
  - src/lib/admin/percurso-queries.ts
  - src/lib/admin/percurso-types.ts
  - src/lib/admin/campanhas-queries.ts
  - src/lib/admin/remarketing-queries.ts
  - src/lib/heatmap/queries.ts
  - src/lib/exportacao/percurso.ts
  - src/lib/exportacao/conversas.ts
  - src/lib/exportacao/toques.ts
  - src/lib/exportacao/index.ts
  - src/lib/exportacao/textos.ts
  - src/lib/exportacao/formato.ts
  - src/components/admin/dashboard/filtro-ab.tsx
  - src/components/admin/conversations/conversations-table.tsx
  - src/components/admin/performance/tabela-origens.tsx
  - src/components/admin/performance/bloco-de-custos.tsx
  - src/components/admin/campanhas/resumo-campanhas.tsx
  - src/lib/chat/telefone-ab-do-servidor.ts
  - src/lib/chat/variante-da-visita.ts
  - src/lib/chat/resultado-do-teste-do-telefone.ts
rodada: 2026-09-30
executado_em: 2026-09-30
---
## Palavras do dono
Kairo, 30/09/2026, batendo o padrão que vale de agora em diante
(`docs/decisoes/2026-09-30-padrao-variante-por-etapa-avancada.md`): *"isso vai ser um padrao daqui pra
frente, a etapa que o cliente avancou, ele veio por qual A/B? essa eh a resposta que temos que dar."*
E, fechando a regra da pessoa: *"essa regra da variante nao entra no whatsapp, porque ele ja nasce
identificado. entenda que vamos seguir o funil, estamos fazendo AB para sair da etapa de nao
identificado. entao o cara na etapa de se identificou quero saber qual foi o a/b que acionou ele."*

## O que estava no ar (medido no código, não no relato)
| Pedido dele | O que existia |
|---|---|
| Recorte por A/B em todas as telas de monitoramento | **nada.** Não havia filtro de variante em tela nenhuma; só o card do teste do telefone (FIX-401/403), que conta por visita |
| "a etapa que o cliente avançou, ele veio por qual A/B?" | as telas sabiam **quantos** em cada degrau, nunca **por qual braço** |
| A exportação dizendo de qual braço veio | nenhuma coluna de braço |
| O braço é fato, não chute | `registrarDesfechoDoTeste` (`src/lib/chat/telefone-ab-do-servidor.ts`) **derivava o braço por hash** e o **gravava** no metadata quando não havia braço válido — um chute virando fato no banco |

O defeito de fundo era o **acoplamento ao nome do teste**: não havia como um segundo A/B existir sem
mexer no filtro, nas queries, no export e na UI.

## O que mudou
1. **Registro de experimentos** (`src/lib/experimentos/registro.ts`, puro, importável no cliente):
   hoje uma entrada — `telefoneDoDesbloqueio`, braços `A`/`B`, âncora `identificados`. Filtro,
   fragmento SQL, coluna do export e seletor **recebem o experimento**; nada fora do registro conhece
   o nome da chave (critério C5 roda `grep` e sai **vazio**).
2. **A pessoa é atribuída ao braço que ACIONOU a identificação** (`src/lib/admin/filtro-variante.ts`):
   a **primeira** conversa web do período com braço em que `conversaIdentificada` é verdadeira; não
   havendo nenhuma, a **última** conversa com braço (exposição — quem nunca se identificou); não
   havendo nenhuma, `sem variante`. Uma linha por pessoa ⇒ **`A + B + sem variante = total` em cada
   etapa**, por construção. As etapas depois da âncora herdam. Nas telas onde a linha **é uma
   conversa** (Conversas, Remarketing, export `conversas`/`toques`), o braço é o da própria conversa.
3. **Recorte na URL e no cookie**: `?ab=<experimento>:<braço>` + cookie de sessão `aja_ab`
   (URL > cookie > nenhum). Par fora do registro é ignorado — link velho ou adulterado mostra o
   painel inteiro, nunca tela vazia. Na tela, o recorte ativo vem **escrito** (o dono é daltônico).
4. **Custo não se divide por braço**: com recorte ativo, investimento/CPC/CPL e custo por campanha
   saem `null` com `custoNaoAplicavelAoRecorte: true`, e o bloco escreve *"Custo não se divide por
   braço de teste: o investimento da Meta é do período inteiro."* — sem nenhum valor em R$.
5. **Coluna de braço na exportação**, uma por experimento do registro (hoje
   `varianteTelefoneDoDesbloqueio`): por pessoa no `percurso`, por conversa em `conversas` e `toques`;
   `limpeza` não. Célula sem braço sai **escrita** (`SEM_BRACO_NO_EXPORT = "sem variante: fora do
   teste"`), nunca vazia e nunca inventada.
6. **O desfecho do teste não inventa braço** (`fix(chat)`): `registrarDesfechoDoTeste` grava
   `desbloqueadoEm`/`recusado` **sem** `variante` quando não havia braço válido persistido.
7. **Default = todas.** Sem recorte, o SQL gerado é **idêntico** ao de antes — nenhum número que a
   operação lê hoje se move.

## Provado
Base `018a205e`. Rodei os critérios do PRD nesta worktree (`kairogyn/filtro-ab-painel`):

| # | Critério | Saída |
|---|---|---|
| C1 | `pnpm -s typecheck` | **exit 0**, sem saída |
| C2 | `vitest run src/lib/experimentos src/lib/admin/filtro-variante.test.ts src/lib/admin/filtro-variante.integration.test.ts` | **3 arquivos, 38 testes verdes** |
| C3 | `vitest run src/lib/admin/*.variante.integration.test.ts src/lib/heatmap src/app/api/admin/conversations` | **19 arquivos, 175 verdes** |
| C4 | integrações existentes das áreas tocadas | **154 verdes, 1 falha PRÉ-EXISTENTE** (ver abaixo) |
| C5 | experimento fictício + `grep -rn "telefoneDoDesbloqueio"` nas 6 árvores do critério | casos verdes; **grep vazio (exit 1)** |
| C6 | casos `custoNaoAplicavelAoRecorte` (C3) + teste do bloco de custo (`bloco-de-custos.recorte.test.tsx`, em C9) | verdes — a frase aparece e **nenhum R$** é renderizado |
| C7 | `git diff --stat 018a205e..HEAD -- src/app/api/admin/performance/telefone-ab src/components/admin/performance/teste-do-telefone.tsx` | **vazio** (card do teste intocado) |
| C8 | `vitest run src/lib/exportacao src/lib/chat/telefone-ab-do-servidor` + grep de derivação | **7 arquivos, 51 verdes**; grep de `varianteDaConversaPersistida\|varianteDaConversa(\|lerVariante(` → **vazio** |
| C9 | `vitest run src/components/admin src/app/admin` | **45 arquivos, 290 verdes** |
| C10 | `biome check` dos 62 arquivos `AM` do diff | **limpo** |
| C11 | diff de `src/lib/chat`/`src/app/api/chat` e das áreas que não mudam | só a constante movida + o fix do B6 e seu teste; Agora/dashboard/leads/`drizzle` **vazios** |
| C12 | este card | ok |
| C13 | `orca worktree list` sem `lane-*`/`integ-*` | ok — só as worktrees pré-existentes |

Testes novos: `registro.test.ts`, `filtro-variante.integration.test.ts` (os casos da âncora nas duas
formas, escalar e CTE), `performance-queries.variante.integration.test.ts`,
`percurso-queries.variante.integration.test.ts`, `campanhas-queries.variante.integration.test.ts`,
`remarketing-queries.variante.integration.test.ts`, `heatmap/queries.variante.integration.test.ts`,
`exportacao/recorte-de-braco.integration.test.ts`, `conversations/route.variante.integration.test.ts`,
`filtro-ab.test.tsx`, `bloco-de-custos.recorte.test.tsx`, `resumo-campanhas.recorte.test.tsx`,
`telefone-ab-do-servidor.test.ts`.

### Vermelho conhecido e alheio a esta entrega
`src/lib/admin/handoff-queries.integration.test.ts` → *"estágio sem saída registrada não vira tempo
zero"*: `qualificado: expected 0 to be greater than 0`. **Não é deste diff** — restaurando o arquivo
da base (`git stash push -- src/lib/admin/handoff-queries.ts`) o teste falha **igual** (`1 failed |
19 passed`). Causa medida no banco do workspace: 16 leads `is_simulated=false` de **14/08 e
20/08/2026** (restos de um run antigo, não semeados por teste nenhum) fazem o p50 de `qualificado`
virar 0,0017 h, que arredonda para 0,0. A saída é limpar essas linhas de agosto/2026 ou estreitar a
janela do teste — decisão do dono, registrada em `.orientacao/diario-enxame.md`.

## Fora do escopo (registrado, não feito)
- **Card do teste do telefone** (FIX-401): continua contando **por visita** e não é cortado pelo
  recorte global (D7) — por decisão, não por esquecimento.
- **Agora** (`/admin`), `/api/admin/dashboard` (órfã) e **Pipeline**: fora do escopo (D12).
- **Nível etapa por instante do evento**: descartado — o override de QA do FIX-403 **regrava** a
  variante, então "o braço em vigor no instante do evento" é irrecuperável. As etapas depois da
  âncora **herdam** o braço da identificação.
- **Defeito pré-existente** em `src/lib/exportacao/percurso.ts`: o mapper lê `contato_id` enquanto a
  query seleciona `p.contact_id` ⇒ o arquivo de percurso sai inteiro como "sem vínculo". Achado
  durante o bloco B4, **não** corrigido nesta rodada (fora do escopo).
- **`PENDENTE-KAIRO`**: o `?variante=A|B` de QA do FIX-403 grava braço em conversas do próprio
  operador; elas entram no recorte como qualquer outra. E o doc versionado `§A item 1` ainda diz
  "variante por etapa, a da conversa em que avançou para aquela etapa", enquanto o estudo mais
  recente (com o qual o dono liberou o B1) diz que as etapas **herdam** — o texto do doc pede uma
  linha do dono alinhando.