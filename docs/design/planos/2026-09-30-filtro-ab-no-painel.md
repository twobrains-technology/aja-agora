# Filtro A/B nas telas de monitoramento + o braço na exportação — Plano de implementação

**Goal:** o painel responde *"a etapa que o cliente avançou, ele veio por qual A/B?"* em todas as telas
de monitoramento e no arquivo exportado, sem mudar um único número quando o filtro está em "todas".
**Arquitetura:** genérica por experimento. Um **registro de experimentos** (hoje um: `telefoneDoDesbloqueio`,
braços `A`/`B`) alimenta o filtro, o fragmento SQL, a coluna do export e o seletor da UI. A pessoa é
atribuída ao braço da conversa que a fez **avançar na etapa âncora do experimento** (para o telefone: a
identificação); as etapas seguintes herdam. As rotas leem o recorte logo depois do período e repassam às
queries como parâmetro opcional; ausente = não filtrar. Sem migration.
**Stack:** Next.js (App Router) · React · nuqs · Drizzle/Postgres · Vitest (`happy-dom` para componente).

Card: **FIX-404**. Tudo acontece **nesta worktree** (`kairogyn/filtro-ab-painel`): o gerente roda um
subagente por bloco com `cwd` aqui, sem worktree nova (regra do dono de 30/09). Fontes desta frente:
`docs/decisoes/2026-09-30-padrao-variante-por-etapa-avancada.md` (o padrão, versionado) e
`.orientacao/ESTUDO-REFINO-3-2026-09-30-ancora-na-identificacao.md` (o SQL e os casos). Validação e
histórico das decisões: `.orientacao/diario.md`.

## Contexto (validado em 30/09)

- O braço vive em `conversations.metadata -> 'telefoneDoDesbloqueio' ->> 'variante'`
  (`CHAVE_DO_TESTE_NO_METADATA`), gravado na criação da conversa **web** (`src/app/api/chat/route.ts`).
  WhatsApp e conversa web anterior ao teste não têm. **A** = telefone antes de qualquer oferta; **B** =
  ofertas embaçadas + clique → telefone (FIX-403).
- **Não existe evento com data de "se identificou"** (refino 3, §1). O fato é o predicado do próprio
  funil, `conversaIdentificada` (`src/lib/admin/sinais-do-funil.ts:269`), que as quatro telas já medem.
  A atribuição diz **em qual conversa** a pessoa se identificou, sem precisar de timestamp.
- Já feito nesta worktree: **B1a** (`3450c366`, trazida em `914ed114`): `filtro-variante-opcoes.ts` +
  `filtro-variante.ts` no nível conversa, **amarrados ao telefone** (`?variante=`, `OPCOES_DE_VARIANTE`
  fixo). O bloco B1 abaixo **generaliza** isso. As branches `kairogyn/lane-b2e`/`-b5`/`-b3a` foram feitas
  sobre o contrato antigo: servem só de **referência** (não se integram).
- **Defeito encontrado (refino 3, §6), confirmado no código:** `registrarDesfechoDoTeste`
  (`src/lib/chat/telefone-ab-do-servidor.ts:158-160`), quando falta um braço válido, **deriva o braço por
  hash e o grava** no metadata. O filtro novo leria esse valor inventado como fato → bloco **B6**.
- `/admin` é o Agora (`/api/admin/agora`, ao vivo) e `/api/admin/dashboard` não tem consumidor de UI → ficam fora.

## Decisões (do dono e dos estudos que ele mandou — implementar, não rediscutir)

