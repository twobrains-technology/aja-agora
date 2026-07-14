---
bloco: bloco-g-consent-wa-fallback
branch: fix/consent-wa-fallback
workspace: fix-consent-wa-fallback
onda: 1
depends_on: []
paralelo_com: [bloco-f-turno-vazio-meta]
itens: [FIX-349, FIX-350]
escopo_arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/system-context.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/whatsapp/adapter.ts
conflitos_esperados: "nível 2 com bloco-f (sanitizer.ts, directives.ts). Mergear DEPOIS do bloco-f."
---
# Bloco G — o consentimento que sumiu no WhatsApp + o último fallback

Ordem: FIX-349 (paridade do consent) → FIX-350 (fallback + evasão).
