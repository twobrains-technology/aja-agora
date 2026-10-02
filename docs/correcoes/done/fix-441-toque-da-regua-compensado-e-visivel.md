---
id: FIX-441
titulo: "Toque da régua compensado, visível e com os códigos da Meta"
status: done
bloco: toque-da-regua-compensado-e-visivel
commit: 32535662
arquivos:
  - src/lib/remarketing/status-do-toque.ts
  - src/lib/remarketing/status-do-toque.test.ts
  - src/lib/workers/remarketing-cycle.ts
  - src/lib/workers/remarketing-cycle.envio.integration.test.ts
  - src/app/api/webhook/whatsapp/route.ts
  - src/lib/admin/remarketing-queries.ts
  - src/lib/whatsapp/template-dispatch.ts
  - src/db/schema.ts
  - drizzle/0063_tan_nuke.sql
  - drizzle/meta/0063_snapshot.json
  - drizzle/meta/_journal.json
  - src/lib/admin/remarketing-tela.ts
  - src/components/admin/remarketing/estado-na-lista.ts
rodada: 2026-10-02
executado_em: 2026-10-02
---
## Palavras do operador
> "manda a msg real" (Kairo, 02/10)
> "Devia ter rolado, porque isso foi meia-noite, já são 11 da manhã. Eu tinha que ter feito já o primeiro contato dos 90 minutos" (Bruna, 01/10 11:57:29)

## O que estava no ar (medido em produção)
A reentrada pôs 15 na régua; o ciclo das 14:00 carimbou **10 toques** (`disparados: 10`, `teto_30_dias: 5`).
O log tem `Status: sent` para 9 e `delivered` para 8, mas **1 falhou com 131049** (`8b8f3244`, final 6246) e
**perdeu a cota**. **Nenhuma linha em `messages`** — o template nunca era gravado; nenhuma mensagem de régua
foi persistida desde que ela existe. A cota de 30 dias era consumida sem o cliente receber.

## O que mudou (D12)
1. **Carimbo honesto com compensação.** O carimbo continua **antes** do envio (carimbar só depois do `wamid`
   abriria envio duplicado e irreversível), mas falha síncrona (`resolveAndSend` sem `messageId` ou com
   `error`) restaura step/`ultimo_toque_em`/`touches_30d` com `WHERE ultimo_toque_em = $agora` e empurra
   `next_touch_at` para um backoff. O `wamid` do sucesso fica em `remarketing_touches.ultimo_wamid`; o
   webhook de status `failed` devolve a cota de forma **idempotente** pelo `wamid`.
2. **Códigos da Meta** (`status-do-toque.ts`): **131049** devolve a cota e reagenda com backoff de dias;
   **131050/131026** encerram a régua (`motivo_saida`); demais falhas ⇒ compensação + backoff.
3. **O toque por template vira mensagem do assistente em `messages`** (`template_name` + texto renderizado),
   para o painel e o agente enxergarem o que foi enviado.
4. **O painel volta a enxergar os toques:** o `LIKE 'remarketing_oportunidade_%'` não casava as chaves reais
   `remarketing_<fase>_*`; passou a `LIKE 'remarketing_%'`.

Migration `0063` (`remarketing_touches.ultimo_wamid text`, `envio_status text`) gerada por `pnpm db:generate`
e aplicada no banco do workspace, conferida por `psql`. **Nenhum envio real** em teste (fetch da Meta
mockado).

### Complemento B12 (FIX-441, mesma frente) — commit `27f3ecee`
O B11 deixou a régua encerrada como `status=ESGOTADO` + `motivo_saida=recusado_pela_meta` (não existe status
terminal próprio para "a Meta recusou"). A tela, porém, mostrava "Esgotou os 3 toques" — **falso**. O bloco
**B12** faz a tela dizer **"A Meta recusou a entrega"** quando o par é esse, nunca o identificador cru.
Arquivos: `src/lib/admin/remarketing-tela.ts`, `src/components/admin/remarketing/estado-na-lista.ts`. Gate:
`pnpm -s vitest run src/lib/admin/remarketing-tela src/components/admin/remarketing` (43 verdes). Commit:
`27f3ecee test+fix(admin): tela diz quando a meta recusou o toque`.

### Complemento B12b (FIX-441) — o Percurso também
O achado do gerente: a coluna **Régua do Percurso** ainda mostrava "Esgotou os 3 toques" para a linha recusada
pela Meta, porque `regua-por-conversa.ts` faz `leftJoin` sem filtrar status (a linha `ESGOTADO` existe e vira
`naRegua=true`) e o `tabela-percurso.tsx` passava `motivoSaida: null`. O bloco **B12b** leva o `motivo_saida` até
a célula (`regua-por-conversa.ts`, `app/api/admin/percurso/route.ts`, `tabela-percurso.tsx`). Gate:
`pnpm -s vitest run src/lib/admin/regua-por-conversa src/lib/admin/percurso-queries src/components/admin/percurso`.
Commit a seguir (o gerente commita).

## Provado
- `status-do-toque.test.ts` (11 testes): classificação/backoff por código; visto vermelho antes do módulo.
- `remarketing-cycle.envio.integration.test.ts` (5 testes, Postgres real, fetch mockado): (a) recusa 131049 ⇒
  carimbo compensado e `next_touch_at` no backoff, 2º ciclo não chama o fetch; (b) aceite 200 ⇒ `ultimo_wamid`
  gravado, corpo `type:"template"` (nunca `text`) e **uma** mensagem do assistente; (c) webhook `failed
  131049` devolve a cota e é idempotente, `131050` encerra com `motivo_saida`; (d) a query do painel conta o
  toque pela chave real.
- `pnpm -s vitest run src/lib/workers/remarketing-cycle src/lib/remarketing src/app/api/webhook/whatsapp src/lib/admin/remarketing-queries src/lib/whatsapp/template-dispatch`
  → **17 arquivos / 274 testes verdes**; `typecheck` exit 0.
- Migração aplicada com `DATABASE_URL` explícita do workspace (`aja_agora_ws_develop`), porque o `.env`
  aponta o banco errado (`aja_agora_ws_langgraph_runtime`).