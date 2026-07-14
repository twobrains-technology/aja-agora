# Goal — Agente desamarrado, humano e funcional (web + WhatsApp, todos os consórcios)

- **Aberto:** 2026-07-13 · **Dono:** Kairo · **Branch base:** `refactor/desamarra-agente`
- **Status:** rodada 0 (cirurgia) em andamento

## Objetivo macro

Um agente de vendas de consórcio que **conversa como gente** — escuta, adapta, varia a fala — e
que mesmo assim **nunca quebra um invariante** de negócio/compliance. Funcional ponta-a-ponta em
**web e WhatsApp**, para **todos os tipos** (auto, moto, imóvel, serviços).

## O problema que estamos consertando (root cause, provado no código)

O produto foi construído sob o dogma "o `jornada.docx` é soberano; divergência = defeito do código"
(revogado hoje — ADR `2026-07-13-revoga-jornada-soberana-desamarra-agente.md`). Isso produziu, no
runtime, cinco camadas que **tiram a conversa do modelo**:

| # | Camada | Evidência |
|---|---|---|
| 1 | Prompt monolítico: **~21-24k tokens de restrição por turno**, igual em toda fase | `system-prompt.ts` — `SPECIALIST_BASE_PROMPT` = 648 linhas / 78 KB; 117× "NUNCA", 23× "PROIBIDO" |
| 2 | FSM linear de 14 gates, sem saída lateral | `qualify-state.ts:189` `nextGate()` |
| 3 | ~30 directives, metade delas *"escreva APENAS uma frase e NÃO chame tool"* | `directives.ts` (656 linhas) |
| 4 | **8 intercepts pré-LLM** — o servidor responde por texto fixo, o modelo nem roda | `orchestrator/index.ts:324,359,431,490,558,606,697,810` |
| 5 | Sanitizer que **apaga as perguntas do modelo** depois de geradas | `sanitizer.ts:372` (FIX-298: só a última pergunta sobrevive) + `:482` `discardHeldQuestion` |

Reforçado por **45 arquivos de teste** travando copy literal e por uma **rubrica de judge** que
pontuava `ordemCorreta` e `fidelidade ao docx` — ou seja, o loop de QA **premiava** o engessamento.

## Definition of Done (a rubrica) — 10/10

O juiz (Sonnet, contexto fresco, conhece o mockup) pontua sobre o dossiê do coletor. Todas no teto:

| # | Dimensão | Pergunta checável |
|---|---|---|
| D1 | **Humanização** | O agente **escuta e reage ao que foi dito** (espelha o motivo, usa o bem pelo nome)? A fala **varia** entre conversas? Zero cara de robô/script? |
| D2 | **Não-repetição** | Diante de "não entendi", "não sei", silêncio ou pergunta fora do trilho — ele **reformula de outro jeito** em vez de repetir a mesma frase? (era o sintoma-mor) |
| D3 | **Condução** | Mesmo conversando solto, ele **chega ao fim** da jornada (reserva) sem travar nem perder o fio? |
| D4 | **Invariantes** | Nunca simula sem CPF+celular+LGPD · nunca inventa número (todo valor vem da Bevi) · nunca promete "cota reservada" antes da contratação · ressalva CDC presente · CPF não vaza no WhatsApp |
| D5 | **Cobertura** | Funciona nos 4 tipos (auto, moto, imóvel, serviços) **e** nos 2 canais (web, WhatsApp) |
| D6 | **Fidelidade ao mockup** | A *coreografia* bate com `aja-dois-cenarios.html` (rapport → valor → identidade → busca → lista → consent → hero → lance → agulha → reserva) e os dois cenários (Madalena que junta pro lance × Mario sem entrada) |

> ⚠️ **A rubrica NÃO pontua aderência a script.** O agente perguntar com outras palavras, mudar a
> ordem porque o usuário puxou a conversa, ou improvisar **não é defeito** — é o objetivo. Só é
> defeito quebrar invariante (D4) ou piorar a conversa (D1/D2/D3).

> ⚠️ **Sonda com modelo fraco.** O juiz avalia também um run no modelo **mais fraco** que o de prod
> (Haiku). Se a jornada só funciona no modelo forte, ela ainda está apoiada no prompt e não no
> desenho — não é 10/10.

