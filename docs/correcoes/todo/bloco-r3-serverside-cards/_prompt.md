Você é o executor do bloco **bloco-r3-serverside-cards** (rodada 3 do loop de qualidade) no worktree isolado deste branch (`fix/r3-serverside-cards-consorcio`). Fecha os gaps que sobraram na jornada de consórcio após a rodada 2 (verificador Fable deu 4/10).

1. Leia, nesta ordem:
   - `docs/correcoes/rodada2-fable/veredito-fable-r2.md` — o VEREDITO r2 (4/10) com evidência ao vivo. É a spec.
   - `docs/correcoes/todo/bloco-r3-serverside-cards/` — `_bloco.md` (a CAUSA-RAIZ) + os 5 cards `fix-246..250`.
   - Contexto: `docs/correcoes/rodada2-fable/veredito-fable-r1.md` (o que já foi corrigido).

2. CAUSA-RAIZ (leia com atenção — é o coração deste bloco): os cards `two_paths`/`embedded_bid`/`scarcity` e o aviso de carta NÃO funcionam porque dependem de o LLM OBEDECER um directive ou de um campo sobreviver a um destructuring — invariante crítico ficou no PROMPT, não em CÓDIGO. Isso viola a Lei 1 (LLM não dirige o fluxo) e a Lei 4 (invariante crítico vira código). Leia `~/.claude/reference/arquitetura-agentes-ia.md` se disponível. A SOLUÇÃO é EMISSÃO SERVER-SIDE DETERMINÍSTICA: o handler monta o payload coagido (igual `runner.ts`) e faz `writer.write({type:"data-artifact", data:{type, payload}})` direto — NÃO manda o LLM chamar `present_X`.

3. Execute NA ORDEM: FIX-246 (cards server-side — o item-título) → FIX-247 (fio rawCreditValue, TESTE DE INTEGRAÇÃO não só folha) → FIX-248 (splitter dígito) → FIX-249 (recovery alucinação) → FIX-250 (polish). **TDD strict**.

4. INVARIANTES:
   - Card crítico = emissão server-side determinística, nunca "peça pro LLM chamar a tool".
   - Campo crítico (rawCreditValue) fiado ponta-a-ponta + testado na INTEGRAÇÃO.
   - Português correto (zero inglês solto). Nunca prometer canal proativo que a web não tem.
   - NÃO quebrar os FIX existentes (r1+r2). test:unit + test:integration verdes.

5. 1 commit Conventional (PT-BR) por item; MOVA cada `fix-NN` pra `done/` com status/commit/executado_em.

6. Ao terminar: **push da branch** + `.done/2026-07-10-r3-serverside-cards.md`. **NÃO abra PR/merge/deploy.** `pnpm test:unit` + `RUN_DB_TESTS=1 pnpm test:integration` VERDES antes do push (suba a app via `~/.claude/skills/local-dev` pra validar E2E que os cards EMITEM).

7. RESUMO FINAL: quais cards agora emitem determinístico (evidência) + decisões.
