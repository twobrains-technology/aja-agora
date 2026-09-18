# Briefing — faltas do admin, funil e remarketing do Aja Agora

**Data do levantamento:** 18/09/2026 · **Autor do levantamento:** sessão do Kairo (pi)
**Destino deste documento:** insumo para um agente escrever o **plano de implementação** (TDD),
item a item, em `docs/design/planos/`.
**Não é o plano.** É o mapa do que falta + **onde a informação está fechada** (fala literal e código).

---

## Como usar

1. Leia a seção **Fontes primárias** e abra os arquivos citados. Toda citação tem **linha** e
   **timestamp** — o timestamp é a âncora confiável; o número de linha é do arquivo na data acima.
2. Cada item (`AJA-NN`) traz: o que falta · **fala literal** (quem disse, quando) · **âncora de código**
   · tela/print · dono e prazo · **o que o plano precisa decidir** · **teste de regressão exigido**.
3. Respeite a seção **Restrições globais** — ela muda a solução de alguns itens (o `AJA-12`, por exemplo,
   **não** é código determinístico).
4. **Âncoras de código conferidas** em 18/09 contra `origin/develop` @ `0947d1ef` — 33 caminhos validados e
   1 corrigido (`remarketing-insights.ts` → `remarketing-tela.ts`). Se um caminho não existir no seu worktree,
   é porque ele está atrás de `develop`: leia com `git show origin/develop:<arquivo>`.

---

## Fontes primárias

| Fonte | Caminho | O que tem |
|---|---|---|
| **Call do Aja 18/09** (fonte principal) | `~/Library/Application Support/local-understanding/transcricoes/2026-09-18/1106-call-teams.md` | 722 linhas. A reunião do Aja começa na **linha 254 (11:36:49)** e vai até o fim (12:19:55). O começo do arquivo é outra reunião (Selecta) que rodava no mesmo Teams — **ignore as linhas 1–253** |
| **Call de alinhamento 15/09** | `~/Library/Application Support/local-understanding/transcricoes/2026-09-15/1137-presencial.md` | 420 linhas. É onde nasceu o combinado do funil (“abriu o chat ≠ iniciou a conversa”) e a extração |
| **WhatsApp do time** | grupo `Aja Agora | Performance e Criação` (jid `120363428875947273@g.us`, Evolution local) | pedido formal da extração, aprovação dos templates, automação do painel |
| **E-mail** | Mail.app — `Bruna Perrotta <bruna.perrota@ajaagora.com.br>` | atas e convites “Aja Agora | Alinhamento”. A ata vem como **link do SharePoint** no corpo, sem anexo |
| **Prints (produção, ao vivo)** | `~/Downloads/aja-faltas/*.png` | 10 telas do admin autenticado, 20/08→18/09. ⚠️ **contêm telefone/nome de lead — dado pessoal, não versionar** |
| **Mapa visual** | `~/Downloads/aja-faltas/mapa-das-faltas.html` (+ `.pdf`) | os mesmos itens com os prints embutidos |

**Nota sobre o WhatsApp:** os horários saem já corrigidos para UTC-3. O comando de leitura é
`~/.claude/skills/varre-whatsapp/scripts/varre.sh msgs "120363428875947273@g.us" <dias>`.

**Nota sobre a transcrição:** a diarização troca rótulos de falante (`Voz 4`/`Voz 6`/`Voz 283` = Lucas;
`Microfone` às vezes = Kairo). Trate o rótulo como pista, nunca como prova. O trecho **12:10–12:15** é o
mais truncado do arquivo.

**Glossário dos erros do transcritor** (ASR — aparecem nas citações literais deste documento):
`Caio` = Kairo · `aula` = áudio · `repino` = refino · `impedo` = entendo · `mesa da Juna` = mesa do humano ·
`Ele voltou três vezes atrás` = “voltei três vezes nele” · `aula`/`audio` = áudio. Ao citar uma fala para
terceiros, **confira o timestamp na transcrição antes** — a palavra errada pode inverter o sentido.

---

## Restrições globais (valem para todos os itens)

1. **O prompt NÃO vive no repositório.** `SYSTEM_PROMPT` e `BASE_SYSTEM_INSTRUCTION` são buscados no
   Langfuse com label `production`; o código é só fallback. Mexeu no texto → **só termina com
   `pnpm sync-prompts`** contra a instância certa. Antes de depurar fala, rode **`pnpm prompts:check`**
   (`src/lib/observability/langfuse/prompts.ts`). Vale direto para o `AJA-12`.
2. **Invariante verificável vira código; conversa é do modelo** (`CLAUDE.md`). Não criar guard de frase,
   não criar teste de regex contra lista própria de strings. Tom/repetição/fluidez → Langfuse.
