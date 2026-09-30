# Filtro A/B nas telas de monitoramento + a variante na exportação — Plano de implementação

**Goal:** o dono filtra *"o A e B em todas as telas de monitoramento"* e a exportação diz *"se foi A ou B
da etapa tal que passou"* — sem mudar um único número quando o filtro está em "todas".
**Arquitetura:** uma peça nova, `src/lib/admin/filtro-variante.ts` (espelho de `filtro-origem.ts`), que lê
o recorte da requisição (URL `variante` > cookie `aja_variante` > todas) e devolve **condições SQL ou
`null`**. As rotas leem logo depois do período e repassam às queries como parâmetro opcional; `null` =
não filtrar. A UI ganha um seletor irmão do `DateRangeFilter`. A exportação ganha a coluna lida direto do
metadata. Sem migration.
**Stack:** Next.js (App Router) · React · nuqs · Drizzle/Postgres · Vitest (`happy-dom` para componente).

Card: **FIX-404**. Base de integração: **`integ/filtro-ab`**, forkada de `kairogyn/filtro-ab-painel`
(= `main` `11d02b20`, que já traz o FIX-403: variantes **`A`** e **`B`**, `C` não existe).
Validação contra o código e decisões do chefe: `.orientacao/diario.md` (30/09).

## Contexto (validado em 30/09)

- A variante vive em `conversations.metadata -> 'telefoneDoDesbloqueio' ->> 'variante'`
  (`CHAVE_DO_TESTE_NO_METADATA`, `src/lib/chat/resultado-do-teste-do-telefone.ts:33`), gravada na criação
  da conversa web (`src/app/api/chat/route.ts`). WhatsApp e conversa web anterior ao teste **não têm**.
- **A** = telefone antes de qualquer oferta; **B** = ofertas embaçadas + clique → telefone.
- O período já viaja por URL + cookie (`periodo-da-requisicao.ts`, `date-range-filter.tsx`); o filtro de
  variante usa **o mesmo trilho**.
- `/admin` é o Agora (`/api/admin/agora`, ao vivo, sem período) e `/api/admin/dashboard` não tem
  consumidor de UI → **os dois ficam fora** (diário, decisão 1).

## Decisões (tomadas — implementar, não rediscutir)

