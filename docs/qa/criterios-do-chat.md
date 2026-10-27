# Critérios do chat — fonte única

A matriz do que o chat do Aja Agora tem de fazer, com o medidor de cada linha. Cinco famílias, numeração
fechada:

| família | prefixo | responde |
|---|---|---|
| CAMINHO | `P-xx` | o caminho da venda passo a passo, nos dois canais (§2.5 do mandato) |
| FALA | `C-xx` | o critério da fala: o que o cliente lê, uma pergunta por balão, o que não se promete |
| DUPLICIDADE | `D-xx` | o mesmo pedido/dado repetido — **conteúdo**, não string |
| FLUIDEZ | `F-xx` | a conversa não repete, não relista card, não cola balão, não emenda pergunta |
| PRODUTO | `R-xx` | o que o dono exige do produto: temperatura avançando, contato salvo, backoffice lendo |

## Como se lê uma linha

Seis colunas: `id` · o que o cliente vê · como se mede · o não-pode · premissa e canal · medido nesta
rodada.

- **como se mede** é sempre uma das três formas: `determinístico: arquivo:linha` (roda sozinho, sem
  LLM), `juiz: arquivo` (LLM avalia a transcrição) ou `NOVO` (não existe medidor hoje — a sonda proposta
  vai em uma linha, e ela vira linha do Bloco 3 ou 4).
- **medido nesta rodada** é um número com a fonte ao lado (`.orientacao/diario.md` §1.3 →
  `scripts/qa/medidor-duplicidade.sql` Q1/Q2/Q3/Q13, ou o SQL do Bloco 1b) ou, literalmente,
  `NÃO MEDIDO`. **`NÃO MEDIDO` não é `ok`.**
- A conduta que governa hoje é o arquivo `src/lib/agent/prompt-do-vendedor.ts`:
  `pnpm prompts:check` imprime "Origem da caixa em uso: codigo (versão 0)" e `select count(*) from
  caixa_de_prompt` = **0** (diário §1.3, Q9). Critério de fala que não esteja nesse texto não existe
  para o modelo.
- Corpus desta rodada (diário §1.3): **484 conversas** do banco `aja_agora_ws_develop` — 346 web, 138
  WhatsApp, 49 simuladas.

## CAMINHO — a matriz do caminho da venda

O passo do funil, nos dois canais. Cada `P-xx` é o degrau; a prova por SQL de cada um está em
`docs/qa/matriz-do-caminho.md`.

