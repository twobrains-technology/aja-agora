---
bloco: bloco-m-ux-funil
branch: feat/ux-funil-nome-e-viabilidade
workspace: feat-ux-funil-nome-e-viabilidade
onda: 1
depends_on: []
paralelo_com: [bloco-k-fechamento-whatsapp, bloco-l-qualidade-observabilidade]
itens: [FIX-17, FIX-18]
escopo_arquivos:
  - src/lib/chat/ui-message.ts
  - src/components/chat/artifacts/name-prompt.tsx (novo)
  - src/components/chat/artifacts/name-prompt.test.tsx (novo)
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/plan-estimate-picker.tsx
  - src/lib/consorcio/plan-estimate.ts
  - src/lib/web/adapter.ts
  - src/lib/agent/orchestrator/detect-name-turn.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/whatsapp/formatter.ts (região do name-prompt)
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "src/lib/whatsapp/formatter.ts: nível 2 com bloco-k (M na degradação do name-prompt; K em contractFormToWhatsApp ~linha 1023 — regiões distantes, merge mecânico)"
  - "tests/regression/agent-trajectory.test.ts: nível 2 append-only com K"
ordem_merge_recomendada: "K antes de M (ou vice-versa — conflitos são mecânicos)"
---

# Bloco M — UX do funil (consolida ex-blocos E + F)

Agrupamento por afinidade: os dois itens mexem na experiência do funil de
qualificação E ambos tocam `system-prompt.ts` — juntos na mesma sessão, o
conflito que existiria entre eles desaparece.

**⚠️ GATE DE ENTRADA: conversar com o Kairo ANTES de lançar.** Decisões
abertas (registrar a resolução na seção "Decisão" de cada item):
- FIX-17: autofocus vs foco do chat; coexistência texto-livre; padronizar
  autofocus nos demais forms?
- FIX-18: onde confrontar a inviabilidade (picker, reveal ou ambos) e o tom
  da narrativa (docx: agente guia, não empurra).

Ordem interna: FIX-17 → FIX-18 (independentes; nome primeiro por ser menor).

## Prompt de lançamento (colar na sessão do Superset — SÓ após conversa)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-m-ux-funil/ na ordem FIX-17 → FIX-18. Antes de
> codar, confirme que a seção "Decisão" de cada item registra a conversa com
> o Kairo — se não estiver registrada, PARE e avise. TDD strict, regressão
> nas 3 camadas (incl. cassettes), validação contra
> docs/jornada/jornada-canonica.md. NÃO tocar em contractFormToWhatsApp no
> formatter.ts (bloco K em paralelo). 1 commit test+feat: por item. Ao
> concluir cada item, mover pra done/ com status/commit/executado_em. Bloco
> vazio → apagar a pasta.
