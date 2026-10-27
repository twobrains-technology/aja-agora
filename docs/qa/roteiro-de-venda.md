# Roteiro de venda — a conversa que a bateria executa

O roteiro nasce da premissa do dono (`AGENTS.md`, P1–P7) e do que o app faz hoje, não de documento
antigo. É instrução executável: cada fase tem os turnos do cliente **literais** (o texto que vai ser
enviado), o que o agente tem de fazer, e como se prova.

O roteiro é executado por `scripts/qa/talk.mjs` (web, SSE de `POST /api/chat`) e por
`scripts/qa/wa-talk.mjs` (WhatsApp, simulador admin com o mesmo processor do webhook).

**Estado nesta rodada: nenhuma fase foi rodada.** O app desta worktree não respondeu ao `curl`
(`http://aja-chefe-criterio-do-chat.orb.local` → `000`, e `http://aja-app-develop.orb.local` → `000`), e
roda sem app é roteiro de papel. Toda fase abaixo está `NÃO MEDIDO` — o critério de cada uma está em
`docs/qa/criterios-do-chat.md` e a prova por SQL em `docs/qa/matriz-do-caminho.md`.

## Pré-requisitos

```bash
export AJA_BASE_URL=http://aja-chefe-criterio-do-chat.orb.local   # sem isto o script fala com outro app
export ADMIN_EMAIL=... ADMIN_PASSWORD=...                          # login do simulador, do vault
```

O app tem de estar de pé (`curl -s -o /dev/null -w '%{http_code}' "$AJA_BASE_URL"` → `200`) e o modelo do
gateway tem de existir. Modelo que o gateway não serve derruba todo turno — nesta worktree `AI_MODEL` é o
que o `.env.local` diz, e cada rodada carimba o modelo real no placar.

**Conversa de web** (a mesma criação que o runner faz, `scripts/eval-run.ts:88-110`):

```bash
BASE="$AJA_BASE_URL"
CK=$(curl -s -i -X POST "$BASE/api/auth/sign-in/email" \
      -H 'content-type: application/json' -H "origin: $BASE" \
      -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | grep -i '^set-cookie:' | cut -d';' -f1 | sed 's/^[Ss]et-[Cc]ookie: //' | paste -sd'; ')
CONV=$(curl -s -X POST "$BASE/api/admin/simulator/sessions" \
      -H 'content-type: application/json' -H "origin: $BASE" -H "cookie: $CK" \
      -d '{"channel":"web"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["conversationId"])')
echo "$CONV"
```

**Conversa de WhatsApp:**

```bash
CONV=$(node scripts/qa/wa-talk.mjs --new)   # imprime o conversationId (usa ADMIN_EMAIL/ADMIN_PASSWORD)
```

Um turno de texto na web: `node scripts/qa/talk.mjs "$CONV" "<texto>"`. Um clique na web:
`node scripts/qa/talk.mjs "$CONV" --action '<json do ChatAction>'`. Um turno no WhatsApp:
`node scripts/qa/wa-talk.mjs "$CONV" "<texto>"`; um botão: `node scripts/qa/wa-talk.mjs "$CONV" --btn <id> "<título>"`.

## Fase 1 — entrada e saudação (P1)

O lead entra pela web e fala por texto. A primeira resposta entrega alguma coisa — reconhecimento do que
ele trouxe, o especialista que assume — e **a qualificação vem depois**.

```
node scripts/qa/talk.mjs "$CONV" "oi"
```

Esperado: um balão de saudação; nenhum pedido de CPF, telefone ou dado antes de qualquer entrega; uma
pergunta no máximo (C-01/F-05); nenhuma frase de rendição (C-05).

Prova: `SQL-A` da matriz (o turno do agente com `role='assistant'`), contagem de `?` por balão em `SQL-F`.

Medido nesta rodada: `NÃO MEDIDO`.

## Fase 2 — tipo de bem e primeira entrega de valor (P1, P4)

O lead manda bem e valor numa frase só. O agente tem de **usar o valor que já chegou** e não perguntar de
novo.

```
node scripts/qa/talk.mjs "$CONV" "quero um carro, uns 90 mil"
node scripts/qa/talk.mjs "$CONV" "Mário"
```

