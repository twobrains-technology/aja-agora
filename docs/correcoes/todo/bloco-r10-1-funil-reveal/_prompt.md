Você é o executor do bloco `bloco-r10-1-funil-reveal` no worktree isolado deste branch
(`fix/r10-1-funil-reveal`), projeto aja-agora.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e `docs/correcoes/todo/bloco-r10-1-funil-reveal/`
   inteiro (`_bloco.md` + `fix-296-*.md` + `fix-297-*.md` — root cause, cenário, correção,
   regressão exigida). Leia TAMBÉM, na íntegra:
   - `docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html` (o mockup-alvo — preste atenção
     especial ao JS final, arrays `F1`/`F2`: é o script exato da conversa desejada, turno a turno,
     com anotações do porquê de cada jogada).
   - `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md` (o estudo de
     causa-raiz P1-P10/S1-S7 completo).

2. DESIGN: os fix-cards já trazem root cause + correção proposta, e as decisões de coreografia
   (adaptativa) e abertura (categoria+divider) já foram aprovadas pelo Kairo — não re-pergunte
   essas duas. Mas HÁ decisões de implementação reais que sobram pra você (ex.: como representar
   o gate `reco-consent` sem virar um novo valor arriscado no enum `Gate`; como estruturar o beat
   de abertura por categoria). Use `AskUserQuestion` com a opção recomendada em 1º lugar quando
   houver trade-off técnico real; sem resposta em tempo razoável, siga a recomendada. Registre em
   `docs/decisoes/blocos/2026-07-12-bloco-r10-1-funil-reveal.md`.

3. Execute NA ORDEM: **FIX-296 primeiro** (reordena o funil pré-reveal), **FIX-297 depois**
   (recoreografa o reveal em cima da nova estrutura). TDD proporcional — isto é lógica de fluxo
   crítica (máquina de estados + coreografia condicional), então TDD strict: escreva o teste que
   reproduz o comportamento ATUAL errado, veja falhar, corrija, veja passar. Rode SÓ os testes dos
   arquivos que você tocou (`vitest run <path>`), nunca a suíte inteira. 🚫 NÃO rode smoke/QA de
   browser neste bloco.

   **Verificações obrigatórias antes de considerar o item pronto:**
   - Reproduza os DOIS fluxos do mockup (Madalena rica, Mario compacto) e confirme que a
     coreografia diverge como esperado (Mario NÃO passa por motivo/espelho/experience/reco-consent/hero).
   - Confirme que a `comparison_table` continua SEMPRE aparecendo no reveal (nunca some — FIX-290
     não pode regredir) e que o hero pós-consentimento é emitido server-side (não dependente do
     LLM chamar tool).
   - Rode `test:integration` (não só `test:unit`) e confirme que os testes relacionados a FIX-294
     (denylist do WhatsApp optin) e FIX-295 (re-emissão de identify na supressão de contract_form)
     continuam verdes.

4. 1 commit Conventional (PT-BR) por item (FIX-296, depois FIX-297).

5. Ao concluir cada item: mova o fix-NN pra `docs/correcoes/done/` com `status: done` + `commit:
   <hash>` + `executado_em: <data>`.

6. Ao terminar: push da branch (`git push origin fix/r10-1-funil-reveal`) + gere
   `.done/{data}-bloco-r10-1-funil-reveal.md` (resumo + decisões + testes + gaps). NÃO abra PR,
   NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.

7. RESUMO FINAL: liste as decisões de design que você tomou (coreografia/abertura/reco-consent)
   linha a linha ("decidi X em vez de Y porque Z").
