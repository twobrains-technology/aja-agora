---
bloco: bloco-h-chat-render
branch: fix/chat-render-ux
workspace: fix-chat-render-ux
onda: 1
depends_on: []
paralelo_com: [bloco-g-infra-teste]
itens: [FIX-102]
escopo_arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/components/chat/chat-message.tsx
conflitos_esperados:
  - "Disjunto do bloco G. FIX-102 toca runner.ts/chat-message.tsx (não tocados por G). Risco residual: se FIX-97 (bloco-g, typecheck) tocar algum test de chat, conflito mecânico nível 2 — improvável."
---
# Bloco H — Render/UX do chat (1 bug visual)

Defeito de **renderização do chat** observado na travessia E2E, independente do
resto da onda. Pacote pequeno pra um dev.

> **FIX-101 removido em 2026-07-01** (modal de resume coberto por z-index) — já
> resolvido inline por `bae59378` (mesmo bug do card `resume-coberto-pelo-theater-zindex`
> do inbox). Ver ata `docs/correcoes/2026-07-01-faxina-todo-zumbis-worktree-auditoria.md`.

## Item
1. **FIX-102** ✅ **done** (`b4f577d`, 2026-07-01, QA autônomo Frente 1) — eco/duplicação
   de texto do assistant (`"Boa...Boa..."`, `"Bora!Beleza"`). Causa cravada: degeneração
   NÃO-determinística da LLM (2ª ocorrência confirmada em homologação — mesmo shape exato),
   não bug de append. Mitigação implementada = **guarda defensiva determinística**
   (`collapse-self-duplicate.ts`) colapsando o texto quando é EXATAMENTE 2 metades idênticas
   coladas, aplicada em `runner.ts` antes do `saveMessage`. Trata o sintoma `"Boa...Boa..."`;
   NÃO pega `"Bora!Beleza"` (shape diferente, eco de quick-reply — segue em aberto se
   reincidir). Ver `docs/correcoes/done/fix-102-assistant-texto-duplicado-eco.md`.

## Regressão
FIX-102: Camada 1 estrutural — `collapse-self-duplicate.test.ts` (8 casos, incl.
anti-falso-positivo) + `runner.fix-102-collapse-dup.test.ts` (wiring). NÃO é
comportamento de prompt (a mitigação é determinística) → sem cassette.