Esperado: o agente reconhece carro na faixa de 90 mil e segue para o motivo/objetivo — **não** repergunta
valor nem tipo de bem; no máximo uma pergunta por balão.

Prova: `SQL-A`; conferir a ausência de pedido repetido do slot `valor` (critério D-01, medidor no Bloco 3:
`pedido-repetido` em `src/lib/agent/pi/eval/golden.ts`).

Medido nesta rodada: `NÃO MEDIDO`. Linha de base do corpus (diário §1.3, Q1): `valor` repetido **23**
vezes, `tipo_de_bem` **181** — é o defeito que esta fase existe para não repetir.

## Fase 3 — primeira carta e o contato cedo na web (P2, P6)

Depois de a primeira carta aparecer, o agente oferece o card que salva o lead. Na web é o número do
WhatsApp: é o dado que mantém a conversa viva depois que a tela fecha.

```
node scripts/qa/talk.mjs "$CONV" "pode ser um Corolla usado"
node scripts/qa/talk.mjs "$CONV" "quero trocar o meu, ele tá velho"
```

Esperado: reconhecimento do bem, e a oferta de continuar no WhatsApp com o card `whatsapp_optin`
(`src/lib/chat/types.ts:490`; sem `knownPhone` o card abre input —
`src/components/chat/artifacts/whatsapp-optin.tsx:48`). O card não pode repetir em texto o que ele mesmo
mostra (D-02).

Prova: `SQL-A` para a ordem dos turnos; `SQL-B` para `leads.phone`; o clique do card é
`node scripts/qa/talk.mjs "$CONV" --action '{"kind":"whatsapp_optin","phone":"+5511..."}'`
(`src/lib/chat/actions.ts:130`) — o telefone vem do vault, nunca deste arquivo.

Medido nesta rodada: `NÃO MEDIDO`. Linha de base (diário §1.2 item 2): `whatsapp_optin` apareceu em **21 de
346** conversas web, sempre **depois** de o telefone já existir (21 antes × 0 depois), `lead_form` em **0**,
`leads.phone` preenchido em **73 de 346**.

## Fase 4 — a carta, o interesse e a recomendação (P2)

Com a carta na mesa, o lead escolhe. O clique é o que manda o servidor resolver a cota — não é texto
livre.

```
node scripts/qa/talk.mjs "$CONV" "me mostra as opções"
```

Esperado: `comparison_table` e/ou `group_card` com números da tool; o agente **comenta** a indicada, não
relista a tabela (F-03), e a recomendação chega (`recommendation_card`).

Prova: `SQL-A` (o `artifacts.type` do turno) + `SQL-F` (uma pergunta por balão). O clique é
`--action '{"kind":"choose_offer","groupId":"<groupId do card>"}'` (`src/lib/chat/actions.ts:92`) — o
`groupId` sai do payload do card, copiado, nunca inventado.

Medido nesta rodada: `NÃO MEDIDO`.

## Fase 5 — valor ou parcela e a simulação (P2)

O lead pede número e depois quer saber quando seria contemplado. O agente só usa número que a tool
devolveu.

```
node scripts/qa/talk.mjs "$CONV" "e a parcela fica quanto?"
node scripts/qa/talk.mjs "$CONV" "e se eu der um lance?"
```

Esperado: parcela vinda do card, não recitada em texto junto com o card (D-02); explicação de lance como
quem sabe; **nenhuma** promessa de contemplação, prazo ou característica de grupo que a cota não mostra
(C-03, D-0004).

Prova: `SQL-A` com o `payload` do card, cruzado com o texto do mesmo turno; a ficha
`scripts/eval/golden/golden-topico-proibido.json` cobre a recusa de promessa no golden set.

Medido nesta rodada: `NÃO MEDIDO`.

## Fase 6 — CPF e identidade (P6)

A identidade vem no ponto em que a oferta real precisa dela — e **não** há aviso de LGPD como passo
obrigatório antes: o aviso não é pedágio da conversa (decisão do dono, 27/10/2026). O CPF é mascarado no
que é gravado.

```
node scripts/qa/talk.mjs "$CONV" --action '{"kind":"gate","gate":"identify","value":{"cpf":"<CPF do vault>","celular":"<celular do vault>","lgpd":true},"label":"meus dados"}'
```