| # | Decisão |
|---|---|
| D1 | **Regra da PESSOA = a conversa mais recente QUE TEM variante, dentro do período** (`c.created_at BETWEEN de AND ate`, `ORDER BY c.created_at DESC, c.id DESC` — desempate obrigatório). Conversa sem variante (WhatsApp, pré-teste) **não reseta**. Decisão do dono de 30/09 (*"se ela passou de etapa do funil, deve considerar a que fez ela ir para lá, que foi a última"*), fechada pelo estudo `.orientacao/ESTUDO-REFINO-2026-09-30-atribuicao-da-variante.md`. Não soma a pessoa em A e B, não existe balde `mista`. |
| D1′ | **Nível ETAPA: NÃO construir** (estudo de 30/09): quebra `A + B = total` (a mesma pessoa pode ter "viu oferta" numa conversa A e "proposta" numa B) e o dado não existe — o override de QA do FIX-403 **regrava** a variante, o banco guarda o valor atual e não o histórico. Nada de `RegraDeAtribuicao`, nada de parâmetro de instante. |
| D2 | Balde **`sem-variante`** (esse nome) = WhatsApp, conversa pré-teste, pessoa sem conversa web. **`A + B + sem-variante = todas`** tem que fechar em toda tela. |
| D3 | **Default = todas.** Com o filtro no default, **nenhum número muda** (provado por teste, ver C4). Com filtro ≠ todas a tela diz *"Recorte: variante A"* (ou B / sem variante). |
| D4 | **Custo não se filtra por variante** (`meta_insights_diarios` não tem variante). Com filtro ≠ todas: investimento, CPC, CPL e custo por etapa saem `null` + `custoNaoAplicavelAoRecorte: true`; a tela escreve *"Custo não se divide por variante: o investimento da Meta é do período inteiro."* O funil segue visível. |
| D5 | O **card do teste do telefone** (FIX-401, `teste-do-telefone.tsx`) **não** é cortado: o fetch dele **não** manda `variante`, e a rota `performance/telefone-ab` **não** lê o filtro. |
| D6 | **Exportação = coluna `varianteTelefone`**, lida do metadata (`c.metadata -> CHAVE ->> 'variante'`): `percurso` (por pessoa, regra D1), `conversas` e `toques` (por conversa). `limpeza` não. Sem metadata ⇒ texto `SEM_VARIANTE_NO_EXPORT = "sem variante: fora do teste do telefone"` (em `textos.ts`), nunca célula muda. **PROIBIDO** `varianteDaConversaPersistida` e `lerVariante` no caminho de tela/export. |
| D7 | A variante é atribuída **à unidade contada**: tela que conta PESSOA → D1; linha que é CONVERSA ou LEAD (Conversas, Remarketing, export `conversas`/`toques`) → a variante da própria conversa (`lead` herda da `conversation_id`). |
| D8 | Filtro = querystring `variante` + cookie de **sessão** `aja_variante` (sem `max-age`). Precedência URL > cookie > todas. Valor desconhecido ⇒ `null` = não filtrar (nunca 400, nunca tela vazia). |
| D9 | Escopo de telas: Performance, Percurso, Campanhas, Exportação, Remarketing, Mapa de calor, **Conversas** (destino do drill-down da Performance). **Fora:** Agora, `/api/admin/dashboard` (órfã), Pipeline (kanban operacional da mesa). |
| D10 | Os links que a Performance/Percurso montam para `/admin/conversations` e para a Exportação **carregam** `variante` (o número clicado abre a mesma lista). |

## Restrições globais

- Texto visível em **português correto** (acento, cedilha, til). Acento faltando é defeito de entrega.
- Status/recorte nunca só por cor: rótulo escrito (o dono é daltônico). Tokens de `globals.css`, primitivos
  `src/components/ui/*`, ícones `lucide-react`. Nada de hex cru.
- **Sem migration** (nenhum arquivo novo em `drizzle/`). Sem índice novo nesta rodada.
- **Nenhum disparo real de WhatsApp**; PII falsa em teste. Nenhum evento novo para a Meta.
- Commit `HUSKY=0`, Conventional Commits PT-BR (imperativo minúsculo, título < 72, sem ponto final).
- **TDD por lane**; teste **pontual** (`pnpm -s vitest run <arquivos>`) + `pnpm -s typecheck`. Nunca a suíte inteira.
- Integração (`*.integration.test.ts`) roda contra o banco do workspace migrado (ver `AGENTS.md`, IP do
  `aja-shared-pg`); falha de ambiente é ambiente, não é "gate verde".
- Worktree de lane é do Orca (`orca worktree create --setup run` / `orca worktree rm`), nunca `git worktree`, nunca `rm -rf`.
- Sem deploy, push, PR ou merge em `develop`/`main`.

## O que NÃO muda (conferido por comando no fim — C11)

1. `src/lib/chat/**` e `src/app/api/chat/**` — nenhuma linha (a gravação da variante é do FIX-403).
2. `src/app/api/admin/performance/telefone-ab/route.ts`, `resultado-do-teste-do-telefone.ts`,
   `src/components/admin/performance/teste-do-telefone*.tsx` — nenhuma linha.
3. `src/lib/admin/sinais-do-funil.ts`: `chaveDaPessoa` e `VISITA_DE_GENTE` intocados; `contagensDoFunil` só ganha parâmetro opcional (sem ele, SQL idêntico).
4. Agora (`agora/route.ts`, `agora-queries.ts`), `dashboard/route.ts`, `dashboard-queries.ts`, Pipeline (`leads/route.ts`).
5. `drizzle/` — nenhum arquivo.
6. Sem filtro, as respostas de toda rota tocada são **idênticas** às de antes (C4).