| id | o que o cliente vê | como se mede | o não-pode | premissa · canal | medido nesta rodada |
|---|---|---|---|---|---|
| P-01 | entrada do anúncio/hero: cumprimento + as três categorias (Imóvel, Carro, Moto) na primeira tela | determinístico: `scripts/eval-run.ts:139` (roda a ficha) + `src/lib/eval/golden-asserts.ts:70` (`expectArtifacts`) na ficha `scripts/eval/golden/golden-madalena-junta.json` | abrir menu fora do produto ("Outros"), ou pedir nome/CPF antes da saudação | P1 · ambos | NÃO MEDIDO |
| P-02 | saudação que entrega algo antes de perguntar (o especialista que assume e a leitura do que a pessoa trouxe) | determinístico: `src/lib/eval/golden-asserts.ts:70` nas fichas `golden-smoke-agente.json`, `golden-pede-humano.json` (`expectArtifacts` de `transition`+`gate:name`) | cumprimento genérico, ou a primeira fala só qualificar/coletar | P1 · ambos | NÃO MEDIDO |
| P-03 | pergunta do tipo de bem/bem desejado, ancorada no que a pessoa pediu (o anúncio pode vender carro e ela pede imóvel) | determinístico: `src/lib/eval/golden-asserts.ts:72` (`forbidArtifacts`) na ficha `golden-troca-de-categoria.json`; o canal WhatsApp tem botões `category_imovel`/`category_auto`/`category_moto` (`src/lib/whatsapp/formatter.ts:773`) | atender só a categoria do anúncio, ou reperguntar o bem depois de já ter a resposta | P4 · ambos | NÃO MEDIDO |
| P-04 | valor ou parcela que a pessoa pretende gastar, pedido depois da saudação — na web com `value_picker`, no WhatsApp em texto (o canal não tem card de faixa: `src/lib/agent/pi/tools-livres.ts:534`) | determinístico: `src/lib/eval/golden-asserts.ts:70` na ficha `golden-probe-i2-justificativa.json`; SQL: `messages` do turno do gate `credit` | pedir valor antes de entregar qualquer coisa, ou pedir valor de novo depois de a pessoa já ter dito | P1 · ambos | NÃO MEDIDO |
| P-05 | primeira oferta/carta na tela — `comparison_table` / `group_card` / `real_offer`, payload montado no servidor | determinístico: `src/lib/agent/pi/cards-livres.ts:42` (`DESTINO_DOS_CARDS`: esses tipos são `emitivel`/`origem: fato`) + `src/lib/eval/golden-asserts.ts:70`; SQL: `artifacts.type` por `message_id` | oferta sem carta real por trás, ou oferta inventada pelo modelo | P2 · ambos | NÃO MEDIDO |
| P-06 | interesse e recomendação: a pessoa escolhe e o agente diz por que aquela é a indicada (`recommendation_card`) | determinístico: `src/lib/eval/golden-asserts.ts:70` na ficha `golden-hero-chega-na-tela.json`; clique web `choose_offer`/`interest` (`src/lib/chat/actions.ts:92`, `:84`), no WhatsApp `interest_<groupId>` (`src/lib/whatsapp/interactive-handlers.ts:129`) | relistar a tabela em texto em vez de comentar a recomendada, ou não entregar a recomendação | P2 · ambos | NÃO MEDIDO |
| P-07 | simulação e lance: `simulation_result`, `embedded_bid`, `contemplation_dial`, `two_paths`, `scarcity` com número da tool | determinístico: `src/lib/eval/golden-asserts.ts:87` (`forbidUngroundedMoney`) nas fichas de objeção + `src/lib/eval/golden-asserts.ts:80` (`minCreditValue`, `golden-probe-w2-menor-lance.json`) | encolher a carta para "melhorar" o lance, ou citar número sem card/tool que o sustente | P2 · ambos | NÃO MEDIDO |
| P-08 | pedido de contato: na web o card que pede o número do WhatsApp (`whatsapp_optin`, `src/lib/chat/types.ts:490`; input quando o número é desconhecido, `src/components/chat/artifacts/whatsapp-optin.tsx:48`); no WhatsApp o número e o nome já chegaram e **não se pede de novo** | determinístico: hoje **não há** assert de contato nas 25 fichas (`grep -c contractClosed scripts/eval/` = 0, `grep -c whatsapp_optin scripts/eval/golden/` só em prosa de `expect`, que o runner não lê). Medidor: `NOVO` — Q6..Q9 do Bloco 1b, a versionar em `scripts/qa/medidor-duplicidade.sql`; clique web `whatsapp_optin` (`src/lib/chat/actions.ts:130`) | pedir o número no WhatsApp, ou deixar a conversa web terminar sem o número salvo | P6 · ambos | `whatsapp_optin` em **21 de 346** conversas web; telefone **antes** do card em 21 × **depois** em 0; `lead_form` em **0**; `leads.phone` preenchido em **73 de 346** (diário §1.2 item 2, Q6..Q9 do Bloco 1b) |
| P-09 | CPF/identidade: o card/porta que coleta CPF e celular, com o CPF mascarado no que é gravado | determinístico: `scripts/qa/medidor-duplicidade.sql:103` (Q4, CPF em claro em `messages`) + Q11 (fala do agente); ficha `golden-identify-antes-da-busca.json` | aviso de LGPD como passo obrigatório antes do pedido (não é mais critério), CPF em claro na fala do agente, ou busca antes da identidade | P6 · ambos | CPF em claro em `messages` = **3**, todos `role='user'` (entrada crua de julho); na fala do agente = **0** (Q4/Q11, diário §1.3) |
| P-10 | proposta: `contract_form` → `real_offer`, e a proposta real criada em `bevi_proposals` com `lead_id` = `leads.id` | determinístico: `src/lib/eval/golden-asserts.ts:70` na ficha `golden-fecho-nao-anda-pra-tras.json` (entrega `contract_form`); clique web `contract-submit` (`src/lib/chat/actions.ts:141`), no WhatsApp `contract_confirm` (`src/lib/whatsapp/interactive-handlers.ts:130`); SQL: `bevi_proposals.lead_id` (`src/db/schema.ts:607`) | proposta sem identidade, ou `bevi_proposals` sem `lead_id` | P5 · ambos | NÃO MEDIDO |
| P-11 | fechamento: `offer-confirm` / `offer_confirm` → `contractClosed = true` e o fecho (proposta em PDF, parabéns) | determinístico: `src/app/api/chat/route.ts:1430` grava `contractClosed`; `src/lib/whatsapp/interactive-handlers.ts:241` (`finalizarOfertaReal`) faz o mesmo no WhatsApp, com a gravação em `:246`; SQL: `conversations.metadata->>'contractClosed'` (`src/db/schema.ts:412`) | fechar sem o cliente ter pedido, ou declarar fechado sem `confirmOffer` | P5 · ambos | NÃO MEDIDO |

