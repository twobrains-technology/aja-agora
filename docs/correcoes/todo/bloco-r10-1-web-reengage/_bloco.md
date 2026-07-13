---
bloco: bloco-r10-1-web-reengage
branch: fix/r10-1-web-reengage
workspace: fix-r10-1-web-reengage
onda: 1
depends_on: []
paralelo_com: [bloco-r10-1-funil-reveal, bloco-r10-1-sanitizer-invariantes, bloco-r10-1-topicpicker-clarify]
itens: [FIX-302]
escopo_arquivos:
  - src/lib/workers/gate-reengage-poll.ts
  - src/lib/agent/gate-reengage.ts
  - src/app/api/chat/resume/route.ts
conflitos_esperados: "nenhum — único bloco totalmente disjunto desta onda."
---
# Bloco r10-1 — web-reengage (FIX-302)

Único item verdadeiramente paralelo (sem colisão com os demais blocos da onda). Reusa a escada de
reengajamento já existente e testada no WhatsApp — o trabalho é (a) remover o filtro de canal e
(b) ramificar a ENTREGA (WhatsApp continua via Meta API; web precisa de um caminho de entrega
proativa, já que não há `waId`).

## Decisão já resolvida (não re-perguntar)
Timeout no web: 90s, igual ao WhatsApp (reusa `GATE_REENGAGE_TIMEOUT_MS` sem ajuste).

## Referências obrigatórias
- `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md` (P8).
- Comentário existente em `gate-reengage-poll.ts:14-15` (já documentava o gap web como
  PENDENTE-KAIRO histórico).
