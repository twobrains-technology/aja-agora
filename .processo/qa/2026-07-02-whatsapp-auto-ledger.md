# Ledger QA — jornada auto WhatsApp (prod) — 2026-07-02

**Escopo:** jornada auto no canal WhatsApp via simulador interno, ambiente PRODUÇÃO (`ajaagora.com.br`).
**Resultado:** BLOQUEADO na largada — simulador dev-only não roda em prod. Jornada não dirigida.

| # | Cenário | Origem | Tipo | Status | Card / artefato | Último resultado |
|---|---|---|---|---|---|---|
| 1 | Abrir `/admin/simulator/whatsapp` em prod e criar conversa | roteiro (escopo) | BLOQUEIO | ⛔ blocked | — | Página renderiza mas APIs dão 404 (`isSimulatorEnabled` false em `TB_ENV=production`). Nova conversa (POST) → 404. |
| 2 | Guard da página do simulador em prod | achado colateral | DEFEITO | 📝 anotado | `inbox/2026-07-02-simulador-page-guard-estatico-prod.md` | Guard `notFound()` é build-time (prerender estático, `x-nextjs-cache: HIT`) → não bloqueia a página em runtime; expõe UI + "HTTP 404" cru. |
| 3 | Override reversível pra habilitar simulador sem degradar segurança | necessidade (opção Kairo) | MELHORIA/FERRAMENTA | ✅ implementado (branch) | `src/lib/utils/env.ts` + `env.test.ts` | `SIMULATOR_FORCE_ENABLE` (TDD, 11/11 verde). NÃO deployado. |
| 4 | Jornada auto WhatsApp passos 1–5 | roteiro | — | ⏸️ não executado | `docs/qa/roteiro-qa.md` | Aguarda ambiente com simulador (DEV/local) ou decisão de deploy do flag. |

## Notas
- `/api/chat/reset` (11/jun) = 200 em prod → prod tem código recente; não é build velho.
- Flip de `TB_ENV` descartado: `recovery.ts:116` vazaria devCode do OTP em prod.
- Contas de teste (CONTA1 Kairo) obtidas via `secrets.sh decrypt contas-teste`; não usadas (jornada bloqueada); env apagado ao fim.
- Decisão pendente do Kairo: deployar `SIMULATOR_FORCE_ENABLE` em prod (gera dados reais) vs rodar QA em DEV/local.
