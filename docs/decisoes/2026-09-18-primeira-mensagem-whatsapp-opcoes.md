# Decisão — primeira mensagem do WhatsApp: conversa (A) × lista (B) × CTA (C) (AJA-13)

> 2026-09-18 · Kairo + Bruna (call de 18/09) · Status: **aberta — decisão travada para terça, 22/09**
> Nada aqui está implementado. Este documento é a preparação para a decisão, como pedido pela Bruna
> (linha 638: *"Na terça, a gente decide se muda o WhatsApp ou não, se muda essa questão da mensagem
> padrão e se deixa os botões mais diretos ali."*).
> Documento irmão (medição): `docs/design/decisoes/2026-09-18-juiz-primeira-resposta-whatsapp.md`

## Contexto

- **O defeito medido:** a primeira resposta do agente no WhatsApp juntou, num balão só, "qual bem você
  quer" e a lista de faixas 50/100/200 mil. A Bruna (12:04–12:08): *"esse bando de texto aqui,
  perguntando duas coisas ao mesmo tempo"*. Kairo (12:08): *"até a formatação ali já está errada. É
  uma correção."*
- **O código já não manda faixas na abertura.** Desde o FIX-120, o gate `credit` no WhatsApp devolve
  `null` (`src/lib/whatsapp/adapter.ts:114-119`) — o valor do bem é conversa, não lista. As únicas
  faixas 50/100/200 mil do código são botões de crédito **pós-descoberta** do bem
  (`src/lib/agent/qualify-config.ts:164-218`, `RANGE_OPTIONS`; e `src/lib/whatsapp/formatter.ts:318-455`,
  `RANGES`). Logo: a mensagem ruim foi **o modelo divergindo da instrução de prompt**, ou produção
  servindo um prompt diferente do código (o prompt vive no Langfuse; `pnpm prompts:check` decide —
  **só o líder roda**).
- **Histórico da opção (B):** a v1 tinha botões Carro/Moto/Imóvel na entrada e eles saíram porque o
  Edu achou robótico (Kairo, 12:08–12:09: *"é uma definição antiga do WhatsApp… vamos só conversar"*).
  A Bruna quer revisitar — daí a decisão de terça.
- **A nota da atribuição:** o texto do CTA (`PRIMEIRA_FALA`) que o cliente já leva escrito para o
  WhatsApp **pode mudar** sem quebrar métrica, porque o vínculo de origem é a `(ref …)`, não o texto.

## Opção (A) — conversa livre com o prompt ajustado

**O que é:** manter a abertura como conversa do modelo, mas instruir explicitamente, no prompt, que a
PRIMEIRA resposta faz UMA pergunta, em até duas frases, sem lista e sem faixas.

**O que mudou neste branch:** uma REGRA DURA na seção da abertura de
`src/lib/agent/system-prompt.ts` (`SYSTEM_PROMPT`, inserida no fim do "## Fluxo de Vendas"). Ela foi
escrita como bloco `**REGRA DURA` de propósito: `leanSystemPrompt`
(`src/lib/agent/langgraph/nodes/converse.ts:145-180`) **recorta a seção "Fluxo de Vendas"** antes de
mandar ao modelo e só deixa sobreviver o que está marcado assim — foi assim que uma correção anterior
virou texto morto (`lean-prompt-entrega-as-regras.test.ts`). Teste que trava isso:
`src/lib/agent/langgraph/nodes/primeira-resposta-uma-pergunta.test.ts`.

**Esforço:** ~0 (já no branch). Publicação: `pnpm sync-prompts` **pelo líder** (o prompt é gerenciado
no Langfuse; deployar o código não muda produção). Confirmar antes com `pnpm prompts:check`.

**Risco:** depende de o modelo obedecer — não há guard, por desenho. É o que o juiz
`primeira_resposta_uma_pergunta` mede (`docs/design/decisoes/2026-09-18-juiz-primeira-resposta-whatsapp.md`).

**Não muda** fluxo, cards, banco nem atribuição.

## Opção (B) — primeira resposta com lista interativa Carro · Moto · Imóvel

**O que é:** no primeiro turno de WhatsApp em que o cliente ainda não disse o bem, o sistema mostra
três botões de resposta rápida (Carro/Moto/Imóvel) em vez de depender da pergunta do modelo.

**A infraestrutura já existe — falta o que liga:**

| Peça | Onde | Estado |
|---|---|---|
| Botões Carro/Moto/Imóvel | `welcomeButtonsToWhatsApp()` — `src/lib/whatsapp/formatter.ts:760-780` | pronto |
| Handler do clique | `handleCategory` — `src/lib/whatsapp/interactive-handlers.ts:368-378`, roteado em `:104` (`replyId.startsWith("category_")`) | pronto |
| Entrega no WhatsApp | caso `welcome-categories` — `src/lib/whatsapp/adapter.ts:527-540` | pronto |
| Paridade com a web | `src/lib/web/adapter.ts:473` + `WELCOME_OPTIONS` — `src/lib/chat/welcome-options.ts:19` | pronto |
| **Emissão no runtime LangGraph** | `src/lib/agent/langgraph/emit.ts:164` marca `welcome-categories` como `TODO(rodada-1)`; o tipo está em `TURN_EVENT_TYPES` (`:203`) | **falta** |

**O que exatamente muda (trabalho real):**

1. **Quem emite o evento.** Hoje o primeiro turno de quem chega sem bem passa pelo gate `desire`
   (`src/lib/agent/qualify-state.ts:408`) e a pergunta sai como texto do modelo. A opção (B) precisa
   de um nó/regra no grafo que, no primeiro turno de `whatsapp` sem `currentCategory` e sem alvo,
   dispare `welcome-categories` — o tipo já existe, o emissor não.
2. **A fala do modelo no mesmo turno.** O adapter manda o texto e depois o botão
   (`adapter.ts:527-540`). É preciso garantir que a fala não repita a pergunta que os botões já fazem
   (o invariante FIX-393, `src/lib/agent/orchestrator/system-context.ts:70-92`, já proíbe segunda
   pergunta quando há card na tela — mas aqui o card é determinístico, não `GATE_INTENT`).
3. **Decidir a relação com o gate `desire`.** Com a categoria escolhida por botão, o `desire` do
   primeiro turno pode ser pulado — mas ele é onde o prompt diz que "se constrói o desejo que vende"
   (`qualify-state.ts:402-408`). Pular perde rapport; manter depois dele perde o ganho de turno.
4. **Testes:** cenário do grafo afirmando o card no primeiro turno, a paridade web↔WhatsApp já coberta
   por `src/lib/web/adapter.test.ts:34`, e o `handleCategory` já testado.

**Esforço estimado:** 1–2 dias de dev + testes. A infra está pronta, mas o item 1 e o item 2 são
mudança de fluxo, com o peso que o repo dá a mexer no grafo.

**O que ganha:**
- O bem passa a ser conhecido já no 1º turno. No remarketing, `arteDoObjetivo`
  (`src/lib/remarketing/motor.ts:128`) escolhe a arte por objetivo — com a categoria no 1º turno, a
  régua manda a arte **certa** desde o início (fecha o AJA-14 do lado do "bem conhecido").
- Um toque a menos para o cliente, e nada de texto longo.

**Riscos:**
- **"Robótico"** — o motivo exato pelo qual a v1 tirou os botões (feedback do Edu). Menu antes de
  qualquer conversa pode repetir a percepção. Mitigação: a lista não é a mensagem inteira; vem depois
  de uma frase curta e calorosa, e digitar continua valendo.
- **Perder o `desire`** — a pergunta "o que você tem em mente?" é o que abre conversa em vez de
  formulário (`CLAUDE.md`, "Entre no assunto DELE"). Um botão de categoria não constrói isso.
- **Inventário de botões:** são exatamente 3, no limite da Meta (`formatter.ts:769-774`); qualquer 4ª
  categoria futura não cabe em `button` e vira `list`.

## Opção (C) — mensagem padrão do CTA mais curta

**O que é:** encurtar a `PRIMEIRA_FALA` do botão flutuante — `src/components/chat/chat-flutuante.tsx:13`,
hoje `"Oi! Quero comparar consórcios."`.

**A atribuição não depende do texto.** `carimbarOrigem` (`src/lib/attribution/codigo-de-origem.ts:73-87`)
anexa `(ref <código>)` à fala, e quem lê de volta é `extrairCodigoDeOrigem` (`:101`). O vínculo é o
código, não a frase: o texto pode mudar à vontade desde que o carimbo continue. (Sem código, a fala
sai limpa — `:85`.)

**Três sugestões (PT-BR):**
1. `"Oi! Quero comparar consórcios."` (a atual)
2. `"Oi! Quero uma simulação de consórcio."`
3. `"Oi! Quero ver as opções de consórcio."`

**Esforço:** minutos. **Risco:** nenhum de atribuição; risco só de tom.

**Ressalva honesta:** a Bruna reclamou da resposta do **agente**, não da frase do **cliente**. (C) não
conserta a fala ruim — no máximo muda a primeira impressão da conversa. É teste de cosmético, não de
causa.

## Como medir uma semana (por variante)

- **Métrica principal:** taxa de 2ª mensagem do cliente — das conversas de WhatsApp de cada variante,
  quantas recebem uma segunda mensagem `role='user'` depois da primeira resposta do agente. É o uso
  prático do degrau `escreveu` ("Mandou ao menos uma mensagem", `src/lib/admin/percurso-types.ts:59`)
  e do rework do F1 (AJA-01, separar "abriu o chat" de "iniciou a conversa"). Enquanto o F1 não
  mergear, medir direto em `messages` contando `role='user'` ≥ 2 por conversa.
- **Guardar a variante:** anotar o `version` do prompt publicado no Langfuse no recorte — sem isso o
  "antes" e o "depois" se misturam e a conta mente.
- **Cruzar com o juiz:** `primeira_resposta_uma_pergunta` (forma) e `primeira_resposta_com_numero`
  (entrega, `src/lib/observability/langfuse/funil-scores.ts:163-181`). Uma variante que sobe a 2ª
  mensagem sem melhorar o juiz ganhou por outro motivo — ou o juiz está errado.
- **Janela:** 7 dias cheios por variante, sem sobreposição.

## Recomendação (5 linhas)

1. **Nesta semana, ligar (A).** Já está no branch, custo zero, e endereça exatamente a fala medida; o
   juiz diz se o modelo obedeceu.
2. **Não decidir (B) sem baseline de (A).** Sem o número do juiz, não dá para saber se o ganho de (B)
   é do menu ou só do texto curto — e (B) é a que mexe em fluxo.
3. **(B) é a aposta mais forte para o AJA-14** (arte certa no remarketing desde o 1º turno), mas é a
   que carrega o risco do Edu e a perda do `desire`; levar para a terça com o número do juiz na mão.
4. **(C) é cosmético** e não muda a resposta do agente — no máximo um teste paralelo de uma semana, se
   a Bruna quiser.
5. **Se (B) vencer, manter (A) publicada junto:** a frase curta antes da lista é o que impede o
   "robótico" de voltar.
