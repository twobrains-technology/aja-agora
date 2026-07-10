---
id: FIX-244
titulo: "Server aceita contract-submit sem contract_form ter sido emitido"
status: todo
bloco: bloco-r2-valor-compliance
arquivos: [src/app/api/chat/route.ts]
rodada: 2026-07-10 rodada 2 (Fable r1, gap P2 #9)
---

## Gap (veredito Fable §D3.2 nota, gap #9)
O handler `contract-submit` (route.ts) ACEITA o fechamento mesmo que o `contract_form` NUNCA
tenha sido apresentado (o Fable fechou uma proposta atirando contract-submit cru numa conversa
que nunca viu o form). Falta validação de estado do funil.

## Correção
- No handler `contract-submit`: exigir que o funil tenha emitido `present_contract_form` (flag no
  meta, ex.: `contractFormDispatched`) antes de aceitar o submit. Sem isso → rejeitar/re-emitir o form.

## Regressão (TDD)
- contract-submit sem contract_form emitido → rejeitado (não fecha proposta).
- fluxo normal (form emitido → submit) → aceita.
