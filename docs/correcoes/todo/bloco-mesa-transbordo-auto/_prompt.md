Você é o executor do bloco `bloco-mesa-transbordo-auto` no worktree isolado deste branch.
É uma FEATURE NOVA (transbordo automático + broadcast + claim) — o card de cada item traz a
evidência e o caminho, mas há decisões de design reais; NÃO improvise sem registrar.

1. Leia `docs/correcoes/README.md`, `docs/jornada/jornada-canonica.md` (Parte 2 — Mesa + Mapa de
   divergências D14-D17, É A REGRA), `docs/visao/mesa-de-operacao.md` (spec de negócio, se existir)
   e `docs/correcoes/todo/bloco-mesa-transbordo-auto/` (_bloco.md + cada fix-NN). **Estude
   `src/lib/whatsapp/proxy.ts`** — o padrão broadcast+claim já existe lá para o chat de vendas
   (`handoffToAgents` + claim atômico via `handedOffUserId`); REUSE a mecânica, não reinvente.

2. DESIGN (feature nova → brainstorme o que tiver trade-off real, via `superpowers:brainstorming`):
   - **FIX-126 (D17):** "em atendimento" é raia NOVA no `leadStageEnum` ou alias de `na_administradora`?
   - **FIX-123 (D14):** o transbordo automático dispara em QUAIS transições de raia (só
     na_administradora? em_negociacao também?).
   Para cada trade-off, FAÇA a pergunta via `AskUserQuestion` (recomendada em 1º, rótulo
   "(Recomendado)"). Fallback anti-trava: sem resposta, siga a recomendada. Registre TODAS as
   decisões em `docs/correcoes/decisions/2026-07-01-bloco-mesa-transbordo-auto.md` e commit `docs:`.

3. Execute os itens NA ORDEM de `itens:` (FIX-125 primeiro — é a base do estado "sem dono").
   TDD strict — teste FALHA antes do fix. ⚠️ **Migration** (FIX-125, `mesa_attendant_id` nullable):
   gere o SQL Drizzle e rode DENTRO do ambiente/container (regra de migrations — NUNCA na mão
   contra o banco). O claim atômico exige integration test com corrida entre 2 atendentes.

4. 1 commit Conventional (PT-BR) por item (`test+feat:`/`test+fix:` conforme o caso).

5. Ao concluir cada item: MOVA o fix-NN pra `docs/correcoes/done/` (status: done + commit + executado_em).
   Bloco esvaziou → apague a pasta. (Best-effort — o orquestrador garante via merge/reconcile.)

6. Ao terminar: **push da branch** (`git push origin feat/mesa-transbordo-auto`) + gere
   `.done/{data}-bloco-mesa-transbordo-auto.md`. **NÃO abra PR, NÃO faça merge, NÃO rode
   deploy/restart, NÃO crie reminder.** A integração na base é do ORQUESTRADOR. A tag-sentinela
   é injetada automaticamente pelo launch-blocks.sh.

7. RESUMO FINAL: liste as decisões de design ("decidi X em vez de Y porque Z"). Sem decisão? Diga.
