# Contato reatribuído à mesa depois do Segurar, sem histórico anterior na mesa

> 2026-09-22 · investigação de código (pedido do PRD "Painel do Aja Agora", parte 5)
> **Natureza:** registro do que o sistema faz HOJE, com `arquivo:linha`. O que o
> código não responde fica em "Perguntas em aberto" — não há proposta de mudança.

## Resumo em uma frase

**O "Segurar" da Régua de remarketing não reatribui ninguém para a mesa.** Ele
pausa os toques automáticos daquela pessoa na régua; "Soltar" devolve a linha ao
ciclo. Quem move um contato para a mesa é o **transbordo** (`mesa_handoffs`), e
esse fluxo já nasce "sem dono" por desenho — a mesa recebe o caso por broadcast e
quem clica "Vou atender" assume.

## 1. O que o botão Segurar faz (e o que ele não faz)

O "Segurar"/"Soltar" que aparece na coluna Régua da lista é a ação da **régua de
remarketing**, não da mesa:

- A rota é `POST /api/admin/remarketing/[conversationId]` com `acao` em
  `segurar | soltar` — `src/app/api/admin/remarketing/[conversationId]/route.ts:42-46`.
- Quem decide é `decidirAcao`, pura: segurar grava `status = RESPONDEU` e
  `motivoSaida = segurado_pelo_atendente`; soltar grava `status = ATIVO` e
  `motivoSaida = null` — `src/lib/admin/remarketing-tela.ts:494-504`.
- O motivo canônico é `MOTIVO_SAIDA_SEGURADO = "segurado_pelo_atendente"` —
  `src/lib/remarketing/motivo-de-exclusao.ts:108`.
- A ação é auditada em `conversations.metadata.remarketingAcao` (tipo, nome de
  quem agiu, id e instante) — `src/lib/admin/remarketing-queries.ts:92-104`, gravada
  por `gravarAcaoDaRegua` em `[conversationId]/route.ts:95-99`.
- Quem pode: `admin` e `attendant`; `viewer` não (o papel é leitura) —
  `[conversationId]/route.ts:57`.
- O efeito prático é retirar a linha do conjunto que o ciclo da régua lê
  (`status` fora de `ATIVO`) e devolvê-la depois — comentário da própria rota,
  `[conversationId]/route.ts:44-46`.

**Não há, em nenhum ponto desse caminho, escrita em `mesa_handoffs`, atribuição
de atendente de mesa ou mudança no status da conversa.** O "Segurar" não cria
dono de mesa, não abre transbordo e não tira a conversa do agente.

## 2. O que move um contato para a mesa

O transbordo nasce em `createMesaHandoff` — `src/lib/mesa/handoff.ts:122-206`:

- O handoff é criado com `status: "aberto"` e `mesaAttendantId: attendant?.id ?? null`
  — `handoff.ts:158-169`. **O dono é opcional por projeto**: sem dono indicado, o
  caso nasce "sem dono" para o broadcast — comentário `handoff.ts:25-31`.
- Um lead tem no máximo **um** handoff ativo por vez (`aberto` ou `em_andamento`) —
  `handoff.ts:18` e a checagem de idempotência em `handoff.ts:145-155`.
- Havendo **mesa dedicada** (no máximo uma ativa), o caso já nasce dela, passando
  pelo mesmo `claimMesaHandoff` (para também calar o agente e mover a raia) —
  `handoff.ts:185-205`.
- Sem mesa dedicada, o caso vai por **broadcast**: `broadcastCaseToAttendants`
  manda o botão "Vou atender" por WhatsApp — `src/lib/whatsapp/mesa/outbound.ts:139-159`.
  O id do botão é `mesa_claim:<handoffId>` — `src/lib/whatsapp/mesa/claim.ts:9`.

## 3. O que a mesa mostra quando o contato chega ali sem histórico

O caso é ancorado em `leadId`/`conversationId` (`handoff.ts:160-166`), então **o
histórico da conversa não pertence ao atendente — pertence à conversa**. Quem
assume vê a mesma conversa e as mesmas mensagens que já existiam; o que é novo é
o *dono* do atendimento, não o registro.

