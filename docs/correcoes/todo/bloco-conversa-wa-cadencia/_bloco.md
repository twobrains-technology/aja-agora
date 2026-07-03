---
bloco: bloco-conversa-wa-cadencia
branch: feat/conversa-wa-cadencia
workspace: feat-conversa-wa-cadencia
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-210, FIX-211, FIX-212]
escopo_arquivos:
  - src/lib/whatsapp/adapter.ts
  - src/lib/whatsapp/formatter.ts
  - src/lib/whatsapp/identify-capture.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/agent/gate-reengage.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/personas.ts
  - tests/regression/agent-trajectory.test.ts
---
# Bloco — Reforma de conversa no WhatsApp (Fase 1: qualificação)

Executa a **Fase 1** do spec `docs/design/specs/2026-07-02-conversa-whatsapp-cadencia-design.md`:
a qualificação (nome → consent → **identify (CPF)** → valor → lance/embutido) — onde está o
atrito que o Kairo viu no WhatsApp.

**Por que um bloco só (não paralelizar):** os três itens tocam os MESMOS arquivos
(`adapter.ts`, `identify-capture.ts`, `gate-questions.ts`, `formatter.ts`, `system-prompt.ts`) em
regiões sobrepostas. Separar em blocos paralelos = conflito de merge garantido. Um dev (uma sessão),
ordem interna explícita: **FIX-210 → FIX-211 → FIX-212**.

**Fonte de verdade:** o spec. Este bloco NÃO redefine a estratégia — implementa o que o spec já
decidiu (channel-aware, cadência 2-tempos, escada de cobrança, tom curto sem emoji). Critérios de
aceite = C1–C5 do spec.

**Restrição inviolável (do spec, C5):** é reforma do **WhatsApp**. A **web** usa componentes React
(`artifact-renderer.tsx`) — nenhuma mudança pode quebrar a renderização da web. Copy compartilhada
(`closing-presentation.ts`, `directives.ts`, `system-prompt.ts`, `gate-questions.ts`) só muda de
forma channel-aware; rodar os testes da web antes de pushar.

**Fora de escopo neste bloco:** reveal/recomendação (Fase 2) e fechamento (Fase 3). Não tocar
`closing-presentation.ts`, `contract-capture.ts`, `interactive-handlers.ts` além do estritamente
necessário à qualificação.
