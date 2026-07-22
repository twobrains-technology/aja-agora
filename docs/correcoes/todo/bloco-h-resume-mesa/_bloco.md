---
bloco: bloco-h-resume-mesa
branch: fix/resume-stage-mesa
workspace: fix-resume-stage-mesa
onda: 2
depends_on: [bloco-g-remove-servicos]
paralelo_com: [bloco-i-vendedor-proativo]
itens: [FIX-364, FIX-365]
escopo_arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/chat/resume.ts
  - src/lib/bevi/proposal-repo.ts
  - src/app/api/chat/route.ts
  - src/lib/whatsapp/contract-capture.ts
  - src/lib/bevi/fecho-pedir-oi.ts
  - src/lib/mesa/handoff.ts
  - src/lib/whatsapp/mesa/notify.ts
  - src/lib/whatsapp/workers/proposal-status-poll.ts
---
# Bloco H — Resume reconhece fechamento + mesa notificada sem duplicar

**Onda 2 — depende do bloco G ter integrado** (o tipo `Category` do bloco G rippla em
`qualify-state.ts`, que este bloco também toca; fazer isso em cima da base já com o G
integrado evita conflito). Paralelo com o bloco I (arquivos não coincidem: este bloco toca
`qualify-state.ts`/`resume.ts`/fluxo de mesa; o bloco I toca `orchestrator/index.ts`/adapter
Bevi/gate de lance).

FIX-364 e FIX-365 estão no mesmo pacote por afinidade temática (ambos são sobre "o funil
reconhece corretamente o estado do lead"), embora toquem arquivos majoritariamente disjuntos
entre si — execute na ordem listada, mas são independentes um do outro.

**FIX-365 é principalmente um teste de regressão/idempotência, não uma feature nova** — as
peças de negócio (stage + notificação de mesa) já existem no código; não reimplemente do zero.
