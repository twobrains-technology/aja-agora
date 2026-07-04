---
bloco: bloco-jornada-conversa
branch: feat/jornada-conversa-reserva
workspace: feat-jornada-conversa-reserva
onda: 1
depends_on: []
paralelo_com: [bloco-descoberta-busca, bloco-cards-recomendacao]
itens: [FIX-216, FIX-217, FIX-215]
escopo_arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/qualify-config.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/app/api/chat/route.ts
  - src/lib/whatsapp/interactive-handlers.ts
  - src/lib/whatsapp/adapter.ts
  - src/lib/whatsapp/identify-capture.ts
  - src/lib/whatsapp/formatter.ts
  - src/lib/web/adapter.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/chat/types.ts
  - src/lib/bevi/discovery-session.ts
  - src/components/chat/artifacts/contract-form.tsx
  - src/components/admin/whatsapp-templates/template-form-dialog.tsx
conflitos_esperados:
  - "directives.ts + system-prompt.ts: tocados também pelo bloco-cards-recomendacao (reordenar 3 blocos / modelo embutido). REGIÕES diferentes (nível 2). Ordem de merge: este bloco ANTES do bloco-cards — o cards forka da base já com a conversa integrada e resolve o conflito residual."
  - "qualify-config.ts: bloco-descoberta-busca toca CREDIT_BOUNDS/clamp (regiões diferentes das de COLLECTION_GATES/lance). Nível 2."
---
# Bloco Jornada-Conversa — remover lance do início · copy reserva de cota · form WhatsApp

**Superfície:** fluxo conversacional + copy + renderização por canal (a mesma família de
arquivos: `route.ts`, `interactive-handlers.ts`, `formatter.ts`, `qualify-state.ts`,
`system-prompt.ts`). Agrupados num bloco só pra editar sequencialmente e evitar conflito
entre si.

## Itens (ordem de execução)
1. **FIX-216** — copy "reserva de cota" (11 edits + booking + wording de reserva concluída). Mecânico, baixo risco — faz primeiro pra assentar as strings.
2. **FIX-217** — WhatsApp: form de identidade vira gate determinístico (P0 bug de canal). Pede só CPF (celular é auto).
3. **FIX-215** — remover a pergunta de lance do início + reorder (busca direto após valor) + mover conversa de lance pra pós-reveal. É o maior e mais arriscado (reverte a colocação de FIX-92/118/212) — faz por último, com o resto já assentado.

## Regra da jornada (ler antes)
`docs/jornada/jornada-canonica.md` foi atualizado com a seção **"Refino Ata 2026-07-04"** —
ela é a REGRA nova (lance sai da entrada; terminologia reserva de cota). Implemente contra ela.