| # | Decisão |
|---|---|
| D1 | **Âncora na etapa que o teste move.** A pessoa é atribuída ao braço da **primeira conversa web do período, com braço, em que ela se identificou** (`conversaIdentificada`). Não havendo nenhuma, ao braço da **última conversa do período com braço** (exposição; vale para quem nunca se identificou). Não havendo conversa com braço no período, `sem variante`. Prioridade: identificação primeiro, exposição só se falhar. Desempate `id ASC`. |
| D2 | **Etapas depois da âncora herdam** (viu oferta, qualificado, proposta, fechado): a cadeia responde *"do A saíram X identificados, Y viram oferta, Z propostas"*, cada número ⊆ do anterior. Uma linha por pessoa ⇒ `A + B + sem variante = total` em **toda** tela e em **cada** etapa, por construção. |
| D3 | **Canal identificado não recebe braço:** conversa de WhatsApp nasce identificada, não tem metadata e **não é candidata**. Quem veio do web e continuou no WhatsApp mantém o braço da conversa web. WhatsApp não reseta a exposição. |
| D4 | **Genérico por experimento.** O registro diz, por experimento: `id` (= chave no metadata), rótulo, braços e rótulos dos braços, e a **etapa âncora** (telefone: `identificados`). Filtro, fragmento, coluna do export e UI recebem o experimento; nada fora do registro conhece o nome `telefoneDoDesbloqueio`. Teste novo = entrada nova no registro. |
| D5 | **Default = todas.** Sem recorte, nenhum número que a operação lê hoje se move (C4). Com recorte, a tela escreve *"Recorte: Teste do telefone · braço A"* e, nas telas de funil, *"O braço é o da conversa em que a pessoa se identificou; nas etapas seguintes ela segue no mesmo braço."* (texto, não só cor). |
| D6 | **Custo não se filtra.** Com recorte ativo: investimento, CPC, CPL e custo por etapa saem `null` + `custoNaoAplicavelAoRecorte: true`; a tela escreve *"Custo não se divide por braço de teste: o investimento da Meta é do período inteiro."* O funil segue visível. |
| D7 | O **card do teste do telefone** (FIX-401) **não** é cortado: o fetch dele não manda o recorte e a rota `performance/telefone-ab` não o lê (conta por visita, de propósito). |
| D8 | **Export = uma coluna por experimento do registro**, `variante<IdDoExperimento>` (ex.: `varianteTelefoneDoDesbloqueio`): por pessoa em `percurso` (D1), por conversa em `conversas` e `toques` (metadata direto). `limpeza` não. Sem braço ⇒ texto `SEM_BRACO_NO_EXPORT = "sem variante: fora do teste"`, nunca célula vazia. |
| D9 | **Lê SÓ o metadata.** Nenhum fragmento, tela ou export chama função que deriva braço (`varianteDaConversa`, `varianteDaConversaPersistida`, hash) nem `lerVariante` (lança). Allowlist no SQL (`IN (<braços do registro>)`): valor fora dela é `sem variante`, não quebra a partição. |
| D10 | **Nível conversa** (lista de Conversas, Remarketing, handoff por lead, export `conversas`/`toques`): predicado direto no metadata da conversa (o lead usa a sua `conversation_id`). A tela de Conversas diz que ali o braço é **da conversa**; nas telas de funil é **da pessoa**. |
| D11 | Recorte na URL: `ab=<experimento>:<braço>[,<experimento>:<braço>]` (ex.: `?ab=telefoneDoDesbloqueio:A`) + cookie de **sessão** `aja_ab` no mesmo formato; URL > cookie > nenhum. Par fora do registro é ignorado (não filtra: nunca 400, nunca tela vazia). Dois experimentos ⇒ E lógico. O `?variante=` da B1a sai. |
| D12 | Telas: Performance, Percurso, Campanhas, Exportação, Remarketing, Mapa de calor e **Conversas** (destino do drill-down da Performance). Links para `/admin/conversations` e para a Exportação **carregam** `ab`. **Fora:** Agora, `/api/admin/dashboard` (órfã), Pipeline (kanban da mesa). |