## FALA — o critério da fala

| id | o que o cliente vê | como se mede | o não-pode | premissa · canal | medido nesta rodada |
|---|---|---|---|---|---|
| C-01 | uma pergunta por balão; pergunta composta legítima ("que carro você tem em mente, e quanto custa?") chega inteira, sem ser cortada | determinístico: `src/lib/agent/pi/uma-pergunta.ts:16` (`contarPerguntas`) e `:21` (`manterUmaPergunta`), aplicado no turno em `src/lib/agent/pi/turno-livre.ts:207` | dois `?` no mesmo balão — e o reparo não pode comer a parte de valor da fala | P1 · ambos | NÃO MEDIDO |
| C-02 | texto íntegro, sem corte: o que está gravado em `messages` é o que saiu na tela | determinístico: `scripts/qa/talk.mjs:52-84` (agrupa balões por id do SSE) e `scripts/qa/wa-talk.mjs:69` (SSE do simulador é o que o cliente recebe) | balão truncado, balão emendado com o seguinte, ou texto do banco diferente do que foi exibido | P7 · ambos | NÃO MEDIDO |
| C-03 | nenhuma promessa que a cota não mostra — inclusive grupo novo × grupo em andamento (D-0004, Bruna 26/10) | `NOVO` — sonda: juiz sobre a transcrição conferindo cada afirmação de estado contra o payload do card do turno; hoje só a ficha `scripts/eval/golden/golden-topico-proibido.json` descreve o critério, em prosa de `expect`, que `scripts/eval-run.ts` não lê | prometer contemplação, prazo, ou característica do grupo que a cota não traz | P1 · ambos | NÃO MEDIDO |
| C-04 | objeção tratada como conversa: "é demorado", "e se eu não for contemplado", "melhor financiamento" respondidas com argumento e com o caminho de volta à venda | juiz: `src/lib/eval/jornada-judge.ts:31` (`judgeJornada`, rubrica `src/lib/eval/jornada-rubric.ts:152` — existe, **sem runner ligado**) + as 7 fichas de objeção `scripts/eval/golden/golden-objecao-*.json` | devolver menu, repetir o bloco anterior, ou despachar a objeção para humano | P7 · ambos | NÃO MEDIDO |
| C-05 | a régua não desiste do lead: nada de frase de rendição | `NOVO` — sonda: pergunta nova em `scripts/qa/medidor-duplicidade.sql` procurando fala de rendição em `messages.content` de `role='assistant'`; a fonte da conduta é `src/lib/agent/prompt-do-vendedor.ts:74` ("quem não respondeu hoje é a fila de amanhã") | encerrar o lead ("sem insistência da minha parte", "quando quiser, é só aparecer") | P3 · ambos | NÃO MEDIDO |
| C-06 | o agente não se ausenta nem empurra para humano quando o cliente não pediu | determinístico: `src/lib/eval/golden-asserts.ts:72` (`forbidArtifacts`) nas fichas `golden-objecao-vender-a-carta.json` e `golden-fora-de-escopo.json`; o handoff legítimo (o cliente pediu) é `golden-pede-humano.json` (`src/lib/eval/golden-asserts.ts:70`) | `atendimento_handoff` ou sugestão de humano sem pedido explícito; encerrar a conversa | P7 · ambos | NÃO MEDIDO |

## DUPLICIDADE — conteúdo, não string

Os três ids desta família são **`NOVO`** e apontam para `src/lib/agent/pi/eval/golden.ts`: a regra nasce
no **Bloco 3** (`pedido-repetido`, `dado-repetido`). O medidor de hoje casa pergunta **por string**:
`src/lib/agent/pi/eval/golden.ts:127` sobre `normalizarPergunta` (`:47`), e no mesmo corpus acha **46
achados em 27 conversas** (`scripts/qa/medidor-duplicidade.sql:120`, Q13) contra **472** do medidor por
slot (Q1) — a distância de 426 é o defeito que esta família existe para pegar.

