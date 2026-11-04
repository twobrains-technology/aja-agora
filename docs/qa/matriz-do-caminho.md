# Matriz do caminho — paridade por passo, nos dois canais

O caminho da venda, degrau por degrau, com o que o cliente vê em cada canal, qual card carrega o passo, o
clique que ele dispara e a prova no banco. É o que os `expectArtifacts` dos cenários de `scripts/eval/golden/`
citam e o que a camada de caminho (`scripts/qa/caminho.mjs` + `scripts/qa/provas-do-caminho.sql`) prova ao
fim de cada conversa.

Regra da casa: **`NÃO MEDIDO` não é `ok`.** Só entra número medido nesta rodada, com a fonte ao lado
(`.orientacao/diario.md` §1.2/§1.3, `scripts/qa/medidor-duplicidade.sql`, ou o SQL abaixo). Todo o resto —
cada passo rodado de ponta a ponta, `contractClosed`, `bevi_proposals.lead_id` — fica `NÃO MEDIDO` até o
Bloco 4 medir.

## Como cada canal entra

| canal | forma real de entrada | instrumento de conversa |
|---|---|---|
| web | `POST /api/chat` com SSE; o primeiro segmento da resposta é `data-welcome` (`src/components/chat/chat-message.tsx:81`) e os cards chegam como `data-artifact` | `node scripts/qa/talk.mjs <conversationId> "<texto>"` (`scripts/qa/talk.mjs:29`) — a conversa nasce em `POST /api/admin/simulator/sessions` com `channel: "web"` (`src/app/api/admin/simulator/sessions/route.ts:20`), o mesmo que o runner usa (`scripts/eval-run.ts:104`) |
| whatsapp | simulador admin, que usa o mesmo processor do webhook; a sessão nasce com `channel: "whatsapp"` (`src/app/api/admin/simulator/sessions/route.ts:20`) e a resposta vem do SSE `/api/admin/simulator/whatsapp/<conv>/stream` (`scripts/qa/wa-talk.mjs:69`), que é o que o cliente recebe | `node scripts/qa/wa-talk.mjs --new`, depois `wa-talk.mjs <conv> "texto"` ou `wa-talk.mjs <conv> --btn <id> "<título>"` (`scripts/qa/wa-talk.mjs:4-6`) |

Os cards que o motor livre pode emitir estão em `DESTINO_DOS_CARDS` (`src/lib/agent/pi/cards-livres.ts:42`).
Quatro tipos são `fora-do-motor` e só nascem de handler, não de `mostrar_card`: `signature_handoff`,
`atendimento_handoff`, `telefone_do_desbloqueio`, `document_upload` (`src/lib/agent/pi/cards-livres.ts:60-78`).

## A matriz

