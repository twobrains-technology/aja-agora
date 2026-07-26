---
bloco: bloco-g-remove-servicos
branch: fix/remove-servicos-categoria
campanha: .processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md (ITEM 1)
itens: [FIX-363]
executado_em: 2026-07-22
commits:
  - f2304cb6 (mapeamento Bevi servicos/outros-bens → auto)
  - 25fdd45c (migration: remove persona e CHECK constraint)
  - e3d1c4df (turn-analyzer TDD + remoção mecânica de servicos em ~30 arquivos)
  - 649b7540 (docs: fix-363 movido para done/)
---

# Bloco G — Remover a modalidade "Serviços" de todas as camadas

## Resumo

A modalidade "Serviços" foi extinta de **todas** as camadas do domínio: banco de
produção (persona "Camila" + CHECK constraint), tipos/enums TypeScript (~30 arquivos),
detecção em texto livre (turn-analyzer), regex de fallback (routing.ts), configs de
qualificação (qualify-config, plan-estimate, recommendation, pmt), UI (web + admin) e
formatter do WhatsApp. Só restam **Imóvel, Auto, Moto**.

`pnpm typecheck` limpo. Testes dos arquivos tocados rodados (não a suíte inteira, por
instrução) — todos verdes (~270 testes entre offer-mapper, turn-analyzer, plan-estimate,
reactivation, chat components, whatsapp formatter/interactive-handlers, validations).

## Sequência executada

1. **`beviSegmentToCategory` (offer-mapper.ts)** — TDD strict. Os segmentos reais da
   Bevi `SERVICOS` e `OUTROS BENS` mapeavam pra `servicos`; agora mapeiam pra `auto` e
   o mapeamento **nunca mais dá `throw`** em segmento conhecido — protege a descoberta
   de grupos em runtime caso a Bevi retorne esses segmentos.
2. **Migration `drizzle/0035_remove_servicos_category.sql`** — `DELETE FROM personas
   WHERE id = 'servicos'` (persona "Camila") **antes** de apertar o CHECK constraint
   `personas_category_check` pra não aceitar mais `servicos` (ordem importa — testado
   mentalmente contra violação de constraint em linha existente).
3. **Remoção do tipo** — `Category` (`personas.ts`) e `ConsorcioCategory`
   (`adapters/types.ts`) perderam o literal `"servicos"`. Deixei o `pnpm typecheck`
   guiar ~30 arquivos até sair limpo: categories.ts, qualify-config.ts,
   recommendation.ts, plan-estimate.ts, pmt.ts, reactivation.ts, proposal/store.ts,
   gate-questions.ts, personas-repo.ts, tools/schemas.ts, tools/ai-sdk.ts, chat/types.ts,
   ui-message.ts, diagnose/types.ts, validations/persona.ts, whatsapp/formatter.ts, e os
   componentes React (group-card, proposal-doc, recommendation-card, welcome-categories,
   chat-message, message-list, e os 5 arquivos de admin/personas e admin/conversations).
4. **`turn-analyzer.ts`** — TDD strict. O `turnAnalysisSchema` (zod) é o único portão
   entre a saída do LLM e o domínio: removido `"servicos"` do enum `detectedCategory`.
   Mesmo que o modelo tente classificar "reforma"/"viagem" como categoria, o
   `generateObject` rejeita — não existe branch de categoria pra isso, porque o literal
   não existe mais no schema.
5. **`routing.ts` e `assistant-tools.ts`** — removida a regex de fallback que
   classificava "reforma/viagem/formatura/cirurgia/..." como `servicos`, e a entrada
   `servicos` do mapa de termos proibidos entre categorias.

## Decisões técnicas tomadas durante a implementação

- **`beviSegmentToCategory` vive em `offer-mapper.ts`, não em `partner-offer-mapper.ts`**
  como o fix-363 apontava — `partner-offer-mapper.ts` só importa a função. Corrigi no
  arquivo certo; o `partner-offer-mapper.test.ts` também tinha uma asserção que esperava
  `servicos` e precisou ser atualizada.
- **`CATEGORY_TO_SEGMENT` (offer-mapper.ts)** — o fix-363 não citava este mapa (categoria
  → segmento Bevi, direção oposta), mas ele tinha `servicos: "SERVICOS"` e quebraria o
  `Record<ConsorcioCategory, string>` assim que o tipo perdesse o literal. Removido.