| id | o que o cliente vê | como se mede | o não-pode | premissa · canal | medido nesta rodada |
|---|---|---|---|---|---|
| D-01 | o agente pedindo de novo o que a pessoa já respondeu (nome, valor, parcela, CPF, tipo de bem, lance) com fraseado diferente | `NOVO` (Bloco 3) — `pedido-repetido` em `src/lib/agent/pi/eval/golden.ts`, por slot pedido e não por string; régua SQL: Q1 de `scripts/qa/medidor-duplicidade.sql:5` (mesmos sete slots) | pedir o mesmo slot em dois turnos depois de a pessoa ter respondido, sem ela pedir de novo | P1, P6 · ambos | **472** repetições por slot, **414** com resposta do cliente entre os dois pedidos, em **90** conversas: `tipo_de_bem` 181 (58 conversas), `parcela` 128 (41), `lance` 88 (42), `cpf` 39 (29), `valor` 23 (18), `nome` 13 (13) — Q1/Q14, diário §1.3 |
| D-02 | o mesmo dado no texto **e** no card do mesmo turno ("a parcela fica em R$ 733" com a tabela mostrando 733) | `NOVO` (Bloco 3) — `dado-repetido`, caso (i), em `src/lib/agent/pi/eval/golden.ts`; régua SQL: Q2 de `scripts/qa/medidor-duplicidade.sql:54` | repetir no texto o número que o card do mesmo turno já mostra | P2 · ambos | **28 turnos**, **41 números**, **24 conversas** — Q2, diário §1.3 |
| D-03 | o mesmo dado repetido em dois turnos (texto-texto, texto-card ou card-card) | `NOVO` (Bloco 3) — `dado-repetido`, caso (ii), em `src/lib/agent/pi/eval/golden.ts`; régua SQL: Q3 de `scripts/qa/medidor-duplicidade.sql:80` | recitar de novo o mesmo valor/dado que já foi dito em turno anterior | P2 · ambos | **1022** ocorrências em **85** conversas; restrito a número ≥ 100 (dado de conversa, não id/data): **470** em **80** conversas — Q3/Q3b, diário §1.3 |

Nota de fronteira: `forbidDuplicateOffers` (`src/lib/eval/golden-asserts.ts:76`, 11 fichas) é o vizinho
mais próximo que existe hoje, mas mede outra coisa — duas ofertas com a mesma administradora e os mesmos
números **na mesma tela**. Não cobre pedido repetido nem dado repetido em turnos distintos.

## FLUIDEZ

| id | o que o cliente vê | como se mede | o não-pode | premissa · canal | medido nesta rodada |
|---|---|---|---|---|---|
| F-01 | o agente não repete o próprio bloco de fala | determinístico: `src/lib/eval/golden-asserts.ts:83` (`forbidRepeatedAgentText`, piso de 40 caracteres em `:98`) — **7 de 25** fichas o usam | repetir um bloco de fala de turno anterior | P7 · ambos | NÃO MEDIDO |
| F-02 | o agente não repete a mesma fala "com roupa nova" | `scripts/sonda-variancia.ts:78` (`sondaRepeticao`) e `:102` (`sondaVariancia`), Jaccard sobre bigramas (`:54`) com teto 0.6 (`:36`); sonda manual, fora do gate | duas respostas ao mesmo estímulo acima do teto de similaridade | P7 · ambos | NÃO MEDIDO |
| F-03 | o agente comenta o card em vez de relistar a tabela no texto | determinístico: `src/lib/agent/pi/eval/golden.ts:170` (regra `card-relistado`), rodada por `scripts/eval-conduta.ts:79` (`--db`) | 3+ linhas de lista no texto quando há `comparison_table` no mesmo turno — **0 de 25** fichas afirmam esta regra | P2 · ambos | NÃO MEDIDO |
| F-04 | nenhum balão cola dois assuntos | `NOVO` — sonda: juiz sobre cada balão contando ideias por balão; `scripts/qa/talk.mjs:52-84` só separa os balões por id, não julga ideia | emendar dois assuntos no mesmo balão ("Madalena.Qual carro…") | P1 · ambos | NÃO MEDIDO |
| F-05 | uma pergunta por mensagem, contada **por balão** e não por conversa | determinístico: `src/lib/agent/pi/uma-pergunta.ts:16`, aplicado em `src/lib/agent/pi/turno-livre.ts:207`; a ficha `golden-probe-p4-perguntas-compostas.json` descreve o critério em `expect`, e `grep -c expect scripts/eval-run.ts` = **0** | 2+ sentenças interrogativas no mesmo balão | P1 · ambos | NÃO MEDIDO |