### Anti-padrões proibidos
"uma variante por pessoa" como atributo solto (sem âncora na etapa que o teste move) · atribuir pelo
instante do evento (o override de QA regrava) · atribuir por evento, com a pessoa contando duas vezes na
etapa · filtrar custo · chave de experimento fora do registro · segundo caminho SQL para um fato que
`sinais-do-funil.ts` já computa · braço derivado por hash · CTE sem desempate (a `conversa_recente` do
Percurso, ~281, ordena só por `updated_at DESC` — não copiar).

## Como o enxame roda

- **Um subagente por bloco, `cwd` = esta worktree, `isolation: 'none'`.** Nenhuma worktree nova.
- Subagentes simultâneos têm os **arquivos disjuntos** listados em cada bloco; quem precisa de arquivo de
  outro bloco espera a onda dele.
- **Subagente não commita.** O gerente roda o gate do bloco aqui e commita só os arquivos do bloco
  (`git add <arquivos> && HUSKY=0 git commit`). Onda assentada ⇒ `pnpm -s typecheck` + testes das áreas.

## Restrições globais

- Texto visível em **português correto** (acento, cedilha, til). Recorte com rótulo escrito (o dono é daltônico). Tokens de `globals.css`, primitivos `src/components/ui/*`, ícones `lucide-react`.
- **Sem migration** (nada novo em `drizzle/`), sem índice novo nesta rodada.
- **Nenhum disparo real de WhatsApp**; PII falsa em teste. Nenhum evento novo para a Meta.
- Conventional Commits PT-BR (imperativo minúsculo, título < 72, sem ponto final), `HUSKY=0`.
- **TDD por bloco**; teste **pontual** + `pnpm -s typecheck`. Nunca a suíte inteira.
- Integração contra o banco do workspace migrado (`AGENTS.md`); falha de ambiente não é gate verde.
- Sem deploy, push, PR ou merge em `develop`/`main`.

## O que NÃO muda (conferido por comando — C11)

1. `src/lib/chat/**` e `src/app/api/chat/**`, **exceto**: (a) mover `CHAVE_DO_TESTE_NO_METADATA` para
   `variante-da-visita.ts` (puro, sem import) e reexportá-la de `resultado-do-teste-do-telefone.ts` — o
   registro precisa ser importável no cliente; (b) o fix de `registrarDesfechoDoTeste` (B6).
2. `performance/telefone-ab/route.ts`, a lógica de `resultado-do-teste-do-telefone.ts`, `teste-do-telefone*.tsx`.
3. `sinais-do-funil.ts`: `chaveDaPessoa`, `VISITA_DE_GENTE`, `conversaIdentificada`, e o **SQL gerado** por
   `contagensDoFunil(de, ate)` sem recorte (teste de igualdade de string SQL + de resultado).
4. Agora, `dashboard/route.ts`, `dashboard-queries.ts`, Pipeline (`leads/route.ts`). 5. `drizzle/`.
6. Sem recorte, a resposta de toda rota tocada é **idêntica** à de antes (C4).

## Contrato (cravado aqui; B1 implementa, todos consomem)