## Contrato (cravado aqui; B1 implementa, todo mundo consome)

```ts
// src/lib/admin/filtro-variante-opcoes.ts — PURO (sem drizzle), importável no cliente
export const VARIANTE_SEM_VARIANTE = "sem-variante";
export const COOKIE_DA_VARIANTE = "aja_variante";
export type FiltroDeVariante = "A" | "B" | "sem-variante";           // "todas" = null
export const OPCOES_DE_VARIANTE: readonly { valor: FiltroDeVariante | null; rotulo: string }[];
//   [{null,"Todas as variantes"},{"A","Variante A — telefone antes das ofertas"},
//    {"B","Variante B — ofertas embaçadas"},{"sem-variante","Sem variante"}]
export function lerFiltroDeVariante(valor: unknown): FiltroDeVariante | null; // allowlist; A/B via ehVarianteDoTelefone
export function rotuloDoRecorte(f: FiltroDeVariante): string;                   // "Recorte: variante A" / "Recorte: sem variante"

// src/lib/admin/filtro-variante.ts — servidor
export const FILTROS_DE_VARIANTE = ["todas", "A", "B", "sem-variante"] as const;
export function varianteDaRequisicao(req: Request): FiltroDeVariante | null;      // URL > cookie > null
// nível CONVERSA (Conversas, Remarketing, export conversas/toques) — predicado direto no metadata
export function condicaoDeVarianteNaConversa(f: FiltroDeVariante | null, conversa?: SQL /* default conversations */): SQL | null;
export function varianteDaConversaSql(conversa: SQL): SQL;                        // 'A'|'B'|NULL
// nível PESSOA, forma ESCALAR correlacionada (funis: Performance/Porta/Campanhas/Mapa), irmã do chaveDaPessoa
export function varianteDaPessoa(de: Date, ate: Date, colunaVisitor?: SQL /* default v.visitor_id */): SQL; // 'A'|'B'|NULL
export function condicaoDeVarianteDaPessoa(f: FiltroDeVariante | null, de: Date, ate: Date, colunaVisitor?: SQL): SQL | null;
// nível PESSOA, forma CTE (Percurso e export percurso), agrupada pela `chave` já computada
export function cteDaVarianteDaPessoa(de: Date, ate: Date, chave: SQL): SQL;     // variante_da_pessoa(chave, variante)
```

A chave do metadata **não é reescrita**: importar `CHAVE_DO_TESTE_NO_METADATA` de
`src/lib/chat/resultado-do-teste-do-telefone.ts`.

Forma canônica (estudo de 30/09), para a CTE:

```sql
variante_da_pessoa AS (
  SELECT DISTINCT ON (chave) chave, variante
  FROM (
    SELECT ${chave} AS chave,                -- a MESMA expressão já computada no por_visita
           c.metadata -> 'telefoneDoDesbloqueio' ->> 'variante' AS variante, c.created_at, c.id
    FROM conversations c
    JOIN por_visita pv ON pv.id = c.visit_id
    WHERE c.is_simulated = false
      AND c.created_at BETWEEN ${de} AND ${ate}
      AND c.metadata -> 'telefoneDoDesbloqueio' ->> 'variante' IN ('A','B')
  ) s
  ORDER BY chave, created_at DESC, id DESC   -- DESEMPATE obrigatório
)
-- LEFT JOIN variante_da_pessoa vp ON vp.chave = final.chave
-- 'A'/'B' → vp.variante = 'A'/'B'  |  'sem-variante' → vp.variante IS NULL
```