O que o sistema faz no instante em que alguém clica "Vou atender"
(`claimMesaHandoff`, `handoff.ts:232-277`):

1. Grava `mesaAttendantId` e `status = "em_andamento"`, com guarda
   `mesa_attendant_id IS NULL` (claim atômico: quem chega depois perde a corrida
   e recebe `ja_assumido`) — `handoff.ts:235-238` e `:264-269`.
2. **Cala o agente** naquela conversa: `conversations.status = "handed_off"` —
   `silenciarAgente`, `handoff.ts:297-321`. Sem isso, o agente respondia por cima
   do atendente (achado de 2026-08-10, registrado no próprio comentário).
   `handedOffUserId` fica NULL de propósito: quem assumiu é atendente de mesa, que
   não é `user` — `handoff.ts:309-312`.
3. Move o lead para `em_atendimento` — `handoff.ts:241-259`.

Ou seja: para a mesa, um contato que ela nunca viu **não aparece como novo** — ele
aparece como um handoff `aberto` (sem dono) ou `em_andamento` (com dono), com a
conversa e o histórico inteiros anexados.

## 4. O que acontece se ninguém pegar

O handoff fica `aberto` com `mesa_attendant_id` NULL. Isso é o estado que a tela
"Agora" conta como **"Sem dono na mesa"**:

```sql
SELECT count(*) FROM mesa_handoffs
WHERE status = 'aberto' AND mesa_attendant_id IS NULL
```

— `src/lib/admin/agora-queries.ts` (bloco `sem_dono_na_mesa` do `computePulso`).

Não há expiração automática no código lido: nenhuma varredura fecha handoff
`aberto` por tempo. Ele permanece na fila até alguém assumir (claim) ou até ser
encerrado (`closeMesaHandoff`, `handoff.ts:459-510`) ou reatribuído
(`reassignMesaHandoff`, `handoff.ts:383-457`).

## 5. Os dois caminhos de saída do atendente

- **Reatribuir** (`reassignMesaHandoff`, `handoff.ts:383-457`): troca
  `mesaAttendantId`, põe `em_andamento`, cala o agente de novo. Se o handoff
  estava **sem dono**, reatribuir é equivalente a um claim e move o lead para
  `em_atendimento` — `handoff.ts:425-441`. O dono anterior **não é avisado** por
  este código.
- **Encerrar** (`closeMesaHandoff`, `handoff.ts:459-510`): `status = "concluido"`,
  `closed_at = now()`, **devolve a conversa ao agente** (`conversations.status = "active"`,
  `handoff.ts:477-482`) e move o lead para `fechado_ganho` (decisão de
  2026-07-03, comentário `handoff.ts:462-466`).

## 6. Perguntas em aberto (o código não responde)

O PRD descreve o "Segurar" como "o operador puxar um contato para si e conduzir a
conversa". O código não faz isso: o Segurar da régua é pause-de-toques e não tem
dono humano. **O que precisa ser confirmado com o dono:**

1. O "Segurar" que o pedido descreve é o da **régua** (o que existe), ou um botão
   de "assumir a conversa" que **não existe** hoje? Se for o segundo, ele é
   funcionalidade nova, não comportamento a documentar.
2. "Voltar para a mesa" significa **criar um transbordo** (handoff novo), ou
   apenas que o cliente respondeu e a régua parou? A única frase do código que
   usa "volta para a mesa" é a mensagem de `podeSoltar` quando o cliente respondeu
   depois do último toque — `src/lib/admin/remarketing-tela.ts:480-482` — e ela não
   cria handoff nenhum.
3. Quando o handoff é reatribuído, o atendente anterior **deveria** ser avisado?
   Hoje `reassignMesaHandoff` não notifica — `handoff.ts:383-457` (nenhuma chamada
   a `notifyMesaAttendant`).
4. Handoff `aberto` parado indefinidamente **deveria** expirar? Hoje não expira —
   não há varredura de tempo sobre `mesa_handoffs` no código lido.