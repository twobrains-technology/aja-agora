Você é o executor do bloco **bloco-r2-funil-cards** (rodada 2 do loop de qualidade) no worktree isolado deste branch (`fix/r2-funil-cards-consorcio`). Corrige os gaps de FUNIL achados por um verificador independente (Fable) na jornada do agente de vendas de consórcio.

1. Leia, nesta ordem:
   - `docs/correcoes/rodada2-fable/veredito-fable-r1.md` — o VEREDITO (nota 3/10) com arquivo:linha, esperado×atual pra CADA gap. É a sua spec.
   - `docs/correcoes/todo/bloco-r2-funil-cards/` — `_bloco.md` + os 4 cards `fix-236..239` (cada um aponta o gap do veredito).
   - A spec do handoff: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/docs/{01-gates-e-ordem,02-cards-novos,04-copy-fluxos}.md`.

2. DESIGN: os gaps são objetivos (o veredito dá arquivo:linha). NÃO rebrainstorme. Se um fix exigir decisão de UX real não coberta, use `AskUserQuestion` (recomendada 1º); sem resposta, siga a recomendada e registre em `docs/decisoes/blocos/2026-07-10-r2-funil-cards.md`.

3. Execute NA ORDEM: FIX-236 (3ª saída — completar; chip+handler JÁ estão na base, falta o gate `lance` não ser pulado) → FIX-237 (embedded_bid + scarcity directives, modelo `buildSimulatorDialDirective`) → FIX-238 (desire engolido) → FIX-239 (decision prematuro). **TDD strict** — o funil TEM testes de ordem (`qualify-state.*.test.ts`): teste que falha antes, corrige, passa.

4. INVARIANTES:
   - Cada card DEVE aparecer no artifact stream de verdade (valide via condução E2E por API — veja o padrão em como o handoff foi verificado; a app da base sobe via `~/.claude/skills/local-dev`). Não basta a tool existir.
   - NÃO quebrar os FIX existentes do funil (muitos invariantes — leia os comentários FIX-NN antes de mexer).
   - Português correto em toda copy. Cadência 1 balão = 1 ideia; NUNCA repetir bolha idêntica (o Fable viu 3× seguidas — é o bug a matar).
   - Invariante de fluxo em CÓDIGO, não regra-no-prompt.

5. 1 commit Conventional (PT-BR) por item. Ao concluir cada, MOVA o `fix-NN` pra `docs/correcoes/done/` com status/commit/executado_em.

6. Ao terminar: **push da branch** + `.done/2026-07-10-r2-funil-cards.md`. **NÃO abra PR/merge/deploy.** Rode `pnpm test:unit` (e `test:integration` se subir DB) VERDE antes do push.

7. RESUMO FINAL: decisões tomadas + quais cards aparecem agora na jornada (evidência E2E).