| passo | web (o que o cliente vê e o que tem de acontecer) | whatsapp (idem) | prova (SQL ou artefato) | medido nesta rodada |
|---|---|---|---|---|
| **1 · entrada do anúncio/hero** | primeiro segmento `data-welcome` com as três categorias (`src/components/chat/chat-message.tsx:81`); o clique manda `{kind:"category"}` (`src/lib/chat/actions.ts:56`) | três botões `category_imovel` / `category_auto` / `category_moto` (`src/lib/whatsapp/formatter.ts:773`), roteados em `src/lib/whatsapp/interactive-handlers.ts:104` | SQL-A: primeira mensagem da conversa em `messages` | NÃO MEDIDO |
| **2 · saudação** | o especialista se apresenta antes de perguntar (`transition`) e o nome é pedido no card/gate: `{kind:"gate",gate:"name"}` (`src/lib/chat/actions.ts:16`) | saudação em texto e nome em texto; sem botão de nome | SQL-A + `conversations.contact_name` | NÃO MEDIDO |
| **3 · tipo de bem** | o bem desejado é conversa (texto), não card — o motor não tem card de catálogo de bem | idem; se a pessoa trocar de categoria, botões `category_*` de novo (`src/lib/whatsapp/interactive-handlers.ts:104`) | SQL-A (turno do cliente com o bem) | NÃO MEDIDO |
| **4 · valor ou parcela** | `value_picker` (card de escolha do modelo, `src/lib/agent/pi/cards-livres.ts:82`) → clique `{kind:"gate",gate:"credit"}` (`src/lib/chat/actions.ts:20`) | **não existe card de faixa no WhatsApp** (`src/lib/agent/pi/tools-livres.ts:534` filtra `value_picker`): o valor é perguntado em texto; as faixas viram botões `range_auto_120` etc. (`src/lib/whatsapp/formatter.ts:332`), roteados em `src/lib/whatsapp/interactive-handlers.ts:111` | SQL-A | NÃO MEDIDO |
| **5 · primeira oferta/carta** | `comparison_table` e/ou `group_card` com número da tool (`src/lib/agent/pi/cards-livres.ts:43`, `:45`); cliques: `interest` (`src/lib/chat/actions.ts:84`), `choose_offer` (`:92`), `select-group` (`:71`), `adjust-value` (`:97`), `show-other-options` (`:108`) | texto com as opções + botões `group_<id>` (`src/lib/whatsapp/formatter.ts:190`), `interest_<id>` (`:264`), `simulate_<id>` (`:171`), `detail_<id>` (`:172`), `whatif_<id>` (`:265`), roteados em `src/lib/whatsapp/interactive-handlers.ts:129` | SQL-A: `artifacts.type` + `payload` do turno | NÃO MEDIDO |
| **6 · interesse/recomendação** | `recommendation_card` com a indicada; clique `choose_offer` (`src/components/chat/artifacts/recommendation-card.tsx:133`) ou `interest` (`:146`); `decision_prompt` manda `show-other-options` (`src/components/chat/artifacts/decision-prompt.tsx:31`) ou o label como texto (`:34`) | a recomendação vai em texto e o botão de decidir é `decision_<intent>` (`src/lib/whatsapp/formatter.ts:1614`), roteado em `src/lib/whatsapp/interactive-handlers.ts:127-128` (`decision_contratar` = interesse, `decision_especialista` = handoff pedido) | SQL-A + `artifacts.type = 'recommendation_card'` | NÃO MEDIDO |
| **7 · simulação ou lance** | `simulation_result`, `embedded_bid`, `contemplation_dial`, `two_paths`, `scarcity`, `financing_comparison` (`src/lib/agent/pi/cards-livres.ts:47-52`); cliques `view-scenarios` (`src/lib/chat/actions.ts:115`), `compare-financing` (`:124`), `adjust-value` (`:97`), gate `lance` (`:42`), `lance-value` (`:44`), `simulator-offer` (`:47`), `timeframe` (`:41`) | botões `timeframe_<token>` (`src/lib/whatsapp/formatter.ts:533`), `lance_<token>` (`:595`), `lancevalue_<token>` (`:626`), `lanceembutido_<token>` (`:658`), `simoffer_<token>`, roteados em `src/lib/whatsapp/interactive-handlers.ts:101-109` | SQL-A: `payload` do card com os números; conferir contra `bevi_proposals`/tool | NÃO MEDIDO |
| **8 · pedido de contato (o número na web)** | `whatsapp_optin` (`src/lib/chat/types.ts:490`); sem `knownPhone` o card abre input (`src/components/chat/artifacts/whatsapp-optin.tsx:48`, `:131`). Cliques `whatsapp_optin` (`src/lib/chat/actions.ts:130`), `whatsapp_optin_confirm` (`:133`), `whatsapp_optin_decline` (`:134`) | **não se pede o número**: telefone e nome chegaram com a mensagem (P6). O card é `fora-do-motor` no canal | SQL-B: `leads.phone` da conversa; SQL-A para a ordem (o turno do card × o turno em que o telefone passou a existir) | `whatsapp_optin` em **21 de 346** conversas web; telefone **antes** do card em 21 × **depois** em 0; `lead_form` em **0**; `leads.phone` preenchido em **73 de 346** (diário §1.2 item 2) |
| **9 · CPF/identidade** | gate `identify` (`src/lib/chat/actions.ts:52`) com o form de identidade (`src/components/chat/artifacts/gate-identity-form.tsx`) — o CPF completo nunca volta ao browser | texto/estado; a identidade é coletada no fluxo do canal, não em card | SQL-E: CPF em claro em `messages` (Q4, `scripts/qa/medidor-duplicidade.sql:103`) e na fala do agente | CPF em claro em `messages` = **3**, todos `role='user'` (entrada crua de julho); na fala do agente = **0** (Q4/Q11, diário §1.3) |
| **10 · proposta** | `contract_form` (`src/lib/chat/types.ts:492`) → `contract-submit` (`src/lib/chat/actions.ts:141`) → `real_offer` (`src/lib/chat/types.ts:493`) → `offer-confirm` (`src/lib/chat/actions.ts:149`) | `contract_confirm` (`src/lib/whatsapp/formatter.ts:1020`) e `offer_confirm` (`:1092`), roteados em `src/lib/whatsapp/interactive-handlers.ts:130`, `:132` | SQL-C: `bevi_proposals.lead_id` = `leads.id` da conversa | NÃO MEDIDO |
| **11 · fechamento** | `contractClosed = true` gravado em `src/app/api/chat/route.ts:1430`; `signature_handoff` e `document_upload` nascem depois do fecho | `finalizarOfertaReal` (`src/lib/whatsapp/interactive-handlers.ts:241`) faz o `confirmOffer` (`:243`) e grava o mesmo estado (`:246`) | SQL-D: `conversations.metadata->>'contractClosed'` | **NULL em 2 de 2** (27/10 11:20) |

