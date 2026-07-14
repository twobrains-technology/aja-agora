---
bloco: bloco-c-whatsapp-invariantes
branch: fix/whatsapp-invariantes
workspace: fix-whatsapp-invariantes
onda: 1
depends_on: []
paralelo_com: [bloco-a-fallback-enlatado, bloco-b-reveal-web]
itens: [FIX-336, FIX-337, FIX-338, FIX-339, FIX-340]
escopo_arquivos:
  - src/lib/whatsapp/adapter.ts
  - src/lib/whatsapp/formatter.ts
  - src/lib/whatsapp/interactive-handlers.ts
  - src/lib/whatsapp/identify-capture.ts
  - src/lib/whatsapp/proxy.ts
  - src/lib/agent/orchestrator/whatsapp-optin-guard.ts
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/system-prompt.ts
conflitos_esperados: "nível 2 com bloco-b em system-prompt.ts e sanitizer.ts (regiões diferentes). Mergear por ÚLTIMO."
---
# Bloco C — o WhatsApp (o canal tirou 3/10 e quebrou 2 invariantes)

Pacote de um dev só: todos os itens são do mesmo canal e tocam os mesmos arquivos — separar
daria conflito garantido. Ordem: FIX-336 (o agente mente — o mais grave) → 337 (CPF vazando) →
339 (turno morto) → 338 (opt-in) → 340 (os três menores).