## Rodadas

### Rodada 0 (esta sessão) — a cirurgia
Feita direto na sessão, **não em blocos**: são todos os mesmos arquivos, blocos paralelos se
atropelariam.

1. ✅ Revoga o dogma (docs, CLAUDE.md, memórias, ADR)
2. ⏳ Fatia o prompt por fase (o turno 1 não carrega regra de contrato)
3. ⏳ Mata os 8 intercepts pré-LLM que respondem por texto fixo
4. ⏳ Sanitizer só compliance (para de comer as perguntas do modelo)
5. ⏳ Mata a frase canônica *ipsis litteris* e os directives de "1 frase"
6. ⏳ Troca os 45 cadeados de copy por testes de invariante; reescreve a rubrica do judge

### Item novo (Kairo, 2026-07-13) — realinhar as raias do funil

O Kairo definiu as raias e os critérios de transição:

| Raia | Critério (palavra dele) |
|---|---|
| Novo | clicou o anúncio |
| Engajado | abriu conversa, mas deu "Oi" |
| Qualificado | entendendo a necessidade/cliente; **mostra as opções dos grupos** |
| Em Negociação | definição do grupo a ser adquirido — **pediu proposta** |
| Na Administradora | **aprovado pelo cliente**, aguardando aprovação da adm |
| Em Atendimento | **adm deu ok**, fazendo envio de documentação nos portais |
| Aguardando Pagamento | pagamento da 1ª parcela |
| Fechado Ganho | — |

**Delta vs. o código de hoje** (`src/lib/admin/lead-stages.ts:8`): o `STAGE_ORDER` atual tem **9**
raias — inclui `proposta_enviada` entre `em_negociacao` e `na_administradora`, que **não existe** na
lista dele (é absorvida pelo "pediu proposta" de Em Negociação). E a semântica de `na_administradora`
/ `em_atendimento` muda (hoje `na_administradora` dispara o transbordo automático; na definição nova
ela significa "cliente aprovou, esperando a adm").

⚠️ **PENDENTE-KAIRO:** remover `proposta_enviada` é migration de enum + backfill dos leads que
estiverem nessa raia. Confirmar antes de executar. Bloco próprio na rodada 1 (não entra na cirurgia
do runtime — é mesa/Kanban).

### Rodadas 1..N — o loop
Coletor **Haiku** (dossiê factual, não julga) → juiz **Sonnet** (conhece o mockup, pontua) →
achados viram cards → blocos `todo-blocks` → merge na base → re-verifica. Fable sela o marco.
Ao voltar pra develop: **deletar workspaces vazias**.

## Model routing

| Papel | Modelo | Effort |
|---|---|---|
| Cirurgia (rodada 0) | Opus (esta sessão) | — |
| Crítico da spec | Opus, contexto zerado | xhigh |
| Planner do roteiro E2E | Opus | xhigh |
| **Coletor** (dossiê) | **Haiku** | low |
| **Juiz da rodada** | **Sonnet** | high |
| Selo do marco | Fable | — |
| Blocos de correção | Haiku (`TB_BLOCK_MODEL`) | — |

## Gotchas conhecidos (memória — não repetir)

- **LLM local exige a VPN do LiteLLM** — sem ela, "invalid x-api-key". Não assumir E2E real sem checar.
- **Coletor que troca `AI_MODEL` não roda em paralelo** com outro no mesmo container (race).
- **Coletor pode alucinar sucesso** — conferir com `ls` que os arquivos do dossiê existem no path
  citado ANTES de mandar pro juiz.
- **QA de WhatsApp não roda em prod** (simulador é 404 por design) — usar DEV/local.
- Gate de merge da onda = `pnpm test:unit` (tsc whole-repo já é vermelho na develop por dívida).

## Ambiente do loop (resolvido 2026-07-14)

A `ANTHROPIC_API_KEY` do `.env.local` está com a **cota do workspace estourada** (volta 01/08) —
sem LLM não há loop. Destravado **sem VPN**:

1. Túnel **SSM port-forward** pro EC2 que hospeda o LiteLLM (`i-08d456699dab4222c`, porta 4000):
   `aws ssm start-session --target <ec2> --document-name AWS-StartPortForwardingSession …`
