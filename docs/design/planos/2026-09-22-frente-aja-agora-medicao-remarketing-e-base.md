# Frente Aja Agora — medição, remarketing e higiene da base

> **Decisões do Kairo (22/09/2026, 21h)** — este documento já as incorpora:
> 1. **Execução autorizada** — o agente começa pela Onda 0.
> 2. **"Identificado" = NOME + contato (telefone ou e-mail).** O Kairo: *"identificado são as pessoas
>    que deixaram o whatsapp e nome, ou que clicaram no whatsapp e mandaram uma msg — porque com essa
>    abertura eu já consigo o nome do perfil e o whatsapp número"*. Confere com o código: o pushName do
>    WhatsApp é sincronizado para `conversations.contactName` e `leads.name`
>    (`src/lib/contacts/sincronizar-nome.ts`), e o telefone vem do `waId`. O funil passa a exigir
>    **nome E (telefone OU e-mail)** — não só telefone. O número cai; é a correção (AJA-29).
> 3. **"Propostas" = pessoa** (opção (a) do AJA-27): uma pessoa com 5 simulações conta **1**.
> 4. **"Cliente oculto" = lead que caiu na mesa e não era cliente de verdade — era conhecido da
>    Bruna.** Não é "lead sem contato" (a hipótese anterior deste documento estava errada). O sistema
>    não tem como adivinhar quem é conhecido dela: o tratamento é **marcar como teste** (o que já tira
>    do funil e segura a régua), com o que falta sendo a **ação em lote** e o que ajuda a Bruna a
>    achar esses casos na lista (AJA-23 T1 e T3).

**Goal:** transformar os 12 pontos da call de 22/09/2026 (Aja Agora: Bruna, Gustavo, Lucas) em código
com contrato verificável — cada número do painel auditável, a régua de remarketing governável pelo
dono, e a base limpa o suficiente para a Bruna operar sem trabalhar lead que não existe.

**Fontes primárias (as duas, e é por isso que este documento cita as duas):**
1. **Call no Teams** — `~/Library/Application Support/local-understanding/transcricoes/2026-09-22/1111-call-teams.md`,
   trecho do Aja Agora de **11:38:04** ("Nasceu, menino!", linha 362) a **12:24:23** (linha 904).
   O trecho 11:16–11:37 é a call do SPC (Lozano) e **não** entra aqui.
2. **WhatsApp da Bruna (Aja Agora)**, 22/09 11:05–16:41 — é de onde vem a dúvida que abriu o item mais
   crítico (AJA-29). Transcrição literal do trecho:
   > 15:49 Bruna: *"Vou deixar aqui uma dúvida, tá?"* · 15:50 *"Na aba de performance temos 3.346 que
   > chegaram - 28/08 a 21/09"* · 15:50 *"No percurso lead:"* · 15:53 *"Qual seria o correto?"* ·
   > 15:57 *"nas outras partes tb.. exemplo uma aba está com 5 pessoas em propostas e na outra aba só
   > tem uma"* · 16:02 *"mesmo depois colocado 1 a 21/09 está dando divergencia"* · 16:33 Kairo *"Vou
   > analisar"*.
   (A leitura se faz por `~/.claude/skills/varre-whatsapp/scripts/varre.sh msgs 236004292223172@lid 2`.)
   **Os números 3.346 e "5 × 1" vêm daqui, não do arquivo da call** — sem esta fonte, o item fica
   inauditável.

**Documento anterior, mesma área:** `docs/design/planos/2026-09-18-briefing-faltas-admin-funil-remarketing.md`
(AJA-01…AJA-17). A numeração **continua** de lá (AJA-18 em diante) e o "Rastreio" diz o que já fechou.

**Como cada item está escrito:** Problema → fala literal (com autor e timestamp) → âncora de código
(verificada em 22/09/2026 contra o HEAD local) → o que fazer, em tasks com passo TDD → critério de
aceite → teste de regressão → decisão pendente, quando houver.

---

## Restrições globais (valem para todos os itens)

1. **Invariante verificável vira código; conversa é do modelo** (`CLAUDE.md`). Nenhum item aqui pode
   nascer como guard de frase ou teste de regex contra lista própria de strings. Tom/fluidez → Langfuse.
2. **O prompt não vive no repositório.** `SYSTEM_PROMPT` e `BASE_SYSTEM_INSTRUCTION` vêm do Langfuse
   (label `production`). `pnpm prompts:check` antes de depurar fala; `pnpm sync-prompts` ao terminar.
   Vale direto para o AJA-21 (o texto do turno de retomada passa pelo prompt).
3. **`REMARKETING_ATIVO` nasce ausente-desligado** e vive em dois lugares (secret + task definition do
   ECS). Tudo que esta frente criar na área de remarketing nasce **desligado por padrão**; ausência da
   chave = no-op, nunca "ligado por acidente".
4. **Toda variável de ambiente nova exige 4 passos** (secret → task definition → registrar revisão →
   deploy). `--force-new-deployment` **não** cria revisão nova.
5. **Português com acento** em tudo que o cliente ou o operador vê (número, rótulo, motivo, erro).
6. **`pnpm` é o único gerenciador.** Migrations Drizzle; o que toca banco exige teste de integração.
7. **Uma unidade por rótulo, em qualquer tela.** O defeito que a dúvida da Bruna expôs (AJA-27) nasceu
   de cinco definições de "proposta" com o mesmo nome. Onde a unidade não for a óbvia, o rótulo diz.
8. **Nada de número derivado de tabela de evento paralela** — cada etapa vem da tabela dona do fato
   (`performance-queries.ts`, cabeçalho).
9. **Três telas de medição contam a MESMA gente** (decisão de 24/08/2026, commit `ba4c4eaa`):
   Performance, Percurso e Mapa de calor abrem com PESSOAS. `VISITA_CONTAVEL`, `VISITA_DE_GENTE`,
   `VISITA_NAO_E_ECO` e `chaveDaPessoa` vivem em `src/lib/admin/sinais-do-funil.ts`, e **nenhum item
   deste PRD pode criar definição paralela**. Onde um predicado hoje está duplicado inline
   (`teve_proposta`, `atribuida`, as guardas de `motivo-fora-da-regua.ts`), a tarefa é **extrair para
   a fonte única**, não reescrever.
10. **Teste que não roda o caminho real não prova nada.** Os predicados puros do remarketing
    (`regua.ts`/`motor.ts`) são testáveis sem I/O; o que decide o envio de verdade é o ciclo
    (`remarketing-cycle.ts`), e há portões fora dele. Cada item que muda comportamento **exige um teste
    de integração no ciclo**, além do teste puro.

---

## Estado do código (medido em 22/09/2026)

| Peça | Onde | Estado |
|---|---|---|
| Predicados do funil (gente/não-eco/pessoa/contagens) | `src/lib/admin/sinais-do-funil.ts` | pronto, fonte única — **mas `teve_proposta` e `atribuida` ainda são inline** |
| Porta do funil (chegadas × pessoas) | `computePorta` em `performance-queries.ts:266` | pronto |
| Funil de mídia (6 etapas, exige `visit_id`) | `computeFunilMidia` em `performance-queries.ts:96` | pronto |
| Percurso pessoa a pessoa (9 degraus) | `percurso-queries.ts` + `/admin/percurso` | pronto |
| Campanhas com gasto da Meta e criativos | `campanhas-queries.ts` + `/admin/campanhas` | pronto |
| Espelho da Meta (entidade + insight diário) | `meta_entities`, `meta_insights_diarios` (`src/db/schema.ts:1258`, `:1310`) | pronto |
| Régua pura (3 toques, teto 30d, 9h–20h) | `src/lib/remarketing/{regua,motor}.ts` | pronto |
| Ciclo da régua (BullMQ, no **worker**, não no app) | `src/lib/workers/remarketing-cycle.ts` | pronto |
| Cadastro dos 8 parâmetros | `remarketing_config` + `src/lib/admin/remarketing-config.ts` | **órfão** — ver AJA-20 |
| Portão de retomadas (externo à régua) | `src/lib/workers/retomada.ts:18-20` | **bloqueia a cadência curta** — ver AJA-20 |
| Tela da régua (resumo, cartões, tabela, insights) | `/admin/remarketing` | pronto (AJA-03/04 fecharam) |
| Exportação (conversas, percurso, toques) | `src/lib/exportacao/*` + `/admin/exportacao` | pronto (AJA-16 fechou) |
| Marcar conversa como teste | `PATCH /api/admin/conversations/[id]` (admin-only) | pronto, propaga para leads e segura a régua |
| Kanban/Pipeline | `GET /api/admin/leads` + `KanbanBoard` | **sem filtro de período/simulado no servidor** — ver AJA-23 |

---

# Os itens

## AJA-29 · "Identificado" não pode contar quem só chegou pelo WhatsApp

**Severidade:** crítico — **é a pergunta literal da cliente, e contamina a base de todos os outros
itens** (o AJA-18 reconcilia Meta × CRM em cima desse número).

**Falas literais**
- Bruna, 11:48:39: *"quantos que a gente tem que se identificar porque vieram do WhatsApp, né? Se
  vieram do WhatsApp, eu já tenho o telefone. Então, aqui ele vai entender que já isso já se
  identificou. Confirma? Isso."*
- Gustavo, 11:49:02: *"É isso, todo mundo que veio do WhatsApp, que a gente já tem o número e já está
  meio identificado."*
- Bruna, 11:49:07: *"esses nove podem gerar uma dupla interpretação. De repente, dos nove ele não se
  identificou nada, ele só pegou o número do WhatsApp."*
- Kairo, 11:48:22: *"a gente checa também se os 9 aqui são de fato reais."*

**Âncora de código — a prova de que o número está inflado**
- `src/lib/whatsapp/session.ts:105-120` — comentário no próprio arquivo: *"B-03: cria lead JÁ no
  início, só com phone"*; o telefone sai de `waIdToPhone(waId)`. **Toda** conversa de WhatsApp nasce
  com telefone no lead, sem o cliente ter informado nada.
- `src/lib/admin/sinais-do-funil.ts:141` — `count(DISTINCT c.id) FILTER (WHERE l.phone IS NOT NULL OR
  l.email IS NOT NULL) AS identificados` (a linha 143 é `count(DISTINCT bp.id) AS propostas`).