```ts
// src/lib/experimentos/registro.ts — PURO (sem drizzle), importável no cliente
export type EtapaDoFunil = "visitas" | "conversas" | "com_contato" | "identificados"
  | "qualificados" | "propostas" | "fechados";
export interface Experimento {
  id: string;                           // "telefoneDoDesbloqueio" — a chave no metadata
  rotulo: string;                       // "Teste do telefone"
  bracos: readonly string[];            // ["A","B"] — de VARIANTES_DO_TELEFONE
  rotulosDosBracos: Record<string, string>; // "A — telefone antes das ofertas", "B — ofertas embaçadas"
  etapaAncora: EtapaDoFunil;            // "identificados"
}
export const EXPERIMENTOS: readonly Experimento[];           // hoje: um
export const SEM_BRACO = "sem-variante";
export const COOKIE_DO_RECORTE_AB = "aja_ab";
export const PARAMETRO_DO_RECORTE_AB = "ab";
export type RecorteAB = ReadonlyArray<{ experimento: string; braco: string /* ou SEM_BRACO */ }>; // [] = todas
export function lerRecorteAB(valor: unknown, registro?: readonly Experimento[]): RecorteAB;
export function serializarRecorteAB(r: RecorteAB): string | null;
export function rotuloDoRecorte(r: RecorteAB, registro?: readonly Experimento[]): string | null;

// src/lib/admin/sinais-do-funil.ts — a fonte única do fato ganha a forma "por conversa"
export function fatoDaEtapaNaConversa(etapa: EtapaDoFunil, conversa: SQL): SQL | null;
//   identificados → conversaIdentificada(conversa); demais etapas depois dela → os predicados que já existem;
//   visitas/conversas → null (não há fato de avanço)
export function contagensDoFunil(de: Date, ate: Date, recorte?: RecorteAB): SQL;   // sem recorte: SQL idêntico

// src/lib/admin/filtro-variante.ts — servidor (substitui a API da B1a)
export function recorteDaRequisicao(req: Request): RecorteAB;                       // URL > cookie > []
export function bracoDaConversaSql(exp: Experimento, conversa: SQL): SQL;            // braço | NULL, allowlist
export function condicaoDeBracoNaConversa(r: RecorteAB, conversa?: SQL): SQL | null; // D10
export function bracoDaPessoaSql(exp: Experimento, o: { de: Date; ate: Date; chave: SQL; colunaVisitor?: SQL }): SQL; // escalar
export function condicaoDeBracoDaPessoa(r: RecorteAB, o: /* idem */): SQL | null;   // E entre experimentos
export function cteDoBracoDaPessoa(exp: Experimento, o: { de: Date; ate: Date; chave: SQL; fonte: SQL }): SQL; // CTE
```

**SQL canônico (refino 3, §4), generalizado pelo registro** — `fato` = `fatoDaEtapaNaConversa(exp.etapaAncora, c)`:

```sql
-- CTE (Percurso e export percurso)
braco_da_pessoa AS (
  SELECT DISTINCT ON (chave) chave, braco
  FROM (
    SELECT ${chave} AS chave,
           c.metadata -> ${exp.id} ->> 'variante' AS braco, c.id, c.created_at,
           ${fato} AS avancou
    FROM conversations c
    JOIN ${fonte} pv ON pv.id = c.visit_id              -- a MESMA fonte que já dá a chave (por_visita)
    WHERE c.is_simulated = false
      AND c.created_at BETWEEN ${de} AND ${ate}
      AND c.metadata -> ${exp.id} ->> 'variante' IN (${exp.bracos})
  ) s
  ORDER BY chave, avancou DESC,
           (CASE WHEN avancou     THEN created_at END) ASC,   -- entre as que avançaram: a PRIMEIRA
           (CASE WHEN NOT avancou THEN created_at END) DESC,  -- entre as demais: a ÚLTIMA (exposição)
           id ASC
)
-- LEFT JOIN braco_da_pessoa bp ON bp.chave = final.chave ; braço X → bp.braco = X ; sem variante → IS NULL
```

A **escalar** (funis de Performance/Porta/Origens/Campanhas/Mapa, irmã do `chaveDaPessoa`) é a mesma
ordenação com `LIMIT 1`, correlacionando **pela chave da pessoa**: `c2.contact_id::text = ${chave} OR
vp.visitor_id::text = ${chave}` (só por `visitor_id` abriria não-partição nos casos multi-dispositivo).
No Percurso, o CTE `conv` já calcula `identificou` por conversa (`percurso-queries.ts:153`): basta levar
`created_at` e o braço e resolver por pessoa no `conv_pessoa`, sem CTE extra. O metadata é lido pelo
operador `->` com o id do experimento como **parâmetro** (nunca interpolado como texto).

