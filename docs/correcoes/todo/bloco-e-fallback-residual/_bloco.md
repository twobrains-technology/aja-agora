---
bloco: bloco-e-fallback-residual
branch: fix/fallback-residual-optin
workspace: fix-fallback-residual-optin
onda: 1
depends_on: []
paralelo_com: [bloco-d-alucinacao-oferta]
itens: [FIX-343, FIX-344]
escopo_arquivos:
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/bevi/closing-presentation.ts
  - src/lib/whatsapp/interactive-handlers.ts
conflitos_esperados: "nível 2 com bloco-d (sanitizer.ts). Mergear DEPOIS do bloco-d."
---
# Bloco E — o fallback que não morreu + o opt-in que voltou por outra porta

Os dois itens têm a mesma lição: **blindar um caminho não basta quando o comportamento é montado
em outro lugar**. Ordem: FIX-343 (o sintoma-mor) → FIX-344.
