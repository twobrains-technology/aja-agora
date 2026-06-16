Você é o executor do bloco `bloco-a-polir-funil-retorno` no worktree isolado deste branch (`feat/polir-funil-retorno`), projeto aja-agora. Trabalhe SOZINHO até o fim — não há ninguém pra responder perguntas.

1. **Leia o contexto.** `docs/correcoes/README.md` (fluxo TODO→DONE), o `CLAUDE.md` do projeto (regras de TDD e de regressão em 3 camadas) e a pasta `docs/correcoes/todo/bloco-a-polir-funil-retorno/` inteira — `_bloco.md` + cada `fix-NN-*.md` (root cause provado, cenário, correção proposta, regressão exigida). Suba o ambiente local pela skill `local-dev` (stack em containers do workspace, NUNCA no host).

2. **DESIGN (só pro FIX-51 — os outros já têm root cause + correção fechada, PULE o brainstorming neles).** O FIX-51 (popup "voltar à conversa ou começar nova") tem decisões de design reais: quando mostrar o popup (limiar de progresso), o que acontece com a conversa anterior ao "começar nova", componente Dialog vs banner, cópia PT-BR sem cara de IA, mobile-first. Use o *raciocínio* da skill `superpowers:brainstorming` (explore o contexto, levante 2-3 abordagens, pese trade-offs, YAGNI) MAS você É o decisor: NÃO faça perguntas, NÃO espere aprovação, NÃO trave no HARD-GATE da skill. Escolha a opção que recomendaria (best practice + design system do projeto: shadcn/ui `src/components/ui/dialog.tsx` e blocos shadcn/studio Pro via MCP, conforme o CLAUDE.md do projeto). Registre cada decisão em `docs/correcoes/decisions/2026-06-15-bloco-a-polir-funil-retorno.md` (uma seção por decisão: o que decidir · opções consideradas · escolhida + porquê). Commit `docs:` desse ADR.

3. **Execute os itens NA ORDEM de `itens:`** do `_bloco.md`: FIX-48 → FIX-49 → FIX-51 → FIX-50. TDD strict: para cada item escreva o teste de regressão PRIMEIRO (integration p/ FIX-48 — toca DB; component + E2E Playwright p/ FIX-49/51/50) e **veja falhar com a assinatura exata** descrita no fix-NN antes de tocar o produto. São bugs/refinos não-agênticos — NÃO precisa cassette (Camada 2). No FIX-48, confirme o root cause no banco com a query do spec antes de corrigir.

4. **1 commit Conventional (PT-BR) por item** — `test+fix:` no FIX-48; `fix:`/`feat:`/`test+feat:` conforme couber nos outros. Sem misturar dois itens num commit.

5. **Ao concluir cada item:** MOVA o `fix-NN-*.md` pra `docs/correcoes/done/` com `status: done` + `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou (só `_bloco.md`/`_prompt.md`) → apague a pasta.

6. **LINHA VERMELHA — NÃO cruze:** NÃO faça `git push`, NÃO abra PR, NÃO rode deploy/restart/migration contra ambiente remoto. Pare ao terminar os commits LOCAIS. O Kairo revisa o diff e decide o merge.

7. **RESUMO FINAL:** liste as decisões de design que você tomou no FIX-51 (do `decisions/`) — "decidi X em vez de Y porque Z" por linha — e o estado de cada item (verde/bloqueado). Reporte os hashes dos commits.