Respostas: `PerformanceResponse.custos` e a resposta de Campanhas ganham `custoNaoAplicavelAoRecorte:
boolean` (sempre presente). Toda query tocada ganha **último parâmetro opcional** `recorte?: RecorteAB` (default `[]`).

---

## Ondas

| Onda | Blocos (subagentes simultâneos, arquivos disjuntos) |
|---|---|
| 1 | **B1** sozinho · **B6** em paralelo (arquivos de `src/lib/chat` que B1 não toca — ver B6) |
| 2 | B2a · B2b · B2d · B2e · B4 · B5 · B3a (até 4 por vez) |
| 3 | **B2c** (usa o `contagensDoFunil` com recorte e os tipos de B2a) |
| 4 | **B3b** (fiação da UI; consome B2a/B2c e o componente de B3a) |

### B1 · registro + recorte + braço da pessoa (generaliza a B1a)
**Arquivos:** Create `src/lib/experimentos/registro.ts` + `.test.ts`. Modify `src/lib/admin/filtro-variante.ts`,
`src/lib/admin/filtro-variante.test.ts`, `src/lib/admin/sinais-do-funil.ts` (`fatoDaEtapaNaConversa`,
`contagensDoFunil` com `recorte?`), `src/lib/chat/variante-da-visita.ts` + `src/lib/chat/resultado-do-teste-do-telefone.ts`
(só mover/reexportar a constante). Delete `src/lib/admin/filtro-variante-opcoes.ts` (absorvido pelo registro).
Create `src/lib/admin/filtro-variante.integration.test.ts`.
- [ ] Unit: registro com `telefoneDoDesbloqueio`, braços de `VARIANTES_DO_TELEFONE`, âncora `identificados`; `lerRecorteAB` aceita `telefoneDoDesbloqueio:A|B|sem-variante`, recusa `:C`, experimento desconhecido, lixo, vazio (⇒ `[]`); serializar ↔ ler; URL > cookie > `[]`; cookie com `%` solto não lança; rótulos com acento; **experimento fictício passado como `registro`** entra no parse e no rótulo sem tocar em código (prova D4).
- [ ] Integração (PII falsa), os 13 do refino 3, **nas duas formas (escalar e CTE)**: *identificou em A e abriu B depois ⇒ A* · *identificou em A e reidentificou em B ⇒ A* · *nunca identificou com A t1 e B t2 ⇒ B* · *identificou no web B e continuou no WhatsApp ⇒ B* · *última conversa do período é WhatsApp ⇒ B* · *só WhatsApp ⇒ sem variante* · *braço só fora do período ⇒ sem variante* · *sem conversa com braço ⇒ sem variante* · *identificou em conversa pré-teste sem braço ⇒ última exposição* · *empate ⇒ id resolve* · **A + B + sem variante = total de pessoas** · *recorte desconhecido ou todas ⇒ null* · *override de QA regravado ⇒ o valor atual gravado vence*. Mais: *metadata com "C" ⇒ sem variante, não lança* · *contagensDoFunil sem recorte gera o SQL de antes*.
**Gate:** `pnpm -s vitest run src/lib/experimentos src/lib/admin/filtro-variante.test.ts src/lib/admin/filtro-variante.integration.test.ts src/lib/chat/variante-da-visita.test.ts && pnpm -s typecheck`

### B6 · o desfecho do teste não inventa braço (onda 1, em paralelo com B1)
**Arquivos:** Modify `src/lib/chat/telefone-ab-do-servidor.ts` (só `registrarDesfechoDoTeste`); Test:
`src/lib/chat/telefone-ab-do-servidor.test.ts` (ou o `.integration.test.ts` existente da área).
- [ ] TDD: conversa **sem** braço persistido recebe o desfecho (`desbloqueadoEm`/`recusado`) **sem** ganhar `variante` no metadata; conversa com braço válido mantém o braço e grava o patch; `webCookie` e demais chaves intactos. Ver o teste falhar antes do fix.
- [ ] Commit `test+fix(chat): o desfecho do teste não inventa variante por hash`.
**Gate:** `pnpm -s vitest run src/lib/chat/telefone-ab-do-servidor && pnpm -s typecheck`