3. **Nunca engessar o agente.** Se a conversa está ruim, a primeira hipótese é prompt/contexto ruim.
4. **`REMARKETING_ATIVO` nasce vazio de propósito** (`.env.example:160`, racional em `CLAUDE.md:168`).
   Qualquer coisa nova nesta área deve nascer **desligada por padrão**.
5. **Português com acento** em tudo que o cliente ou o operador vê.
6. **`pnpm` é o único gerenciador.** Migrations Drizzle + teste de integração para o que toca banco.
7. **O funil inteiro exige origem conhecida** — é pré-requisito, não detalhe (`src/lib/admin/filtro-origem.ts`).
8. Repo de referência: **`origin/develop`**. O worktree local está atrás dela — leia `git show origin/develop:<arquivo>`
   quando a dúvida for “o código atual faz isso?”.

---

## Decisões já tomadas (não reabrir sem motivo)

- A régua de remarketing **foi ligada em produção em 18/09** (12:05, na call).
- A decisão sobre **mensagem padrão e botões** foi empurrada para **terça, 22/09** (linhas 638 e 592).
- **CAC / conversão mínima** saiu da pauta desta semana (Bruna, 12:18).
- **Categorização dos comentários** segue despriorizada e condicionada a volumetria (Bruna, 12:18; linha ~700).
- A **extração para o Gustavo** tem prazo **segunda, 22/09** (linha 642).

---

# Os itens

## AJA-01 · O funil conta a mensagem pré-preenchida como conversa iniciada
**Severidade:** crítico — contamina todos os números que o cliente olha.

**O que falta:** separar “abriu o chat” de “iniciou a conversa”. Hoje a tela de Performance mostra
**Engajaram 166/167 = 99%**, enquanto o Percurso (que conta pessoa) mostra **102 pessoas** que escreveram.

**Fala literal:**
- 15/09, Kairo (linha **92**): *“esse é o ajuste coerente aqui”* — respondendo ao Gustavo sobre
  “ele só abriu o chat, ele não iniciou a conversa”.
- 15/09, Kairo (linha **116**): *“acho que a gente pode fazer isso até pro da web também, porque o
  comportamento é o mesmo. Se a mensagem que o cara mandou é uma daquelas automáticas, a gente não
  considera que ele começou a conversa.”*
- 18/09, Gustavo (11:39): reforça a jornada nova — *“é o chat aberto, ele abriu. Não na primeira
  conversa, mas a partir da segunda conversa que ele responde, aí a gente contabiliza o evento.”*

**Âncora de código** (todas conferidas contra `origin/develop` @ `0947d1ef`):
- `src/lib/admin/performance-queries.ts:151` — `engajou` = existe `messages.role='user'`, **sem filtrar pré-preenchido**. ✅ linha exata.
- `src/lib/admin/percurso-queries.ts:123` — `escreveu` usa a mesma régua (`role='user'`).
- Degraus já desenhados: `src/lib/admin/percurso-types.ts:53` (`label: "Abriu o chat"`) e `:59` (`label: "Escreveu", ajuda: "Mandou ao menos uma mensagem"`).
- **A pepita:** o fato que falta **já existe e nenhuma consulta o lê.** O comentário em `percurso-queries.ts:152-159` documenta: *“o degrau ‘Abriu o chat’ era derivado de conversa SEM mensagem do cliente, e a conversa só nasce no primeiro POST /api/chat — ou seja, depois de escrever. **O degrau era estruturalmente vazio (zero pessoas em 30 dias)**, e quem abriu o teatro e desistiu diante do palco vazio caía um degrau abaixo. **O evento existe desde 18/08 (`chat_open`, 30 em 30 dias) e nenhuma consulta o lia.**”*
  O predicado pronto está em `percurso-queries.ts:170-171`: `EXISTS (… pe.type = 'chat_open') AS abriu_teatro`. É usar.
- O mesmo arquivo documenta o degrau “Olhou a página” com prova de produção (`:145-151`): 82% do degrau era gente que só carregou a página (536 visitas → 96 com rolagem/clique, medido em 24/08). **Padrão a repetir: medir antes de definir o degrau.**
- `percurso-types.ts:24` — decisão já escrita de que duas telas respondendo “se identificou” com regras diferentes seriam *duas verdades*. Não criar régua paralela.

**Tela/print:** `02-performance.png`, `03-percurso.png` (e `09-mapa-de-calor.png`).

**O que o plano precisa decidir:**
- Qual é o predicado de “mensagem automática”: a semente de campanha no CTA (`semente-de-campanha.tsx`),
  o primeiro `chat_send` de label vazio, ou o texto pré-preenchido vindo do anúncio?
