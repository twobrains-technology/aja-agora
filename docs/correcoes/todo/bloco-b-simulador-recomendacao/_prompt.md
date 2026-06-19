Você é o executor do bloco **bloco-b-simulador-recomendacao** no worktree isolado deste branch (`fix/simulador-recomendacao`). Trabalha SOZINHO, sem o Kairo para responder: NÃO faça perguntas, NÃO espere aprovação — você É o decisor (best practice + padrões do repo).

## Contexto
Correções da revisão 2 da jornada (`jornada2_revisão.docx`, teste manual do Bernardo). Este bloco é a **mecânica do simulador e da recomendação de grupos**.

## Passos
1. Leia `docs/correcoes/README.md` e a pasta `docs/correcoes/todo/bloco-b-simulador-recomendacao/` inteira: `_bloco.md` + `fix-54`, `fix-55`, `fix-56`, `fix-57` (cada um com arquivo:linha investigado). Leia `CLAUDE.md` (regras de regressão) e `docs/jornada/proposta-simulador.md`.

2. DESIGN: FIX-54 (novo teto de carro), FIX-55 (step vs input livre), FIX-56 (estratégia de dedup), FIX-57 (como sinalizar próximo passo) têm decisões reais. Use o raciocínio de `superpowers:brainstorming` mas DECIDA sozinho — não trave no HARD-GATE. Registre em `docs/correcoes/decisions/2026-06-19-bloco-b-simulador.md`. Commit `docs:`.

3. Execute NA ORDEM: **FIX-54 → FIX-55 → FIX-56 → FIX-57** (54 e 55 compartilham `qualify-config.ts`+pickers; sequencial). TDD strict por item: teste falha antes do fix.

4. Regressão por item:
   - FIX-54 (config pura): Camada 1 em `qualify-config.test.ts` — `CREDIT_BOUNDS.auto.max` >= novo teto; `clampCreditToCategory` aceita valor > 300k para auto.
   - FIX-55: Camada 1 (valor quebrado sobrevive ao clamp) + teste do componente `value-picker.tsx`/`plan-estimate-picker.tsx` (input livre aceita valor quebrado).
   - FIX-56: Camada 1 em `recommendation.test.ts` — top 3 com administradoras distintas dado universo com 2 grupos da mesma adm no topo; cobrir fallback "poucas administradoras".
   - FIX-57: teste de componente `simulation-result.tsx` (affordance de próximo passo + microcopy meses×lance). **NÃO alterar a fórmula de `contemplation-dial.ts`** — a mecânica está correta.

5. **Limite de escopo:** NÃO toque `system-prompt.ts`, `ai-sdk.ts` nem reposicione o simulador no fluxo — isso é do Bloco A (FIX-58). Aqui só a mecânica interna de config/lógica/componentes. Único overlap esperado: cassettes append-only em `tests/regression/agent-trajectory.test.ts` (se precisar, append; o Bloco A mergeia antes).

6. 1 commit Conventional (PT-BR) por item — `test+fix:` quando aplicável.

7. Ao terminar: **push da branch** (`git push origin fix/simulador-recomendacao`) + gere `.done/{data}-bloco-b-simulador-recomendacao.md` + **crie reminder de revisão**:
   `osascript -l JavaScript /Users/kairo/.superset/projects/organizacao-produtiva/scripts/reminders.js add "[Aja Agora] Revisar+mergear bloco-b-simulador-recomendacao: teto carro + números quebrados + dedup administradora + CTA próximo passo — branch fix/simulador-recomendacao no aja-agora, testes verdes — validar diff e decidir merge"`

8. **PROIBIDO**: PR, merge, deploy/restart, `--no-verify`. Sua linha vermelha é só push da branch.

9. RESUMO FINAL: liste as decisões de design ("decidi X em vez de Y porque Z").
