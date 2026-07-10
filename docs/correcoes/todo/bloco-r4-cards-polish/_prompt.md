Você é o executor do bloco **bloco-r4-cards-polish** (rodada 4) no worktree isolado deste branch (`fix/r4-cards-polish`). Fecha os caminhos de card ainda descobertos + P2/P3 do veredito Fable FINAL (4/10).

1. Leia: `docs/correcoes/rodada2-fable/veredito-fable-final.md` (§2, §3, §N-C..N-I) + `docs/correcoes/todo/bloco-r4-cards-polish/` (_bloco.md + fix-253..256).
2. CAUSA-RAIZ (mesma do r3, ainda viva num caminho): enquanto `present_decision_prompt` estiver no toolset do LLM, o LLM decide se scarcity aparece — tire a tool do toolset e roteie decision pelo orchestrator (emissão server-side incondicional). Idem embedded_bid no caminho texto. É a Lei 1/4 (LLM não dirige o fluxo).
3. Execute NA ORDEM: FIX-253 (decision fora do toolset + scarcity incondicional + embedded_bid texto) → FIX-254 (dedup educação/double-dispatch) → FIX-255 (copy identidade por canal + acento Bevi + notice coerente) → FIX-256 (copy reserva + nota migration 0033). **TDD strict**.
4. INVARIANTES: card = emissão server-side determinística (nunca depender do LLM chamar present_X); português correto com acento nos nomes de administradora; copy por canal (web ≠ WhatsApp); NÃO quebrar os FIX r1-r3.
5. 1 commit Conventional (PT-BR) por item; mova o fix-NN pra done/. Ao terminar: **push da branch** + `.done/`. **NÃO abra PR/merge/deploy.** `pnpm test:unit` (+ integration) VERDE antes do push.
6. RESUMO: quais caminhos de card agora emitem determinístico (evidência).