- O degrau do WhatsApp é o mesmo caso? (lá não há “semente” — a mensagem chega pelo clique no link).
- Vale corrigir retroativamente (`UPDATE` de histórico em `remarketing_touches`/eventos) ou só daqui pra frente?

**Teste de regressão exigido:** conversa em que o lead só enviou a mensagem pré-preenchida **não** conta
como `engajou`/`escreveu`; conversa com uma segunda mensagem digitada **conta**. Rodar contra
`percurso-queries` e `performance-queries` (integração, com banco).

---

## AJA-02 · O nome que o agente descobre não é gravado no cadastro
**Severidade:** crítico — aparece na régua e na lista de conversas como “Sem nome ainda”.

**Fala literal:** 18/09, Kairo (linha **454**, 11:59:42):
> *“Aparentemente o nome dela é Maria Graciete. Tem dois problemas aqui. Primeiro, também identificou o
> nome dela, apesar de a gente saber ali… Eu preciso fazer quando o agente souber o nome dela, ele já
> preencha lá no nosso cadastro. **Então aqui já é uma correção que eu preciso fazer.**”*

**Âncora de código:**
- `src/lib/admin/remarketing-queries.ts:127` — a régua lê `ct.name` de `contacts`; nulo ⇒ “Sem nome ainda”
  (`src/components/admin/remarketing/tabela-remarketing.tsx:95`).
- Quem deveria gravar: `src/lib/agent/langgraph/nodes/capture.ts`.
- Testes vizinhos que dizem o que **já** é garantido: `src/lib/agent/langgraph/cenario-nome-oferecido-chega-ao-banco.test.ts`,
  `capture.nome-de-frase.test.ts`. O furo é **onde** o nome chega, não se ele chega.

**Tela/print:** `05-remarketing.png` (3 contatos sem nome), `08-conversas.png` (coluna Contato quase toda “—”),
`04-percurso-identificados.png` (11 pessoas identificadas por telefone, todas “Anônimo”).

**O que o plano precisa decidir:** qual é a fonte da verdade do nome — `contacts.name`, `leads`, ou o
metadata da conversa? Se o agente já grava em algum lugar, a correção é sincronizar, não criar caminho novo.

**Teste de regressão exigido:** conversa em que o agente aprende o nome → `contacts.name` preenchido e a
régua/lista passam a exibir o nome.

---

## AJA-03 · A ficha/lista de conversas não mostra em que pé está o remarketing
**Severidade:** crítico (prometido na call).

**Fala literal:** 18/09, Kairo (linha **458**, 12:00:09; e linha **462**):
> *“Uma coluna nova aqui. Pelo menos o status do remarketing… esse cara aqui ele mandou mensagem há três
> dias. Então já era para pelo menos você ter uma visão: nossa, como é que está o remarketing desse cara?
> Quantas vezes a gente falou com ele? **Vou tentar trazer essa visão para cá.**”*
> No mesmo turno (11:59:11): *“a informação do remarketing, quantidade de mensagens que a gente disparou,
> ou quando está agendada a próxima mensagem, seria interessante mostrar aqui.”*

**Âncora de código:**
- Tela: `src/app/admin/(dashboard)/conversations/page.tsx` — colunas atuais: Contato, Canal, Status, Categoria, Atende, Mensagens, Qualidade, Atualizada.
- O dado já existe: `src/components/admin/remarketing/tabela-remarketing.tsx` + `remarketing_touches`
  (`next_touch_at`, `ultimo_toque_em`, `step`, `status`).
- API pronta por conversa: `src/app/api/admin/remarketing/[conversationId]/route.ts`.

**Tela/print:** `08-conversas.png` (não há coluna), `05-remarketing.png` (onde o dado vive hoje).

**O que o plano precisa decidir:** coluna na lista (custo de N+1 queries — ver como as outras colunas
resolvem) **ou** só no detalhe? E o que mostrar quando a conversa nunca entrou na régua: “—”, “fora da
régua” ou o motivo?

**Teste de regressão exigido:** a lista mostra, para uma conversa com toque disparado, o número de toques
e a data do próximo; e distingue “nunca entrou” de “entrou e parou”.

---

## AJA-04 · Não existe visão agregada de acompanhamento da régua
**Severidade:** alto (prometido na call).

**Fala literal:** 18/09, Kairo (linha **332**, 11:50:10):
> *“Eu preciso te dar essa visão, Bruna — não só pontual, tipo para acompanhar um remarketing ali, mas…
> no geral, do tipo **quantas foram disparadas**, te dá um resuminho disso daí pra você pelo menos ter um
> acompanhamento.”*

