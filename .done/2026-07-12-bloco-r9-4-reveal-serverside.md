# Bloco r9-4 reveal-serverside — FIX-290

## Resumo

Item único, P0 sistêmico, achado do veredito r9pos3 (Sonnet 5, §3): o pareamento
`present_recommendation_card` × `present_comparison_table` ("REGRA DURA... INSEPARÁVEIS",
`directives.ts:348`) era só regra-no-prompt — sem nenhum invariante em código que forçasse a 2ª
tool-call quando a 1ª saía. Resultado real observado (dossiê `probe-i2-justificativa`, turno 7):
o modelo chamava `search_groups` → `recommend_groups` → `present_recommendation_card` e parava —
`comparison_table`, `gate:experience` e `whatsapp_optin` nunca saíam na conversa inteira.

Root cause já vinha 100% investigado no card (nenhum caminho do código, feliz ou de recuperação,
emitia `comparison_table` sem depender do modelo decidir chamar a tool — nem sequer o caminho de
recuperação do FIX-286, que só materializa o hero).

## Decisão de design

Sem decisão real levada ao `AskUserQuestion` — segui a alternativa "mais forte (preferível)" que
o próprio card já indicava na tabela "Correção proposta": forçar a emissão no FIM do loop de
stream do `runner.ts` (não no `index.ts`/FIX-286), reaproveitando os mesmos grupos indexados no
turno (`revealGroupsById`). A investigação do código (root cause já provado no card + leitura de
`runner.ts`/`recommendation-payload.ts`) confirmou que essa era a opção correta sem ambiguidade de
produto/UX a resolver — é o mesmo padrão já usado pelo hero no caminho feliz (`coerceRecommendationPayload`
no fim do stream, linha ~693) e pelo `pickBestRankedGroup`/`buildRecommendationCardFromRevealGroup`
do FIX-286 na via de recuperação. Não achei um 3º caminho melhor nem motivo pra divergir do card.

## Implementação

- `recommendation-payload.ts` — dois exports novos:
  - `usableRevealGroupCount(index)`: quantos grupos REAIS (passam `isUsableGroup`) estão
    indexados no turno — decide o ramo "2+ grupos" (força a tabela) vs "1 grupo único" (nunca
    força, regra já documentada do reveal).
  - `buildComparisonTableFromRevealGroups(index, logos, knownCreditValues)`: materializa o
    `comparison_table` inteiro a partir dos grupos já indexados, sem depender de um `input` de
    tool-call que nunca existiu — monta um `input.groups` mínimo (`id`/`administradora`/`category`)
    e reaproveita `coerceComparisonPayload` (mesma coerção server-side do caminho feliz, FIX-191).
- `runner.ts` — novo bloco logo após a consolidação de `group_card`s (linha ~908, antes da
  persistência no DB): se o turno emitiu `recommendation_card`, NÃO emitiu `comparison_table`, e
  há 2+ grupos reais indexados, materializa e `yield`a o artifact `comparison_table` ali mesmo —
  mesmo `messageId`/persistência do resto do turno, mesmo padrão do FIX-286 pro hero.

## Testes

**TDD strict, confirmado RED→GREEN:**

- Novo `runner.fix-290-comparison-forced.integration.test.ts` — mocka o fullStream exato do
  cenário real (`search_groups` + `recommend_groups` com 2 grupos reais + `present_recommendation_card`
  e PARA). RED confirmado via `git stash` do código de produção (`comparison` ficava `undefined`);
  GREEN depois do fix.
- 3 cenários cobertos (regressão exigida pelo card):
  1. 2+ grupos, modelo chama só o hero → `comparison_table` forçado, com os grupos REAIS coagidos
     (números batem com o grupo indexado, não com o que a LLM teria digitado) e persistido no DB.
  2. Caso de borda — 1 grupo único → `comparison_table` NUNCA é forçado.
  3. Caminho feliz — modelo chama as duas tools normalmente → idempotente, sem duplicar (exatamente
     1 evento de artifact `comparison_table`).
- `pnpm test:unit` (container transitório do workspace, DB migrado via `drizzle-kit migrate`,
  `.env.local` copiado do clone principal): **359/359 arquivos, 3321/3321 testes verdes** — sem
  regressão introduzida (baseline antes do fix já era 359/3321 verde).
- `pnpm test:integration` rodado também: 2 falhas pré-existentes, **confirmadas via `git stash`
  como já vermelhas ANTES deste fix** (não relacionadas ao FIX-290):
  - `builder.lead-capture.test.ts` (CA-05, `present_whatsapp_optin` inesperado no toolset do
    specialist) — dívida de outro bloco/onda, arquivo `builder.ts` não tocado por mim.
  - `runner.contract-guard.integration.test.ts` (FIX-12, gate `identify` não dispara pré-reveal)
    — mesma situação, não relacionado ao diff deste bloco.
- Typecheck: nenhum erro novo introduzido nos arquivos tocados (`recommendation-payload.ts`,
  `runner.ts`) — o único erro de `tsc --noEmit` que sobra (`tool-input-error` fora do union de
  `part.type`, linha 483) é dívida pré-existente fora do meu diff, já fora do gate de merge deste
  projeto (`pnpm test:unit`, não typecheck whole-repo).
- `biome check --write` aplicado aos arquivos tocados (só reformatação, sem findings de lint).

## Overlaps do bloco (resolvidos, mecânicos)

Conforme `_bloco.md`: este bloco mergeia PRIMEIRO nos dois arquivos compartilhados
(`recommendation-payload.ts` × bloco-r9-4-valor-honestidade; `ai-sdk.ts` × bloco-r9-4-bevi-degradacao)
— na prática **não toquei em `ai-sdk.ts`** (a correção ficou inteira em `recommendation-payload.ts`
+ `runner.ts`, sem precisar mexer nas definições das tools `present_comparison_table`/
`present_recommendation_card`), então o overlap declarado com `bloco-r9-4-bevi-degradacao` some
por completo — nada pra o outro bloco reconciliar ali. O overlap com `bloco-r9-4-valor-honestidade`
em `recommendation-payload.ts` segue válido (toquei só em `coerceComparisonPayload`/novo código
abaixo dele, ~236-280; o outro bloco mexe em `coerceRevealCota`, ~82-148 — regiões diferentes).

## Gaps honestos

- **`comparison_table` forçado só no caminho FELIZ do stream, não na via de recuperação
  (FIX-286/`index.ts`).** Se o guard de tool-error/cap interromper o turno DEPOIS de
  `recommend_groups` já ter retornado 2+ grupos (cenário do FIX-286), a via de recuperação em
  `index.ts` materializa só o `recommendation_card` — o `comparison_table` continua sem sair
  nesse cenário específico (diferente do cenário do card, que é o modelo simplesmente PARAR sem
  erro nenhum). Não investiguei se esse gap é real em produção nem se está no escopo do FIX-290
  (o card cita só o caminho feliz do dossiê); registrado aqui como candidato a novo achado se o
  próximo loop de QA reproduzir o mesmo sintoma na via de recuperação.
- `gate:experience`/`whatsapp_optin` sumirem no mesmo turno era citado no card como "sintoma
  colateral, não investigado a fundo" — não investiguei essa cadeia aqui (fora do escopo declarado
  do root cause do FIX-290); se ainda faltarem depois deste fix, é matéria de outro achado.
