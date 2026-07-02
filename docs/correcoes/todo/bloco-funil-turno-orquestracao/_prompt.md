Você é o executor do **bloco-funil-turno-orquestracao** no worktree isolado deste branch (`fix/turno-governanca-dado-erro`). Projeto: aja-agora (Next.js + Vercel AI SDK 6). Idioma: PT-BR. Package manager: **pnpm** (nunca npm/yarn).

1. **Leia primeiro:**
   - `docs/correcoes/README.md` (regras do fluxo) e `docs/correcoes/todo/bloco-funil-turno-orquestracao/` (`_bloco.md` + `fix-186` + `fix-187` — root cause, cenário, correção e regressão exigida já investigados).
   - `CLAUDE.md` §"REGRAS DE PRODUTO" (dado real / Bevi fonte única — INVIOLÁVEL), §"Regressão de agent — 3 camadas OBRIGATÓRIAS", §"Feature Development Workflow".
   - `~/.claude/reference/arquitetura-agentes-ia.md` (as 6 leis) — a correção é **determinística em CÓDIGO**, nunca "mais uma regra no system-prompt". Invariante crítico vira código; allowlist, não blocklist-no-prompt.
   - O ADR do bloco A: `docs/correcoes/decisions/2026-07-01-bloco-a-governanca-agente.md` (contexto da governança que já existe — você ESTENDE ela, não duplica).

2. **DESIGN:** o design está fechado nos cards (root cause + correção). NÃO reabra. Só há UMA decisão de implementação com trade-off real: **quantos retries e o timeout do retry silencioso** do FIX-186. Escolha o default sensato (1 retry, timeout curto alinhado ao "< 3s" do CLAUDE.md) e siga — se surgir outro trade-off genuíno, use `superpowers:brainstorming` + `AskUserQuestion` (recomendada em 1º, rótulo "(Recomendado)"); **fallback anti-trava:** sem resposta em tempo razoável, siga a sua recomendada. Registre decisões em `docs/correcoes/decisions/2026-07-01-bloco-funil-turno-orquestracao.md` (commit `docs:`).

3. **Execute NA ORDEM: FIX-186 → FIX-187** (o 187 lê o sinal `discoveryFailedThisTurn` que o 186 cria). **TDD strict** (regra global): para cada item, escreva as 3 camadas de regressão PRIMEIRO, veja FALHAR, implemente, veja PASSAR.
   - **Camada 1** (structural, `src/**/*.test.ts`) + **Camada 2** (cassette OBRIGATÓRIO em `tests/regression/agent-trajectory.test.ts`, `MockLanguageModelV2` de `ai/test`) + **Camada 3** (cenário em `tests/eval/agent-flow.eval.test.ts` — não roda no PR, mas deixe escrito).
   - **NUNCA** fix sem cassette (Camada 2). O pre-commit hook roda Camadas 1+2.

4. **1 commit Conventional (PT-BR) por item** — `test+fix:` (imperativo minúsculo, sem ponto final, título < 72). Um item = um commit com teste + fix juntos.

5. Ao concluir cada item: **mova** o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit: <hash>` + `executado_em: 2026-07-01`. (Best-effort — o orquestrador garante via merge/reconcile; não trave por isso.)

6. **Invariantes que NÃO podem ser violados** (verifique ao final):
   - Nenhuma narração de erro técnico crua chega ao usuário (nem "problema"/"dificuldade técnica"/"instabilidade"/"tente de novo" solto).
   - Nenhuma proposta/recomendação/simulação/número é emitido quando a descoberta do turno falhou.
   - Número de oferta/fiscal só vem de retorno REAL da Bevi — nunca inferido pela LLM.
   - Copy PT-BR correta (acentos/cedilha) em toda mensagem determinística nova.
   - Sincronia: se tocar `system-prompt.ts`/`HARD_RULES.md`, atualize os dois no mesmo commit (travado por `HARD_RULES.test.ts`).

7. **Evidências extras** (`_evidencia/agente-trava-apos-valor`, `valor-componente-nao-aparece`): são bugs IRMÃOS de orquestração NÃO investigados. Se sobrar tempo e a causa for a mesma família, abra `fix-NN` e trate; senão registre no `.done/` como "triado, próxima rodada" — **não invente root cause**.

8. **Ao terminar:** `pnpm typecheck` + `pnpm test:unit` verdes (corrija qualquer vermelho que você veja, mesmo pré-existente — regra global). **Push da branch** (`git push origin fix/turno-governanca-dado-erro`) + gere `.done/2026-07-01-bloco-funil-turno-orquestracao.md` (resumo + decisões + testes + gaps honestos). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration, NÃO crie reminder.** A integração na base é do orquestrador. A tag-sentinela de conclusão é injetada automaticamente no fim deste prompt — só siga o footer.

9. **RESUMO FINAL:** liste as decisões de implementação que você tomou ("decidi X em vez de Y porque Z"), uma por linha. Sem decisão? Diga isso.