A escalar (`varianteDaPessoa`) é a mesma leitura por linha: conversa **da pessoa** = `vp.visitor_id =
colunaVisitor OR c.contact_id::text = chaveDaPessoa(de, ate, colunaVisitor)` (reusa o dono da identidade;
sem o `OR contato`, o visitante WhatsApp de um contato web cairia em `sem-variante` e a pessoa contaria em
dois baldes), mesmo `WHERE`, `ORDER BY c.created_at DESC, c.id DESC LIMIT 1`. `condicaoDe…` devolve
`= 'A'`/`= 'B'`/`IS NULL`, ou `null` para todas/desconhecido.

**`IN ('A','B')` e não `IS NOT NULL`** (refino do chefe sobre o SQL do estudo): um valor fora da allowlist
no metadata cairia em nenhum dos três baldes e quebraria `A + B + sem = todas`; assim ele é `sem-variante`.
**Não herdar** o defeito da CTE `conversa_recente` (`percurso-queries.ts` ~281: `updated_at DESC` sem
desempate).

Respostas: `PerformanceResponse.custos` e a resposta de Campanhas ganham `custoNaoAplicavelAoRecorte:
boolean` (sempre presente; `false` sem filtro). Toda query tocada ganha **último parâmetro opcional**
`variante?: FiltroDeVariante | null` (default `null`) — as chamadas existentes não mudam.

---

## Ordem das ondas

| Onda | Lanes | Por quê |
|---|---|---|
| 1 | **B1** sozinha | todo o resto consome o contrato |
| 2 | B2a · B2b · B2c · B2d · B2e · B4 · B5 · B3a (paralelo, arquivos disjuntos) | cada uma é um módulo |
| 3 | **B3b** (fiação da UI nas páginas) | consome os tipos de B2a/B2c e o componente de B3a |

Merge na base na ordem: B1 → onda 2 (qualquer ordem, **exceto B2c depois de B2a**, que é dona do `contagensDoFunil`; gate integrado depois de cada merge) → B3b.

### B1 · fundação — `filtro-variante-opcoes.ts` + `filtro-variante.ts`
**Files:** Create `src/lib/admin/filtro-variante-opcoes.ts`, `src/lib/admin/filtro-variante.ts`,
`src/lib/admin/filtro-variante.test.ts`, `src/lib/admin/filtro-variante.integration.test.ts`.
**Interfaces:** Consome `ehVarianteDoTelefone`, `CHAVE_DO_TESTE_NO_METADATA`, `chaveDaPessoa` · Produz o contrato acima.
- [ ] Unit: allowlist (`A`,`B`,`sem-variante` ok; `C`, `a`, `""`, `todas`, lixo ⇒ `null`); `varianteDaRequisicao` URL > cookie > null, cookie com `%` solto não lança; `condicao…(null)` ⇒ `null`; rótulos com acento.
- [ ] Integração (PII falsa), **os seis casos do estudo, nas duas formas (escalar e CTE)**: (1) A em t1 e B em t2 ⇒ **B**; (2) última do período é WhatsApp e a web anterior é B ⇒ **B** (não reseta); (3) variante só fora do período ⇒ `sem-variante`; (4) pessoa sem conversa web no período ⇒ `sem-variante`; (5) empate de `created_at` ⇒ desempate por `c.id DESC`, determinístico; (6) filtro desconhecido ou `todas` ⇒ `null`. Mais: contato com web(A) + WhatsApp ⇒ **o mesmo** balde a partir dos dois visitantes; conversa simulada ignorada; metadata com `"C"` ⇒ `sem-variante` (não lança).
- [ ] Ver falhar → implementar → ver passar → commit `feat(admin): filtro de variante do teste do telefone`.
**Gate:** `pnpm -s vitest run src/lib/admin/filtro-variante.test.ts src/lib/admin/filtro-variante.integration.test.ts && pnpm -s typecheck`