**Âncora de código:** `src/lib/admin/remarketing-tela.ts` (é aqui: tem `SITUACOES`, `Contadores`,
`RespostaDaRegua`, `proximoToqueDe`, `passoLegivel`, `cotaLegivel`) + `src/components/admin/remarketing/cartoes-da-regua.tsx`
(os cartões); fonte dos números: `remarketing_touches`. Já existe teste: `src/lib/admin/remarketing-insights.test.ts`
(o arquivo de teste tem nome antigo mas importa de `./remarketing-tela` — renomear junto).

**Tela/print:** `05-remarketing.png` (hoje só o funil por passo e o por-toque).

**O que o plano precisa decidir:** quais são as 4–6 métricas do resumo (disparadas no período, entregues,
respondidas, opt-out, esgotadas, em espera) e se entra como bloco na própria tela da régua ou como card no painel.

**Teste de regressão exigido:** com toques em estados diferentes, os contadores do resumo fecham com a soma
das linhas da tabela.

---

## AJA-05 · O filtro de período não propaga em todas as telas
**Severidade:** crítico (admitido por Kairo na call).

**Fala literal:** 18/09, Kairo (linha **348**, 11:52:40–11:53:31):
> *“Ainda tem uma versão de refino chegando aqui, que eu quero melhorar… esse agora aqui vai mudar depois.”*
> *“A única coisa que não está funcional ainda: eu trocar o 30 dias aqui e eu quero trocar para ‘tudo’ aqui
> também… **esse aqui não** [funcionou]. Dá uma falta um refino de quando eu trocar em um lugar e também
> trocar nos outros.”*
> Revisão final (12:15:51, linha ~665): *“Em parte está ok, mas vou refinar mais ainda.”*

**Âncora de código:** `src/components/admin/dashboard/periodo-provider.tsx`,
`src/components/admin/dashboard/filtros.tsx`, `src/lib/admin/periodo-querystring.ts`,
`src/lib/admin/periodo-da-requisicao.ts`.

**Tela/print:** `02-performance.png`, `03-percurso.png`, `07-campanhas.png` (a mesma barra nas três).

**O que o plano precisa decidir:** o período é estado global por provider **ou** vive na querystring?
(a URL já carrega `from`/`to` — decidir a fonte única). E “tudo” precisa existir como opção ou basta
“personalizado” com data aberta?

**Teste de regressão exigido:** trocar o período em uma tela e conferir que as demais abrem com o mesmo
intervalo; navegação suave (client-side) não pode perder o filtro.

---

## AJA-06 · O criativo não aparece por campanha
**Severidade:** médio-alto (em curso, disse que está confirmando a API).

**Fala literal:** 18/09, Kairo (linha **676–682**, 12:17:19 → 12:18:27):
> *“Eu estou querendo fazer mais aqui: criativo. Acho que eu consigo pegar pela API ali, **estou confirmando
> isso ainda**, aí você teria essa visão.”*
> *“esse cara aqui chegou por onde? Essa campanha — ele chegou do criativo.”*
> Bruna: *“essa sequência eu consigo visualizar em algum lugar, para saber exatamente qual é o criativo?”*

**Âncora de código:** `src/lib/meta-ads/cliente.ts` (Graph API), `src/lib/workers/meta-ads-sync-cycle.ts`
(ciclo que popula o espelho), tabela de espelho da Meta, tela `src/app/admin/(dashboard)/campanhas/`.

**Tela/print:** `07-campanhas.png` (a tabela não tem coluna de criativo).

**O que o plano precisa decidir:** o criativo vem por `ad_id` no *insights* da Graph API e é guardado no
espelho, ou é resolvido sob demanda (e aí qual é o custo/latência)? Precisa de nova coluna ou nova tabela?

**Teste de regressão exigido:** com o espelho populado, a tela mostra o nome/identificador do criativo por
campanha; campanha sem criativo exibe estado explícito, não vazio.

---

## AJA-07 · Campanhas com “Nome não resolvido” (chave crua, uma URL-encoded)
**Severidade:** médio (degrada a leitura por campanha).

**Fala literal:** 18/09, Kairo (12:16, linha ~670): *“pode ver que até a nomenclatura da campanha mudou”* — e
na tela aparecem 6 linhas com `△ Nome não resolvido`, uma com a chave
`BOFU+-+AJA+%7C+CPM+FOCO+CONVERS%C3%83O+%2B+BASE+GERAL+%E2%80%94+C%C3%B3pia`.

