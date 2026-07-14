---
id: FIX-335
titulo: "Meta-narrativa no reveal: 'Agora vou te recomendar a mais adequada', 'Agora vou detalhar como fica sua simulação'"
status: todo
bloco: bloco-b-reveal-web
arquivos:
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/sanitizer.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
---

# FIX-335 — o agente narra o próprio pipeline

## Cenário (4/4 dossiês web)
> "Encontramos 23 boas opções pra você! **Agora vou te recomendar a mais adequada:**"
> "**Agora vou detalhar como fica sua simulação:**"

Soa como log de execução, não como gente vendendo. O juiz: *"as 4 conversas soam como um log
de pipeline"*.

## Root cause
O prompt já proíbe narrar mecânica ("vou buscar", "deixa eu usar a ferramenta"), e o sanitizer
tem `isMechanismNarrationClaim` — mas o padrão "Agora vou <ação de produto>" escapa: não é
mecânica de ferramenta, é anúncio de passo.

## Correção proposta
| O quê | Onde |
|---|---|
| Directives do reveal param de descrever a sequência ("(1) escreva… (2) chame…") de um jeito que o modelo ecoa como narração | `directives.ts` (search-summary / recomendação) |
| Guard: "agora vou te <verbo>" / "agora vou detalhar" entra na família de narração de processo | `sanitizer.ts` (`isProcessPreamble`) |

⚠️ Cuidado pra não virar mordaça: o objetivo é o agente **fazer** em vez de **anunciar**, não
ficar mudo. Não adicione mais proibição do que o necessário.

## Regressão exigida
- Unit: sanitizer dropa "Agora vou te recomendar a mais adequada:".