### B2a · Performance (+ handoff)
**Arquivos:** `src/lib/admin/performance-queries.ts` (computeFunilMidia, pessoasQuePararam, computePorta,
computeQuemChegou, computeOrigens, computeSerie, computeCobertura, computeCustosDoCpc), `src/lib/admin/handoff-queries.ts`
(`computeFunilDeHandoff`, D10 pela conversa do lead), `src/lib/admin/performance-types.ts`, `src/app/api/admin/performance/route.ts`;
Test `src/lib/admin/performance-queries.variante.integration.test.ts`.
- [ ] Integração: fechamento `A + B + sem = total` em cada degrau do funil, das Origens, da Porta; cadeia ⊆ (D2); recorte vazio ⇒ `toEqual` a sem parâmetro (C4); custos com recorte ⇒ `null` + `custoNaoAplicavelAoRecorte: true`; sem recorte ⇒ `false` e valores de hoje.
**Gate:** `pnpm -s vitest run src/lib/admin/performance-queries.variante.integration.test.ts src/lib/admin/performance-queries.integration.test.ts src/lib/admin/handoff-queries.integration.test.ts && pnpm -s typecheck`

### B2b · Percurso
**Arquivos:** `src/lib/admin/percurso-queries.ts` (`baseDoPercurso`: braço resolvido no `conv_pessoa`, como no §4 do refino 3),
`src/lib/admin/percurso-types.ts` (`FiltroPercurso.recorte?`), `src/app/api/admin/percurso/route.ts`; Test `src/lib/admin/percurso-queries.variante.integration.test.ts`.
- [ ] Integração: fechamento no total e em cada profundidade; `sem variante` inclui quem só chegou; recorte vazio ⇒ igual a hoje.
**Gate:** `pnpm -s vitest run src/lib/admin/percurso-queries.variante.integration.test.ts src/lib/admin/percurso-queries.integration.test.ts && pnpm -s typecheck`

### B2c · Campanhas (onda 3)
**Arquivos:** `src/lib/admin/campanhas-queries.ts` (`funilPorCampanha` via `contagensDoFunil(…, recorte)`, `criativosPorCampanha`,
`computeCampanhas`; `gastosPorCampanha` **sem** recorte — D6), tipos, `src/app/api/admin/campanhas/route.ts`; Test `src/lib/admin/campanhas-queries.variante.integration.test.ts`.
- [ ] Integração: fechamento por campanha; com recorte, gasto/CPC/CPL `null` + flag; vazio ⇒ igual a hoje.
**Gate:** `pnpm -s vitest run src/lib/admin/campanhas-queries.variante.integration.test.ts src/lib/admin/campanhas-queries.integration.test.ts src/lib/admin/campanhas-queries.test.ts && pnpm -s typecheck`

### B2d · Mapa de calor
**Arquivos:** `src/lib/heatmap/queries.ts` (`recorteAB` irmão de `recorteDesfecho`, pela pessoa da visita), `src/app/api/admin/heatmap/route.ts`;
Test `src/lib/heatmap/queries.variante.integration.test.ts`.
- [ ] Integração: pessoas por página `A + B + sem = total`; vazio ⇒ igual a hoje.
**Gate:** `pnpm -s vitest run src/lib/heatmap && pnpm -s typecheck`

### B2e · Conversas (lista)
**Arquivos:** `src/app/api/admin/conversations/route.ts` (`condicaoDeBracoNaConversa` nas `conditions`); Test: integração da rota.
Referência: branch `kairogyn/lane-b2e` (contrato antigo — reaproveite o teste, troque a API).
- [ ] `?ab=telefoneDoDesbloqueio:A` só conversas A; `:sem-variante` inclui WhatsApp; `:C` e experimento desconhecido ⇒ lista inteira.
**Gate:** `pnpm -s vitest run src/app/api/admin/conversations && pnpm -s typecheck`

