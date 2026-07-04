Você é o executor do bloco `bloco-cache-anthropic` no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-cache-anthropic/` (_bloco.md + fix-213 + fix-214 — root cause,
   cenário, correção, regressão exigida). O root cause já está PROVADO no código; não
   re-investigue do zero — confirme os pontos exatos e execute.

2. SEM design real (correção fechada) → PULE brainstorming. Vá direto pro TDD.

3. Execute NA ORDEM `itens: [FIX-213, FIX-214]`. TDD strict pra cada:
   - **FIX-213** (`src/lib/agent/agents/builder.ts`):
     a. PRIMEIRO escreva o teste em `builder.test.ts` que asserta que o 1º bloco de `system`
        (o `stable`) carrega `providerOptions.anthropic.cacheControl` com **`ttl: "1h"`**, em
        AMBOS os ramos do ternário (com e sem `blocks.dynamic`). Veja FALHAR (hoje não tem `ttl`).
     b. Corrija: `{ type: "ephemeral" }` → `{ type: "ephemeral", ttl: "1h" as const }` nas
        linhas ~219 e ~229. Veja o teste passar.
     c. **VERIFIQUE o passthrough do `ttl` (não crave):** o `@ai-sdk/anthropic` ^3.0.69 aceita
        `providerOptions.anthropic.cacheControl.ttl`? (cheque a doc/tipos do pacote — use MCP
        context7 `resolve-library-id` + `query-docs` pra "@ai-sdk/anthropic cache control ttl",
        ou leia `node_modules/@ai-sdk/anthropic` tipos). E o gateway LiteLLM repassa o campo
        `ttl` pro Anthropic? Se NÃO conseguir provar o passthrough end-to-end no worktree
        (sem prod), documente o que verificou e o que falta como **dúvida ABERTA** no `.done/`
        e no ADR — NÃO afirme "funciona" sem evidência. Se descobrir que não passa, registre a
        resolução na fonte (config do gateway) como próximo passo; não deixe `ttl` ignorado
        passando por verde.
   - **FIX-214** (`src/lib/agent/mesa-copilot/index.ts:47`): mesma troca
     `{ type: "ephemeral" }` → `{ type: "ephemeral", ttl: "1h" as const }`. Estenda o teste
     estrutural existente do bloco cacheável pra assertar `ttl: "1h"` (ou adicione assertion
     mínima). Não invente E2E de mesa.

4. 1 commit Conventional (PT-BR) por item:
   - `perf: cache anthropic do agente com ttl 1h (corta cache-creation em conversa human-paced)`
   - `perf: cache anthropic do mesa-copilot com ttl 1h`
   (ajuste o texto se preferir — imperativo minúsculo, < 72, sem ponto final).

5. Ao concluir cada item: MOVA o fix-NN pra `docs/correcoes/done/` com `status: done` +
   `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta. (Best-effort;
   o orquestrador reconcilia se você esquecer.)

6. Ao terminar: **push da branch** (`git push origin fix/cache-anthropic-ttl-1h`) + gere
   `.done/{data}-bloco-cache-anthropic.md` (resumo + o que verificou do passthrough do `ttl` +
   testes + gaps honestos). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie
   reminder.** A integração na base é do ORQUESTRADOR. A tag-sentinela é injetada
   automaticamente — siga o footer.

7. RESUMO FINAL: liste as decisões que tomou e — crítico — **o veredito honesto sobre o
   passthrough do `ttl`** (provado que passa? / não consegui provar sem prod? / descobri que
   não passa e a fonte é X?). Se não houve decisão de design, diga isso.
