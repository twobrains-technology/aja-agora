---
bloco: bloco-entrada-welcome-upload
branch: fix/entrada-welcome-upload
workspace: fix-entrada-welcome-upload
project: tb-aja-agora
onda: 1
depends_on: []
paralelo_com: [bloco-whatsapp-funil-paridade, bloco-mesa-transbordo-auto]
itens: [FIX-121, FIX-122]
escopo_arquivos:
  - src/lib/web/adapter.ts
  - src/app/api/webhook/whatsapp/route.ts
  - src/lib/whatsapp/formatter.ts
  - src/lib/storage/index.ts
---
# Bloco — Entrada (welcome) + upload de documento no WhatsApp (auditoria jornada 2026-07-01)

2 divergências pequenas de canal que sobraram da auditoria, ambas de "entrada/mídia":
o welcome do chat web ainda tem uma 4ª categoria que a jornada/WhatsApp/landing não
têm, e o upload de documento pelo WhatsApp está quebrado (o webhook ignora imagem).

## Ordem interna
1. **FIX-121** (D21) — welcome do chat web com 3 categorias (tirar "Outros"/serviços); a
   decisão canônica (moto substitui serviços) já vale no WhatsApp e na landing.
2. **FIX-122** (D13) — handler de mídia inbound no webhook WhatsApp (a copy convida "manda
   a foto aqui", mas a imagem é dropada como "Unhandled type").

Disjunto dos outros blocos. FIX-121 toca só `web/adapter.ts` (welcome); FIX-122 toca o
webhook + storage. Sem overlap com `whatsapp-funil-paridade` (aquele mexe em
interactive-handlers/formatter, não no webhook nem no welcome web).