### B4 · Exportação
**Arquivos:** `src/lib/exportacao/percurso.ts` (coluna por experimento via `cteDoBracoDaPessoa`, com a **mesma** `chave` já usada ali; recorte),
`conversas.ts` e `toques.ts` (coluna por conversa), `index.ts` (`OpcoesDeExportacao.recorte?`), `textos.ts` (`SEM_BRACO_NO_EXPORT`),
`src/app/api/admin/exportacao/route.ts`, `src/app/api/admin/exportacao/[tipo]/route.ts`.
- [ ] Integração: identificou em A e abriu B depois ⇒ `varianteTelefoneDoDesbloqueio = "A"`; só WhatsApp ⇒ `SEM_BRACO_NO_EXPORT`; conversa pré-teste sem metadata ⇒ texto, **não** braço por hash; `conversas` por conversa; com recorte, contagem do cartão = linhas do arquivo; `limpeza` sem coluna; experimento fictício no registro ⇒ duas colunas.
**Gate:** `pnpm -s vitest run src/lib/exportacao src/app/api/admin/exportacao && pnpm -s typecheck`

### B5 · Remarketing (tela)
**Arquivos:** `src/lib/admin/remarketing-queries.ts` (`FiltroDaRegua.recorte?` no `recorte`, D10), `src/app/api/admin/remarketing/route.ts`;
Test `src/lib/admin/remarketing-queries.variante.integration.test.ts`. Referência: `kairogyn/lane-b5`.
- [ ] Integração: linhas `A + B + sem = total`; contadores fecham com a lista; vazio ⇒ igual a hoje. **Nenhum envio.**
**Gate:** `pnpm -s vitest run src/lib/admin/remarketing-queries.variante.integration.test.ts && pnpm -s typecheck`

### B3a · componente do filtro (N experimentos)
**Arquivos:** Create `src/components/admin/dashboard/filtro-ab.tsx` + `.test.tsx` (consome só `src/lib/experimentos/registro.ts`).
Referência: `kairogyn/lane-b3a`. Padrão do `campanha-filter.tsx`: estado em `?ab=` (nuqs) **e** cookie de sessão
`aja_ab`; **um seletor por experimento do registro** (Todas · braços · Sem variante); rótulo do recorte escrito quando ativo.
- [ ] Teste: com o registro real, um seletor com "Todas", "A — telefone antes das ofertas", "B — ofertas embaçadas", "Sem variante"; escolher A grava URL + cookie sem `max-age`; "Todas" limpa; par inválido na URL ⇒ "Todas"; com um experimento fictício injetado ⇒ **dois seletores** sem mudar o componente.
**Gate:** `pnpm -s vitest run src/components/admin/dashboard/filtro-ab.test.tsx && pnpm -s typecheck`

### B3b · fiação nas páginas (onda 4)
**Arquivos:** `src/app/admin/(dashboard)/{performance,percurso,campanhas,exportacao,remarketing,mapa-de-calor}/page.tsx`,
`src/components/admin/conversations/conversations-table.tsx`, `src/components/admin/performance/tabela-origens.tsx` (e demais links
para `/admin/conversations`/exportação — D12), bloco de custo da Performance e de Campanhas (D6). **Não toca** `teste-do-telefone.tsx` (D7).
- [ ] `FiltroAB` ao lado do `DateRangeFilter`; `ab` no `URLSearchParams` de cada fetch (exceto o card do teste); frases de D5 e D6.
- [ ] Teste do bloco de custo com a flag: mostra a frase e **nenhum** "R$".
**Gate:** `pnpm -s vitest run src/components/admin src/app/admin && pnpm -s typecheck`

---

