---
bloco: bloco-r10-2-whatsapp-fecho
branch: fix/r10-2-whatsapp-fecho
workspace: fix-r10-2-whatsapp-fecho
onda: 2
depends_on: [bloco-r10-1-funil-reveal]
paralelo_com: [bloco-r10-2-bakeoff-regua]
itens: [FIX-303]
escopo_arquivos:
  - src/lib/agent/orchestrator/whatsapp-optin-guard.ts
  - src/lib/agent/orchestrator/index.ts
conflitos_esperados: "nenhum — onda 1 já integrada e pushada na base, este bloco forka dela."
---
# Bloco r10-2 — whatsapp-fecho (FIX-303)

Sequencial (onda 2): depende da estrutura final do branch de reveal/decision da onda 1, já
integrada e pushada em `integ/consorcio-r10` (`a70c9108`). Move o gatilho do opt-in de WhatsApp de
`revealCompleted` pra `contractFormDispatched` (proposta/fecho apresentado).

## Referências obrigatórias
- `docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html` (roteiro `FECHO`).
- ⚠️ Preservar FIX-294 (denylist optin do specialist) e FIX-295 (re-emite identify) — rodar
  `test:integration`, não só `test:unit`.