## A rodada de 27/10/2026 (11:11–11:20) — o que o caminho andou de verdade

Instrumento: `node scripts/qa/caminho.mjs --canal web` e `--canal whatsapp`, rodados **dentro do container**
(o Node do host não alcança o OrbStack: `EHOSTUNREACH`), com `AJA_BASE_URL=http://localhost:3000`, modelo
`qwen-35b`, `caixa_de_prompt` = 0 (conduta = texto do código). Provas: `scripts/qa/provas-do-caminho.sql`
com `-v conv=<uuid>`. Relatório completo em `.orientacao/relatorios/4b.md`.

Conversas medidas: web `18b875a8-15f7-4116-8b22-4cedde277bcd` (10 turnos do cliente) ·
WhatsApp `191b287c-a668-4408-b4a6-342d936627f5` (9 turnos).

| passo | web | whatsapp | número medido |
|---|---|---|---|
| 1 entrada (`data-welcome`) | texto puro | texto puro, sem botão `category_*` | `data-welcome` = **0 de 1** — a matriz supunha esse segmento; ele **não aparece** |
| 2 saudação | avançou | avançou | saudação em texto **2 de 2**; `leads.name` = `Mário` em **2 de 2** |
| 3 tipo de bem | avançou | avançou | `metadata.currentCategory = "auto"` em **2 de 2** |
| 4 valor/parcela | avançou | avançou | valor capturado do texto **2 de 2**; card `value_picker` **0 de 1** (web); botões de faixa **0 de 1** (WhatsApp) |
| 5 primeira oferta | **parou** | **parou** | cards de oferta **0 de 2** — `buscar_cartas` fora do ar (vitrine vazia) |
| 6 interesse/recomendação | parou | parou | `recommendation_card` **0 de 2** |
| 7 simulação/lance | parou | parou | cards de simulação **0 de 2**; nenhum valor em reais inventado nestas duas conversas |
| 8 pedido de contato | avançou isolado | não existe no canal | web: `whatsapp_optin` **1 de 1**; `leads.phone` **0 de 2** (o card saiu, o número não foi digitado) |
| 9 CPF/identidade | pediu, não recebeu | pediu, não recebeu | CPF enviado **0 de 2** (`E2E_TEST_CPF` vazia); CPF em claro **0**; máscara **0** |
| 10 proposta | parou | parou | `bevi_proposals` = **0 rows** nas duas |
| 11 fechamento | não alcançado | não alcançado | `contractClosed` **NULL em 2 de 2** |

**Leitura:** o caminho andou até o passo 4 nos dois canais e parou no 5 — por **ambiente** (busca sem
vitrine), não por condução. Do passo 5 em diante, o que está medido é **zero**, e zero por impossibilidade
não é verde: `contractClosed` continua **NÃO MEDIDO**, com o motivo escrito.

## As provas por SQL

Rodam contra o banco do dev; troque o `:conv` pelo `conversationId` da rodada.

```bash
docker exec -i aja-shared-pg psql -U postgres -d aja_agora_ws_develop -v conv="'<conversationId>'" -f -
```

**SQL-A — o caminho gravado da conversa (todos os passos).**

```sql
select m.created_at, m.role, a.type as card,
       left(regexp_replace(m.content, '\s+', ' ', 'g'), 160) as fala
from messages m
left join artifacts a on a.message_id = m.id
where m.conversation_id = :conv
order by m.created_at, m.id;
```

**SQL-B — o contato salvo na web (passo 8).**

```sql
select c.id, c.channel, l.id as lead_id, l.name, l.phone,
       (l.phone is not null and l.phone <> '') as telefone_salvo
from conversations c
left join leads l on l.conversation_id = c.id
where c.id = :conv;
```

**SQL-C — a proposta amarrada ao lead (passo 10).**