## Critérios de pronto (rodados pelo chefe nesta worktree, saída colada no diário)

`BASE=018a205e` (o último commit antes do código desta frente).

| # | Critério | Comando |
|---|---|---|
| C1 | Compila | `pnpm -s typecheck` |
| C2 | Registro, recorte e âncora (os 13 casos) | `pnpm -s vitest run src/lib/experimentos src/lib/admin/filtro-variante.test.ts src/lib/admin/filtro-variante.integration.test.ts` |
| C3 | Fechamento em toda tela (D2) | `pnpm -s vitest run src/lib/admin/*.variante.integration.test.ts src/lib/heatmap src/app/api/admin/conversations` |
| C4 | Default não move número (D5) | casos "vazio ⇒ igual" de C3 + `*.integration.test.ts` existentes das áreas tocadas verdes + caso do SQL idêntico em C2 |
| C5 | Genérico (D4) | casos do experimento fictício (B1, B3a, B4) verdes + `grep -rn "telefoneDoDesbloqueio" src/lib/admin src/lib/exportacao src/lib/heatmap src/app/api/admin src/components/admin src/app/admin` vazio |
| C6 | Custo não dividido (D6) | casos `custoNaoAplicavelAoRecorte` em C3 + teste do bloco de custo |
| C7 | Card do teste intocado (D7) | `git diff --stat $BASE..HEAD -- src/app/api/admin/performance/telefone-ab src/components/admin/performance/teste-do-telefone.tsx` vazio |
| C8 | Nada deriva braço (D9) | `pnpm -s vitest run src/lib/exportacao src/lib/chat/telefone-ab-do-servidor` + `grep -rnE "varianteDaConversaPersistida\|varianteDaConversa\(\|lerVariante\(" src/lib/admin src/lib/exportacao src/lib/heatmap src/app/api/admin src/components/admin` vazio |
| C9 | UI | `pnpm -s vitest run src/components/admin src/app/admin` |
| C10 | Lint | `pnpm -s biome check $(git diff --name-only --diff-filter=AM $BASE..HEAD -- src)` |
| C11 | O que NÃO muda | `git diff $BASE..HEAD -- src/lib/chat src/app/api/chat` só mostra a constante movida e o B6; `git diff --stat $BASE..HEAD -- src/app/api/admin/agora src/lib/admin/agora-queries.ts src/app/api/admin/dashboard src/lib/admin/dashboard-queries.ts src/app/api/admin/leads drizzle` vazio |
| C12 | Card do FIX | `docs/correcoes/done/fix-404-filtro-ab-no-painel.md` no padrão do fix-403 |
| C13 | Sem worktree aninhada | `orca worktree list` sem `aja-agora/lane-*` nem `integ-*` |

## Riscos

- **Custo de consulta:** a escalar é correlacionada por linha e só entra com recorte ativo (sem recorte,
  zero SQL novo — C4). Tela filtrada acima de ~2 s no banco do workspace ⇒ registrar e trocar pela CTE,
  **sem** índice/migration nesta rodada.
- **Override de QA regrava o braço** (FIX-403): vale o valor atual gravado (caso 13). Conversas em que o
  dono forçou `?variante=` entram com o braço forçado. É `PENDENTE-KAIRO`, junto com "teste do operador
  conta como venda".
- **Divergência entre as fontes do dono, registrada:** o doc versionado (§A regra, item 1) diz "variante
  por etapa, a da conversa em que avançou **para aquela etapa**". O refino 3, mais recente e com o qual o
  dono liberou o B1, diz que as etapas depois da identificação **herdam**. Seguimos o refino 3 (D2) e o
  doc precisa de uma linha do dono alinhando o texto. `PENDENTE-KAIRO`.
- **Ambiente:** integração depende do banco do workspace migrado (`aja_agora_ws_develop`, via ponte
  `aja-pg-forward`); `ECONNREFUSED`/coluna inexistente é ambiente.
