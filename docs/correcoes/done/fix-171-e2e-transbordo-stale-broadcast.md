---
id: FIX-171
titulo: "E2E golden-path do transbordo estava STALE (testava single-select removido pelo FIX-124)"
status: done
executado_em: 2026-07-01
severidade: alta
projeto: aja-agora
rodada: 2026-07-01 — QA autônomo Frente 3 (mesa de operação), ancorado na onda divergencias-jornada (develop 4c8a81c5)
arquivos: [tests/e2e/specs/admin-mesa-transbordo/golden-path.spec.ts, playwright.config.ts]
tipo: stale-test-fix
mexe_em: [src/components/admin/pipeline/mesa-transbordo-dialog.tsx, src/app/api/admin/leads/[id]/transbordo/route.ts]
---

## Origem
QA autônomo da mesa. A spec E2E golden-path do transbordo do kanban (escrita no QA de
2026-06-22, **antes** da onda) ficou **stale**: testava o fluxo **single-select** de atendente
(um `<Select>` "Atendente de mesa" + handoff nascendo COM dono) que o **FIX-124 REMOVEU**. O
transbordo agora é **broadcast a TODOS** (sem escolher atendente) e o handoff nasce **SEM dono**
(o 1º que clica "Vou atender" assume via claim). A spec apontava pra rede de regressão errada —
iria vermelha se rodada, mas E2E não roda no pre-commit gate, então ficou silenciosamente quebrada.

## Cenário exato (ver FALHAR — TDD)
Rodada no container (chromium Alpine + base URL `http://aja-mesa-operacao.orb.local` pra casar
`trustedOrigins` do better-auth), a spec ANTIGA falhava com a assinatura exata do stale:
```
locator.click: Test timeout — waiting for getByRole('combobox', { name: 'Atendente de mesa' })
  132 | await page.getByRole("combobox", { name: "Atendente de mesa" }).click();
```
O combobox não existe mais (removido pelo FIX-124). Login/kanban/abertura do dialog funcionavam;
só o passo do single-select morto quebrava.

## Esperado × Atual
- **Atual (era):** spec testa combobox + `option` + assertion `att_nome: ATT_NOME` (dono no INNER
  JOIN mesa_attendants) — reflete o produto pré-onda.
- **Esperado:** spec reflete o fluxo broadcast — confirma sem escolher atendente, assert de VALOR
  no DB = handoff `status='aberto'`, `mesa_attendant_id IS NULL` (sem dono), administradora
  resolvida pela cota.

## Correção (o quê × onde)
| O quê | Onde |
|-------|------|
| Reescrita da spec pro fluxo broadcast: remove combobox/option; confirma via botão do dialog (escopado pelo nome acessível — o painel do lead também é `role=dialog`); assert `mesa_attendant_id IS NULL` + `status='aberto'` + administradora resolvida | `tests/e2e/specs/admin-mesa-transbordo/golden-path.spec.ts` |
| Infra pra rodar E2E no container Alpine: `launchOptions.executablePath` via `PW_EXECUTABLE_PATH` + `--no-sandbox`; `video` off quando `PW_EXECUTABLE_PATH` setado (Alpine sem ffmpeg). **Gated/inerte** no host/CI (env vazia → browser padrão do Playwright) | `playwright.config.ts` |

## Provisionamento (§4.2.2 — não parar por falta de estado)
DB fresco não tinha admin. Semeado via better-auth sign-up API (`/api/auth/sign-up/email`) +
`UPDATE "user" SET role='admin'` (como o `seed-admin.ts` faz). Atendente/lead/proposta seedados
no `beforeAll` da spec, limpos no `afterAll`.

## Verificação
- Spec ANTIGA (stale): VERMELHA no combobox (assinatura confirmada).
- Spec NOVA: **VERDE** (2.1s) — golden path completo com assertion de VALOR no DB.
- Sibling `admin-mesa-cadastros/golden-path.spec.ts`: verde (não-stale, atendente CRUD não mudou).

## Nota de contrato (memória `project_transbordo_kanban_contrato_shape`)
O contrato dialog↔API do fluxo novo (body VAZIO sem `mesaAttendantId`) já está congelado no
component test `mesa-transbordo-dialog.test.tsx` e na integration da rota — esta E2E cobre o elo
browser ponta-a-ponta (kanban → dialog → POST → handoff no DB).
