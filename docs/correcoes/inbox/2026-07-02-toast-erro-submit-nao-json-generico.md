# Bug — Toast de erro do submit mostra "HTTP 502" genérico quando a resposta não é JSON

- **Data:** 2026-07-02 (QA dono-de-produto em PROD)
- **Origem:** FIX-205 (tela admin de templates). Card mãe: `2026-07-02-whatsapp-template-submit-sync-quebrados-prod.md`.
- **Severidade:** baixa/média — UX; o operador não recebe orientação útil quando a falha vem do gateway (não-JSON).

## Cenário
Submeter à Meta falha com um 502 do Cloudflare (resposta `text/html`, não JSON da app). O toast exibe apenas **"Falha ao submeter: HTTP 502"** — sem indicação de que é indisponibilidade de serviço nem o que fazer.

## Esperado × Atual
- **Esperado:** quando `res.json()` falha (resposta não-JSON) ou o status é 5xx de gateway, mostrar mensagem amigável — "Serviço temporariamente indisponível ao falar com a Meta. Tente novamente em instantes." — em vez de "HTTP 502".
- **Atual:** `template-row-actions.tsx` faz `body.message ?? body.error ?? HTTP ${res.status}`; com 502 do Cloudflare o body é HTML → `.catch(() => ({}))` → cai no genérico "HTTP 502".

## Evidência
- Screenshot: `_evidencia/2026-07-02-whatsapp-template-submit-502.png` (toast "Falha ao submeter: HTTP 502").
- Raw fetch do submit → 502 `content-type: text/html`.

## Onde mexe (provável)
- `src/components/admin/whatsapp-templates/template-row-actions.tsx` — em `confirmSubmit`, checar `res.headers.get('content-type')`/status e usar cópia amigável quando não-JSON ou 5xx de gateway.
- (Opcional) mesmo tratamento no `template-form-dialog.tsx` e no botão "Sincronizar status".

## Tratamento
TDD component/unit: mock de fetch retornando 502 com body HTML → esperar a mensagem amigável no estado de erro. Structural.