C-01 e F-05 medem a mesma costura (`uma-pergunta.ts`) de dois ângulos: C-01 é o critério da fala (o que
o cliente lê, inclusive o risco de o reparo cortar pergunta composta válida); F-05 é a contagem por balão
na conversa inteira — dois balões com uma pergunta cada nunca viram um achado.

## PRODUTO

| id | o que o cliente vê | como se mede | o não-pode | premissa · canal | medido nesta rodada |
|---|---|---|---|---|---|
| R-01 | a temperatura do lead avança: sala um degrau a mais em `leads.stage` (`src/db/schema.ts:44`) e termina em `contractClosed` | `NOVO` — sonda SQL sobre `leads.stage` e `conversations.metadata->>'contractClosed'` (`src/db/schema.ts:412`); o único leitor do booleano hoje é a nota do eval (`src/lib/eval/scorer.ts:121`), não o caminho | conversa que termina sem degrau novo e sem `contractClosed` | P7 · ambos | NÃO MEDIDO |
| R-02 | o contato é salvo: na web o número do WhatsApp fica em `leads.phone` (`src/db/schema.ts:507`) antes de a tela fechar | `NOVO` — Q6..Q9 do Bloco 1b ainda **não** estão versionadas em `scripts/qa/medidor-duplicidade.sql`; cliques web `whatsapp_optin` / `whatsapp_optin_confirm` (`src/lib/chat/actions.ts:130`, `:133`) | conversa web que chega ao reveal e não deixa telefone | P6 · web | `whatsapp_optin` em **21 de 346** conversas web; telefone **antes** do card em 21 × **depois** em 0; `lead_form` em **0**; `leads.phone` preenchido em **73 de 346** (diário §1.2 item 2) |
| R-03 | o backoffice lê a temperatura que a conversa produziu | `NOVO` — sonda: comparar o degrau que o backoffice exibe com `leads.stage`/`contractClosed` da conversa; hoje `scoreConversation` só é chamado por `src/app/api/admin/conversations/[id]/eval/route.ts:5` | degrau que existe na conversa e não aparece no backoffice | P7 · ambos | NÃO MEDIDO |
| R-04 | o fechamento só acontece quando o cliente pede | `NOVO` — sonda SQL que compara `contractClosed` com o último turno do cliente; a ficha `golden-fecho-nao-anda-pra-tras.json` só afirma que não se volta a qualificar depois do pedido | `contractClosed` sem pedido, ou qualificação reaberta depois do pedido | P5 · ambos | NÃO MEDIDO |
| R-05 | nenhum lead é descartado sem toque de retomada | `NOVO` — sonda SQL sobre `conversations.status` (`closed` sai da régua: `src/lib/remarketing/motivo-de-exclusao.ts:262`) e os toques dela (`src/lib/remarketing/regua.ts:5`: até 3 toques em 7 dias); o re-engajamento mora em `src/lib/workers/retomada-cycle.ts:60` | conversa `closed` sem retomada, ou fala de rendição no último turno | P3 · ambos | NÃO MEDIDO |

## Cobertura das 25 fichas do golden set

`ls scripts/eval/golden/*.json` = **25** fichas (`scripts/eval/golden-v2/` não entra: nenhum runner lê —
`GOLDEN_DIR` em `scripts/eval-run.ts:39` aponta só para `scripts/eval/golden/`).

O que cada família tem hoje, contado nas fichas:

| família | fichas que medem | quais / como |
|---|---|---|
| CAMINHO (`P-xx`) | **11** | 6 com `expectArtifacts` (`src/lib/eval/golden-asserts.ts:70`) e 5 com `forbidArtifacts` (`:72`) — afirma *qual card* aparece, não a sequência completa até o fechamento. `contractClosed`: **0** fichas; `leads.phone`: **0** fichas |
| FALA (`C-xx`) | **8** | 7 fichas de objeção (`golden-objecao-*.json`, `forbidRepeatedAgentText`/`forbidUngroundedMoney`) + `golden-pede-humano.json`. Uma pergunta por balão: **0** fichas asseguram; `golden-probe-p4-perguntas-compostas.json` só descreve em `expect`, e o runner não lê `expect` (`grep -c expect scripts/eval-run.ts` = 0) |
| DUPLICIDADE (`D-xx`) | **0** | nenhuma ficha acusa pedido repetido por slot nem dado no texto e no card. `forbidDuplicateOffers` (11 fichas) é oferta duplicada na mesma tela |
| FLUIDEZ (`F-xx`) | **7** | `forbidRepeatedAgentText` (`src/lib/eval/golden-asserts.ts:83`). `card-relistado`: **0** fichas — essa regra só roda em `scripts/eval-conduta.ts` |
| PRODUTO (`R-xx`) | **0** | nenhuma ficha lê banco: o golden set afirma trajetória de card, não `leads.stage`/`leads.phone`/`contractClosed` |

