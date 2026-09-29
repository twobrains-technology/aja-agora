Você é o executor do bloco **bloco-reentrada** (`feat/reentrada-parados`) no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md`, `docs/decisoes/blocos/2026-09-28-decisoes-da-frente-aja.md` e
   `docs/correcoes/todo/bloco-reentrada/` (`_bloco.md` + cada `fix-NN`).

2. DECISÕES DO DONO QUE MANDAM AQUI (não reabra):
   - Esgotou os toques ⇒ **só para**. `ESGOTADO` é terminal, **sem** transição para `perdido` e **sem**
     alerta novo.
   - A reentrada é **deliberada e em lote**, ignorando a janela de 7 dias — é o que dá vazão ao bolo
     que a cliente quer retomar.
   - Cota de 30 dias na reentrada: **CONTA** o histórico (recomendação do PRD; é o item que o dono ainda
     não respondeu — registre isso no ADR e siga a recomendação, não trave).

3. TDD STRICT (é lógica e invariante). Provas obrigatórias:
   - esgotar a sequência **não** muda `leads.stage` e não cria evento de `perdido`;
   - a reentrada é **idempotente** (rodar duas vezes não duplica linha);
   - **opt-out nunca reentra**, telefone da equipe nunca reentra, `is_simulated` nunca reentra;
   - quem ficou terminal **por ter respondido** não é reativado;
   - a linha reaberta nasce com `step = 0`, `status = "ATIVO"`, `nextTouchAt = agora`,
     `touchesNaJanela = []`, `motivoSaida = null` e o registro de **quem autorizou e quando**.
   Rode só o que tocar: `pnpm vitest run src/lib/remarketing/` e `pnpm vitest run src/app/api/admin/remarketing/`
   (ou o diretório equivalente). **NÃO rode a suíte inteira** e **NÃO rode smoke de browser**.

4. 🚫 **NÃO DISPARE MENSAGEM REAL.** Nenhum teste pode atingir WhatsApp de cliente; use `deps`
   injetadas e mock do dispatcher.

5. 1 commit Conventional (PT-BR) por item. Mova o `fix-NN` para `docs/correcoes/done/` com `status: done`,
   `commit:` e `executado_em:` (best-effort). ADR em `docs/decisoes/blocos/2026-09-28-bloco-reentrada.md`.

6. Ao terminar: **push da branch** + `.done/{data}-bloco-reentrada.md`. **NÃO abra PR, NÃO faça merge,
   NÃO rode deploy.**

7. RESUMO FINAL: o estado inicial exato da linha reaberta e como a ação é disparada na tela.
