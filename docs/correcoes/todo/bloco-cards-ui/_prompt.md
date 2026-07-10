Você é o executor do bloco **bloco-cards-ui** no worktree isolado deste branch (`feat/cards-consorcio-ui`). É a CAMADA DE CARDS da onda "agente de vendas de consórcio": 3 cards novos + ajustes nos existentes.

1. Leia, nesta ordem:
   - `docs/correcoes/README.md`
   - `docs/correcoes/todo/bloco-cards-ui/` — `_bloco.md` (checklist de card + conflitos nível 3) + os 5 cards `fix-228..232`
   - SPEC: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/docs/02-cards-novos.md` (specs dos cards), `.../docs/04-copy-fluxos.md` (copy exata dos balões), `.../docs/05-compliance-e-dados.md` (o que NUNCA exibir).
   - Mockups visuais (abra se precisar): `.../mockups/aja-dois-cenarios.html` e `.../mockups/agulha-contemplacao.html`.

2. DESIGN: fechado nos cards + spec. NÃO brainstorme. Uma exceção: se um card exigir uma decisão de UX genuína não coberta pela spec, use `AskUserQuestion` (recomendada em 1º, rótulo "(Recomendado)"); sem resposta em tempo razoável, siga a recomendada e registre em `docs/decisoes/blocos/2026-07-09-cards-ui.md`.

3. Execute NA ORDEM: FIX-231 (guard + ajustes) → FIX-228 (embutido) → FIX-229 (dois caminhos) → FIX-230 (escassez placebo) → FIX-232 (proposta). Como um card nasce (4 pontos): payload em `chat/types.ts` → tool `present_*` + schema Zod → **coerção server-side no `runner.ts`** (os números vêm da oferta REAL, a LLM só escolhe o grupo) → componente + case no `artifact-renderer.tsx` + registrar fase em `tool-policy.ts`.

4. INVARIANTES QUE NÃO SE NEGOCIAM:
   - Card de embutido SEMPRE diz "o crédito recebido diminui".
   - Card de dois-caminhos NUNCA traz % de chance/probabilidade; NÃO recomenda um dos dois.
   - Card de escassez: número **estável por grupo** (hash determinístico do `quotaId` → 1..6), NUNCA `Math.random()` por render; barra decorativa (largura fixa), NUNCA razão N/total; NUNCA exibe total de cotas.
   - `taxaContemplacao` NUNCA vai pra UI (adicione o teste-guard).
   - Número de card é coagido no servidor (LLM não inventa) — mantenha o padrão do `runner.ts:427-458`.
   - NÍVEL 3 com o motor: `contemplation-dial.tsx` deve parar de consumir `likelihood` (o bloco-motor o remove do output). NÍVEL 3 com a jornada: crie `present_two_paths`; a ligação do gate `lance` é do bloco-jornada.
   - Português correto em TODA copy voltada ao usuário (acentos, cedilha, til) — acento faltando é defeito de entrega.

5. 1 commit Conventional (PT-BR) por item. Ao concluir cada, MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit:` + `executado_em:`.

6. Ao terminar: **push da branch** + `.done/2026-07-09-cards-ui.md`. **NÃO abra PR, NÃO faça merge, NÃO rode deploy.** Rode `pnpm test:unit` dos arquivos tocados e garanta VERDE antes do push.

7. RESUMO FINAL: liste as decisões de UX/implementação que tomou.
