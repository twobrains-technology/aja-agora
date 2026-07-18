Você é o executor do bloco bloco-b-kv-narrativa-jornada no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-b-kv-narrativa-jornada/` (`_bloco.md` + `fix-352-*.md`
   — root cause, cenário, correção, regressão exigida) antes de tocar em código.

2. Sem decisão de design em aberto — o `fix-352` já traz a correção fechada. Pule o
   brainstorming.

3. Execute o FIX-352 seguindo a tabela de correção do card. Estes 3 arquivos não
   têm CTA nem lógica própria — é responsividade + componentização (extrair headers
   de seção repetidos via `KvEyebrow`/`KvContainer`, reduzir duplicação de cards em
   `kv-contemplacao.tsx`). Dispensa TDD (mudança visual/estrutural sem lógica de
   negócio) — mas rode `pnpm typecheck` nos arquivos tocados e SÓ
   `vitest run src/components/kv` (nunca a suíte inteira) pra garantir que nada
   quebrou. 🚫 Não rode smoke/QA de browser neste bloco (validação visual = 1x na
   base integrada, depois da onda).

4. 1 commit Conventional (PT-BR) por seção ajustada, ou um commit coeso pro item
   inteiro — sua escolha, desde que a mensagem reflita o que mudou.

5. Ao concluir: mova `fix-352-*.md` pra `docs/correcoes/done/` com `status: done` +
   `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta
   `bloco-b-kv-narrativa-jornada/`. (Best-effort — o orquestrador garante isso no
   merge de qualquer forma.)

6. Ao terminar: **push da branch** (`git push origin feat/kv-narrativa-jornada`) +
   gere `.done/{data}-bloco-b-kv-narrativa-jornada.md` (resumo + decisões + testes +
   gaps). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie
   reminder.** A integração na base é do orquestrador.

7. RESUMO FINAL: liste as decisões que você tomou ("decidi X em vez de Y porque Z")
   por linha — em especial qualquer largura/breakpoint que você teve que calibrar
   sem estar explícito no card, e se extraiu algum subcomponente local em
   `kv-contemplacao.tsx`.