### B2a · Performance (+ handoff)
**Files:** Modify `src/lib/admin/sinais-do-funil.ts` (**só** `contagensDoFunil` ganha parâmetro opcional
de variante, default = SQL idêntico ao de hoje), `src/lib/admin/performance-queries.ts` (computeFunilMidia,
pessoasQuePararam, computePorta, computeQuemChegou, computeOrigens, computeSerie, computeCobertura, computeCustosDoCpc), `src/lib/admin/handoff-queries.ts`
(`computeFunilDeHandoff` — lead ⇒ D7), `src/lib/admin/performance-types.ts`, `src/app/api/admin/performance/route.ts`.
Test: `src/lib/admin/performance-queries.variante.integration.test.ts`.
- [ ] Integração: com dados A/B/WhatsApp, `A + B + sem-variante = todas` em cada degrau do funil e na porta; `variante=null` ⇒ `toEqual` com a chamada sem o parâmetro (C4); `computeCustosDoCpc(…, "A")` ⇒ investimento/CPC/CPL `null` e `custoNaoAplicavelAoRecorte: true`; sem filtro ⇒ `false` e valores iguais aos de hoje.
- [ ] Rota lê `varianteDaRequisicao(request)` logo após o período e repassa a todos os computes.
**Gate:** `pnpm -s vitest run src/lib/admin/performance-queries.variante.integration.test.ts src/lib/admin/performance-queries.integration.test.ts src/lib/admin/handoff-queries.integration.test.ts && pnpm -s typecheck`

### B2b · Percurso
**Files:** Modify `src/lib/admin/percurso-queries.ts` (`baseDoPercurso`: `cteDaVarianteDaPessoa` com a `chave`
já computada, `LEFT JOIN` e o predicado num ponto só), `src/lib/admin/percurso-types.ts` (`FiltroPercurso.variante?`),
`src/app/api/admin/percurso/route.ts`. Test: `src/lib/admin/percurso-queries.variante.integration.test.ts`.
- [ ] Integração: partição fecha (total de pessoas e contagem por passo); `null` ⇒ igual a hoje; filtro `sem-variante` inclui quem só chegou e nunca conversou.
**Gate:** `pnpm -s vitest run src/lib/admin/percurso-queries.variante.integration.test.ts src/lib/admin/percurso-queries.integration.test.ts && pnpm -s typecheck`

### B2c · Campanhas
**Files:** Modify `src/lib/admin/campanhas-queries.ts` (consome o `contagensDoFunil` de B2a — por isso **merge depois de B2a**; `funilPorCampanha`, `criativosPorCampanha`, `computeCampanhas`;
`gastosPorCampanha` **não** recebe variante — D4), tipos da resposta, `src/app/api/admin/campanhas/route.ts`.
Test: `src/lib/admin/campanhas-queries.variante.integration.test.ts`.
- [ ] Integração: partição do funil por campanha fecha; com filtro, gasto/CPC/CPL por campanha `null` + `custoNaoAplicavelAoRecorte: true`; `null` ⇒ igual a hoje.
**Gate:** `pnpm -s vitest run src/lib/admin/campanhas-queries.variante.integration.test.ts src/lib/admin/campanhas-queries.integration.test.ts src/lib/admin/campanhas-queries.test.ts && pnpm -s typecheck`

### B2d · Mapa de calor
**Files:** Modify `src/lib/heatmap/queries.ts` (`recorteVariante` irmão de `recorteDesfecho`, por pessoa via a
visita do evento), `src/app/api/admin/heatmap/route.ts`. Test: `src/lib/heatmap/queries.variante.integration.test.ts`.
- [ ] Integração: pessoas por página A + B + sem = todas; `null` ⇒ igual a hoje.
**Gate:** `pnpm -s vitest run src/lib/heatmap && pnpm -s typecheck`

### B2e · Conversas (lista)
**Files:** Modify `src/app/api/admin/conversations/route.ts` (GET: `condicaoDeVarianteDaConversa` nas
`conditions`, D7). Test: `src/app/api/admin/conversations/route.variante.integration.test.ts` (ou o arquivo de rota existente).
- [ ] Integração: `?variante=A` só conversas A; `sem-variante` inclui WhatsApp; `?variante=C` ⇒ lista inteira (não vazia, não 400).
**Gate:** `pnpm -s vitest run src/app/api/admin/conversations && pnpm -s typecheck`