**Âncora de código:** `src/lib/meta-ads/resolver.ts:137` (o parâmetro `fallback: string | null`) e **`:140`** —
`if (fallback?.trim()) return fallback.trim();` — é **aqui** que a chave crua vira rótulo. O comentário do
contrato está em `:128-131` e o teste em `src/lib/meta-ads/resolver.test.ts:80` (*“sem resolvida e sem fallback,
sobra o valor cru da chave”*).
Em `src/lib/admin/titulo-da-origem.ts:33` — *“sem nome e sem id não há nada a acrescentar: o rótulo cru de
antes”*; e `:39` avisa que **o rótulo cru fica junto de propósito** (a busca e o filtro dependem dele) —
não apagar, só deixar de ser o texto principal.

**Tela/print:** `07-campanhas.png`.

**O que o plano precisa decidir:** onde mora o de-para (cadastro em tela, como `remarketing_config`, ou
tabela nova)? Decodificar percent-encoding na leitura é paliativo ou parte da solução? O que a tela deve
mostrar enquanto não há de-para?

**Teste de regressão exigido:** chave com `%7C`/`%C3%83` resolve para rótulo legível; chave sem de-para cai
em um rótulo humano (“campanha nova, nome pendente”), nunca na string crua.

---

## AJA-08 · “Custo por lead qualificado: sem base” e a divergência Meta × CRM (258 × 6)
**Severidade:** crítico para a decisão de mídia (é onde a Bruna quer chegar).

**Fala literal:** 18/09, Kairo (linha **676**, 12:16:32) — verbatim, com a deturpação do transcritor:
> *“a quantidade de leads ali que a meta fala que ela mandou. **Não impedo muito** [= “não entendo muito”],
> Gustavo, porque ela trata como lead aqui, mas o lead nosso é esse da direita, tá? É o nosso lead aqui, né?
> O que virou conver[sa]…”*
> A tela diz, literalmente: *“A Meta atribui o que ela viu; o CRM conta o que entrou. **Nunca concordam.**”*

**Âncora de código:** `src/lib/meta-ads/resolver-do-banco.ts`, `src/lib/admin/agrupar-origens.ts`
(leads da Meta) × `src/lib/admin/performance-queries.ts` (quantos viraram conversa).

**Tela/print:** `07-campanhas.png` (os dois cartões do topo).

**O que o plano precisa decidir:** o custo por lead qualificado fica vazio por **falta de dado** (zero
qualificado no período) ou por **falta de vínculo**? A tela deve dizer qual dos dois — hoje “sem base”
não distingue. Definir também qual lead é a base canônica (o da Meta ou o do CRM) e como o painel reconcilia.

**Teste de regressão exigido:** com zero qualificados, a tela explica o motivo; com campanha atribuída, o
custo aparece e bate com investimento ÷ qualificados.

---

## AJA-09 · 11 pessoas paradas em “Se identificou” (o “limbo”) e a elegibilidade da régua
**Severidade:** crítico (cobrado pela Bruna; é receita parada).

**Fala literal:** 18/09, Bruna (11:49:46): *“essas 9 e 10 pessoas continuam num limbo… eu não sei o
timing disso versus esses nove que eu posso ligar.”*
Kairo (linha **434**, 11:57:23): *“Correto, mas a gente pode rever aqui, Bruna, voltar naqueles 9 seu e
entender por que ele não veio. Eu imagino que seja por conta do telefone, talvez ele fez pelo R [= landing?],
tá? E não informou o número.”*

**Medido na tela:** são **11**, todos com telefone, um com 32 mensagens, parados há 3–7 dias;
a régua ativa tem **3**.

**Âncora de código:** tela `/admin/percurso?passo=se_identificou`; `src/lib/admin/percurso-queries.ts:126` —
`AND (l.phone IS NOT NULL OR l.email IS NOT NULL)) AS identificou` (agregado em `:211`); o mapeamento do degrau
em `percurso-types.ts:60` (`se_identificou` = *“Deixou telefone ou e-mail”*); critério de elegibilidade da régua
em `src/lib/remarketing/regua.ts`.

**Tela/print:** `04-percurso-identificados.png` (os 11), `05-remarketing.png` (os 3 da régua).

**O que o plano precisa decidir:** por que os 11 não entraram (telefone ausente? janela de 24h? não é
`wa_id`? conversa encerrada?) — **isso precisa de prova no banco, não de hipótese**. Decidir também se
entra um caminho de “forçar para a mesa” — a Bruna sugeriu isso em 15/09, linha **176**, 11:49:39:
*“Mas aí será que a gente não põe para a mesa do agente? A gente força esses IDs de vai para o pessoal lá
para a mesa da Juna [= mesa do humano]?”*

