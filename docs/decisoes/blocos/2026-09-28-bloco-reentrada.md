---
data: 2026-09-28
titulo: "Reentrada do bolo parado em lote + esgotar só para (FIX-385 / FIX-386)"
status: aceita
decisor: executor do bloco-reentrada — segue as decisões do dono (28/09) e a recomendação do PRD no item em aberto
contexto: bloco-reentrada (`feat/reentrada-parados`), onda 2, depende de bloco-regua
---

# ADR — FIX-385 (reentrada em lote) e FIX-386 (esgotar só para)

A cliente, em 22/09: *"eles continuam parados desde a semana passada."* Medido em produção (28/09):
`[remarketing-cycle] avaliadas 210, elegíveis 0` — e 4 conversas apareciam exatamente com
`parada_ha_mais_de_7_dias`. A janela de entrada de 7 dias fechava a porta por construção, e **não
existia ação de admin que inscrevesse o bolo parado ignorando a janela**. As rotas da régua só
tinham segurar/soltar por conversa. A ordem interna do bloco foi **386 → 385**: primeiro travar que
esgotar NÃO vira `perdido`; depois abrir a porta.

## Decisão 1 (FIX-386) — `ESGOTADO` é terminal e SÓ PARA

Palavras do dono (28/09): *"esgotar os toques qd chegar, so parar mesmo"*. O comportamento já era
esse (`motor.ts` grava `ESGOTADO` sem tocar `leads.stage`), mas era **decisão de produto sem prova**.
O PRD previa transição automática (AJA-24 T2) e alerta de revisão humana (T3) — **as duas morreram
nesta decisão**.

O que este bloco entrega:

- **Teste que trava** (`motor.test.ts`, describe "esgotar a sequência SÓ PARA"): o terceiro toque
  grava `ESGOTADO` + `tres_toques_sem_resposta`, zera `next_touch_at`, e a linha **não tem** campo de
  funil — nenhum `stage`, nenhum `perdido`. `podeDisparar` sobre `ESGOTADO` devolve `motivo:
  "esgotado"` (não existe `perdido` no vocabulário). Quem respondeu no meio do caminho não esgota.
- **Comentário no ponto de esgotamento** (`motor.ts`, `normalizarSequenciaMorta`, e o gêmeo em
  `regua.ts`, `registrarToque`) dizendo que é decisão do dono — para o próximo a ler não "consertar".
- **Nenhum alerta novo** de "aguardando revisão" — a coluna e o caminho não existem.

Não é defeito corrigido: é invariante agora provado.

## Decisão 2 (FIX-385) — a reentrada afrouxa UMA guarda, não todas

A reentrada é **deliberada e em lote** (decisão do dono), e a decisão mora em **módulo puro novo**
(`src/lib/remarketing/reentrada.ts`), não em SQL — pelo mesmo motivo de `avaliarElegibilidade`: a
tela (que só mostra) e a rota (que escreve) chamam a MESMA função, e um `CASE WHEN` daria duas
verdades para "quantas vão entrar".

**A única guarda afrouxada é a janela de 7 dias.** Todo o resto continua de pé, na ordem da entrada:
`regua_desligada`, `teste`, `optout`, `encerrada`/`com_atendente`, `conversa_web`, `sem_contato`,
`sem_telefone`, `telefone_da_equipe`, `ainda_em_silencio`, `respondeu`, `converteu`, `ja_ativo`.

Duas escolhas que merecem registro:

- **O PISO de silêncio fica.** A janela de 7 dias é o TETO que a reentrada derruba; o piso de 90 min
  continua — ninguém reentra falando com quem acabou de escrever (e `last_inbound_at` nulo cai aqui,
  a corrida do FIX-86).
- **`RESPONDEU` nunca reentra** — quem ficou terminal por ter respondido está vivo e é da mesa.
  Isso inclui, de propósito, a linha segurada à mão pelo atendente: a reentrada não desfaz uma
  decisão humana de segurar.

### Estado inicial da linha reaberta

A linha reaberta nasce com `step = 0`, `status = "ATIVO"`, `nextTouchAt = agora`,
`touchesNaJanela = []` e `motivoSaida = null` — o ciclo recomeça do ZERO, e o motor nunca grava
`step = 4` numa reentrada (`registrarToque` já trata isso). O estado inicial de quem NUNCA entrou é
o mesmo, via `estadoInicial` — as duas portas nascem idênticas.