### B4 · Exportação (coluna + recorte)
**Files:** Modify `src/lib/exportacao/percurso.ts` (coluna `varianteTelefone` via `cteDaVarianteDaPessoa` com
**a mesma** `chave` do `chaveDaPessoa` já usado ali; recorte `variante`), `conversas.ts`
(coluna por conversa via `varianteDaConversaSql`), `toques.ts` (coluna por conversa), `index.ts`
(`OpcoesDeExportacao.variante?`), `textos.ts` (`SEM_VARIANTE_NO_EXPORT`), `src/app/api/admin/exportacao/route.ts`,
`src/app/api/admin/exportacao/[tipo]/route.ts`. Tests: os `*.integration.test.ts` de `src/lib/exportacao` + `route.test.ts`.
- [ ] Integração: pessoa com A depois B ⇒ `varianteTelefone = "B"`; pessoa só WhatsApp ⇒ texto `SEM_VARIANTE_NO_EXPORT`; conversa pré-teste (sem metadata) ⇒ texto, **não** uma variante derivada por hash; `conversas` ⇒ coluna por conversa; com `variante=A` a contagem do cartão = número de linhas do arquivo; `limpeza` sem a coluna.
**Gate:** `pnpm -s vitest run src/lib/exportacao src/app/api/admin/exportacao && pnpm -s typecheck`

### B5 · Remarketing (tela)
**Files:** Modify `src/lib/admin/remarketing-queries.ts` (`FiltroDaRegua.variante?` no `recorte`, por conversa — D7),
`src/app/api/admin/remarketing/route.ts`. Test: `src/lib/admin/remarketing-queries.variante.integration.test.ts`.
- [ ] Integração: linhas A + B + sem = todas; contadores da tela fecham com a lista; `null` ⇒ igual a hoje. **Nenhum envio** — só leitura.
**Gate:** `pnpm -s vitest run src/lib/admin/remarketing-queries.variante.integration.test.ts && pnpm -s typecheck`

### B3a · componente do filtro
**Files:** Create `src/components/admin/dashboard/filtro-de-variante.tsx` + `.test.tsx`. Consome só
`filtro-variante-opcoes.ts`. Padrão do `campanha-filter.tsx`. Escreve URL (`useQueryState("variante")`) **e** cookie de sessão
`aja_variante`; lê o cookie quando a URL não traz; "Todas as variantes" remove os dois. Mostra, quando ≠
todas, o rótulo `rotuloDoRecorte` (texto, não só cor). Select de `src/components/ui/*`.
- [ ] Teste de componente: quatro opções com os rótulos exatos (com acento); escolher A grava URL + cookie sem `max-age`; voltar a todas limpa; valor inválido na URL mostra "Todas as variantes".
**Gate:** `pnpm -s vitest run src/components/admin/dashboard/filtro-de-variante.test.tsx && pnpm -s typecheck`

### B3b · fiação nas páginas (onda 3)
**Files:** Modify as páginas `src/app/admin/(dashboard)/{performance,percurso,campanhas,exportacao,remarketing,mapa-de-calor}/page.tsx`,
`src/components/admin/conversations/conversations-table.tsx`, `src/components/admin/performance/tabela-origens.tsx`
(e demais links para `/admin/conversations`/exportação — D10), e o bloco de custo da Performance e de Campanhas (texto D4).
**Não toca** `teste-do-telefone.tsx` (D5).
- [ ] `FiltroDeVariante` ao lado do `DateRangeFilter` em cada página; `variante` entra no `URLSearchParams` de cada fetch; recorte ativo escrito na tela; bloco de custo mostra a frase de D4 quando `custoNaoAplicavelAoRecorte`.
- [ ] Teste: os testes de componente existentes das áreas tocadas continuam verdes + um teste do bloco de custo com `custoNaoAplicavelAoRecorte: true` mostrando a frase e **sem** R$.
**Gate:** `pnpm -s vitest run src/components/admin src/app/admin && pnpm -s typecheck`