**Teste de regressão exigido:** dado um lead identificado e parado, ele aparece na régua **ou** a tela diz
por que não (motivo nomeado), nunca some.

---

## AJA-10 · Higiene da régua: a equipe entra na base, e o rótulo da marcação de teste é ruim
**Severidade:** médio.

**Fala literal:** 18/09 11:56:49 — Bruna (linha **422**): *“É, na verdade, a gente está falando desses seis,
mas desses seis, tipo três, já somos nós, né?”*; Kairo (linha **426**, 11:56:56): *“Isso, exato. Já somos
nós. E tem que sair daqui também, já saiu.”* Kairo (linha **420**, 11:56:32): *“Sempre que vocês olharem para
algum item que for um teste, vamos, essa luz aqui não é propriamente. **Eu preciso melhorar ali para o nome.**
Como o nome de WhatsApp, eu vou fazer aqui também a mesma coisa.”*

**Âncora de código:** `src/app/api/admin/conversations/[id]/marcar-como-teste.integration.test.ts` e o botão na ficha;
a lista que conta (Performance) já tem o filtro de conversa de teste — `feat(admin): marcar conversa como
teste tira ela e o lead das métricas` (commit `68baefbc`).

**Tela/print:** `05-remarketing.png`, `02-performance.png`.

**O que o plano precisa decidir:** a marcação de teste deve também **remover da régua** (não só das
métricas)? E como o operador distingue teste de lead real na lista — badge com texto, cor, ou filtro?

**Teste de regressão exigido:** conversa marcada como teste não aparece na régua nem no funil; e a lista
mostra a distinção sem depender de ícone sem rótulo.

---

## AJA-11 · Posição da régua no menu
**Severidade:** baixo (ajuste fino, dito por Kairo).

**Fala literal:** 18/09 (linha **368**, 11:54:01): *“Acho que eu vou subir ela até aqui para cima, porque ela
é meio que um negócio operacional e ao mesmo tempo ela é também de acompanhamento.”*

**Âncora de código:** navegação do grupo “Aplicações” (`src/app/admin/(dashboard)/layout` / sidebar).

**Tela/print:** `05-remarketing.png` (hoje fica abaixo de “Conversas”).

---

## AJA-12 · Formatação da primeira resposta do agente no WhatsApp
**Severidade:** crítico — **mas atenção: não é código determinístico.**

**O que falta:** o agente pede dois dados na mesma frase (“qual bem você quer” + faixas 50/100/200 mil)
para quem ainda não disse o bem. A Bruna quer uma pergunta por vez e menos texto.

**Fala literal:** 18/09, Bruna (12:04–12:08) lendo a mensagem que recebeu: *“esse bando de texto aqui,
perguntando duas coisas ao mesmo tempo.”* Kairo (linha **578**, 12:08:02):
> *“Não, **até a formatação ali já está errada. É uma correção.** Agora… é só a gente definir, aquela
> mensagem ali pode ser até fixa primeira. Depois o agente pega o contexto e vai te falar como se fosse o GPT.”*

**Âncora:** `src/lib/agent/system-prompt.ts` (`SYSTEM_PROMPT`) e o prompt publicado no Langfuse;
`src/lib/agent/orchestrator/directives.ts`; `src/lib/agent/orchestrator/system-context.ts`.
**Antes de qualquer coisa: `pnpm prompts:check`** e, ao terminar, `pnpm sync-prompts`.

**Tela/print:** a conversa real dela em `/admin/conversations` (evidência primária) — **não** nos prints deste documento.

**O que o plano precisa decidir:** isto é (a) ajuste de prompt, (b) diretiva de turno, ou (c) o texto fixo
da mensagem inicial? Pela regra do projeto, tom não vira código — o plano deve dizer **qual dos três** e
**como medir** (juiz LLM + score no Langfuse sobre volume real, não teste de regex).

---

## AJA-13 · Botões de resposta rápida no WhatsApp (carro / moto / imóvel)
**Severidade:** médio · **decisão travada para terça, 22/09.**

**Fala literal:** 18/09, Bruna (12:08:19–12:09:28) pede para revisitar; Kairo (linha **592**): *“Mas dá para
fazer; tem tudo que você vê… tecnicamente dá para a gente fazer.”* Kairo (linha **610**, 12:09:28):
*“Está num momento antigo aí, é uma definição antiga do WhatsApp. A gente tinha falado: olha, vamos só
conversar, o WhatsApp não vai…”* — lembrando que a primeira proposta **tinha** os botões e foi tirada
porque o Edu achou robótico.
Bruna (linha **638**, 12:12:29): *“Então, 22 do 9. Na terça, a gente decide se muda o WhatsApp ou não, se
muda essa questão da mensagem padrão e se deixa os botões mais diretos ali.”*