```sql
select p.id as proposta, p.lead_id, l.id as lead_da_conversa,
       (p.lead_id is not null and p.lead_id = l.id) as proposta_do_lead
from bevi_proposals p
join conversations c on c.id = p.conversation_id
left join leads l on l.conversation_id = c.id
where c.id = :conv;
```

**SQL-D — o estado terminal (passo 11).**

```sql
select id, status, (metadata->>'contractClosed')::boolean as contrato_fechado, metadata
from conversations
where id = :conv;
```

**SQL-E — CPF em claro e CPF mascarado (passo 9).** O mesmo das Q4/Q11 de
`scripts/qa/medidor-duplicidade.sql`: conta CPF em claro em `messages` separando por `role` — a prova da
bateria vale para o que o agente escreve; o input cru do cliente é o que a cifra de identidade protege.

```sql
select role, count(*) as mensagens_com_cpf_em_claro
from messages
where conversation_id = :conv
  and content ~* '\d{3}\.\d{3}\.\d{3}-\d{2}'
group by role;
```

**SQL-F — uma pergunta por balão (todos os passos).** Conta por **balão**, não por conversa.

```sql
select m.id, m.role,
       (select count(*) from regexp_matches(m.content, '\?', 'g')) as perguntas
from messages m
where m.conversation_id = :conv and m.role = 'assistant'
order by m.created_at;
```

## O que esta matriz NÃO prova ainda

- **Nenhum passo foi rodado de ponta a ponta nesta rodada.** As linhas 1 a 7 e 10 a 11 estão `NÃO
  MEDIDO`: prova exige conversa nova, no app, com o SQL acima colado ao lado.
- **`contractClosed` e `bevi_proposals.lead_id` não foram medidos.** Os dois dependem de identidade
  homologada para o `startContract` rodar (`E2E_TEST_CPF` vazia nesta worktree) — é a `Q2` do PRD, e o
  caminho fecha até a proposta enquanto isso não existir.
- **A paridade web × WhatsApp é de código, não de comportamento medido.** O que se sabe hoje é o que cada
  componente/handler faz (`cards-livres.ts`, `formatter.ts`, `interactive-handlers.ts`, `actions.ts`); o
  comportamento dos dois canais no mesmo roteiro é o Bloco 4 que produz.
- **O golden set não cobre o caminho completo:** `contractClosed` aparece em **0** das 25 fichas e
  `leads.phone` também em **0** — as fichas afirmam trajetória de card, não estado de banco.

## A rodada de 27/10/2026 12:0x — com o MODELO DE PRODUÇÃO, nos dois canais

`AI_MODEL=claude-haiku-5-5-alan-brow-twobrains` (o da produção), vitrine e identidade ligadas.
Conversas de referência: WhatsApp `c27aea93-3f7f-4219-925a-c537c1bb3800` e a rodada de `caminho.mjs
--canal ambos`. Provas: `scripts/qa/provas-do-caminho.sql`.

| passo | estado medido | prova |
|---|---|---|
| 1–4 saudação, bem, nome, valor | avançou nos dois canais | `leads.name`, `metadata.currentCategory`, `qualifyAnswers.valorDoBemAlvo = 90000` |
| 5 oferta/carta | **avançou** (a vitrine busca) | `artifacts.type = comparison_table` |
| 6 interesse/recomendação | avançou | recomendação em texto + `quick_reply` |
| 7 simulação/lance | avançou | fala com parcela real do card (`R$ 1.176,39 / 96 meses`) |
| 8 pedido de contato | web: `whatsapp_optin` emitido · WhatsApp: não existe no canal (P6) | `artifacts.type`; `leads.phone` preenchido |
| 9 CPF/identidade | avançou — CPF por texto, identidade **cifrada** | `metadata.identityEnc`, `identityCollected = true`, `lgpdAceite` |
| 10 proposta | **parou** — tool chamada, sem proposta | `fazer_proposta` com `aceiteLgpd: true`; `BEVI_API_TOKEN` vazio; `bevi_proposals` = 0 rows |
| 11 fechamento | não alcançado | `contractClosed` ausente |

**O que continua `NÃO MEDIDO` e por quê:** `bevi_proposals.lead_id` e `contractClosed` dependem de
criar proposta REAL na Bevi — sem `BEVI_API_TOKEN` e sem "GO BEVI" do dono, não se cria. O caminho está
provado até o ato de fechar (`fazer_proposta` chamada com o aceite), que é o que o ambiente permite.
