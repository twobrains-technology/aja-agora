---
bloco: bloco-t-ux-chat
branch: fix/ux-chat
workspace: fix-ux-chat
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-38, FIX-36, FIX-37]
escopo_arquivos:
  - src/app/api/chat/route.ts (handler interest)
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/system-prompt.ts
  - src/components/chat/artifacts/decision-prompt.tsx
  - src/lib/chat/types.ts (labels do decision, se for por aí)
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados: []
---

# Bloco T — UX do chat, rodada pós-merge 2026-06-12

Pacote da rodada de testes manuais do Kairo no dev de hoje (pós PRs #28/#30).
Três itens pequenos/médios, mesma sessão:

1. **FIX-38** (dupla confirmação no "Tenho interesse") — o mais relevante:
   ajusta o desenho do FIX-34 mergeado hoje; tem `decisao_pendente` leve
   (validar contra a jornada canônica antes de pular o decision no sinal
   explícito).
2. **FIX-36** (copy "Encontrei" antes do search_groups completar) — prompt e
   directives; atenção à tensão de design documentada no item (sem
   meta-narrativa no lugar).
3. **FIX-37** (overflow do label no decision card) — CSS puro, rapidinho.

> Histórico: o bloco nasceu como bloco-t-copy-pre-tool (só FIX-36); virou
> pacote quando a rodada trouxe FIX-37/38 (regra: itens pequenos afins, uma
> sessão).

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-t-ux-chat/ na ordem FIX-38 → FIX-36 → FIX-37.
> FIX-38: antes de codar, valide a proposta contra
> docs/jornada/jornada-canonica.md (pular o decision_prompt no sinal
> EXPLÍCITO de interesse; card de decisão fica pros caminhos ambíguos) e
> registre a leitura na seção "Decisão" do item; preserve o invariante do
> FIX-34 (interest NUNCA vira lead/consultor) nos cassettes. FIX-36 e FIX-38
> são comportamento de agent — regressão nas 3 camadas obrigatória. FIX-37 é
> CSS (component test basta). TDD strict, 1 commit test+fix: por item, mover
> cada um pra done/ ao concluir e apagar a pasta do bloco no fim.