**Âncora de código:** `src/lib/whatsapp/interactive-handlers.ts`; a referência que já funciona é a coluna
**Categoria** (Moto / Imóvel / Automóvel) da lista de conversas.

**Tela/print:** `08-conversas.png` (a Categoria prova que o bem já é capturado quando vem pelo site).

**O que o plano precisa decidir:** o plano deve **preparar as duas opções** e só então aguardar a decisão
de 22/09 — não implementar antes.

---

## AJA-14 · Imagem fora do template sem sentido + texto de referência na mensagem padrão
**Severidade:** médio.

**Fala literal:** 18/09, Kairo (linha **556**, 12:06:30): *“Só que eu achei que a mensagem ficou… a mensagem
não, **a imagem embaixo ali não fez tanto sentido**, né?”* e (12:07:02): *“O agente olhou pro insumo que a
gente tinha e te mandou isso. Faz sentido mandar a imagem do criativo do template do carro. **A gente pode
refinar.** Ele pode ser inteligente ou pode ser fixo.”*
Sobre o texto da mensagem padrão — Bruna: *“por que precisa estar escrito isso aqui junto?”*; Kairo
(linha **498**, 12:02:39): *“**Não precisa.** Sim, isso é mais para trás”* — mas depois explica que
*“ajuda na métrica: ele veio de alguma campanha nossa”*; e (linha **524**): *“pode escolher a mensagem que
você quiser.”*

**Âncora de código:** `src/components/vertical/semente-de-campanha.tsx` (referência no CTA);
`src/lib/remarketing/motor.ts` (arte enviada fora do template); artes em `public/kv/remarketing/`.

**Tela/print:** `05-remarketing.png` (a régua é quem envia), `10-templates.png`.

**O que o plano precisa decidir:** a arte deve ser escolhida **pelo bem** quando ele é conhecido, e nenhuma
arte quando não é (mandar genérico ou não mandar)? Tirar a referência da mensagem padrão quebra a
atribuição — então como preservar a origem sem poluir a mensagem do cliente?

---

## AJA-15 · Áudios vazios — **única pendência com progresso zero**
**Severidade:** alto (o lead fala e o agente não recebe nada).

**Fala literal:** 18/09, Bruna (12:15:14): *“você ia tentar ver se você conseguia avaliar alguma coisa das
conversas de áudio? Não sei se evoluiu alguma coisa com isso.”* → Kairo (linha **662**): **“Do áudio não.”**
Origem do item — WhatsApp 14/09 17:02 (Kairo): *“faltam nada com nada. mandaram um audio vazio. avaliei e
pelos logs e tudo mais são genuínos. problema agora é entender porque [o áudio] não falou nada… mais tarde
vou tentar um contato manual para ver se o número é de uma pessoa que responde, ou se pode ser bot.”*
E 15/09 (linha **174**): *“eu tô pendente aqui ainda de tentar validar… adicionar esses números no meu
WhatsApp e tentar mandar um oi só pra ver se são realmente pessoas.”*

**Caso concreto para reproduzir:** o lead que **voltou 3 vezes** mandando áudio (linha **484**, 12:01:34
— *“E ele voltou três vezes atrás, fazendo a mesma coisa, mandando aula [áudio]”*); aparece na lista de
conversas com 4 mensagens e categoria Moto.

**Âncora de código:** `src/lib/whatsapp/processor.ts`, `src/lib/whatsapp/api.ts` (download de mídia),
`src/lib/whatsapp/adapter.ts`.

**O que o plano precisa decidir:** é falha de download da mídia, áudio realmente vazio, ou formato não
suportado? **Isso pede medição primeiro** (log/inspeção do payload do webhook) — o plano deve começar por
um passo de diagnóstico que produza prova, e só depois a correção. Sem prova, não escrever guard.

---

## AJA-16 · A extração pedida pelo Gustavo (prazo: segunda, 22/09)
**Severidade:** crítico — tem prazo e é pedido formal do cliente.

**Pedido literal** (WhatsApp do grupo, 16/09 11:44, Gustavo Barbosa — inclusive marcando o Kairo):
> *“Precisamos preparar a extração para avaliar os testes de growth, baseada nas mudanças que fizemos.*
> *- Enviar os participantes elegíveis com identificação do experimento e da versão, quando disponível,
> conversas em ordem cronológica, histórico das etapas e resultado comercial.*
> *- Incluir quem não virou lead, quem interrompeu o contato e quem permanece em atendimento. Precisamos
> dos identificadores, datas, **autoria das mensagens** e origem de cada status, além de informar
> **vínculos ausentes e dados indisponíveis**.*
> *- A extração deve acompanhar as conversas dos participantes do teste até a data de corte definida,
> inclusive mensagens posteriores ao fim da veiculação. **Não substituir o histórico apenas por um resumo
> de IA.***
> *- Primeiro, entregar **um pequeno lote** para validar o formato e os vínculos, **sem alterar a
> produção**. Minimizar dados pessoais e informar o prazo de disponibilidade dos dados.”*
> Na linha seguinte: *“pode ser em CSV ou JSON”*.

