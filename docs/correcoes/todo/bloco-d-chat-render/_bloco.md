---
bloco: bloco-d-chat-render
branch: fix/chat-render-ux
workspace: fix-chat-render-ux
onda: 1
depends_on: []
paralelo_com: [bloco-a-funil-qualificacao, bloco-c-infra-teste]
itens: [FIX-93, FIX-94]
escopo_arquivos:
  - src/components/chat/theater/resume-prompt.tsx
  - src/components/chat/theater/resume-prompt.test.tsx
  - src/lib/agent/orchestrator/runner.ts
  - src/components/chat/chat-message.tsx
conflitos_esperados:
  - "Disjunto dos blocos A e C. FIX-94 toca runner.ts/chat-message.tsx (não tocados por A/C). Risco residual: se FIX-89 (Bloco C, typecheck) tocar algum test de chat, conflito mecânico nível 2 — improvável."
---
# Bloco D — Render/UX do chat (2 bugs visuais)

Dois defeitos de **renderização do chat** observados na travessia E2E, independentes
entre si e do resto da onda. Pacote pequeno pra um dev.

## Ordem interna
1. **FIX-93** — modal de resume coberto pelo `chat-theater` (z-index): `DialogContent` do `ResumePrompt` é z-50, o theater é z-[90] → popup fica atrás e inclicável, trava o usuário de retorno. Elevar o `DialogContent` pra z-[110] (1 linha + teste estrutural que extrai o z-index e compara > 90). **Alta severidade** (bloqueia retorno same-device).
2. **FIX-94** — eco/duplicação de texto do assistant (`"Boa...Boa..."`, `"Bora!Beleza"`). Causa cravada: degeneração NÃO-determinística da LLM (1 ocorrência em todo o DB de homologação), não bug de append. Mitigação decidida no card = **guarda defensiva determinística** colapsando segmentos/parágrafos 100% idênticos consecutivos antes de persistir/renderizar (`runner.ts` ou `groupAdjacentText` em `chat-message.tsx`). Trata o sintoma `"Boa...Boa..."`; é testável (Camada 1). **Baixa severidade** (cosmético, raro).

## Regressão
FIX-93: Camada 1 estrutural (happy-dom) — `DialogContent` renderiza com z-index > 90.
FIX-94: Camada 1 estrutural — a guarda colapsa segmento duplicado consecutivo. NÃO é
comportamento de prompt (a mitigação é determinística) → cassette opcional.
