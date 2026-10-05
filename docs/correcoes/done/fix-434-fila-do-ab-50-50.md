---
id: FIX-434
titulo: "A/B com fila 50/50, braço gravado em toda entrada e ?variante= fora do teste"
status: done
bloco: fila-do-ab-e-braco-em-toda-entrada
commit: ff801771
arquivos:
  - src/lib/experimentos/fila.ts
  - src/lib/experimentos/fila.integration.test.ts
  - src/lib/chat/variante-da-visita.ts
  - src/lib/chat/variante-da-visita.test.ts
  - src/app/api/chat/route.ts
  - src/lib/chat/telefone-ab-do-servidor.ts
  - src/lib/chat/resultado-do-teste-do-telefone.ts
  - src/lib/admin/filtro-variante.ts
  - src/db/schema.ts
  - drizzle/0062_crazy_king_cobra.sql
  - drizzle/meta/0062_snapshot.json
  - drizzle/meta/_journal.json
rodada: 2026-10-02
executado_em: 2026-10-02
---
## Palavras do operador
> "garantir que esse teste AB não funcione só pelo link ali. Ele tem que funcionar rodando também pela entrada normal. [...] toda vez que eu entrar, eu vejo uma, depois eu entro de novo e vejo outra." (Kairo, 11:58:08)
> "você precisa garantir que de fato seja randômico... tem que ser justo. As duas têm que aparecer para a mesma quantidade de pessoas." (Bruna/Kairo, 12:01:04)

## O que estava no ar (medido)
A atribuição era `FNV-1a(visitId) % 2` — moeda honesta, **sem fila**: o mesmo navegador caiu 4 vezes na
mesma ponta. E **4 de 25 conversas web pós-FIX-403 estavam sem braço** (`1758757e`, `d108a748`, `cc4f3bac`,
`9b30b5ac`). A causa medida é o **próprio `route.ts`** no ramo de clique de categoria/nav: para conversa
recém-criada o `meta` era `{}` (o registro do banco é lido antes do insert) e `persistMeta({ ...meta,
navigationStack })` apagava braço **e** `webCookie` de uma vez. O `?variante=` forçado gravava como braço
real, sem marca, e entrava no resultado.

## O que mudou
1. **Fila atômica no Postgres** (`src/lib/experimentos/fila.ts`): `INSERT … ON CONFLICT DO UPDATE SET proximo
   = proximo + 1 RETURNING` → alternância estrita A, B, A, B, sem perder incremento sob concorrência. Tabela
   `experimento_fila` (`experimento` text pk, `proximo` bigint) na migration `0062`.
2. **A fila é a fonte do 50/50**; o hash virou o último recurso (conversa legada). Precedência em
   `varianteDaConversa`: `forcar > daFila > hash`.
3. **Toda entrada web nasce com o braço** e nenhum writer posterior apaga: `metadataDeConversaWebNova` grava
   o braço no nascimento (inclusive o clique de categoria) com o metadata REAL da conversa.
4. **`?variante=` continua forçando**, **não consome a fila**, grava `forcada: true` e fica **fora do teste**:
   `resultado-do-teste-do-telefone.ts` e `filtro-variante.ts` tratam a conversa como "sem variante".
   Conversa já com braço mantém o braço; o override numa conversa existente preserva `desbloqueadoEm`/`recusado`.

## Provado
- Teste de integração `fila.integration.test.ts`: 2N conversas novas **em paralelo** ⇒ `|A − B| ≤ 1`; em
  série alternam A, B, A, B; `?variante=A` grava `forcada:true` sem consumir a fila; reprodução do
  `1758757e` (clique de categoria não apaga braço nem `webCookie`); forçada fora do resultado e em "sem
  variante" no filtro.
- `pnpm -s vitest run src/lib/experimentos src/lib/chat/variante-da-visita.test.ts src/lib/chat/telefone-ab-do-servidor src/lib/chat/resultado-do-teste-do-telefone src/lib/admin/filtro-variante`
  → **8 arquivos / 77 testes verdes**; `typecheck` exit 0.
- Migration `0062` (`experimento_fila`) aplicada no banco do workspace e conferida por `psql`.

## Nota de execução
O primeiro `pnpm db:migrate` rodou sem `DATABASE_URL` explícito e o drizzle-kit leu `.env` (banco
`aja_agora_ws_langgraph_runtime`) em vez de `.env.local` (o do workspace). A tabela foi criada nos dois
bancos **locais**; sem efeito em produção.