**Reforço na call:** 18/09 (linha **642**, 12:12:56): *“Cairo, já deixa aquele relatório das conversas aí
pronto para a gente ir na segunda-feira. Eu te mando reforço ali contigo.”* E (11:48): *“a partir de
segunda-feira eu já vou pedir uma lista… e ele vai mandar para mim segunda-feira”; “depois… quarta-feira,
quinta-feira, ele manda de novo.”*

**O que já existe:** `scripts/exportar-percurso-prod.mjs` em `origin/develop` (merges das PRs #119–#131 de
`kairogyn/extracao-dos-dados`).

**O gap:** o export atual entrega o **percurso agregado por pessoa**; o pedido exige **histórico
mensagem-a-mensagem com autoria** (`messages.role`) + **vínculos ausentes declarados**. A consulta de
referência é `src/lib/admin/percurso-queries.ts`.

**O que o plano precisa decidir:** formato exato do lote de validação (colunas do CSV / shape do JSON),
onde o script roda (sem tocar produção), e como declarar vínculo ausente em vez de deixar célula vazia.

**Teste de exigido:** o lote dobra sobre si mesmo: toda mensagem tem autoria; todo vínculo quebrado
aparece nomeado; contagem do lote bate com a consulta de origem.

---

## AJA-17 · 9 conversas sem origem conhecida ficam fora de todo o funil
**Severidade:** médio-alto (é o que trava o CAC).

**Fala literal:** não há fala — é o aviso da própria tela (18/09, print `02-performance.png`):
> *“167 de 176 conversas têm origem conhecida (95%). As demais **não aparecem em nenhum número desta
> tela** — nasceram fora da landing, e todo o funil abaixo exige origem conhecida.”*

**Âncora de código:** `src/lib/admin/filtro-origem.ts` (+ `predicadoDeOrigemNaVisita`),
`src/lib/admin/origem-label.ts`.

**O que o plano precisa decidir:** essas 9 devem ser excluídas com aviso (hoje) ou classificadas como
“origem desconhecida” e contadas? E como o número fica coerente com a tela de Campanhas?

---

# Fora deste repo (não virar card aqui)

| Item | De quem é |
|---|---|
| Peças novas de criativo (17 peças, teste AB, vídeo + carrossel) | Lucas (agência) |
| Subir as campanhas novas e pedir a lista na segunda | Gustavo |
| Revisão do site com foco em conversão | Gustavo (“já está na minha lista”, 16/09 11:52) |
| Ata-viva com as pendências no final do doc | Bruna (link SharePoint, 15/09 12:52) — ninguém confirmou o “vejam se falta algo” |
| Acesso ao Google Tag Manager | convite chegou em 16/09 13:12 (notify-noreply@google.com) |

---

# Ordem sugerida (dependências)

1. **Diagnóstico primeiro, código depois** em dois itens: `AJA-15` (áudio — precisa de prova antes de
   qualquer correção) e `AJA-09` (por que os 11 não entraram — prova no banco).
2. **`AJA-01` antes de tudo que é leitura de número**: enquanto o engajamento estiver em 99%, todo painel
   que a Bruna abre mente. `AJA-02` é o par natural (os dois aparecem nas duas mesmas telas).
3. **`AJA-03` + `AJA-04`** respondem o que foi prometido na call e são o que ela espera ver na tela;
   `AJA-04` depende de `AJA-03` definir o shape.
4. **`AJA-16` é prazo duro (22/09)** e é o único com cliente esperando arquivo — se houver conflito de
   agenda, ele vem primeiro.
5. **`AJA-05`** é pequeno e de alto impacto na percepção (foi admitido ao vivo).
6. `AJA-06`/`AJA-07`/`AJA-08` são a mesma família (campanhas/mídia) — planejar juntos, decidir o
   dicionário de campanha uma vez.
7. **`AJA-12`/`AJA-13`/`AJA-14`** são a família WhatsApp/fala. `AJA-12` depende de `prompts:check` antes e
   `sync-prompts` depois; `AJA-13` está **bloqueado por decisão de terça (22/09)** — o plano pode
   preparar as opções, não implementar.