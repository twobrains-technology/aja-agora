Você é o executor do bloco **bloco-r2-valor-compliance** (rodada 2 do loop de qualidade) no worktree isolado deste branch (`fix/r2-valor-compliance-consorcio`). Corrige os gaps de VALOR/MOTOR, COMPLIANCE e higiene achados por um verificador independente (Fable) na jornada de consórcio.

1. Leia, nesta ordem:
   - `docs/correcoes/rodada2-fable/veredito-fable-r1.md` — o VEREDITO (3/10) com arquivo:linha, esperado×atual. É a sua spec.
   - `docs/correcoes/todo/bloco-r2-valor-compliance/` — `_bloco.md` (inclui a DECISÃO do Kairo sobre a carta 211k) + os 6 cards `fix-240..245`.
   - Spec do handoff: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/docs/{03-regras-calculo,05-compliance-e-dados}.md`.

2. DESIGN: gaps objetivos (veredito com arquivo:linha). A decisão de produto da carta 211k JÁ foi tomada pelo Kairo (clamp + aviso — ver `_bloco.md`/FIX-240). NÃO rebrainstorme. Dúvida de UX real não coberta → `AskUserQuestion` (recomendada 1º); sem resposta, siga a recomendada e registre em `docs/decisoes/blocos/2026-07-10-r2-valor-compliance.md`.

3. Execute NA ORDEM: FIX-240 (carta 211k — clamp+aviso) → FIX-241 (âncora de dinheiro) → FIX-243 (compliance da fala) → FIX-242 (arredondamento parcela) → FIX-244 (contract-submit guard) → FIX-245 (higiene). **TDD strict**: teste que falha antes, corrige, passa.

4. INVARIANTES:
   - Invariante financeiro/compliance em CÓDIGO, não regra-no-prompt (o guard da carta 211k e o clamp são código).
   - NUNCA arredondar valor monetário (CDC art. 30) — parcela sempre com centavos.
   - `taxaContemplacao` NUNCA na fala nem no payload; sinal de contemplação = contagem real (contemplados/mês).
   - Preservar o modelo AMORTIZA (FIX-221) e a curva power (FIX-225) — só corrigir o comentário stale, não a lógica.
   - Português correto em toda copy.

5. 1 commit Conventional (PT-BR) por item. Ao concluir cada, MOVA o `fix-NN` pra `docs/correcoes/done/` com status/commit/executado_em.

6. Ao terminar: **push da branch** + `.done/2026-07-10-r2-valor-compliance.md`. **NÃO abra PR/merge/deploy.** `pnpm test:unit` (+ `test:integration` se subir DB) VERDE antes do push.

7. RESUMO FINAL: decisões + o que mudou em cada gap (com evidência de teste).