- Mesmo predicado: `src/lib/admin/percurso-queries.ts:134` e `src/lib/exportacao/percurso.ts:134`
  (a `:136` nesse arquivo é `teve_proposta`, outro predicado).
- O rótulo na tela afirma o que o dado não sustenta: `src/components/admin/campanhas/resumo-campanhas.tsx:82-92`
  ("Leads no CRM" / "Leads que a Meta atribuiu"), com a nota *"Conversas com contato deixado"* — e
  "deixado" é falso para WhatsApp. O valor é `totais.leadsCrm`, somado de `linha.identificados`
  (`campanhas-queries.ts:357-391`): **conversas, não leads**.

**O que fazer**
- **Task 1 — definir "identificado" como NOME + contato.** **DECIDIDO (Kairo, 22/09):** identificado é
  quem tem **nome e** (telefone ou e-mail) — para WhatsApp vale o nome do perfil (pushName), que o
  sistema já sincroniza em `conversations.contactName` e `leads.name`
  (`src/lib/contacts/sincronizar-nome.ts`), mais o telefone do `waId`. Não é mais "tem telefone":
  quem só chegou e não deixou nome não conta. O predicado passa a
  `l.name IS NOT NULL AND (l.phone IS NOT NULL OR l.email IS NOT NULL)`.
- **Task 2 — separar os dois números na tela, em vez de escolher um.** Como no AJA-27: "identificados
  pelo cliente" (o degrau honesto) × "com telefone conhecido" (o que a régua usa para falar). Os dois
  são úteis e medem coisas diferentes: um é funil, o outro é capacidade de contato.
- **Task 3 — corrigir o rótulo.** "Conversas com contato deixado" só pode aparecer se for verdade.
- **Task 4 — o número que a Bruna pediu (os 9).** Fechar com ela: dos 9 qualificados da Meta, quantos
  são WhatsApp (identificados só pelo canal) e quantos **de fato** deixaram dado. Isso vira a resposta
  do AJA-22, não uma planilha paralela.

**Critério de aceite**
- Uma conversa de WhatsApp em que o cliente só mandou "oi, quero comparar" **não** conta como
  identificada no funil de "Se identificaram".
- Uma conversa em que o cliente informou o telefone **conta**, em qualquer canal.
- Os dois números aparecem com nomes que dizem a diferença; nenhum rótulo afirma "contato deixado"
  quando o dado veio do canal.

**Teste de regressão**
Integração com banco: conversa WhatsApp criada por inbound com `waId` → `identificados` = 0; a mesma
conversa após o cliente digitar o telefone → 1; conversa web com telefone no formulário → 1. Rodar
contra `performance-queries` **e** `percurso-queries` (a definição é uma só).

**Risco de retrocompatibilidade:** o número vai **cair** em todas as telas (o funil inteiro). É
esperado e é a correção. Comunicar antes de publicar: a Bruna vai ver o número mudar.

---

## AJA-18 · Reconciliação de mídia: investimento da Meta × leads do CRM

**Severidade:** crítico — é a pergunta nº 1 da call e o que a Bruna cobra por escrito.

**Falas literais**
- **11:43:43 · Eu (Kairo):** *"Ó, de hoje é 28 reais."* → **11:44:04 · Voz 6 (Gustavo):** *"Não, não,
  está muito alto."*
- **Kairo (paráfrase de duas falas, 11:44:05 + 11:44:17):** pediu o valor real para equalizar
  ("*me falar o valor*" / "*aí eu ajusto aqui e equalizo*").
- Gustavo, 11:47:10: *"Não, não, dos últimos sete dias aí… A gente tem um valor bem maior, ó."* →
  11:47:35: *"se a gente pegar, então a gente tem até um pouquinho mais, por exemplo, ali de lead
  qualificado, teria nove, pelo menos"* → 11:47:52: *"Quando você vai em campanhas, ele não tem nove
  lead qualificado nos últimos sete dias."*
- Kairo, 11:48:22: *"os leads da meta tinha que estar batendo com os leads reais aqui, né? E aí a gente
  checa também se os 9 aqui são de fato reais."*

**Âncora de código**
- Cartões Meta × CRM: `src/components/admin/campanhas/resumo-campanhas.tsx:82` ("Leads no CRM") e
  `:90` ("Leads que a Meta atribuiu"); a frase que nomeia de que lado caiu a diferença está em
  `explicarDiferenca`, `:44-52`.
- `leadsCrm = soma de linha.identificados`; `leadsMeta = soma de meta_insights_diarios.leads`;
  `qualificados = contagensDoFunil().qualificados` (`campanhas-queries.ts:357-391`). **`leadsCrm` herda
  o defeito do AJA-29** — reconciliar antes de corrigir é auditar número errado.
- Investimento: `gastosPorCampanha` soma `spend_cents` do nível `campaign` (`campanhas-queries.ts:424-447`);
  casamento com o funil por chave (`campaign_id` → `utm_campaign` → `ctwa_source_id`, `src/lib/meta-ads/resolver.ts:72-85`);
  `combinarCampanhas` (`src/lib/admin/campanhas-queries.ts:224-351`) cria linha só-Meta para quem gastou e não trouxe ninguém.
- `custoPor` (`campanhas-queries.ts:203-213`) já distingue `sem_vinculo` / `sem_gasto` / `sem_qualificado`.
- **O fragmento `atribuida` é local a `performance-queries.ts:101`** e está duplicado em
  `campanhas-queries.ts`, com a dívida declarada pelo próprio autor em `:466-472`.

**O que fazer**
- **Task 1 (diagnóstico, produção, prova no banco) — sem código.**
  Para a janela 16–22/09, por campanha: `spend_cents` somado por `entity_id`; quantas visitas/conversas
  casaram por `campaign_id` vs só por UTM; o total da tela; e quantos dos "9 qualificados" vieram de
  WhatsApp (cruza com AJA-29).
  Esqueleto: `SELECT i.entity_id, max(e.nome), sum(i.spend_cents) FROM meta_insights_diarios i LEFT JOIN
  meta_entities e ON e.entity_id = i.entity_id AND e.nivel='campaign' WHERE i.nivel='campaign' AND
  i.data BETWEEN '2026-09-16' AND '2026-09-22' GROUP BY 1;` — e do lado do CRM, agrupar visitas por
  `COALESCE(campaign_id, utm_campaign, ctwa_source_id)`.
  **Entregável: os números num comentário do PR.** Sem eles, o item não começa.
- **Task 2 (rótulo honesto, independente do diagnóstico).** Onde o total somar fontes não
  conciliáveis, a tela diz "Investimento reportado pela Meta" e "Investimento atribuído no CRM", com a
  diferença em reais e o motivo (sem campanha atribuída × janela de data). Reusar o padrão de
  `explicarDiferenca` — não inventar segunda linguagem para a mesma ideia.
- **Task 3 (fonte única).** Exportar `atribuida` de `performance-queries.ts:101` para
  `sinais-do-funil.ts` e consumir nos dois lugares. Pré-requisito de qualquer reconciliação.
- **Task 4 (motivo visível do custo por qualificado).** Garantir que a UI mostra o motivo textual
  quando `custoPor().tipo === "motivo"` (`formato.ts` + `resumo-campanhas.tsx`).
- **TDD:** (1) teste de integração que falha — campanha que gastou e não trouxe visita aparece com
  `visitas = 0` e `spendCents > 0`, e o total é a soma das linhas sem duplicar `entity_id`; (2) mínimo
  para passar; (3) verde; (4) commit `fix(admin): …`.

**Critério de aceite**
- `investimento reportado` + `investimento sem campanha atribuída` = total exibido, e a diferença tem nome.
- Nenhuma campanha entra duas vezes na soma.
- Zero qualificado → a tela diz "sem base" **e o motivo**.
- `leadsCrm` só é chamado de "leads" depois do AJA-29; antes disso, o rótulo diz "conversas".

**Teste de regressão**
Integração em `campanhas-queries.integration.test.ts`: campanha só-Meta; campanha com duas chaves de
CRM para o mesmo `entity_id`; total fechando.

**DECISÃO PENDENTE (Kairo + Gustavo):** qual investimento é o **oficial** na tela — o reportado pela
Meta (o que o Gustavo vê no gerenciador) ou o atribuído no CRM.

---

## AJA-19 · Criativo: miniatura de 40×40 e por que não há imagem grande

**Severidade:** médio — o Kairo prometeu na call.

**Fala literal** — Kairo, 11:42:51: *"Eu vou melhorar isso aqui, tá? Para quando você passar o mouse,
aumentar a imagem. É que eu não consegui ainda pegar o criativo maior. Mas para você ver, pelo menos
mais ou menos aqui, qual é a campanha que a gente está falando? Aqui ficou horrível, né? Porque está
pequeno a imagem."* → Bruna, 11:43:19: *"Mas eu consigo aumentar."* → Kairo: *"É não, mas eu vou
ajustar aqui para pegar a imagem maior."*

**Âncora de código — e uma correção importante**
- Único lugar com imagem de criativo: `SubTabelaCriativos` em
  `src/components/admin/campanhas/tabela-campanhas.tsx:136-199`. O `<img>` é 40×40
  (`className="size-10 shrink-0 rounded object-cover"`, `:167`) — **sem `hover`/`group-hover`/`Dialog`
  e não clicável**.
- O sync pede `creative{id,name,thumbnail_url,effective_object_story_id}` (`src/lib/meta-ads/cliente.ts:321`),
  mas **descarta o `effective_object_story_id`**: o parse em `:286-291` só lê `id`, `name` e
  `thumbnail_url`. Ou seja: **a chave para a imagem grande já vem no payload e é jogada fora.**
- Grava só `thumbnail_url` (`meta_entities.thumbnail_url`, `src/db/schema.ts:1287`); a tela lê só
  `thumbnailUrl` (`campanhas-queries.ts:510-545`).

**O que fazer**
- **Task 1 — usar o que já vem.** Guardar `effective_object_story_id` em coluna nova (`meta_entities`) e
  resolver a imagem grande por ele (`full_picture` do post) ou por `creative{image_url}`. A coluna
  nova é nullable; o upsert já tem lugar (`meta-ads-sync-cycle.ts:112-150`). `thumbnail_url` **não sai**
  — vira fallback.
