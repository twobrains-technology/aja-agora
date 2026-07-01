Você é o executor do bloco `bloco-entrada-welcome-upload` no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo), `docs/jornada/jornada-canonica.md` (o
   **Mapa de divergências** — É A REGRA) e `docs/correcoes/todo/bloco-entrada-welcome-upload/`
   (_bloco.md + cada fix-NN: root cause, evidência `file:line`, correção e regressão exigida).

2. DESIGN: FIX-121 é trivial (remover a 4ª categoria do welcome) — sem brainstorming. FIX-122
   (upload de mídia inbound no WhatsApp) tem decisão real: onde salvar a foto (reusar o storage
   S3 do bloco-a-documentos se já existir, ou persistir + repassar). Se houver trade-off, FAÇA a
   pergunta via `AskUserQuestion` (recomendada em 1º, rótulo "(Recomendado)"). Fallback anti-trava:
   sem resposta, siga a recomendada. Registre em
   `docs/correcoes/decisions/2026-07-01-bloco-entrada-welcome-upload.md` e commit `docs:`.

3. Execute os itens NA ORDEM de `itens:`. TDD strict — teste FALHA antes do fix. FIX-122 (webhook
   HTTP) é integration test do handler de mídia; FIX-121 (welcome) é Camada 1 structural.

4. 1 commit Conventional (PT-BR) por item (`test+fix: <descrição>`).

5. Ao concluir cada item: MOVA o fix-NN pra `docs/correcoes/done/` (status: done + commit + executado_em).
   Bloco esvaziou → apague a pasta. (Best-effort — o orquestrador garante via merge/reconcile.)

6. Ao terminar: **push da branch** (`git push origin fix/entrada-welcome-upload`) + gere
   `.done/{data}-bloco-entrada-welcome-upload.md`. **NÃO abra PR, NÃO faça merge, NÃO rode
   deploy/restart, NÃO crie reminder.** A integração na base é do ORQUESTRADOR. A tag-sentinela
   é injetada automaticamente pelo launch-blocks.sh.

7. RESUMO FINAL: liste as decisões de design ("decidi X em vez de Y porque Z"). Sem decisão? Diga.