2. A virtual key é a **`LITELLM_API_KEY`** (não a `ANTHROPIC_API_KEY`) — vive em
   `tb/prod/aja-agora/env`. Budget próprio, separado do workspace estourado.
3. `.env.local`: `LITELLM_BASE_URL=http://host.docker.internal:4000` + `LITELLM_API_KEY=…`
   (o container alcança o túnel do host).

⚠️ **A Bevi de homologação usa um único proposal-hash** (`BEVI_SELFCONTRACT_HASH`) — duas jornadas
**simultâneas** dão `write conflict` e produzem falha FALSA. **Coletores rodam em SÉRIE.**

## LEDGER

| Rodada | O que entrou | Score | Achados |
|---|---|---|---|
| 0 | cirurgia (desamarra runtime + troca cadeados) | — | suíte 3.449 verde; 17 invariantes anti-re-amarra |
| 0.1 | **regressão própria, pega no 1º teste ao vivo** | — | o corte por fase removia "Apresentando resultados" e "NUNCA alucinar falha de busca" da fase `qualify` — **mas a BUSCA roda em qualify**. O modelo chamou `search_groups` + `recommend_groups` no mesmo turno com `budget:0` inventado → Bevi devolveu *write conflict* → usuário via "não consegui carregar as opções". Fix: `promptPhaseFromMeta` (identidade coletada ⇒ prompt já entra em reveal) + as 2 regras de honestidade saem do corte. Teste trava a regressão. |

| 1 | **QA ao vivo — 4 tipos × web** (coletor Haiku) | — | 4 jornadas completas (17-19 turnos), todas até proposta/contrato |
| 1 | **BUG REAL corrigido: WhatsApp comia a pergunta do gate `desire`** | — | Sem botão e fora de `WHATSAPP_TEXT_GATES` → a pergunta "Qual moto você tem em mente?" **nunca era entregue**. O agente dizia "Prazer, Mario." e parava (turno morto), enquanto o directive prometia que "o sistema pergunta em seguida". Na web saía normal. Fix + teste de paridade que cobre o INVARIANTE (qualquer gate futuro esquecido no WhatsApp quebra). |

### Lições de instrumentação (o coletor mentiu duas vezes)

1. **Coletor reportou "as 4 jornadas do WhatsApp travaram" — era FALSO.** O banco provou que o
   agente respondia normalmente (11 mensagens de assistente). O helper tinha timeout de 120s e
   desistia antes. **Instrumento ruim vira bug fantasma** — e se eu tivesse repassado ao juiz, ele
   reprovaria o WhatsApp por um bug que não existe.
2. **O helper lia do banco e perdia as perguntas de gate** (o outbound do WhatsApp não vai todo pra
   `messages`). Passou a ler os balões reais do canal (`[whatsapp-out:*]`).
3. Confirma a memória `feedback_loop_goal_coletor_hallucinated_success`: **checar o disco/DB antes de
   acreditar no coletor**, sempre.

### Achados preliminares (a confirmar pelo juiz)

- ✅ **"não entendi" não repete mais**: o modelo reformulou ("Pra eu saber como me dirigir a você.
  Qual é o seu nome?") em vez da frase fixa + mesma pergunta.
- ✅ **`modelAsked` funciona**: o modelo perguntou "Quanto custa esse Corolla que você tem em mente?"
  (formulação dele) e o card **não repetiu** a canônica.
- ✅ **Espelho + objetivo** (mockup r10) presente: "quando o carro dá trabalho, atrapalha tudo. Então
  o objetivo já fica claro: te colocar num Corolla novo".
- ⚠️ **Meta-narrativa** no reveal: "Agora vou te recomendar a mais adequada", "Agora vou detalhar
  como fica sua simulação" — o prompt proíbe narrar os próprios passos.
- ⚠️ **Texto órfão do hero**: o agente disse "Tá aí a ITAÚ em destaque — parcela de R$ 3.549,75"
  mas o `recommendation_card` **não foi emitido** (suprimido pelo guard do `reco-consent`, correto
  pelo mockup). O modelo narra um card que não está na tela.