Contagem reproduzível (as fichas mudam; a contagem tem de ser refeita, não herdada):

```bash
ls scripts/eval/golden/*.json | wc -l                                  # 25
for campo in expectArtifacts forbidArtifacts forbidRepeatedAgentText forbidDuplicateOffers; do
  printf '%-24s %s\n' "$campo" "$(grep -l "\"$campo\"" scripts/eval/golden/*.json | wc -l)"
done                                                                   # 6 · 5 · 7 · 11
grep -l contractClosed scripts/eval/golden/*.json | wc -l              # 0
grep -c expect scripts/eval-run.ts                                     # 0
```

## Premissa × critério

Toda premissa de `AGENTS.md` tem pelo menos um critério; nenhuma fica `(em aberto)`.

| premissa | critérios |
|---|---|
| P1 entrega antes de perguntar | P-01, P-02, P-04, C-01, C-03, D-01, F-04, F-05 |
| P2 o card converte ou não existe | P-05, P-06, P-07, D-02, D-03, F-03 |
| P3 a régua não desiste do lead | C-05, R-05 |
| P4 atende o que a pessoa pediu | P-03 |
| P5 ninguém é empurrado para o fim da negociação | P-10, P-11, R-04 |
| P6 o contato é o ativo | P-08, P-09, D-01, R-02 |
| P7 vender é o trabalho | C-02, C-04, C-06, F-01, F-02, R-01, R-03 |

## Lacunas declaradas

Todo id abaixo está `NOVO`: o critério existe, o medidor não. Cada linha diz o que precisa para existir.

- **D-01** — precisa da regra `pedido-repetido` em `src/lib/agent/pi/eval/golden.ts` (Bloco 3): detector de slot por balão + janela "o cliente falou entre os dois pedidos", com teste que reprova o caso dos quatro fraseados e passa quando o defeito sai do fixture.
- **D-02** — precisa da regra `dado-repetido`, caso texto × card do mesmo turno (Bloco 3), reusando `valores` de `TurnoDeConversa` (`src/lib/agent/pi/eval/golden.ts:14`).
- **D-03** — precisa da regra `dado-repetido`, caso turno × turno (Bloco 3), com o mesmo piso de "número de conversa" (≥ 100) que a Q3b usa, senão id e data poluem a contagem.
- **C-03** — precisa de sonda de juiz sobre a transcrição cruzando cada afirmação de estado com o payload do card do turno; hoje o único texto sobre o assunto é prosa de `expect` em `golden-topico-proibido.json`, que nenhum runner lê.
- **C-05** — precisa de pergunta nova no `scripts/qa/medidor-duplicidade.sql` (fala de rendição em `role='assistant'`) e de rodar contra o corpus.
- **F-04** — precisa de sonda de juiz por balão (contagem de ideias), rodando sobre transcrição do banco.
- **R-01** — precisa de SQL de caminho por conversa (degrau em `leads.stage` + `contractClosed`) rodado ao fim de cada cenário do Bloco 4.
- **R-02** — precisa versionar as Q6..Q9 (funil do telefone na web) em `scripts/qa/medidor-duplicidade.sql`; as contagens desta rodada saíram de consulta avulsa e hoje não são reproduzíveis por um comando só.
- **R-03** — precisa de sonda que leia o degrau exibido no backoffice e compare com o banco; sem ela o critério é opinião sobre uma tela.
- **R-04** — precisa de SQL que prove a ordem "pedido do cliente antes de `contractClosed`".
- **R-05** — precisa de SQL que conte conversa `closed` sem nenhum toque de retomada registrado.
- **P-01 a P-07, P-10, P-11** — têm medidor de *card* (fichas com `expectArtifacts`/`forbidArtifacts`), mas nenhum mede a **sequência completa** de degraus na mesma conversa, nem o estado final no banco. É o Bloco 4 (camada de caminho) que fecha: `contractClosed`, `bevi_proposals.lead_id`, `leads.phone`.
- **P-08** — medido em parte (21/346, 73/346) por consulta avulsa; para virar critério rodável precisa do mesmo SQL versionado de R-02.
