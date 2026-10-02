---
id: FIX-438
titulo: "A régua alcança o lead da web: o silêncio conta da última fala do cliente"
status: done
bloco: regua-alcanca-o-lead-da-web
commit: 7dd71c8d
arquivos:
  - src/lib/remarketing/motivo-de-exclusao.ts
  - src/lib/remarketing/motivo-de-exclusao.test.ts
  - src/lib/remarketing/motor.ts
  - src/lib/remarketing/regua.ts
  - src/lib/remarketing/regua.test.ts
  - src/lib/workers/remarketing-cycle.ts
  - src/lib/workers/remarketing-cycle.integration.test.ts
  - src/lib/workers/remarketing-cycle.test.ts
  - src/lib/admin/regua-por-conversa.ts
  - src/lib/admin/regua-por-conversa.test.ts
  - src/lib/admin/regua-por-conversa.integration.test.ts
  - src/lib/admin/motivo-fora-da-regua.test.ts
  - src/lib/admin/remarketing-reentrada.ts
  - src/lib/admin/remarketing-reentrada.integration.test.ts
  - src/lib/remarketing/reentrada.ts
  - src/lib/remarketing/reentrada.test.ts
  - src/app/api/admin/conversations/route.ts
  - src/app/api/admin/conversations/route.regua-web.integration.test.ts
rodada: 2026-10-02
executado_em: 2026-10-02
---
## Palavras do operador
> "Devia ter rolado, porque isso foi meia-noite, já são 11 da manhã. Eu tinha que ter feito já o primeiro contato dos 90 minutos" (Bruna, 11:57:29)
> "esse daí é um caso bom pra mim testar aqui o porquê que o remarketing com ele não rolou... Deveria ter rolado já. Tipo, isso foi meia-noite." (Kairo, 11:57:18)

## O que estava no ar (medido)
Desde 18/09: **119 conversas web, 1 com `last_inbound_at`, zero na régua** (WhatsApp: 6, 5 na régua). A web
nunca grava `last_inbound_at`, então caía em "ainda_em_silencio". Lead 774 = `594e8850`/`e9a56c73`. O teste
da entrada web era **falso-verde**: a fixture gravava `lastInboundAt` para web.

## O que mudou (D9)
"Silêncio do cliente" e "janela de 24h da Meta" passam a ser **dois fatos separados**:

- **Silêncio** — na web, a última fala do cliente (`messages.role='user'`); no WhatsApp, o próprio
  `last_inbound_at` (inalterado). É `referenciaDoSilencio` em `motivo-de-exclusao.ts`, a fonte única da regra
  por canal.
- **Janela de 24h** — continua de `last_inbound_at`, que só o webhook do WhatsApp escreve; por isso conversa
  web vai **sempre** por template.

A tela (`regua-por-conversa.ts`/`motivo-fora-da-regua.ts`) e o worker usam a MESMA função
(`avaliarElegibilidade`). A **ordenação** de candidatos passou a `coalesce(last_inbound_at, fala, created_at)`
com `ORDER BY … DESC NULLS LAST`, para o `LIMIT` não descartar a web por ela não ter a coluna. Na **B7b**
(commit `5664ca57`) a lista de Conversas (`route.ts`) e a reentrada manual (`reentrada.ts`,
`remarketing-reentrada.ts`) passaram a ler a mesma última fala — mesmo veredito do worker.

## Provado
- Integração (reproduz o lead 774): conversa web, `last_inbound_at` NULL, contato com telefone válido, fala
  do cliente às 00:00 BRT, `REMARKETING_ATIVO=1` e `REMARKETING_ENTRADA_WEB=true` ⇒ entra na régua com
  próximo toque às 01:30 e dispara como **template** às 09:00. A fixture não grava mais `lastInboundAt` para
  web. Sem a flag web ⇒ "conversa_web". Disparo **mockado**.
- `pnpm -s vitest run src/lib/remarketing src/lib/workers/remarketing-cycle src/lib/admin/regua-por-conversa src/lib/admin/motivo-fora-da-regua`
  → **12 arquivos / 244 testes verdes** (B7); `pnpm -s vitest run src/app/api/admin/conversations src/lib/remarketing/reentrada src/lib/admin/remarketing-reentrada src/lib/admin/regua-por-conversa`
  → **10 arquivos / 69 testes verdes** (B7b); `typecheck` exit 0.

## PENDENTE-KAIRO (deploy)
Ao subir, os leads web com telefone dos últimos 7 dias que nunca receberam toque entram de uma vez — o chefe
mede quantos antes de entregar.