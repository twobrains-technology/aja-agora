---
slug: e2e-web-resume-fix51-popup
titulo: "E2E web-resume FIX-51 (popup 'Continuar de onde você parou') não aparece — backend OK, componente intocado"
status: inbox
severidade: baixa
projeto: aja-agora
rodada: 2026-06-29 — QA autônomo da onda de revisão (modelo errado)
evidencia: []
mexe_em:
  - tests/e2e/specs/web-resume/same-device.spec.ts
  - src/components/chat/theater/resume-prompt.tsx
---

## Palavras do operador
> (achado do QA autônomo. NÃO é regressão da onda de revisão.)

## Cenário
- `web-resume/same-device.spec.ts` → 2 testes FIX-51 falham (`:92` e `:111`): com cookie `aja_uid` + conversa com progresso seedada, ao abrir o teatro o popup `getByText(/Continuar de onde você parou/i)` não fica visível (timeout 15s). O snapshot mostra a landing.
- Os outros 4 do arquivo passam (inclusive "primeira vez sem cookie → sem popup").

## Esperado × Atual
- **Esperado:** cookie + `meaningfulProgress:true` → popup de retomada aparece.
- **Atual:** popup não aparece no E2E.

## Pista de causa (parcial — NÃO é regressão da revisão)
Provado: (1) o backend `GET /api/chat/resume` retorna `{messageCount:4, meaningfulProgress:true}` corretamente com o cookie seedado (testado manual via psql+curl); (2) o componente `resume-prompt.tsx` **não foi tocado pela revisão** (último commit `bae59378`, anterior a `9cf78252`). Então backend e componente estão íntegros. Falta investigar o **disparo no frontend**: `openTheater` clica em "Começar" (que abre teatro com seed VAZIO, comentário do próprio spec) — talvez o popup deva ser aguardado no LOAD da página (antes do clique), ou o boot do teatro não monta o `resume-prompt` quando há cookie. Investigar o componente que decide montar o popup (quem chama `/api/chat/resume` no client e passa pro `resume-prompt`). O spec tem nota "rodar numa máquina ociosa pra fechar cobertura" — pode nunca ter passado verde.