### Idempotência: UPSERT que só reabre `ESGOTADO`

O índice único por conversa já existia (`remarketing_touches_conversation_id_idx`). A escrita é um
`INSERT ... ON CONFLICT (conversation_id) DO UPDATE SET status='ATIVO', step=0, next_touch_at=agora,
motivo_saida=null WHERE remarketing_touches.status = 'ESGOTADO'`. Consequências:

- rodar duas vezes **não duplica** linha (o índice) e **não reativa** quem respondeu (o `WHERE`);
- uma corrida (outro clique, o ciclo) não atropela estado: se a linha deixou de ser `ESGOTADO`, o
  `RETURNING` volta vazio e a linha não é tocada;
- a decisão anterior já filtra `ja_ativo`, então o `WHERE` é a defesa de corrida, não o filtro
  principal.

### O rastro de quem autorizou

Vai em `conversations.metadata.remarketingAcao` (`tipo: "reentrada"`, `por`, `porId`, `em`) — o
MESMO lugar do rastro de segurar/soltar, sem coluna nova e sem migration (`drizzle/**` está fora do
escopo do bloco). `rastroDoMetadata` passou a aceitar `"reentrada"`, então a linha reaberta carrega
quem autorizou e quando, como o card pediu.

### A ação na tela

`PainelDeReentrada` (`src/components/admin/remarketing/painel-de-reentrada.tsx`), no topo da Régua:
lê o preview (`GET /api/admin/remarketing/reentrada`, dry-run) e mostra **quantas vão entrar** e
**quantas ficam de fora, por motivo**, com o botão "Reentrar N conversas". O POST executa e recarrega
a lista. `viewer` vê o preview; só `admin`/`atendente` executam — o mesmo critério de segurar/soltar.
O número que o botão anuncia é o mesmo que o servidor grava (as duas pontas chamam `avaliarReentrada`).

## A cota de 30 dias CONTA o histórico — e o item segue EM ABERTO com o dono

**Decisão do dono (28/09): a cota CONTA o histórico** (recomendação do PRD, a mais conservadora).
O item ainda **não foi respondido** pelo dono — está registrado como EM ABERTO no item 6 de
`docs/decisoes/blocos/2026-09-28-decisoes-da-frente-aja.md`, e esta frente **seguiu a recomendação
em vez de travar** (instrução explícita do bloco).

Como isso aparece no código: a reabertura **preserva** `touches_30d` e `ultimo_toque_em` em vez de
zerá-los (o `SET` do UPSERT não toca essas colunas). O motor soma os toques do contato
(`toquesDoContato`), reconstruindo o histórico a partir do `ultimo_toque_em` — sem essa preservação,
a reentrada daria 3 toques novos a quem já gastou os 3, que é o lado que não se pode errar.

Consequência operacional, dita em voz alta: **quem gastou a cota nos últimos 30 dias reentra, mas o
toque espera a cota reabrir** (a linha fica `ATIVO` com `next_touch_at = agora` e o motor bloqueia
por `teto_30_dias` até o toque mais antigo cair). É o comportamento conservador pedido. Se o dono
responder "zera com o passo", a mudança é uma linha: parar de preservar `touches_30d`/`ultimo_toque_em`.

## Residual (o que este ADR não resolve)

- **O item 6 da ata segue em aberto** (cota conta × zera). Implementado o lado conservador; trocar é
  barato e está localizado no UPSERT de `remarketing-queries`/`remarketing-reentrada.ts`.
- **`limite de 500` candidatos por lote.** É teto de trabalho, não elegibilidade; o preview devolve
  `truncado: true` quando bate no teto. Se o bolo passar disso, uma segunda rodada (ou paginação) resolve.
- **Não há seleção por conversa** — a ação é em lote, como o dono pediu. Quem quiser tirar UMA
  conversa do lote tem hoje o "segurar" depois de reentrar.
- **Reabrir `RESPONDEU` de higiene** (teste/equipe/segurado) fica de fora por decisão conservadora;
  se o dono quiser tratar "segurado pelo atendente" como reversível pela reentrada, é um caso a
  acrescentar em `avaliarReentrada`.