Esperado: identidade aceita, busca disparada, e o CPF **nunca** em claro na fala do agente.

Prova: `SQL-E` (CPF em claro por `role`) e `SQL-A` (a fala do agente com o CPF mascarado).

Medido nesta rodada: `NÃO MEDIDO`. Linha de base (diário §1.3, Q4/Q11): CPF em claro em `messages` = **3**,
todos `role='user'` (entrada crua de julho); na fala do agente = **0**.

Bloqueio conhecido: `E2E_TEST_CPF`/`E2E_TEST_CELULAR` estão vazias nesta worktree e `startContract` chama
bureau real (mock proibido, `src/lib/bevi/fulfillment.ts`). Sem identidade homologada pelo vault, o
roteiro fecha **até a proposta**.

## Fase 7 — proposta e fechamento (P5)

O fechamento só acontece porque o lead pediu. O clique manda o servidor confirmar a cota na administradora.

```
node scripts/qa/talk.mjs "$CONV" --action '{"kind":"contract-submit","useStoredIdentity":true,"lgpd":true,"label":"quero contratar"}'
node scripts/qa/talk.mjs "$CONV" --action '{"kind":"offer-confirm","label":"confirmo a carta"}'
```

Esperado: `contract_form` → proposta real criada em `bevi_proposals` com `lead_id` do lead da conversa →
`real_offer` → `contractClosed = true` e o fecho (proposta em PDF, parabéns). Nenhuma qualificação reaberta
depois do pedido (`golden-fecho-nao-anda-pra-tras.json`).

Prova: `SQL-C` (`bevi_proposals.lead_id` = `leads.id`), `SQL-D` (`contractClosed` = `true`), `SQL-B`
(`leads.phone` preenchido).

Medido nesta rodada: `NÃO MEDIDO`.

## Variante WhatsApp — os mesmos turnos, outro canal

Mesma condução, com duas diferenças de canal que a premissa crava (P6): **telefone e nome já chegaram** —
não se pede de novo — e o valor/parcela é conversa, porque o WhatsApp não tem card de faixa de valor
(`src/lib/agent/pi/tools-livres.ts:534`).

```bash
CONV=$(node scripts/qa/wa-talk.mjs --new)
node scripts/qa/wa-talk.mjs "$CONV" "oi"
node scripts/qa/wa-talk.mjs "$CONV" --btn category_auto "Carro"
node scripts/qa/wa-talk.mjs "$CONV" "quero um carro, uns 90 mil"
node scripts/qa/wa-talk.mjs "$CONV" "Mário"
node scripts/qa/wa-talk.mjs "$CONV" --btn range_auto_120 "Até 120 mil"
node scripts/qa/wa-talk.mjs "$CONV" "pode ser um Corolla usado"
node scripts/qa/wa-talk.mjs "$CONV" --btn experience_first "É a primeira vez"
node scripts/qa/wa-talk.mjs "$CONV" --btn interest_<groupId> "Tenho interesse!"
```

Esperado: mesma sequência de degraus da web; **nenhum** pedido de telefone ou de nome; botões no lugar do
card de escolha; uma pergunta por balão.

Prova: as mesmas `SQL-A`..`SQL-F` (o banco não muda de forma por canal — `conversations.channel` distingue).

Medido nesta rodada: `NÃO MEDIDO`.

## Onde o roteiro termina

Termina em `contractClosed = true` (`conversations.metadata`, gravado em `src/app/api/chat/route.ts:1430`
na web e em `src/lib/whatsapp/interactive-handlers.ts:246` no WhatsApp), com `bevi_proposals.lead_id` =
`leads.id` e, na web, `leads.phone` preenchido. Roteiro que termina antes disso é roteiro interrompido:
`NÃO MEDIDO`, nunca `ok`.

Os 12 leads difíceis do Bloco 4 (muda de assunto, "sei lá" a tudo, preço três vezes com palavras
diferentes, pede humano, CPF errado, some e volta, pergunta se é golpe, tudo numa frase, grupo novo × em
andamento, quer lance, "não entendi" duas vezes) encenam **este** roteiro com um cliente que resiste; cada
cenário cita aqui a fase que exercita.
