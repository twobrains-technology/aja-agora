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
  - src/components/chat/artifacts/ (identify/lead form — autofocus padronizado, decisão 2026-06-11)
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

**✅ GATE DE ENTRADA RESOLVIDO (conversa com o Kairo, 2026-06-11)** — decisões
registradas na seção "Decisão" de cada item: FIX-17 = autofocus padronizado em
todos os forms + coexistência card/texto-livre; FIX-18 = confronto em ambos
(picker com estimativa + reveal com números reais), tom que guia sem empurrar.

Ordem interna: FIX-17 → FIX-18 (independentes; nome primeiro por ser menor).

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-m-ux-funil/ na ordem FIX-17 → FIX-18. As decisões
> de desenho estão na seção "Decisão" de cada item — siga-as à risca (FIX-17:
> autofocus em todos os forms, coexistência card/texto; FIX-18: confronto no
> picker E no reveal, tom guia-não-empurra). TDD strict, regressão
> nas 3 camadas (incl. cassettes), validação contra
> docs/jornada/jornada-canonica.md. NÃO tocar em contractFormToWhatsApp no
> formatter.ts (bloco K em paralelo). 1 commit test+feat: por item. Ao
> concluir cada item, mover pra done/ com status/commit/executado_em. Bloco
> vazio → apagar a pasta.