---

## Critérios de pronto (rodados pelo chefe na base `integ/filtro-ab`, saída colada no diário)

| # | Critério | Comando |
|---|---|---|
| C1 | Compila | `pnpm -s typecheck` (sem saída, exit 0) |
| C2 | Contrato da fundação | `pnpm -s vitest run src/lib/admin/filtro-variante.test.ts src/lib/admin/filtro-variante.integration.test.ts` |
| C3 | Partição fecha em toda tela (D2) | `pnpm -s vitest run src/lib/admin/*.variante.integration.test.ts src/lib/heatmap src/app/api/admin/conversations` |
| C4 | Default não muda número (D3) | contidos em C3 (cada teste `.variante` tem o caso `null ≡ sem parâmetro`) + os `*.integration.test.ts` já existentes das áreas tocadas verdes |
| C5 | Regra da última conversa COM variante (D1) e nada de etapa (D1′) | os seis casos do estudo em C2 + `grep -rn "RegraDeAtribuicao\|etapa.*instante" src/lib/admin/filtro-variante*.ts` vazio |
| C6 | Custo não dividido (D4) | casos `custoNaoAplicavelAoRecorte` em C3 + teste do bloco de custo em B3b |
| C7 | Card do teste intocado (D5) | `git diff --stat kairogyn/filtro-ab-painel..integ/filtro-ab -- src/app/api/admin/performance/telefone-ab src/lib/chat/resultado-do-teste-do-telefone.ts src/components/admin/performance/teste-do-telefone.tsx` vazio |
| C8 | Export com coluna, sem hash (D6) | `pnpm -s vitest run src/lib/exportacao src/app/api/admin/exportacao` + `grep -rnE "varianteDaConversaPersistida\|lerVariante\(" src/lib/admin src/lib/exportacao src/lib/heatmap src/app/api/admin src/components/admin` vazio |
| C9 | UI | `pnpm -s vitest run src/components/admin src/app/admin` |
| C10 | Lint dos arquivos tocados | `pnpm -s biome check $(git diff --name-only kairogyn/filtro-ab-painel..integ/filtro-ab -- src)` |
| C11 | O que NÃO muda | `git diff --stat kairogyn/filtro-ab-painel..integ/filtro-ab -- src/lib/chat src/app/api/chat src/app/api/admin/agora src/lib/admin/agora-queries.ts src/app/api/admin/dashboard src/lib/admin/dashboard-queries.ts src/app/api/admin/leads drizzle` vazio |
| C12 | Card do FIX | `docs/correcoes/done/fix-404-filtro-ab-no-painel.md` no padrão (frontmatter + palavras do dono + o que mudou + provado) |

## Riscos

- **Custo de consulta:** `varianteDaPessoaSql` é subconsulta correlacionada por linha de visita, como o
  `chaveDaPessoa`. Só roda quando o filtro ≠ todas (com `null` nenhum SQL novo entra — C4). Se a tela
  filtrada passar de ~2 s no banco do workspace, registrar no diário e resolver com CTE de variante por
  pessoa, **sem** índice/migration nesta rodada.
- **Teste do operador em produção:** o override `?variante=A|B` do FIX-403 grava variante em conversas do
  próprio dono; elas entram no recorte como qualquer outra (o painel já não separa teste do operador —
  memória "teste do operador conta como venda"). Fora do escopo; vai para `PENDENTE-KAIRO`.
- **Ambiente:** integração depende do banco do workspace migrado; `ECONNREFUSED`/coluna inexistente é
  ambiente (`AGENTS.md`), e o gate só vale verde de verdade.
- **Nível etapa descartado** (D1′). Se um dia voltar, exige primeiro guardar o HISTÓRICO da variante
  (hoje o override regrava) — é outro pedido, com migration.
