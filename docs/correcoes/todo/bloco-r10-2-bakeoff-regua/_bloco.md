---
bloco: bloco-r10-2-bakeoff-regua
branch: fix/r10-2-bakeoff-regua
workspace: fix-r10-2-bakeoff-regua
onda: 2
depends_on: [bloco-r10-1-funil-reveal, bloco-r10-1-sanitizer-invariantes]
paralelo_com: [bloco-r10-2-whatsapp-fecho]
itens: [FIX-304]
escopo_arquivos:
  - scripts/bakeoff.sh
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/llm/gateway-openai.ts
conflitos_esperados: "possível overlap em sanitizer.ts com o que a onda 1 já fez (FIX-298/299) — checar se a capitalização já está coberta antes de reimplementar."
---
# Bloco r10-2 — bakeoff-regua (FIX-304)

Sequencial (onda 2): depende dos fixes de código da onda 1 (o bakeoff só faz sentido re-rodado
contra o funil já corrigido). Misto processo+código: re-rodar a régua de admissão de modelo e
investigar (sem cravar) a hipótese de chunking divergente no gateway OpenAI-compat.

## Referências obrigatórias
- `.bakeoff/qwen-jornada.log` (baseline atual, fluxoScore 0.774).
- `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md` (P9, P10).

## Cuidado
Antes de "corrigir" capitalização/emoji, CONFIRME que o FIX-299 (onda 1, já integrado na base) não
já cobre isso — leia `sanitizer.ts` atual primeiro. Não duplique.
