Você é o executor do bloco bloco-c-kv-confianca-fechamento no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-c-kv-confianca-fechamento/` (`_bloco.md` +
   `fix-353-*.md` — root cause, cenário, correção, regressão exigida) antes de
   tocar em código.

2. Sem decisão de design em aberto — o `fix-353` já traz a correção fechada
   (contrato `onOpenChat`/`TheaterOpener`, átomos `kv/ui/*` já prontos na base). Pule
   o brainstorming. Única exceção: NÃO invente URLs reais pros links sociais do
   footer — siga o card (placeholder documentado).

3. Execute o FIX-353 seguindo a tabela de correção do card, na ordem que fizer
   sentido (é o pacote mais pesado — 5 arquivos). TDD proporcional: CTA (Depoimentos,
   Footer) é lógica de negócio → TDD strict. `kv-faq.tsx` já tem accordion
   funcionando — não reescreva a lógica, só confirme/cubra com teste se faltar.
   Responsividade pura (Confiança, Comparação, larguras/breakpoints) é visual → sem
   teste. Rode SÓ `vitest run src/components/kv` — nunca a suíte inteira. 🚫 Não
   rode smoke/QA de browser neste bloco (validação visual = 1x na base integrada,
   depois da onda).

4. 1 commit Conventional (PT-BR) por arquivo/tema ajustado, ou um commit coeso pro
   item inteiro — sua escolha.

5. Ao concluir: mova `fix-353-*.md` pra `docs/correcoes/done/` com `status: done` +
   `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta
   `bloco-c-kv-confianca-fechamento/`. (Best-effort — o orquestrador garante isso no
   merge de qualquer forma.)

6. Ao terminar: **push da branch** (`git push origin feat/kv-confianca-fechamento`)
   + gere `.done/{data}-bloco-c-kv-confianca-fechamento.md` (resumo + decisões +
   testes + gaps — inclua o placeholder dos links sociais). **NÃO abra PR, NÃO faça
   merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração na base é do
   orquestrador.

7. RESUMO FINAL: liste as decisões que você tomou ("decidi X em vez de Y porque Z")
   por linha — em especial como resolveu `kv-comparacao.tsx` em mobile (scroll
   horizontal vs. recomposição) e qualquer ajuste de breakpoint não explícito no
   card.
