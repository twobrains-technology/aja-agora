Você é o executor do bloco `bloco-e-sweep-multifaixa` no worktree isolado deste branch (`feat/sweep-multifaixa-descoberta`). Trabalha SOZINHO, sem o Kairo pra responder — você É o decisor.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-e-sweep-multifaixa/` (`_bloco.md` + `fix-69-...md` +
   `fix-70-...md` — root cause provado, viabilidade, correção, limites de escopo).
   Leia também o cookbook `docs/integracoes/bevi-api-requests.md` (§3 stateful,
   §5a piso, §6 sweep) — é a fonte de verdade da integração.

2. DESIGN (feature nova com decisões reais — só pro FIX-70): use o raciocínio da
   skill `superpowers:brainstorming` (explore contexto, 2-3 abordagens, trade-offs,
   YAGNI) MAS sem perguntar e sem travar no HARD-GATE — DECIDA a opção que
   recomendaria (best practice + padrões do repo). Registre em
   `docs/correcoes/decisions/<data>-bloco-e-sweep-multifaixa.md` (o quê · opções ·
   escolhida + porquê). Commit `docs:` desse ADR. O FIX-69 (spike) é direto, sem
   brainstorming.

3. Execute NA ORDEM `itens:` → FIX-69 (spike) depois FIX-70 (impl). TDD strict pro
   FIX-70 (teste falha antes do fix). FIX-69:
   - Entregue `scripts/spike-bevi-sweep.ts` (mede latência por simulate quente +
     sonda rate-limit). Rode SE houver `BEVI_SELFCONTRACT_HASH` no ambiente; se NÃO
     tiver, **não trave** — deixe o script pronto, documente o protocolo e marque o
     resultado como `PENDENTE-KAIRO` no `.done/`. O FIX-70 procede com defaults
     conservadores independente do spike.

4. LIMITES INVIOLÁVEIS de escopo:
   - **NÃO toque `src/lib/agent/recommendation.ts`** (é do bloco-b parado).
   - **NÃO toque `src/lib/agent/orchestrator/tool-policy.ts`** (é do bloco-d).
   - Se precisar tocar `system-prompt.ts` ou `agent-trajectory.test.ts`, faça em
     região distinta (append-only) — é nível 2 com bloco-d, que mergeia ANTES.

5. 1 commit Conventional (PT-BR) por item (`test+feat:`/`feat:`/`chore:` conforme).

6. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` com
   `status: done` + `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou →
   apague a pasta.

7. Ao terminar: **push da branch** (`git push origin feat/sweep-multifaixa-descoberta`)
   + gere `.done/{data}-bloco-e-sweep-multifaixa.md` (resumo + decisões de design +
   testes + gaps, incl. o caveat de cache por processo e o status do spike).
   **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration.**

8. RESUMO FINAL: liste as decisões de design que você tomou (do `decisions/`) —
   "decidi X em vez de Y porque Z" por linha — + status do spike (rodou ao vivo? ou
   PENDENTE-KAIRO?) + se adicionou cassette ou só integration.
