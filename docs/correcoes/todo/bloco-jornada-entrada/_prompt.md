Você é o executor do bloco `bloco-jornada-entrada` no worktree isolado deste branch (`feat/jornada-entrada-conversacional`), rodando com Opus.

CONTEXTO: revisão da jornada de ENTRADA do Aja Agora (plataforma de consórcio AI-first), decidida pelo Kairo. Leia PRIMEIRO, nesta ordem:
- `docs/specs/2026-06-28-jornada-entrada-simulador-conversacional-design.md` — decisões do Kairo + desenho da onda (FONTE DE VERDADE).
- `docs/correcoes/README.md` — regras do fluxo.
- `docs/correcoes/todo/bloco-jornada-entrada/` — `_bloco.md` + cada `fix-NN` (root cause, cenário, correção, regressão exigida).
- `docs/jornada/jornada-canonica.md` — a jornada canônica (REGRA do produto). Atualize os passos 1-2 e 4 ao implementar.
- `CLAUDE.md` do projeto — em especial "Regressão de agent — 3 camadas OBRIGATÓRIAS", TDD, pnpm.

ESCOPO (só estes arquivos): `src/lib/agent/**` (qualify-state, qualify-config, system-prompt, agents/builder, HARD_RULES, tools/ai-sdk) + os testes da área + `tests/regression/agent-trajectory.test.ts` + `tests/eval/**`.

Execute os itens NA ORDEM: FIX-103 → FIX-104 → FIX-105 → FIX-106.

REGRAS (invioláveis):
1. TDD strict. Todo item = mudança de comportamento de agent → 3 camadas OBRIGATÓRIAS: Camada 1 (structural, `src/lib/agent/*.test.ts`), Camada 2 (cassette em `tests/regression/agent-trajectory.test.ts`), Camada 3 (eval em `tests/eval/**`). Veja o teste/cassette FALHAR antes do fix.
2. 1 commit Conventional em PT-BR por item (`feat:`/`test+feat:`/`fix:` conforme o caso). Sem `--no-verify`.
3. DESIGN real (FIX-106 em especial — copy do convite ao simulador, quando ofertar, como apresentar cada iteração; e o fallback de recomendação sem `desiredTermMonths` no FIX-103): use `superpowers:brainstorming` e FAÇA a pergunta via `AskUserQuestion` (opção recomendada em 1º, rótulo terminando em "(Recomendado)") — o agente respondedor do Kairo responde. Sem resposta em tempo razoável → siga a recomendada e registre em `docs/correcoes/decisions/2026-06-28-bloco-jornada-entrada.md`. NÃO trave no HARD-GATE.
4. Português correto (com acentuação) em TODA copy do agente/UI.
5. NÃO toca DB/schema. Se descobrir que precisa, migration À MÃO (db:generate está quebrado — escreva o .sql + journal entry, valide com db:migrate), NUNCA `drizzle-kit push`.
6. Reuso: o simulador (FIX-106) DEVE reusar `computeContemplationDial()` de `src/lib/consorcio/contemplation-dial.ts` — não duplicar cálculo.

CONTRATO que este bloco define (os blocos web e whatsapp dependem):
- O agente PARA de emitir `present_value_picker` na entrada (valor vira conversa).
- O gate `timeframe` (prazo) SAI da qualificação.
- O simulador de contemplação é conduzido em LOOP conversacional pelo agente.
Deixe esse contrato explícito num comentário no topo de `qualify-config.ts`/`system-prompt.ts` pra os outros blocos se alinharem.

Ao concluir cada item: mova o `fix-NN` pra `docs/correcoes/done/` (status done + commit + executado_em).

Ao terminar: `git push origin feat/jornada-entrada-conversacional` + gere `docs/entregas/<ts>-bloco-jornada-entrada.md` (resumo + decisões + testes + gaps). NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart. A integração na base é do orquestrador.

RESUMO FINAL: liste as decisões de design que você tomou ("decidi X em vez de Y porque Z", uma por linha). Sem decisão? Diga isso.
