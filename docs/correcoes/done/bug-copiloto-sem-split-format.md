---
id: BUG-copiloto-sem-split-format
titulo: "Copiloto envia reply cru ao WhatsApp — sem split (4096) nem formato"
status: done
executado_em: 2026-06-21
origem: QA noturno 2026-06-21 (achado adversarial na superfície do merge mesa-copiloto)
rodada: 2026-06-21 qa-noturno pós-merge develop
arquivos:
  - src/lib/whatsapp/mesa/routing.ts
---
# BUG — copiloto manda reply cru pro WhatsApp

## Cenário
Atendente de mesa manda dúvida → `handleMesaCopilot` chama o copiloto → envia a resposta
com `sendTextMessage(from, reply)` **cru**.

## Esperado × Atual
- **Esperado:** igual ao caminho de vendas (`adapter.ts`), aplicar `formatTextForWhatsApp`
  (markdown `##`/`**` → formato WhatsApp, strip de marcadores de sistema) e `splitMessage`
  (chunks ≤ 4096) antes de enviar — WhatsApp rejeita mensagem > 4096 chars.
- **Atual:** envia o texto cru numa única `sendTextMessage`.

## Evidência
- `adapter.ts:115-124`: `formatTextForWhatsApp(textBuffer)` → `splitMessage(formatted)` →
  envia cada chunk. `sendTextMessage` (api.ts) NÃO trata tamanho.
- `routing.ts handleMesaCopilot`: `await sendTextMessage(from, reply)` — sem format/split.
- Smoke real do copiloto retornou markdown literal (`## Primeiro passo`, `**portal...**`) —
  apareceria cru pro atendente. Orientação passo-a-passo de manual passa fácil de 4096.

## Causa
O caminho do copiloto não reusa o pipeline de saída do WhatsApp do projeto.

## Correção (inline, TDD)
Em `handleMesaCopilot`: persistir o reply CRU em `mesa_copilot_messages` (histórico = palavras
reais do agente) e, ao ENVIAR, aplicar `formatTextForWhatsApp` + `splitMessage`, enviando chunk
a chunk — igual ao caminho de vendas.

## Regressão exigida
- Integration: reply longo (>4096) → múltiplos `sendTextMessage`, cada chunk ≤ 4096; markdown
  convertido (sem `##`/`**`). Persistência mantém 1 linha assistant com o reply cru.
