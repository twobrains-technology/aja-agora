Você é o executor do bloco **bloco-r4-ancora** (rodada 4 do loop de qualidade) no worktree isolado deste branch (`fix/r4-ancora-fechamento`). Corrige o P0 do fechamento achado pelo verificador independente Fable (nota FINAL 4/10) na jornada de consórcio.

1. Leia: `docs/correcoes/rodada2-fable/veredito-fable-final.md` (§N-A é o P0 — arquivo:linha, sequência reproduzível) + `docs/correcoes/todo/bloco-r4-ancora/` (_bloco.md + fix-251/252).
2. LEI VIOLADA (o coração): "nunca aja sobre entidade não-ancorada" — o what-if re-ancora `recommendedOffer` e o fechamento fecha a proposta ERRADA (real, na Bevi). Conserto cirúrgico (o Fable deu as 2 opções): what-if NUNCA re-ancora / contract-input valida contra a última confirmação explícita.
3. Execute NA ORDEM: FIX-251 (âncora do fechamento — TDD reproduzindo a sequência exata do Fluxo B) → FIX-252 (rota determinística nome→grupo). **TDD strict**.
4. INVARIANTES: invariante de entidade-ancorada em CÓDIGO; NÃO quebrar o clamp de 20% (FIX-240, correto) nem os FIX r1-r3. Português correto.
5. 1 commit Conventional (PT-BR) por item; mova o fix-NN pra done/. Ao terminar: **push da branch** + `.done/`. **NÃO abra PR/merge/deploy.** `pnpm test:unit` (+ integration se subir DB) VERDE antes do push.
6. RESUMO: o que mudou + evidência de que o Fluxo B fecha o plano CERTO.
