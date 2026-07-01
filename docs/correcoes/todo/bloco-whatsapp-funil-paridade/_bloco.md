---
bloco: bloco-whatsapp-funil-paridade
branch: fix/whatsapp-funil-paridade
workspace: fix-whatsapp-funil-paridade
project: tb-aja-agora
onda: 1
depends_on: []
paralelo_com: [bloco-entrada-welcome-upload, bloco-mesa-transbordo-auto]
itens: [FIX-116, FIX-117, FIX-118, FIX-119, FIX-120]
escopo_arquivos:
  - src/lib/whatsapp/interactive-handlers.ts
  - src/lib/whatsapp/formatter.ts
  - src/lib/whatsapp/adapter.ts
  - src/lib/bevi/contract-summary.ts
  - src/lib/agent/qualify-config.ts
---
# Bloco — Paridade do funil de vendas no WhatsApp (auditoria jornada 2026-07-01)

5 quebras de paridade web↔WhatsApp descobertas na auditoria código×jornada
(Mapa em `docs/jornada/jornada-canonica.md`): um fix foi aplicado só no canal web e
o WhatsApp ficou pra trás. Todos no fluxo WhatsApp reveal→decisão→fechamento, nos
mesmos 2-3 arquivos (`interactive-handlers.ts` + `formatter.ts`) → 1 dev, edição
sequencial sem conflito interno.

## Ordem interna
1. **FIX-116** (D11) — WhatsApp para de prometer "assinatura" (paridade DES-1).
2. **FIX-117** (D18) — "Tenho interesse" = avanço direto ao contract (paridade FIX-38).
3. **FIX-118** (D19) — educação de lance embutido pra no/maybe (paridade FIX-92).
4. **FIX-119** (D22) — "Ver outras opções" determinístico (buildOtherOptions).
5. **FIX-120** (D5) — valor do bem por conversa (não lista de faixas); reusar `parse-asset-value.ts` (FIX-115).

Disjunto dos blocos entrada-welcome-upload e mesa-transbordo-auto (arquivos diferentes).
A **regra é a jornada canônica** — cada fix leva o WhatsApp à paridade com o web já corrigido.