- **Task 2 — a UI.** Miniatura continua 40×40 e clicar (botão, não `onMouseEnter` solto) abre
  `Dialog`/`Popover` com a imagem grande, o nome da peça e o funil do criativo. Sem imagem grande: abre
  o thumbnail ampliado com o aviso. Estado explícito, nunca vazio — o mesmo padrão que o arquivo já usa
  (`ImageOff` + "Nome pendente").
- **TDD:** (1) teste que falha no parse — `effective_object_story_id` presente no payload vira campo da
  entidade; (2) coluna + upsert; (3) teste de componente do diálogo (com `imageUrl` e sem); (4) verde;
  (5) commit.

**Critério de aceite**
- Clicar na miniatura abre a imagem grande; `Escape` fecha; foco volta.
- Anúncio sem criativo espelhado mostra estado explícito.
- Sem imagem grande, o diálogo abre o thumbnail **e diz que a versão grande não veio**.

**Teste de regressão**
`src/lib/meta-ads/cliente.test.ts` (já testa o parse de `creative`) + teste novo de componente. **Não
existe hoje teste de render da tabela de campanhas** — o teste do diálogo nasce junto.

**DECISÃO PENDENTE:** `effective_object_story_id` (mais barato, já no payload) ou `image_url` do
criativo (exige permissão `ads_read` sobre o criativo — o arquivo já degrada sem ela: `cliente.ts:145,212`).
Registrar a escolha em comentário no código, como o `semCriativo` já faz.

---

## AJA-20 · Régua: cadência dentro da janela de 24 h, teto de toques e o cadastro que não chega ao motor

**Severidade:** crítico — é o action point que o Kairo fechou com a Bruna; e tem dois blockers medidos
no código (um de ligação, um de portão).

**Falas literais**
- Kairo, 11:51:53: *"Isso deveria talvez, gente, ser mais… não tão fixo como a gente pensou… a IA
  entender ali o contexto e cara, mandar uma mensagem genérica do tipo: ó, Irene, vamos voltar a falar
  sobre a carta?"* → 11:52:48: *"não fechou, não precisava ter fechado… eu poderia ter pingado ela 30
  minutos depois ali, tipo um remarketing automático mesmo."*
- Kairo, 11:54:16: *"acho que a gente pode deixar como action point aqui a gente já fazer isso… Não
  deixar a janela fechar… Deixa aquele fluxo do remarketing por template para quando a janela fechar."*
- Cadência (12:05:50): *"Primeiro o cara não respondeu em 10 minutos. Eu já pingo ele em 10 minutos…
  depois é 20 minutos. Aí depois 30. Aí de 30 em 30 até infinitamente. Até acabar a janela."*
