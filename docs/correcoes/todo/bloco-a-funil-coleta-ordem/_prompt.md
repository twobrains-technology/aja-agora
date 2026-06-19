Você é o executor do bloco **bloco-a-funil-coleta-ordem** no worktree isolado deste branch (`fix/funil-coleta-ordem`). Trabalha SOZINHO, sem o Kairo para responder: NÃO faça perguntas, NÃO espere aprovação — você É o decisor (best practice + padrões do repo).

## Contexto
Correções vindas da revisão 2 da jornada (`jornada2_revisão.docx`, teste manual do stakeholder Bernardo em ajaagora.com.br). Este bloco é o **comportamento e a ordem do agente no funil**.

## Passos
1. Leia `docs/correcoes/README.md` (regras do fluxo) e a pasta `docs/correcoes/todo/bloco-a-funil-coleta-ordem/` inteira: `_bloco.md` + `fix-52`, `fix-53`, `fix-58` (root cause, cenário, correção, regressão exigida — cada um já tem arquivo:linha investigado). Leia também `CLAUDE.md` do projeto (regras de agente e regressão de 3 camadas) e `docs/jornada/jornada-canonica.md`.

2. DESIGN (FIX-58 tem decisão de produto/ordem; FIX-52/53 já vêm com root cause fechado): para o que tiver alternativa real, use o raciocínio da skill `superpowers:brainstorming` (explore contexto, 2-3 abordagens, trade-offs, YAGNI) mas DECIDA sozinho — não trave no HARD-GATE. Registre cada decisão em `docs/correcoes/decisions/2026-06-19-bloco-a-funil.md` (o que decidiu · opções · escolhida + porquê). Commit `docs:` desse ADR.

3. Execute os itens NA ORDEM: **FIX-53 → FIX-52 → FIX-58** (os três convergem no `system-prompt.ts`; sequencial evita reescrever a mesma seção 3x). TDD strict por item.

4. **Regressão de agent obrigatória — 3 camadas (CLAUDE.md):** para cada bug de comportamento, escreva ANTES do fix: Camada 1 (structural, `src/**/*.test.ts` ao lado do código) + Camada 2 (cassette novo em `tests/regression/agent-trajectory.test.ts`, usando `MockLanguageModelV2` de `ai/test`). Veja os 2 falharem, então corrija (prompt/builder/tool/gate), veja passar. **Sem cassette = fix recusado.** Pontos críticos a cobrir:
   - FIX-52: o system-prompt NÃO pode conter "atualizar a página"/"reabra"/"aparece automaticamente"/"não consigo disparar" (meta-narrativa + solução manual proibida); o card de dados (`present_contract_form`) tem que disparar quando o usuário fornece os dados (inclusive CPF+telefone juntos); pedir CPF e telefone separados (um por vez).
   - FIX-53: gate `identify` (CPF/celular) ANTES de `present_value_picker`; não re-pedir valor já coletado.
   - FIX-58: simulador de contemplação disparado ANTES da `present_recommendation_card`; passo de confirmação de premissas antes de avançar. NÃO redesenhar o simulador (componente é do Bloco B) — só mudar a ORDEM/fluxo e a doc.

5. Atualize `docs/jornada/jornada-canonica.md`, `proposta-simulador.md` e `CONTEXT.md` para refletir a nova ordem (dados antes do valor; simulador antes da indicação; confirmação de premissas). Divergência docx×código é defeito do código, mas aqui o stakeholder MUDOU a ordem — registre.

6. 1 commit Conventional (PT-BR) por item — use `test+fix:` (teste de regressão + correção no mesmo commit). 

7. Ao terminar: **push da branch** (`git push origin fix/funil-coleta-ordem`) + gere `.done/{data}-bloco-a-funil-coleta-ordem.md` (resumo + decisões + testes + gaps) + **crie reminder de revisão** (NÃO PR):
   `osascript -l JavaScript /Users/kairo/.superset/projects/organizacao-produtiva/scripts/reminders.js add "[Aja Agora] Revisar+mergear bloco-a-funil-coleta-ordem: ordem dados-antes-valor + card de dados + reposicionar simulador — branch fix/funil-coleta-ordem no aja-agora, 3 camadas verdes — validar diff e decidir merge"`

8. **PROIBIDO**: abrir PR, fazer merge, rodar deploy/restart, `--no-verify`. A revisão+merge é decisão do Kairo. Sua linha vermelha é só push da branch.

9. RESUMO FINAL: liste as decisões de design que tomou (do `decisions/`) — "decidi X em vez de Y porque Z" por linha. Sem decisão real num item? Diga isso.