- **CSS tokens `--cat-servicos*`** — não removi as variáveis CSS (fora do escopo de
  arquivos `.ts`/`.tsx`; são definidas em algum arquivo de tema/globals.css que não foi
  tocado). As referências a elas no TSX foram todas removidas, então os tokens ficam
  órfãos mas inofensivos — não deletei porque não confirmei se alguma outra área do
  admin ainda os usa e o fix-363 não pediu limpeza de CSS.
- **Fallback de `GroupCard`** — `CATEGORY_STYLES[payload.category] ?? CATEGORY_STYLES.servicos`
  virou `?? CATEGORY_STYLES.auto` (mesma lógica de "categoria genérica mais próxima"
  usada no mapeamento Bevi).
- **Gaps pré-existentes que NÃO mexi** (fora de escopo, não introduzidos por mim):
  alguns `Record<string, string>` de label cosmético em componentes admin (ex.:
  `personas-table.tsx`, `conversations-table.tsx`, `persona-create-form.tsx`) já não
  tinham entrada para `"moto"` antes desta mudança — só removi `servicos` e não
  adicionei `moto` para não fazer uma correção de bug não pedida (decisão de produto
  "sem decisão de design nova aqui"). O comportamento observável não piora: cai no
  fallback `?? p.category`, que já era o comportamento pra moto antes do meu fix.
- **`eval/signals.ts` (`REQUIRED_BY_CATEGORY`)** — mesma lógica: tinha `imovel`/`auto`/
  `servicos` (sem `moto`). Removi só `servicos`; não adicionei `moto` porque isso
  mudaria o comportamento de scoring de qualidade de conversas de moto (`qualifyCoverage`),
  o que é uma decisão de produto fora do escopo deste fix.
- **Comentários históricos preservados** — `artifact-guard.ts`, `sanitizer.ts`,
  `runner.ts`, `whatsapp/adapter.ts` têm comentários citando nomes de cassette de teste
  antigos (`servicos-web t15`, `servicos-whatsapp t6`) que documentam a origem de uma
  regra de código. Não são "categoria servicos" viva — são rastreabilidade de qual
  rodada de teste revelou o bug. Deixei como estão.
- **`system-prompt.ts`** — o prompt do agente falava "vale pras 4 specialists
  (auto/imovel/moto/servicos)" em duas linhas de instrução crítica sobre não pular
  gates. Atualizado pra "3 specialists" — texto que o modelo lê, relevante mesmo não
  estando no `escopo_arquivos` do `_bloco.md`.
- **Commits granulares saíram diferente do planejado**: pretendia 1 commit por
  sub-passo (c, d, e separados), mas um `git add -A -- <paths>` no meio do processo
  escopou TUDO que estava no working tree (não só os paths passados), então os passos
  c/d/e da instrução acabaram no mesmo commit `e3d1c4df` junto com o turn-analyzer.
  O resultado funcional é idêntico (testes verdes, typecheck limpo); só a granularidade
  do histórico ficou menor que o pedido.

## Testes

- **Novo**: `src/lib/agent/turn-analyzer.test.ts` — prova que `turnAnalysisSchema`
  rejeita `"servicos"` como `detectedCategory` e aceita as 3 categorias válidas.
- **Atualizado**: `offer-mapper.test.ts` e `partner-offer-mapper.test.ts` — segmentos
  `SERVICOS`/`OUTROS BENS` agora esperam `"auto"`, não `"servicos"`/throw.
  `plan-estimate.test.ts` e `reactivation.test.ts` — trocaram a categoria de teste de
  `servicos` pra `imovel` (mesma cobertura de comportamento, categoria válida).
- Todos os testes dos ~40 arquivos tocados rodados isoladamente (não a suíte inteira,
  por instrução do modo de urgência) — verdes.
- `pnpm typecheck` limpo — critério de aceitação mecânico do fix-363.

## Gaps honestos

- Não rodei a migration `0035_remove_servicos_category.sql` contra um banco real
  (proibido por regra global — migration só via ambiente/entrypoint, nunca na mão).
  A sintaxe SQL foi gerada por `drizzle-kit generate` e só o `DELETE` foi inserido
  manualmente, mas não há verificação de execução real nesta sessão.
- Não deletei as variáveis CSS `--cat-servicos*` (tema) — só as referências TypeScript.
- Não toquei nos arquivos de `.processo/loop/**/evidencias/**/servicos-*.md` nem nos
  cards do `docs/correcoes/inbox/2026-07-02-servicos-*.md` — são histórico de campanhas
  passadas, fora do escopo de "erradicar a categoria do código".