- Limite: Gustavo, 12:06:21 (*"pode virar um incômodo… Teria ali um limite nisso, infinitamente"*);
  Bruna, 12:07:09 (*"no máximo duas abordagens ali, um textinho curto"*); Kairo, 12:07:31 (*"até umas
  3, 4 mensagens não considero extremamente chato"*).

**Âncora de código — o que existe, e os dois portões**
- Fábrica: `ESPERA_SILENCIO_MS = 90 min`; `DIAS_ATE_SEGUNDO_TOQUE = 3`; `DIAS_ATE_TERCEIRO_TOQUE = 5`;
  `MAX_TOQUES = 3`; `TETO_TOQUES_30_DIAS = 3`; `JANELA_DO_TETO_MS = 30d`; `HORA_ABERTURA = 9` /
  `HORA_FECHAMENTO = 20` (`src/lib/remarketing/regua.ts:54-79`).
- A janela de 24 h **hoje só decide a forma do envio**: `entregaDe` (`regua.ts:495-499`) devolve
  `texto_livre` dentro de 24 h do último inbound, `template` fora. Não existe cadência curta.
- Elegibilidade de entrada: silêncio entre **90 min e 7 dias** (`src/lib/remarketing/motivo-de-exclusao.ts:195-250`;
  `parada_ha_mais_de_7_dias` no `:247`; `JANELA_DE_ENTRADA_MS` no `:169`).
- **BLOCKER 1 — o cadastro não chega ao motor.** `lerParametrosRegua()` (`src/lib/admin/remarketing-config.ts:280`)
  **não tem chamador em produção** (grep global: só a definição). O ciclo chama
  `decidir({ agora, estado, telefone, optoutDaPessoaEm, retomadaPermitida, telefoneDaEquipe })`
  **sem `parametros`** (`src/lib/workers/remarketing-cycle.ts:915-922`), caindo em
  `PARAMETROS_DE_FABRICA` (`motor.ts:404`). A tela promete "passa a valer em até um ciclo do motor, sem
  deploy" (`src/app/admin/(dashboard)/remarketing/config/page.tsx:36`) — **hoje é falso.**
- **BLOCKER 2 — há um portão fora da régua.** `src/lib/workers/retomada.ts:18-20` define
  `MAX_RETOMADAS = 2` e `BACKOFF_RETOMADA_MS = 30 * 60_000`. O ciclo passa
  `retomadaPermitida: podeRetomar(meta, agora.getTime())` (`remarketing-cycle.ts:920`) e o motor, quando
  é falso, devolve `semDisparo("teto_de_retomadas")` **sem gravar e sem enviar** (`motor.ts:442-443`).
  Consequência: uma escala de 10/20/30 min **morre no toque 2** (backoff de 30 min) e no toque 3
  (`MAX_RETOMADAS = 2`) — em silêncio, porque o caminho é `texto_livre` → `turno_de_retomada`.
  **Qualquer teste que só exercite `regua.ts` passa verde enquanto produção não dispara.**
- **Divergência a resolver:** a call fala "ele roda a cada 30 minutos" (Kairo, 11:49:31); o ciclo é
  BullMQ com `POLL_INTERVAL_MS` (default **30 s**, `remarketing-cycle.ts:1043`, configurável por env).
  Uma cadência de 10 minutos não existe se o ciclo roda a cada 30 s nem se roda a cada 30 min — o
  intervalo real tem que ser conferido **em produção** (task 0).

**O que fazer**
- **Task 0 — medir o intervalo real do ciclo em produção.** Ler o log do worker
  (`aja-agora-worker`) e conferir `REMARKETING_POLL_INTERVAL_MS`. Sem isso, a escala é desenho no ar.
- **Task 1 (blocker, primeiro).** Ligar o cadastro ao motor: ler `lerParametrosRegua()` **uma vez por
  ciclo** e passar em `EntradaDoMotor.parametros`. Teste puro **e teste de integração do ciclo**:
  com linha em `remarketing_config` alterando `diasAteSegundoToque`, o intervalo decidido muda; sem
  linha, fábrica; valor inválido volta à fábrica (`normalizarParametros`, viés "na dúvida, menos toque").
- **Task 2 (cadência intra-janela).** Novo parâmetro nomeado em `ParametrosRegua` —
  `escalaDeRetomadaMs: number[]` (fábrica `[10, 20, 30]` min) — e um modo de agendamento que, **quando
  o último inbound está dentro da janela de 24 h**, usa a escala curta em vez de
  `esperaSilencioMs + dias`. Mantém as guardas: `tetoToques30Dias`, `maxToques`, janela de horário.
  `entregaDe` continua decidindo texto livre × template **pelo mesmo fato**.
- **Task 3 — destravar o portão de retomadas, explicitamente.** A escala curta **não cabe** em
  `MAX_RETOMADAS = 2` / `BACKOFF_RETOMADA_MS = 30 min`. Duas saídas — **DECISÃO PENDENTE (Kairo)**:
  (a) o teto e o backoff de retomada passam a ser **parâmetros da régua** (um contador por *ciclo* da
  régua, não por conversa), e a escala curta vira o caminho; ou (b) os toques intra-janela **não** são
  turnos de retomada e ganham um contador próprio, deixando `retomada.ts` intacto para a retomada
  normal. A (b) separa dois conceitos que hoje estão colados — e é a que o PRD **recomenda**.
  Qualquer que seja, o item **exige** o teste de integração no ciclo provando que o toque 2 e o 3 saem.
- **Task 4 — limite de toques.** O número final (2, 3 ou 4) é decisão de produto (Bruna 2, Kairo 3–4).
  O código parametriza: escala e teto vivem no cadastro; a decisão vira linha em `remarketing_config`.
- **Task 5 — por que não saiu o próximo toque (o caso da Irene).** Hoje o motivo de **entrada** é
  nomeado (`motivoForaDaRegua`), mas o motivo de **repetição** (`aguardando_data`, `teto_30_dias`,
  `fora_da_janela_de_horario`, `esgotado`, `teto_de_retomadas`) **não é persistido**: `motivo_saida`
  só guarda terminal. **DECISÃO PENDENTE:** coluna nova com o último motivo de bloqueio (e o backfill
  fica `NULL`, dito na tela) — ou calcular em tela a partir do estado, que é mais barato e não mente
  sobre o passado. O PRD recomenda **calcular em tela** primeiro.
- **TDD:** (1) testes puros que falham (silêncio de 12 min com janela aberta → toque 1 elegível;
  janela fechada → não; teto 30d cheio → `teto_30_dias`; três toques → `esgotado`); (2) implementar o
  mínimo; (3) **teste de integração do ciclo** provando que o toque sai (esta é a prova que falta
  hoje); (4) verde; (5) commit.

**Critério de aceite**
- Com a janela aberta, uma conversa em silêncio recebe o toque 1 **na escala curta**, e o 2 e o 3
  também saem (não morrem em `teto_de_retomadas`).
- Fora da janela de 24 h, o comportamento por template continua o de hoje (não regride).
- Alterar `remarketing_config` muda o comportamento **sem deploy**.
- Nenhum envio fora de 9h–20h.

**Teste de regressão**
Puro (por `agora`) **+ integração no `runRemarketingCycle`**: linha em `remarketing_config` alterando a
escala → três toques saem no intervalo novo; `optoutDaPessoaEm` preenchido → nenhum toque; telefone da
equipe → nenhum toque.

---

## AJA-21 · Mensagem por macro-fase do funil (as três comunicações)

**Severidade:** alto — é o que substitui o "desenho do mundo ideal" que a Bruna não quer esperar.

**Falas literais**
- Kairo, 12:02:49: *"Por que a gente não pensa no fluxo mais genérico desse… Vamos pensar em três
  mensagens genéricas ali pra macro fases do funil… se o cara tá no início ainda, ele não viu a…
  ele chegou até visualizar a oferta. A gente vai mandar um tipo de mensagem pra ele. No template, eu
  tô falando assim, pra gente preparar uma mensagem fixa, que ele consiga voltar a conversar com a
  gente, apelativa mesmo."* → 12:03:26: *"Já tá no finalzinho, é só fechar? A gente manda outra… E aí
  a gente fecharia nesses três."*
- Bruna, 12:04:46: *"a mesma mensagem genérica… mas se a gente sabe que o cara quer moto, já colocar a
  palavra moto, o cara quer imóvel… só para o cara se sentir do tipo, puta, ele minimamente sabe o que
  eu quero."*

**Âncora de código**
- O objetivo do toque já é `carro | moto | imovel` (`src/lib/remarketing/motor.ts:99-160`):
  `templateDoObjetivo` (`:160`) e `arteDoObjetivo` (`:178`) decidem a chave do template e a arte do bem.
- Template de remarketing **não tem parâmetros `{{1}}`** hoje (`remarketing-cycle.ts:767-774`).
- O turno de retomada é um turno **real** do orquestrador (`dispararTurnoReal`, `:727`) — não existe
  canal paralelo de texto enlatado.
- **Correção de âncora:** `teve_proposta` **não existe** em `sinais-do-funil.ts`. Hoje ele está inline
  em `src/lib/admin/percurso-queries.ts:140`, `performance-queries.ts:190` e `src/lib/exportacao/percurso.ts:136`. O que
  existe na fonte única é `ARTIFACTS_DE_OFERTA_SQL` (`sinais-do-funil.ts:152`).

**O que fazer**
- **Task 1 — a fase é um fato do servidor.** Função pura `faseDoFunil(sinais): "inicio" | "viu_oferta" | "fechamento"`,
  com os sinais vindo da fonte única. **Pré-requisito: extrair `teve_proposta` para
  `sinais-do-funil.ts`** (hoje inline em três arquivos) — não criar quarta definição.
- **Task 2 — a chave do template passa a ser fase × bem, e a resolução continua no dispatcher.**
  Hoje é `remarketing_oportunidade_<objetivo>`. Proposta: `remarketing_<fase>_<objetivo>`, com fallback
  para o genérico. **Onde mora a checagem de "template aprovado":** a função pura **não** decide isso —
  ela devolve a **lista ordenada de chaves candidatas** (`[fase+bem, genérico]`), e quem decide qual
  existe/aprovado é o `template-dispatch` (`template-dispatch.ts:1-19`, que já enfileira quando não há
  aprovado). Contrato explícito, para a função pura continuar pura.
- **Task 3 — a palavra do bem.** Quando o objetivo é conhecido, a comunicação diz o bem. Isso é
  **conteúdo** (template na Meta) e, no caminho de texto livre, é **do modelo** (diretiva de retomada +
  prompt no Langfuse). **Não criar texto fixo no código**: se ficar ruim, a hipótese é prompt/contexto.
- **Task 4 — a arte.** `arteDoObjetivo` já devolve `null` sem bem conhecido; a regra "nenhuma arte
  quando o bem é desconhecido" já é o comportamento — confirmar com teste.
- **TDD:** (1) teste puro de `faseDoFunil` nos três estados; (2) teste puro das chaves candidatas e da
  ordem de fallback; (3) teste do dispatcher escolhendo/enfileirando; (4) verde; (5) commit.

**Critério de aceite**
- Lead que viu oferta e não respondeu recebe a comunicação de `viu_oferta`, não a de início.
- Sem template aprovado para a combinação, o toque **enfileira** (não desaparece) e o admin é alertado.
- Textos revisados pela Bruna antes de publicar (ela pediu: *"você põe no grupo, a gente pode testar"*,
  12:22:06).

**Dependência:** o AJA-24 (disparo dos parados) **usa** esta comunicação — ver a ordem nas Ondas.

**DECISÃO PENDENTE (Bruna + Gustavo):** o texto das três comunicações. O código entrega a estrutura e as
chaves; o texto entra por cadastro, nunca por commit.

---

## AJA-22 · Visão dos leads parados: quem, em que etapa e qual a última interação

**Severidade:** crítico — a Bruna precisa disso para decidir se liga para os 9.

**Falas literais**
- Bruna, 12:10:09: *"Eu preciso saber quem são esses nove, porque se for o caso, eu tenho que ligar…
  porque eles continuam parados desde a semana passada."* (o bloco fecha com *"É saber o que o de
  fato."*, ainda em 12:10:09 — em 12:10:59 quem fala é o Gustavo.)
- Kairo, 12:11:52: *"Tem, cara. Inclusive eu tô nele aqui. A gente só precisa ajustar ele pra um jeito
  que fica legal pra todo mundo entender."* → 12:12:12: *"O que está parado a gente já tem, que é o
  próprio pipeline…"* → 12:13:02: *"Aqui eu acho que dá pra gente cruzar as informações."*
- Bruna, 11:49:07: *"o suprassumo da jornada… é quantos de fato pediram a simulação, né?"*

**Âncora de código**
- "Onde cada conversa parou" **existe**: `performance-queries.ts:158-217` calcula a profundidade por
  conversa (1..7) e devolve `pararam` / `vivas` (viva = último inbound do cliente < 7 dias **e**
  `status = 'active'`, `DIAS_PARA_CONSIDERAR_VIVA`).
- O percurso já filtra por degrau e modo (`?passo=se_identificou&modo=parou`, `percurso-queries.ts:303-308`;
  `percurso-types.ts:112`).
- O motivo de **não entrar** na régua é nomeado: `src/lib/admin/motivo-fora-da-regua.ts` (o
  `motivoForaDaRegua`, `:187`; `sem_contato` no `:206`) e `src/lib/remarketing/motivo-de-exclusao.ts`
  (as 11 guardas, `:195-250`, com rótulo humano em `ROTULO_DO_MOTIVO_DE_EXCLUSAO`, `:78`).
  **Achado colateral:** `motivo-fora-da-regua.ts:187` é um **espelho manual** das mesmas 11 guardas —
  duas verdades para a mesma pergunta, contra a restrição #9 — **e a duplicação não são só as guardas:**
  `JANELA_DE_ENTRADA_MS` é re-declarada em `motivo-fora-da-regua.ts:47` **e** em
  `motivo-de-exclusao.ts:169` (mesmo valor), e as tabelas de rótulo existem em dois lugares
  (`ROTULO_DO_MOTIVO`, `:73` × `ROTULO_DO_MOTIVO_DE_EXCLUSAO`, `:78`). **Task 0 deste item unifica as
  três coisas.**
  **Raio de alcance (medido):** `motivoForaDaRegua` é consumido por 7 módulos
  (`src/lib/admin/remarketing-tela.ts:62`, `remarketing-queries.ts:49`, `regua-por-conversa.ts:31`,
  `src/components/admin/conversations/conversations-table.tsx:32`,
  `src/components/admin/percurso/tabela-percurso.tsx:22`, `estado-na-lista.ts:27`,
  `src/app/api/admin/remarketing/route.ts:2`), e `JANELA_DE_ENTRADA_MS` é reexportada por
  `regua-por-conversa.ts:227`. Não é troca de uma linha.

**O que fazer**
- **Task 0 — unificar o motivo.** `motivoForaDaRegua` deixa de reimplementar a ordem das guardas e
  passa a chamar `avaliarElegibilidade` (a mesma função que o ciclo usa). Teste que prova que a tela e
  o ciclo concordam para os 11 motivos.
- **Task 1 — a **tela** e o **contrato** (o que o revisor achou raso).** Onde: **na tela de Percurso**,
  como um modo (`?passo=…&modo=parou`) enriquecido — nada de página nova. O shape da lista por pessoa:
  `{ etapaAlcancada, ultimaInteracaoEm, ultimaInteracaoAutor: "cliente" | "agente" | null, telefone,
  email, naRegua: boolean, motivoForaDaRegua: MotivoDeExclusao | null, canal, origem, pediuSimulacao }`.
  API: estender `GET /api/admin/percurso` (ou a rota que a tela já usa) — **sem rota nova**. Ordenação
  default: **parado há mais tempo primeiro** (é a pergunta dela). Paginação: o teto que a tela já usa
  (`LIMITE_MAXIMO = 200`).
- **Task 2 — "parado" tem um critério único, no servidor.** Reusar `DIAS_PARA_CONSIDERAR_VIVA` e
  `status`. Um segundo critério na tela seria a segunda verdade que o repo proíbe.
- **Task 3 — "de fato pediu a simulação".** O degrau honesto é `viram_oferta` (`ARTIFACTS_DE_OFERTA_SQL`).
  Usar o rótulo existente ("Viram oferta"); não criar métrica paralela.
- **Task 4 — o entregável nomeado: "quem são os 9".** Além da tela, este item produz a **resposta
  concreta** para a Bruna: dos 9 qualificados da Meta no período, quem é, em que etapa, se pediu
  simulação, se está na régua e por que não (cruza com AJA-29: quantos são "identificados" só pelo
  canal). Sai em conversa/planilha, com a tela como fonte.
- **Task 5 — exportação leva o filtro.** Hoje a exportação só carrega `from/to`
  (`src/app/admin/(dashboard)/exportacao/page.tsx:98-117`, `OpcoesDeExportacao` só tem `de/ate/mascarar`). Se a lista ganhar
  filtro de etapa, o link leva junto.
- **TDD:** (1) teste de integração que falha — pessoa com telefone da equipe sai com o motivo nomeado,
  não some; (2) implementar; (3) teste que fecha os números (lista == escada == funil); (4) verde;
  (5) commit.

**Critério de aceite**
- A lista fecha com o número da Performance na mesma etapa e período (senão é o defeito de "duas
  verdades").
- Toda pessoa traz a última interação com data **e autor**.
- Quem está identificado e parado aparece **na régua ou com o motivo nomeado**.
- Existe a resposta escrita para a Bruna com os 9.

**Teste de regressão**
Integração: mesma janela/degrau → total da lista == escada do Percurso == funil da Performance; os 11
motivos de exclusão idênticos entre ciclo e tela.

---

## AJA-23 · Higiene da base: teste, "cliente oculto", seleção e o filtro "identificável"

**Severidade:** alto — sem isso a Bruna trabalha lead que não existe e a régua conta errado.

**Falas literais**
- Kairo, 12:18:21: *"Primeira coisa que eu vou fazer é limpar todo mundo que não deveria estar ali.
  Deletar teste meu, seu, do Gustavo, os clientes ocultos também, eu acho que a gente pode deletar,
  certo?"* → 12:18:54: *"Vamos deixar só gente real."*
- Kairo, 12:19:03: *"Foi só pela web e eu não tenho contato dele. Esses aí também eles já não entram
  nessa seara nossa aqui de recontactar."* → Bruna, 12:19:50: *"Excluiria, porque ele pode ajudar alguma
  coisa na conversa, alguma coisa que a gente possa analisar…"* → 12:20:00: *"Dependendo, deveria
  guardar essa informação em algum lugar, entendeu?"*
- Kairo, 12:20:05: *"Talvez então, Bruna, lá em cima onde a gente tem o filtro da data, talvez eu
  coloque um filtro de identificável… Até no próprio funil ali, né? Naquele do Kanban."*

**Âncora de código**
- **Delete existe, e é estreito:** além de `administradoras`, `administradora-docs`, `attendants` e
  `mesa-attendants`, há `DELETE` em `src/app/api/admin/simulator/sessions/[id]/route.ts:78-96`, que
  apaga **linha de `conversations`** (`db.delete(conversations)…`), admin-only, **guardado por
  `isSimulated = true`**. Ou seja: **não existe delete de conversa REAL** — é assim que a premissa
  deve ser escrita.
- **"Cliente oculto" não existe como conceito no código** (grep: só `/reset` oculto e UI escondida).
  O que existe é lead sem `contactId`, o motivo `sem_contato` da régua (`motivo-fora-da-regua.ts:206`)
  e o rótulo de exportação `sem vínculo: conversa sem contato` (`exportacao/textos.ts:20`).
- **Não existe filtro "identificável"** em tela nenhuma. O que existe: o degrau `se_identificou` do
  Percurso (`phone IS NOT NULL OR email IS NOT NULL`, `percurso-queries.ts:134`) — **que o AJA-29 vai
  corrigir**. Este item depende do AJA-29 para o predicado.
- **Marcar conversa como teste existe**: `PATCH /api/admin/conversations/[id]` (admin-only) propaga
  `isSimulated` para conversa **e** leads e segura a linha da régua (`motivo_saida = 'teste'`); é
  reversível e **não** devolve a linha à régua.
- **Kanban:** `GET /api/admin/leads` devolve todos os leads, **sem `where`** e sem `is_simulated`
  (`route.ts:27-42`); o recorte de período é **no cliente**, por `lead.createdAt`
  (`pipeline-filters.tsx:103-110`), com default resolvido por `fromUrl ?? cookie aja_periodo ??
  INICIO_DO_COLETOR` (`src/components/admin/pipeline/periodo-do-pipeline.ts:40-52`; `INICIO_DO_COLETOR = "2026-08-18"`,
  `periodo.ts:61`). **O cookie tem precedência sobre o "desde o início"** — corrigir sem olhar isso
  quebra o compartilhamento de tela.

**O que fazer**
- **Task 1 — "cliente oculto" são os conhecidos da Bruna que caíram na mesa.** **DECIDIDO (Kairo,
  22/09):** não é "lead sem contato alcançável" (a hipótese anterior estava errada); é lead real que
  **não é cliente** — gente da rede dela que entrou no fluxo. O sistema não tem como adivinhar isso.
  Portanto: (a) o tratamento é **marcar como teste** (`isSimulated`, o que já tira do funil e segura a
  régua); (b) o que falta é a **ação em lote** e um jeito de achar esses casos na lista (o pipeline com
  filtro de período no servidor, do T4, é o que dá a ela a lista curta para varrer); (c) o relatório de
  candidatos (T3) não tenta adivinhar "amigo da Bruna" — traz os sinais objetivos (teste, telefone da
  equipe, sem contato) e **a lista de quem caiu na mesa sem origem de campanha**, que é onde esses
  casos aparecem.
- **Task 2 — filtro "identificável" (o pedido explícito).** Binário "tem contato informado pelo
  cliente" — o predicado do AJA-29, extraído para `sinais-do-funil.ts` e consumido na lista de
  conversas, no Pipeline e no Percurso.
- **Task 3 — limpeza em lote, sem delete.** Duas ações: (a) **marcar como teste em lote** (a rota já
  propaga e segura a régua; falta a ação em lote e o alvo "telefones da equipe", que já existe em
  código: `TELEFONES_DA_EQUIPE_PADRAO`, `motor.ts:77`, cruzado com `mesa_attendants` ativos **ou não**);
  (b) **relatório de candidatos** com forma definida — para cada linha: `motivo`
  (`teste` | `telefone_da_equipe` | `sem_contato`), `conversationId`, `contato`, `últimaAtividade`, e
  `[ ] aplicar` — exportável em CSV pela tela de exportação (tipo novo `limpeza`), com o Kairo
  marcando o que aprova. **Delete de conversa REAL continua não existindo**; se ele quiser, é item
  separado com desenho de consequência (cascata em `messages`, `artifacts`, `remarketing_touches`).
- **Task 4 — o kanban para de contar errado.** Mover o período para o **servidor** (a rota passa a
  aceitar `from`/`to` e a resolver `cookie > INICIO_DO_COLETOR` como hoje) e **excluir simulado por
  padrão**, com o mesmo opt-in explícito de `/api/admin/conversations` (`include_simulated=true`).
  Manter o recorte por `lead.createdAt` **ou** alinhar com a chegada da visita — **DECISÃO PENDENTE**,
  porque muda o número: o PRD recomenda alinhar com a chegada (é o que as outras telas usam) e dizer na
  tela qual data recorta.
- **TDD:** (1) teste de integração da rota que falha (`?from&to` recorta no servidor; simulado fora por
  padrão); (2) implementar; (3) teste do filtro identificável igual nas três telas; (4) verde; (5) commit.

**Critério de aceite**
- O kanban abre com o mesmo período das outras telas e **sem** lead simulado por padrão.
- O filtro "identificável" responde igual nas três telas onde aparece.
- Marcar em lote é reversível e segura a régua; nada é apagado.
- O relatório de candidatos tem forma, motivo por linha e exportação.

**Teste de regressão**
Rota de leads (período no servidor, simulado fora, dedup por contato preservado — a regra de
`kanban-dedup.ts` não muda) e o lote de "marcar como teste".

---

## AJA-24 · Disparo dos parados em três toques e a marcação de "perdido"

**Severidade:** alto — é o que "dá vazão" ao bolo parado.

**Falas literais**
- Kairo, 12:20:41: *"eu tento separar eles e montar uma mensagem pelo menos para cada grupo… E aí você
  critica a mensagem… E aí você me liberando. Eu já mando essas."* → 12:21:04: *"Tem que ser pelo menos
  umas três mensagens, né?… o primeiro toque, o segundo toque, o terceiro toque. Pinguei e ele não
  respondeu, aí a gente vai marcar ele como perdido."*
- Kairo, 12:23:25: *"Vamos imaginar que a gente faça essas três tomadas aí, desses caras que estavam
  parados. Aí a gente marca eles como perdidos… a gente pode pensar num próximo fluxo dos perdidos."*
- **Alerta (ainda não explicitado em item):** Kairo, 11:54:04 — *"se ela parou de responder, aí
  realmente entra num alerta, alguma coisa do tipo, para a gente revisar depois."*

**Âncora de código**
- O estágio `perdido` existe e é terminal (`lead-stages.ts:9-27`). **Quem o seta:**
  - `repproved → perdido`: `src/lib/bevi/proposal-status.ts:159`, aplicado por
    `src/lib/workers/proposal-status-poll.ts:61`;
  - **perdido por inatividade:** `markStaleProposalsLost` em `proposal-status-poll.ts:114-131`;
  - manual no kanban: `lead-card.tsx:210` (`onAvancar(lead.id, "perdido")`).
  *(O PRD anterior dizia que `:130` era `repproved → perdido`; é inatividade. Corrigido.)*
- **Não existe ligação entre "esgotou os 3 toques" (`remarketing_touches.status = 'ESGOTADO'`) e
  `leads.stage = 'perdido'`.**
- A entrada na régua tem janela de **7 dias** (`motivo-de-exclusao.ts:247`) — o bolo que a Bruna quer
  retomar está fora por construção, e a decisão escrita no código é **"não se reabre retroativamente"**.
- A régua tem **teto por pessoa** (`TETO_TOQUES_30_DIAS = 3`, janela de 30 dias: `regua.ts:66-69`), que
  `podeDisparar` cobra (`:319`), e **opt-out por pessoa** (`contacts.remarketing_optout_at`), que a
  régua trata como terminal.
- `POST /api/admin/remarketing/[conversationId]` já tem segurar/soltar por conversa.

**O que fazer**
- **Task 1 — reabertura deliberada, com as guardas explícitas.** Ação de admin que inscreve em lote as
  conversas elegíveis **ignorando a janela de 7 dias**, criando/reativando a linha. Estado inicial da
  linha, explícito: `step = 0`, `status = "ATIVO"`, `nextTouchAt = agora` (o toque 1 sai no próximo
  ciclo), `touchesNaJanela = []`, `touches30d = 0`, `motivoSaida = null`, e um registro de **quem
  autorizou e quando** (o cadastro `remarketing_config` serve, ou uma coluna `origem_da_reentrada`).
  **Guardas que NÃO se afrouxam:** `optoutDaPessoaEm` (quem pediu para sair **nunca** reentra),
  `telefone da equipe`, `is_simulated`, e a **decisão** sobre o teto de 30 dias —
  **DECISÃO PENDENTE:** a cota de 30 dias conta a reentrada (mais conservador) ou é zerada junto com o
  `step` (mais agressivo)? O PRD recomenda **contar** (a cota é da pessoa, não do ciclo).
  Corrida com o `entrar()` do ciclo: o índice único por conversa (`remarketing_touches_conversation_id_idx`)
  resolve o duplicado, mas a ação precisa ser idempotente e não pode reativar quem ficou terminal
  **por ter respondido**.
- **Task 2 — esgotamento vira "perdido".** Quando `maxToques` sai sem resposta e a linha vira
  `ESGOTADO`, transicionar o lead via `transitionLeadStage(leadId, "perdido", { type: "system" })` —
  o caminho oficial (com evento em `lead_events`), o mesmo que a proposta reprovada usa.
  **Interação com o caminho de inatividade** (`markStaleProposalsLost`): se o lead já está `perdido`,
  não transicionar de novo; se o `markStaleProposalsLost` chegar depois, ele é no-op. **Qual vence:**
  primeiro quem chega; a transição é idempotente e ambas gravam o motivo.
- **Task 3 — o alerta de "parou de responder" (11:54:04).** Um sinal revisável quando a sequência
  termina sem resposta **e** o lead não é `perdido` automaticamente (o caso da Task 2 com a decisão
  pendente desligada). Entra como estado na tela da régua ("esgotou, aguardando revisão humana"), não
  como notificação nova.
- **Task 4 — o fluxo dos perdidos (ligação humana).** Depois de `perdido`, o próximo passo é humano
  (a Bruna falou em ligar). É **operação**, não código novo neste PRD: o `perdido` já aparece no kanban
  e a mesa existe.
- **TDD:** (1) teste de integração que falha — esgotar 3 toques → `remarketing_touches.status = 'ESGOTADO'`
  **e** `leads.stage = 'perdido'` com `lead_events`; (2) implementar; (3) teste do opt-out barrando a
  reentrada; (4) verde; (5) commit.

**Critério de aceite**
- O lote reaberto entra com contagem zerada e origem registrada, **sem** reabrir quem tem opt-out.
- Ao esgotar o terceiro toque, o lead aparece como `perdido` **com evento**.
- Quem respondeu no meio do caminho **não** vira perdido.
- Um perdido por esgotamento **não** conta como qualificado em lugar nenhum (`ESTAGIOS_QUALIFICADOS`
  o exclui — prova em teste).

**Dependência:** este item **usa** a comunicação do AJA-21 — ver a ordem nas Ondas.

**DECISÃO PENDENTE:** marcar `perdido` automaticamente ao esgotar (tira o lead de "em atendimento") ou
sugerir para revisão humana.

---

## AJA-25 · "Já foram enviados oito — para quem, e qual toque?"

**Severidade:** médio — a pergunta é literal, e a resposta hoje existe só agregada.

**Fala literal** — Kairo, 12:12:30: *"a gente teria aqui uma métrica de ó: já foram enviados oito.
Para quem que foi? E como que foi? Foi o primeiro toque, o segundo ou o terceiro? É onde a gente
para, né?"* → 12:13:02: *"Talvez é só deixar isso mais… mais claro aqui pra gente… Aqui eu acho que dá
pra gente cruzar as informações."*

**Âncora de código (o que já existe — bastante)**
- Resumo com 6 cartões, incluindo "Toques enviados" (`resumo-da-regua.tsx:75`) — AJA-04 fechou.
- Tabela com "Passo atual" e "Próximo toque" (`tabela-remarketing.tsx:78-89`).
- Insights com funil por passo e a atribuição da conversão ao toque (`insights-da-regua.tsx`).
- Dados por conversa em `GET /api/admin/remarketing` e `GET /api/admin/remarketing/[conversationId]`.
- **O que já registra a forma do envio:** `messages.template_name` (`src/db/schema.ts:467`) e
  `whatsapp_outbound_queue` (`:1147`) registram template e fila. **Não** é verdade que "sem coluna nova
  não há resposta" — o reuso é possível e deve ser avaliado **antes** de pedir migration.

**O que fazer**
- **Task 1 — "para quem":** clicar em "Toques enviados" (ou no passo 1/2/3 do funil) abre a lista das
  pessoas que receberam aquele toque, com data/hora, **a forma** e se respondeu depois. Filtro por
  passo explícito na tabela.
- **Task 2 — a forma do envio, com reuso primeiro.** Derivar de `messages.template_name` +
  `whatsapp_outbound_queue` quando existir; só criar coluna em `remarketing_touches` se o reuso não
  cobrir o caso (turno de retomada × template × enfileirado). Se criar coluna: **dizer na tela que o
  histórico anterior à migration não tem o dado** (`NULL` ≠ "texto livre").
- **Task 3 — o "onde a gente para".** O limite exibido vem do **cadastro vigente**, não da constante
  do código (é o AJA-20 visto por outro ângulo).
- **TDD:** (1) teste que falha — contadores por passo somam o total ("chegaram é cumulativo e as contas
  fecham", padrão que já existe em `remarketing-tela.test.ts`); (2) implementar; (3) teste do recorte
  por passo devolvendo N == o número do passo; (4) verde; (5) commit.

**Critério de aceite**
- Clicar no toque 02 mostra exatamente quem o recebeu, com data e forma.
- A soma dos passos bate com "Toques enviados".
- Toque enfileirado aparece com o estado "aguardando template".
- O limite exibido vem do cadastro.

---

## AJA-26 · Custo de IA e de mensagem (o CPC que a Bruna quer fechar)

**Severidade:** alto — pedido explícito, e hoje **não existe nenhuma das duas metades**.

**Fala literal** — Bruna, **12:17:26**: *"E uma coisa só que uma hora que der, você checar e ver o custo
de IA e das mensagens de remarketing, tá? Porque eu tô tentando levantar todos os custos para a gente
calcular o CPC depois quando precisar de jeito."* (Em 12:17:19 ela falava da rodada de sexta.)
→ Kairo: *"Vou atualizar vocês quanto isso aí."*

**Âncora de código (o que existe — e o que não existe)**
- **Não existe custo de LLM** (nenhuma tabela de preço, nenhuma conversão token→dinheiro).
- Tokens: (a) o turno emite **só cache** (`cacheRead`/`cacheWrite`, `converse.ts:1213-1214` →
  `turn-trace.ts:53,55`); (b) tokens completos só na **avaliação**
  (`conversation_evaluations.tokens_input/tokens_output`, `src/db/schema.ts:804-805`, escritos por
  `eval/scorer.ts` e pelo diagnose).
- **Não existe custo de mensagem de WhatsApp**; `whatsapp_outbound_queue` existe (`src/db/schema.ts:1147`) mas
  sem preço.
- O investimento de mídia **existe e é confiável**: `meta_insights_diarios.spend_cents`,
  `gastosPorCampanha` (`campanhas-queries.ts:424-452`), `custoPor` (`:203-213`).

**O que fazer — caminhos concretos (o revisor achou este item raso e ele tem razão)**
- **Task 1 — caminho do custo de IA, decidido antes de começar.**
  **Rota A (recomendada, mais barata):** gravar `tokens_input`/`tokens_output` do turno. O ponto de
  entrada é o evento `usage` do turno (`converse.ts:1213-1214` e o tipo em
  `src/lib/agent/orchestrator/types.ts`), persistido em tabela nova `usos_de_ia(conversationId,
  turnoEm, modelo, tokensInput, tokensOutput)` e multiplicado por **`src/lib/admin/precos-dos-modelos.ts`**
  — tabela versionada em código com `{ modelo, vigenteDe, centsPorMilInput, centsPorMilOutput }`.
  Arquivos tocados: `converse.ts` (emitir os totais), `telemetry/turn-trace.ts` (campo novo),
  migration da tabela, `src/lib/admin/custo-de-ia.ts` (a função de cálculo, pura) e o bloco na tela.
  **Rota B:** ligar model pricing no Langfuse e ler o custo de lá — nenhum código de cálculo, mas o
  número mora fora do nosso banco e depende da UI de terceiro.
  **DECISÃO PENDENTE (Kairo):** A ou B.
- **Task 2 — custo de mensagem, em duas metades.** (a) **Contagem** (fato do servidor, verificável):
  quantos templates/conversas saíram no período, de `messages.template_name` e
  `whatsapp_outbound_queue`. (b) **Preço**: parâmetro de cadastro (mesmo desenho de
  `remarketing_config`) — **não hard-codar** a tabela de preço da Meta, que muda por categoria/país.
- **Task 3 — a tela.** Bloco com: investimento Meta, custo de IA, custo de mensagem, leads/conversas/
  qualificados e o **CPC resultante**, **cada número com a fonte** e o aviso quando o preço não está
  cadastrado ("sem preço cadastrado" ≠ zero).
- **TDD:** (1) teste puro de `custoDeIA({tokens, modelo, quando})` falhando — preço vigente na data,
  modelo desconhecido → `null`, nunca zero; (2) implementar; (3) integração da contagem por template;
  (4) verde; (5) commit.

**Critério de aceite**
- O custo de IA do período é reproduzível a partir dos dados gravados (não de estimativa).
- Custo de mensagem aparece como **contagem** mesmo sem preço.
- Ausência de preço significa "não calculável", nunca "R$ 0,00".

---

## AJA-27 · Padronizar "Propostas" — cinco unidades para o mesmo rótulo

**Severidade:** crítico — é literalmente a dúvida que a Bruna mandou por WhatsApp e não conseguiu
resolver nem trocando o período.

**Âncora de código — as CINCO unidades (todas verificadas)**
| Onde | Unidade | Expressão | Arquivo:linha |
|---|---|---|---|
| Campanhas + Tabela de origens (Performance) | **linha de proposta** | `count(DISTINCT bp.id)` | `sinais-do-funil.ts:143` |
| Funil de mídia (Performance) | **conversa com proposta** | `count(DISTINCT c.id) … JOIN bevi_proposals` | `performance-queries.ts:147-149` |
| Percurso / "onde parou" (booleano) | **pessoa/conversa com proposta** | `EXISTS (… bevi_proposals)` | `percurso-queries.ts:140`, `performance-queries.ts:190` |
| Funil comercial (handoff) | **lead que alcançou o estágio** | `etapas…proposta_enviada` | `handoff-queries.ts:277` |
| **Kanban (Pipeline)** | **lead no estágio `proposta_enviada`**, sem filtro de simulado, período no cliente | `leads.length` | `kanban-column.tsx:64` |

E o outro lado da mesma dúvida — "3.346 que chegaram":
- **chegada** = `count(*) … VISITA_CONTAVEL` (`performance-queries.ts:277`), que é a sublinha
  "chegadas ao todo" da porta do funil;
- **pessoa** = `count(DISTINCT chaveDaPessoa)` (`:272`) e `totalDePessoas` do Percurso
  (`percurso-queries.ts:345`) — a MESMA definição nas duas telas;
- o número grande da porta é **pessoas** desde 24/08/2026 (`ba4c4eaa`).
Portanto: 3.346 comparado com o total do Percurso **só bate se for o número de pessoas**. Comparar
chegadas com pessoas é comparar coisas diferentes — e a tela tem que dizer isso **onde a confusão nasce**.

**O que fazer**
- **Task 1 — uma unidade por rótulo.** Onde aparecer "Propostas", a unidade é explícita no
  cabeçalho/tooltip ("propostas criadas" = `bp.id`; "pessoas com proposta" = chave de pessoa). O
  Percurso **não muda de unidade** — o contrato dele é uma linha por pessoa (`src/lib/admin/percurso-queries.ts:13`).
  O que muda é o rótulo dizer isso.
- **Task 2 — o kanban entra no contrato (o revisor cobrou: o item não pode empurrar tudo para o
  AJA-23).** Aqui a decisão é **de rótulo e de conta**: o kanban conta **lead por estágio** e vai
  continuar contando isso — então o rótulo da coluna diz "leads no estágio Proposta enviada", e a nota
  do card diz que **não** é a mesma grandeza das telas de mídia. O AJA-23 T4 muda o **recorte**
  (período/simulado); este item muda o **nome**. Os dois juntos fecham a divergência.
- **Task 3 — as contas fecham na mesma tela.** Teste que prova que, na tela de Performance, a coluna
  "Propostas" da tabela de origens e a etapa "Propostas" do funil **não podem** ter o mesmo rótulo com
  unidades diferentes — ou o rótulo difere, ou a unidade é a mesma.
- **Task 4 — separar "chegada" de "pessoa"** onde as duas aparecem juntas, com o recurso que a porta já
  usa (número grande + sublinha + tooltip).
- **TDD:** (1) teste de integração que falha — pessoa com 5 propostas → `bp.id` = 5 e
  pessoa-com-proposta = 1, e o rótulo de cada tela nomeia a unidade; (2) implementar; (3) verde; (4) commit.

**Critério de aceite**
- Nenhuma tela mostra dois números com o mesmo rótulo e unidades diferentes.
- Para a mesma janela, o total do Percurso == o número de PESSOAS da porta do funil.
- O kanban, no mesmo período, conta a mesma população das outras telas **ou diz na tela por que não**.

**DECISÃO PENDENTE (Kairo):** ~~o número oficial de propostas~~ — **DECIDIDO em 22/09: opção (a),
**pessoas com proposta** (uma pessoa com 5 simulações conta 1). O rótulo da contagem de linhas
(`bp.id`), onde ela continuar a existir, passa a dizer "propostas criadas".

---

## AJA-30 · Exportação levando o filtro, e a transcrição do áudio visível na conversa

**Severidade:** médio — são as duas promessas de tela que a call reabriu e que ficaram sem item.

**Falas literais**
- Kairo, 11:41:22 (mostrando a exportação): *"Se tiver algum dado faltando aqui, a gente pode ajustar
  também e melhorar. O importante é que agora vocês conseguem fazer uma análise mais em massa."*
- Bruna, 11:45:27: *"E aí a transcrição do áudio ele fica na estrutura da conversa."* → Kairo,
  11:45:35: *"Eu tento checar se aparece para você, mas o ponto é: quando o Lucas mandou o áudio, a Iá
  não respondeu ele."*

**Âncora de código**
- Exportação: 3 tipos (`conversas`, `percurso`, `toques`), formatos CSV/JSON, e **só** `from`/`to`/
  `completo` (`src/app/admin/(dashboard)/exportacao/page.tsx:98-117`; `OpcoesDeExportacao` = `de/ate/mascarar`,
  `src/lib/exportacao/index.ts:23-28`). Sem campanha, sem origem, sem etapa.
- **A transcrição do áudio do cliente É o texto da mensagem, não metadata.** O invariante está escrito
  na própria coluna: `src/db/schema.ts:473-474` — *"NUNCA guarda fala: o texto transcrito é `content`,
  porque é fala do cliente como qualquer outra"*. `src/lib/whatsapp/midia-do-cliente.ts:286` monta
  `conteudoDeAudio = transcricao?.texto ?? AUDIO_NAO_TRANSCRITO` e `:320-322` grava isso em `content`, com
  `metadata = { modelo, duracaoMs, bytes, mimeType }` (`:106`) — **sem a fala**. No turno real,
  `:410-418` usa `transcricao.texto` como a fala do cliente (teste que fixa isso:
  `midia-do-cliente.audio.integration.test.ts:169-176`). E o texto **já é renderizado**:
  `src/components/admin/conversa/whatsapp-view.tsx:69` passa `m.content` para o balão, e
  `src/components/admin/pipeline/conversation-timeline.tsx:209` mostra `{msg.content}`.
  **Ou seja: o defeito não é "está em metadata" — é apresentação** (o áudio entra como anexo "Áudio",
  e a transcrição aparece como texto comum, sem dizer que veio de áudio).

**O que fazer**
- **Task 1 — o link de exportação leva o recorte da tela.** Estender `OpcoesDeExportacao` com os
  filtros que a lista tiver (etapa, canal, campanha, origem — os mesmos do AJA-22/23) e propagar por
  `from/to` + querystring. Teste: exportar com filtro devolve exatamente as linhas da lista filtrada.
- **Task 2 — a transcrição do áudio precisa de rótulo, não de render novo.** O texto já é o `content`
  e já aparece na timeline. A tarefa é **conferir o que a timeline mostra quando o turno veio de áudio**
  (`mediaType='audio'`) e marcar a origem: um selo "transcrito de áudio" no bubble e, quando o áudio for
  o `AUDIO_NAO_TRANSCRITO`, o estado explícito "áudio sem transcrição" em vez de texto vazio. **Não**
  criar caminho novo de render sem antes medir o que já existe. O diagnóstico do áudio que chega vazio
  (AJA-15 do briefing anterior) continua separado e sem prova.

---

## AJA-28 · (fora do código) A listinha de entregas para a Bruna

O Kairo prometeu no áudio de 22/09 11:05 (*"vou te mandar uma listinha aqui do que era de novo, mas já
está tudo implementado"*) e ela ainda não recebeu. Vira mensagem, não commit. Fica registrado aqui
para não se perder entre os itens técnicos.

---

# Datas (a call fixou uma, e ela manda na ordem)

| Quando | O quê | Fonte |
|---|---|---|
| **Sexta, 26/09/2026** | Rodada com o Gustavo: ele traz volume e número das campanhas; a Bruna quer os leads qualificados conciliados e o custo | Gustavo 12:17:07 (*"pelo menos na sexta, para a gente ter volume e ter número"*), Bruna 12:17:19 (*"Sexta, eu já atualizo aqui então para sexta. Vocês conseguem falar sexta?"*) |
| **Antes de sexta** | AJA-22 (quem são os 9) e AJA-23 (kanban/identificável) de pé — é o que ela vai usar na rodada | decorre da linha acima |
| **Hoje/amanhã** | AJA-18 T1 (medir o investimento real) e o AJA-29 (responder o "confirmar? isso") | Kairo, 11:48:22 e 16:33 (*"Vou analisar"*) |

---

# Fora de escopo (decidido adiar — para o dev não achar que faltou)

1. **Multicanal de recuperação (push, SMS, e-mail, notificação na plataforma, mensagem patrocinada do
   Google com CTA).** Desenhado pelo Gustavo em 11:57:14 e separado por ele mesmo como "só dando como
   funciona para a gente adaptar". O escopo desta frente é **WhatsApp**; o desenho fica registrado.
2. **Fluxo de CRM binário por etapa** (o "sim/não" do Gustavo, 11:55:02). Substituído, para agora, pelas
   três macro-fases do AJA-21.
3. **Áudio vazio (AJA-15 do briefing anterior).** Continua aberto e **sem prova**; o que esta frente
   resolve é só a **exibição** da transcrição (AJA-30 T2).
4. **Ligação humana para os perdidos** (12:23:25) — operação, não código.
5. **Peças de criativo, subida de campanha, revisão do site** — Lucas/Gustavo, fora deste repo.

---

# Rastreio do briefing anterior (18/09)

| Item antigo | Estado em 22/09 | Evidência |
|---|---|---|
| AJA-01 (pré-preenchida ≠ conversa iniciada) | **fechado** | commit `36244f6d`; `ETAPAS_FUNIL_MIDIA.so_pre_preenchida` |
| AJA-03 (remarketing na ficha/lista) | **fechado** | `estado-na-lista.ts` |
| AJA-04 (visão agregada da régua) | **fechado** | `resumo-da-regua.tsx`, `insights-da-regua.tsx`, `cartoes-da-regua.tsx` |
| AJA-05 (filtro de período entre telas) | **parcial** | kanban ainda recorta no cliente → **AJA-23 T4** |
| AJA-06 (criativo por campanha) | **parcial** | `SubTabelaCriativos` existe; falta imagem grande → **AJA-19** |
| AJA-08 (Meta × CRM / custo por qualificado) | **parcial** | cartões e motivos existem; falta reconciliação → **AJA-18**; e a base de "identificado" está errada → **AJA-29** |
| AJA-09 (11 parados em "se identificou") | **parcial** | motivo nomeado existe; falta a visão única → **AJA-22** |
| AJA-10 (higiene da régua / teste) | **parcial** | `PATCH conversas/[id]` propaga e segura; falta lote → **AJA-23 T3** |
| AJA-12/13/14 (fala do WhatsApp) | **decisão de terça** | estrutura entra no **AJA-21** |
| AJA-16 (extração do Gustavo) | **fechado** | `src/lib/exportacao/*` + `/admin/exportacao` |
| AJA-17 (conversas sem origem) | **fechado na tela** | aviso + link `?origem=desconhecida` |
| AJA-15 (áudios vazios) | **aberto** | fora de escopo; ver AJA-30 T2 |

---

# Ondas de execução (ordem corrigida, com o motivo)

**Onda 0 — desbloquear o que mente (sem decisão pendente)**
1. **AJA-29 T1-T3** — o predicado de "identificado". É a pergunta da cliente **e** a base do AJA-18.
2. **AJA-20 T1** — ligar `lerParametrosRegua` ao ciclo. Blocker medido, não depende de ninguém.
3. **AJA-27 T1-T4** — rótulo/unidade. Resolve o que ela perguntou por escrito.
4. **AJA-18 T3** — extrair `atribuida` para `sinais-do-funil.ts` (dívida já declarada no código).
5. **AJA-22 T0** — unificar `motivoForaDaRegua` com `avaliarElegibilidade` (hoje são dois espelhos).

**Onda 1 — o que a Bruna usa na rodada de sexta**
6. **AJA-22 T1-T4** (leads parados + o entregável "quem são os 9").
7. **AJA-23 T1-T4** (identificável, lote sem delete, kanban com período no servidor).

**Onda 2 — o que o Kairo usa para trabalhar o bolo parado**
8. **AJA-21 T1-T4** (as três comunicações) — **antes** do AJA-24, porque o AJA-24 dispara justamente
   essa mensagem (o revisor pegou esta inversão no PRD anterior).
9. **AJA-24 T1-T4** (reentrada do bolo, esgotou → perdido, alerta).
10. **AJA-30 T1-T2** (exportação com filtro + transcrição na conversa).

**Onda 3 — o que depende de terceiros ou de decisão**
11. **AJA-20 T2-T5** (cadência intra-janela) — decisão do limite de toques e do portão de retomadas.
12. **AJA-19** (imagem grande) — escolher o campo da Graph API.
13. **AJA-25** (para quem/qual toque) — cresce junto do AJA-20.
14. **AJA-18 T1/T2** (reconciliação) — precisa do relatório do Gustavo e da janela medida.
15. **AJA-26** (custo) — decisão de arquitetura do Kairo.

---

# O que só o Kairo destrava

| Item | Decisão |
|---|---|
| AJA-29 | o critério exato de "identificado" (origem do dado) — e o de retrocompatibilidade: o número cai |
| AJA-18 | qual investimento é o oficial: Meta reportado ou atribuído no CRM |
| AJA-19 | `effective_object_story_id` (já no payload) ou `image_url` do criativo |
| AJA-20 | limite de toques (2, 3 ou 4); e se o portão de retomada vira parâmetro ou se os toques intra-janela ganham contador próprio (PRD recomenda contador próprio) |
| AJA-20 T5 | motivo do bloqueio persistido ou calculado em tela (PRD recomenda em tela) |
| AJA-21 | texto das três comunicações (com a Bruna) + templates cadastrados na Meta |
| AJA-23 | o que é "cliente oculto"; se o kanban recorta por criação do lead ou por chegada da visita |
| AJA-24 | marcar `perdido` automaticamente ao esgotar, ou sugerir revisão; e se a reentrada consome a cota de 30 dias |
| AJA-26 | instrumentar custo de IA no banco (rota A) ou ler do Langfuse (rota B) |
| AJA-27 | número oficial de "propostas" do painel |

---

# Riscos

1. **AJA-29 muda números para baixo em todas as telas.** É correção, não regressão — mas a Bruna e o
   Gustavo veem a queda. Comunicar **antes** de publicar, com o antes/depois medido.
2. **A régua envia mensagem de verdade.** Cadência (AJA-20/21) entra com `REMARKETING_ATIVO` desligado
   e validada contra número da equipe. `TELEFONES_DA_EQUIPE_PADRAO` (`motor.ts:77`) existe porque 2 dos
   6 toques de 18/09 chegaram em gente nossa (`motor.ts:74-75`).
3. **O portão `MAX_RETOMADAS`/`BACKOFF_RETOMADA_MS`** é o risco nº 1 do AJA-20: sem tratá-lo, o item
   passa nos testes e não dispara em produção.
4. **`meta_entities` é dimensão compartilhada.** O AJA-19 adiciona coluna; migration nullable primeiro,
   sync depois.
5. **Mover o período do kanban para o servidor** (AJA-23 T4) muda o que o operador vê. Entra com o
   default das outras telas, respeitando o cookie `aja_periodo`, e com aviso na tela.
6. **Marcar perdido em massa** (AJA-24) mexe no funil comercial: teste que prova que perdido por
   esgotamento não conta como qualificado.
7. **A reconciliação (AJA-18) pode mudar decisão de mídia.** Enquanto não houver prova no banco, o PRD
   proíbe mexer na soma — só rotular.
8. **Nada aqui vira guard de frase.** O AJA-21 é onde a tentação aparece (texto fixo no servidor).
   Tom é do modelo/prompt; fato do servidor é que vira código.

---

# Revisão crítica deste documento

Antes de ser dado por pronto, este PRD passou por **dois críticos isentos** (não escreveram o
documento): um **contra a transcrição** (completude/profundidade) e um **contra o código** (veracidade
das âncoras). Os dois deram veredito **`blocked`** na primeira versão, e o que estava errado foi
corrigido aqui:

- **Blocker de comportamento (novo item):** `identificados` contava toda conversa de WhatsApp como
  identificada → virou **AJA-29**.
- **Blocker de comportamento (item reescrito):** a cadência curta era bloqueada por
  `MAX_RETOMADAS`/`BACKOFF_RETOMADA_MS`, fora do `regua.ts` → **AJA-20 T3** agora trata o portão, e o
  teste de integração no ciclo virou exigência (restrição #10).
- **Âncoras falsas corrigidas:** `motivo-de-exclusao.ts` está em `src/lib/remarketing/` (não em
  `admin/`); `parada_ha_mais_de_7_dias` em `:247`; existe `DELETE` de conversa **simulada** em
  `simulator/sessions/[id]`; `teve_proposta` **não** existe em `sinais-do-funil.ts` (está inline em três
  arquivos — a tarefa virou **extrair**); `repproved → perdido` é `proposal-status-poll.ts:61` +
  `bevi/proposal-status.ts:159`, e `:130` é perdido por inatividade; dezenas de deslocamentos de linha.
- **Falas corrigidas:** "28 reais" é **11:43:43 · Kairo**; "muito alto" é **11:44:04 · Voz 6** (Gustavo);
  "É saber o que o de fato" fecha **12:10:09**; o custo de IA é **12:17:26**. A fala de 11:44:05 está
  marcada como **paráfrase** de duas falas.
- **Faltantes que entraram:** datas (sexta), exportação e transcrição na conversa (**AJA-30**), o
  entregável "quem são os 9" (**AJA-22 T4**), o alerta de "parou de responder" (**AJA-24 T3**), fora de
  escopo explícito (multicanal, CRM binário), backfill do AJA-25 T2, teto/opt-out no AJA-24 T1, teste de
  integração no AJA-20 T1, unificação do espelho de motivos (**AJA-22 T0**), a **5ª unidade** de
  propostas no kanban (**AJA-27 T2**) e a inversão de ordem **AJA-21 antes do AJA-24**.

**Segunda rodada (mesmos dois críticos, sobre esta versão).** Veredito de novo `blocked`, mas por
correções pontuais de âncora — não de desenho. O que ainda estava errado e foi corrigido aqui:

- **AJA-30 ancorava no oposto do fato.** A transcrição do áudio **é o `content` da mensagem**, não
  metadata — o invariante está escrito em `src/db/schema.ts:473-474`, e o texto já é renderizado em
  `src/components/admin/conversa/whatsapp-view.tsx:69` e
  `src/components/admin/pipeline/conversation-timeline.tsx:209`. O defeito é de **apresentação** (o áudio entra como anexo e a transcrição
  aparece como texto comum, sem dizer que veio de áudio); a Task 2 virou "conferir/rotular", não
  "renderizar do metadata".
- **Linhas que apontavam para outro objeto:** `OpcoesDeExportacao` é `src/lib/exportacao/index.ts:23-28`
  (não `:35-39`, que é o `switch`); o predicado de identificados em `exportacao/percurso.ts` é `:134`
  (a `:136` é `teve_proposta`); `sem_contato` em `motivo-fora-da-regua.ts` é `:206` — o `:205` é o
  comentário imediatamente acima do `return`, e a conferência da 1ª rodada parou no comentário.
- **Timestamps fundidos:** a fala do Kairo sobre "cruzar as informações" é de **12:13:02** (não
  12:12:12) e "Dependendo, deveria guardar…" é da Bruna em **12:20:00** (não 12:19:50).
- **`schema.ts` sem caminho** → `src/db/schema.ts` em todas as citações; caminhos abreviados
  (`resolver.ts`, `template-dispatch.ts`, `turn-trace.ts`) ganharam diretório completo.
- **Intervalos ajustados** (`performance-queries.ts:158-217`, `custoPor :203-213`, `combinarCampanhas
  :224-351`, `SubTabelaCriativos :136-199`, `resolver.ts:72-85`, `exportar :98-117`,
  `periodo-do-pipeline.ts:40-52`, `remarketing-cycle.ts:915-922`, `campanhas-queries.ts:357-391`).
- **AJA-22 T0 estava subdimensionada:** além das 11 guardas espelhadas, a duplicação inclui
  `JANELA_DE_ENTRADA_MS` (`motivo-fora-da-regua.ts:47` × `motivo-de-exclusao.ts:169`) e as duas tabelas
  de rótulo (`:73` × `:78`); e o consumidor tem **raio de 7 módulos** — não é troca de uma linha.

**Ancoras que dependem de git, confirmadas por comando** (o crítico não roda shell): `git show --stat
ba4c4eaa` = *"as três telas de medição passam a contar a mesma gente"* (24/08/2026) e `git show --stat
36244f6d` = *"separa 'iniciou a conversa' do texto do anuncio no funil"* (18/09/2026). Os dois existem.

**Onde este documento continua sendo uma aposta, e o leitor deve saber:** (a) o bloco do WhatsApp
(números 3.346 e "5 × 1") só é auditável na fonte 2, cujo comando de leitura está no cabeçalho — quem
só tem a transcrição da call não valida o AJA-27; (b) o intervalo real do ciclo da régua em produção
(BullMQ, `POLL_INTERVAL_MS` configurável) é **Task 0 do AJA-20** justamente porque a call e o código
divergem (30 min falado × 30 s de default); (c) nenhuma query deste PRD foi executada contra o banco de
produção — os números que ele manda **medir** (AJA-18 T1, AJA-29 T4) são justamente os que a tela hoje
mostra errado.