---
bloco: bloco-mesa-c-copiloto
branch: feat/mesa-copiloto
workspace: feat-mesa-copiloto
onda: 2
depends_on: []
paralelo_com: [bloco-mesa-a-cadastros, bloco-mesa-b-transbordo]
itens: [FIX-66, FIX-67]
escopo_arquivos:
  - src/lib/whatsapp/processor.ts
  - src/lib/whatsapp/mesa/routing.ts
  - src/lib/agent/mesa-copilot/
  - tests/regression/agent-trajectory.test.ts
---
# Bloco Mesa-C — agente copiloto de operação (WhatsApp do atendente)

O copiloto que orienta o atendente de mesa a fazer o contrato na administradora, com o PDF
daquela administradora injetado. Roteia mensagens vindas do número de um atendente de mesa pro
copiloto (≠ vendas). **Toca o `processor.ts`** (hook inbound) — bloco B NÃO toca, então sem colisão.

## Nível de paralelismo
- Nível 1 com A e B em arquivos. Único arquivo compartilhado POSSÍVEL: `src/lib/whatsapp/mesa/`
  (B cria `outbound.ts`, C cria `routing.ts` — arquivos distintos). E
  `tests/regression/agent-trajectory.test.ts` é append-only (nível 2 mecânico) — adicione um
  `describe` novo no fim, não edite os existentes.
- Lê `administradora_docs.texto_extraido` (schema fixo) — contrato via DB.

## Ordem interna
FIX-66 (roteamento inbound + persistência) → FIX-67 (agente copiloto + injeção PDF + cassette).
