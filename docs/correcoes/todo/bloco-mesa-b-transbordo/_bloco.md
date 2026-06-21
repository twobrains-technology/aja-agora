---
bloco: bloco-mesa-b-transbordo
branch: feat/mesa-transbordo
workspace: feat-mesa-transbordo
onda: 2
depends_on: []
paralelo_com: [bloco-mesa-a-cadastros, bloco-mesa-c-copiloto]
itens: [FIX-64, FIX-65]
escopo_arquivos:
  - src/components/admin/pipeline/lead-detail-panel.tsx
  - src/components/admin/pipeline/mesa-transbordo-dialog.tsx
  - src/app/api/admin/leads/[id]/transbordo/
  - src/lib/mesa/handoff.ts
  - src/lib/whatsapp/mesa/outbound.ts
---
# Bloco Mesa-B — transbordo no kanban → WhatsApp do atendente

Botão no card do kanban que transborda o caso pra um atendente de mesa, registra o handoff e
manda o dossiê + orientação pro WhatsApp dele. **Não toca o `processor.ts`** (inbound é do bloco C)
nem os cadastros (bloco A).

## Nível de paralelismo
- Nível 3 (contrato via DB) com A: lê `mesa_attendants`/`administradoras` (schema fixo). Semeia
  dados de teste via insert direto — NÃO depende do CRUD de A em runtime.
- Nível 1 com C em arquivos: B cria `src/lib/whatsapp/mesa/outbound.ts`; C cria
  `src/lib/whatsapp/mesa/routing.ts`. Se ambos criarem um `mesa/index.ts` barrel → nível 2
  (mecânico). Prefira NÃO criar barrel pra evitar até isso.

## Ordem interna
FIX-64 (botão + registro handoff) → FIX-65 (outbound: dossiê pro WhatsApp do atendente).
