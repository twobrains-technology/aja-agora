# bloco-reentrada — FIX-385 e FIX-386 (abrir a porta do bolo parado)

**Status:** concluído · 2026-09-29 · branch `feat/reentrada-parados` (worktree `feat-reentrada-parados`)

A cliente, em 22/09: *"eles continuam parados desde a semana passada."* Medido em produção (28/09),
o ciclo dizia `avaliadas 210, elegíveis 0` — a janela de entrada de 7 dias fechava a porta por
construção, e não existia ação que trouxesse o bolo parado de volta. Este bloco (onda 2, na ordem
**386 → 385**) entrega as duas metades: trava que esgotar NÃO vira `perdido`, e abre a porta da
reentrada **deliberada e em lote**.

## O que foi entregue

- **FIX-386 — esgotar os toques SÓ PARA.** Não é correção: é prova. `motor.ts`/`regua.ts` já
  gravavam `ESGOTADO` sem tocar `leads.stage`; o que faltava era o **teste que trava** que o
  esgotamento não transita o lead para `perdido` nem cria alerta de revisão humana (o T2/T3 do
  AJA-24 morreram nesta decisão do dono, 28/09). Teste em `motor.test.ts` + comentário no ponto de
  esgotamento, para o próximo a ler não "consertar".
- **FIX-385 — reentrada em lote.** Módulo puro novo (`src/lib/remarketing/reentrada.ts`) com
  `avaliarReentrada` / `reabrirEstado` / `linhaReaberta`; I/O em
  `src/lib/admin/remarketing-reentrada.ts`; rota `GET`/`POST /api/admin/remarketing/reentrada`;
  painel na tela da Régua (`painel-de-reentrada.tsx`).

## O essencial das decisões (o detalhe está no ADR)

1. **A reentrada afrouxa UMA guarda: a janela de 7 dias.** Todo o resto continua — `optout`,
   `teste` (`is_simulated`), telefone da equipe, `encerrada`/`com_atendente`, `conversa_web`,
   `sem_contato`/`sem_telefone`, e o **piso de 90 min** de silêncio. Quem respondeu (`RESPONDEU`)
   **nunca** reentra: está vivo e é da mesa.
2. **A linha reaberta nasce em `step = 0`, `status = "ATIVO"`, `nextTouchAt = agora`,
   `touchesNaJanela = []`, `motivoSaida = null`** — o ciclo recomeça do zero.
3. **Idempotência por construção.** `INSERT ... ON CONFLICT (conversation_id) DO UPDATE ... WHERE
   status = 'ESGOTADO'`: rodar duas vezes não duplica (índice único) nem reativa quem respondeu (o
   `WHERE`). A decisão anterior já filtra `ja_ativo`.
4. **O rastro de quem autorizou e quando** vai em `conversations.metadata.remarketingAcao`
   (`tipo: "reentrada"`) — sem migration, no mesmo lugar do segurar/soltar.
5. **Cota de 30 dias CONTA o histórico** (decisão do dono, recomendação do PRD). O UPSERT preserva
   `touches_30d` e `ultimo_toque_em`; quem zerar depois é uma linha de mudança.
6. **Nenhuma mensagem real foi disparada** — toda a prova usa `deps` injetadas e mock do dispatcher.

## Como a ação é disparada na tela

No topo de `/admin/remarketing`, o painel **"Reentrada do bolo parado"** lê o preview (`GET`,
dry-run) e mostra: **quantas vão entrar**, **quantas ficam de fora e por quê** (opt-out, teste,
equipe, respondida…), e o botão **"Reentrar N conversas"**. O POST executa, grava as linhas e o
rastro, e recarrega a lista. `viewer` vê o preview; só `admin`/`atendente` executam. O número que o
botão anuncia é o mesmo que o servidor grava (as duas pontas chamam `avaliarReentrada`).

## Prova

- `pnpm vitest run src/lib/remarketing/ src/app/api/admin/remarketing/` → **7 arquivos / 150 testes
  verdes** (inclui `reentrada.test.ts` — 17 casos — e `route.test.ts` — 5 casos).
- `pnpm typecheck` verde; `biome check` limpo nos 6 arquivos novos/tocados.
- Nenhum smoke de browser e nenhuma mensagem de WhatsApp, por instrução do bloco.

## Lacunas honestas

- **O item 6 da ata segue EM ABERTO com o dono** (a cota conta ou zera com o passo). Implementado o
  lado conservador (CONTA); trocar é barato e está localizado no UPSERT.
- **O recorte do lote é de até 500 conversas** (teto de trabalho); o preview devolve `truncado: true`
  quando bate no teto.
- **Não há seleção por conversa** — a ação é em lote, como o dono pediu; para tirar uma, use
  "Segurar" depois de reentrar.
- **Nada foi medido em produção** (a página não foi aberta no browser): a prova é unitária +
  typecheck, conforme o escopo do bloco.