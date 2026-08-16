# Crítica de desenho — acolhida N1 pós-handoff

> **Autor:** Super Especialista de IA (revisor de arquitetura e avaliação de agente).
> **Escopo:** crítica da proposta de "N1 agêntico" que acolhe o cliente enquanto a mesa não
> responde. Responde às 7 perguntas do proponente, com veredito e plano priorizado.
> **Fontes:** banco de produção (túnel SSM 25432, somente leitura — medições próprias, §1);
> CloudWatch `/ecs/tb/prod` (webhooks de status da Meta para o telefone do atendente,
> 14–15/08); código da `develop` em `85b5b325`.
> **Rótulos:** **PROVADO** · **INFERÊNCIA** · **HIPÓTESE**.
> **Não implementei nada.**

---

## Veredito em uma frase

A feature está certa como produto e **errada como diagnóstico**: as 28,9 horas de silêncio da
`75f77efd` não foram desatenção da mesa — a notificação de handoff levou **42 minutos para ser
`delivered`** e **17h24 para ser `read`** no WhatsApp do atendente (PROVADO, webhooks de status
da Meta) —, de modo que o N1, sozinho, entrega ao cliente um cobertor sobre uma campainha
quebrada; e, do jeito que está desenhado (**inline, no turno de inbound**), ele reintroduz
exatamente o incidente de 2026-08-10, porque a geração leva 3–8 s e o atendente digita
enquanto isso.

O conserto do desenho é pequeno e conhecido: **não é um caminho novo — é `retomada.ts` com
outro gatilho e outro directive**, disparado por *worker* (não inline), com re-checagem do
predicado dentro do lock antes de emitir.

---

## §1 · Os fatos que eu medi e que mudam a premissa

### 1.1 A mesa não ignorou — a notificação não chegou

Handoff da `75f77efd`, sexta 14/08. Timeline dos webhooks de status da Meta para o telefone do
atendente (`556293336547`), mesma `wamid`:

| Evento | Quando (BRT) | Δ desde o handoff |
|---|---|---|
| handoff criado, `[simulator-bus] publish attendant … **listeners=0**` | 14/08 19:01–19:02 | — |
| `Status: sent` | 14/08 19:02:04 | 0 min |
| `Status: **delivered**` | 14/08 **19:44:39** | **42 min** |
| `Status: **read**` | 15/08 **12:26:22** | **17h 24min** |

**PROVADO.** Dois fatos, e nenhum deles é "o atendente não quis atender":

1. **O painel não tinha ninguém conectado** no instante do handoff (`listeners=0`, duas vezes —
   o atendente e a supervisão).
2. **O único outro canal de aviso levou 42 min para chegar ao aparelho e um dia para ser
   aberto**, e o `read` veio em rajada (5 `wamid` marcados como lidos no mesmo segundo — a
   pessoa abriu o WhatsApp e leu o acumulado).

O código dispara a notificação e **não olha para nada disso**: não checa `listeners`, não
consome o webhook `read`, não escala para um segundo atendente, não repete. É fire-and-forget.

**Consequência para a proposta:** se o N1 entrar sozinho, o resultado em produção é um cliente
bem acolhido esperando o mesmo dia inteiro. A feature não é errada — ela é **a segunda metade**
de um par, e está sendo priorizada antes da primeira.

### 1.2 Os tempos da mesa — o número por RAJADA, não por mensagem

Os números que você me passou estavam por mensagem, o que infla (o cliente manda 20 mensagens,
a mesa responde uma vez, e cada mensagem vira uma amostra). Recalculei por **rajada** (do
primeiro inbound sem resposta até a próxima fala da mesa), que é a unidade que o N1 realmente
observa:

```
conv 270b2464:  17 · 1 · 3 · 1 · 8 min
conv 8e28d6f0:  53 · 1 · 9 min
conv 8eaabefa:  69 min
conv 75f77efd:  ∞  (28,9 h e contando)
```

**n = 8 esperas medidas + 1 infinita.** A distribuição é **bimodal**: um modo "mesa viva"
(1–17 min) e um modo "mesa fria" (53–69 min), com um vazio entre 17 e 53.

### 1.3 A fila da mesa não é confiável como fato para citar

`mesa_handoffs`: 5 registros, **4 `em_andamento` sem `closed_at`** — abertos há 28,9 h, 61,6 h,
128,9 h e 129,2 h. Um único `concluido` em todo o histórico.

**PROVADO.** O campo existe, é ancorado, e é **enganoso**: ninguém encerra handoff. Um N1 que
diga "você está na fila há X" vai dizer "há 129 horas" para clientes que já foram atendidos. →
**a proposta deve remover "há quanto tempo entrou na fila da mesa" da lista de fatos citáveis**
até `closed_at` ser mantido. Ancorado ≠ seguro de dizer.

### 1.4 A nota da web nunca foi persistida

`SELECT count(*) … content LIKE '%Aguarde a resposta aqui%'` → **0**. A nota é escrita direto no
stream (`route.ts:360-372`, `writer.write` sem `saveMessage`). O cliente lê; o banco não guarda;
o modelo nunca vê.

É a camada 4 de novo (entregue ≠ persistido): um N1 que decida "já avisei este cliente?" olhando
o histórico **é cego** para as N vezes em que a nota já apareceu na tela dele.

---

## §2 · Respostas às 7 perguntas

### Q1 — O desenho fura o invariante de 2026-08-10? **Sim, em três lugares.**

**(a) A corrida, que é o furo que você já suspeitava — e é maior do que parece.**
O gatilho proposto é *inline no inbound*. Um turno de agente medido em produção nesta semana
leva **2,4 s a 7,8 s** (`turn-trace.durationMs`, conversas de 14–15/08). O atendente humano
digita nesse intervalo o tempo todo — nas rajadas medidas, três respostas da mesa vieram em
**1 minuto**. Uma pré-checagem "a mesa não falou" em t₀ **não vale** em t₀+7 s.

Pior: o dano assimétrico não é o agente falar junto — é o agente falar **depois**. A sequência
`cliente → mesa responde → N1 emite "aguarde o atendimento da mesa"` é a mesma humilhação de
2026-08-10, agora com a agravante de o agente contradizer uma resposta humana que já resolveu.

**Correção estrutural (não é um guard novo):** o predicado tem de ser avaliado **no instante da
emissão, dentro do mesmo lock**, como *compare-and-swap*, não como pré-condição. O WhatsApp já
tem o lock (`withConversationLock`, `processor.ts:158`); a web não tem equivalente. E mesmo com
CAS sobra a janela de rede. Por isso a resposta certa é a Q7: **tirar do inline**.

**(b) O furo que já existe hoje, sem N1 nenhum.** `route.ts:376-379`: quando o relay falha
(`entregue === false`), o código loga `handoff sem destinatário` e **o agente assume o turno
normalmente numa conversa `handed_off`**. É um bypass do invariante que está em produção agora.
O comentário do OC-31 explica o motivo (era pior deixar a conversa morta) e a decisão é
defensável — mas ela é **a exceção não catalogada** do contrato `quemRespondePara`, e um N1 que
se ancore em `quem === "humano"` vai herdar essa exceção sem saber. → catalogar essa exceção
**antes** de construir por cima dela.

**(c) O predicado "fala da mesa" está impuro.** `role='assistant' AND persona_id IS NULL`
também casa com **nota de sistema**: `proxy.ts:672-676` grava
`saveMessage(convId, "assistant", "[sistema] X encerrou o atendimento.")` sem `personaId`.
Hoje isso é 0 em produção (ninguém usou `/fim`), então é uma **bomba dormindo**: o dia em que um
atendente encerrar, a nota conta como "a mesa falou" e o N1 cala para sempre. → o predicado
precisa de coluna própria (`author: 'mesa' | 'agente' | 'sistema'`) ou, no mínimo, excluir
explicitamente o prefixo `[sistema]` — e um teste que trave isso.

### Q2 — (A) × (B) × (C): **(C), mas não do jeito descrito — e a casa já tem o molde**

Sua inclinação está certa e a justificativa dela está incompleta. O ponto decisivo não é
"allowlist estrutural": é que **este problema já foi resolvido neste repo**, em
`src/lib/workers/retomada.ts`, e o desenho de lá é literalmente o (C):

- *"A retomada é um **TURNO DE SERVIDOR de verdade**: entra no grafo pelo mesmo caminho do
  directive (`isUserTurn: false`), passa pelos mesmos guards, pelo mesmo filtro e pelo mesmo
  `persist`. **Não existe canal paralelo de texto enlatado** — o que o agente diz continua sendo
  dele; o que o servidor faz é contar o FATO e pedir a intenção."*
- *"O directive da retomada: **FATO + INTENÇÃO, nunca passo a passo**. **Nome de tool não entra
  aqui** — foi assim que o agente acabou perseguindo uma `search_groups` que não existe no grafo
  e entregando um turno mudo (sessão `ff8f2080`)."*
- Anti-repetição já existe e tem forma: `MAX_RETOMADAS = 2` + `BACKOFF_RETOMADA_MS = 30 min`,
  com o **contador gravado ANTES do disparo**, de propósito — *"um watchdog que só conta sucesso
  vira loop justamente na conversa que está quebrando"*.

**Veredito: o N1 não é um mecanismo novo. É `buildAcolhidaN1Directive` + uma condição a mais no
ciclo do watchdog.** Escrever um segundo caminho de "servidor decide que o agente deve falar" é
criar a oitava costura da casa — e o dossiê de 15/08 mostra que é exatamente assim que os
defeitos voltam: duas cópias da mesma regra, uma consertada.

Isso também mata (B) sem discussão: `MAX_RETOMADAS`/backoff é o precedente de como esta casa faz
anti-repetição (contador + backoff curto), não "12 h em `metadata.n1AckAt`". Um relógio de 12 h
sem contador é uma terceira convenção para a mesma regra.

E mata (A): o modelo escrevendo **sem** allowlist estrutural, num estado em que o invariante é
"quem responde é o humano", é a Lei 1 invertida. Mas note que (C) só é (C) de verdade se a
tool-policy for **vazia com uma exceção explícita** — ver Q4.

### Q3 — Os limiares: **não têm lastro, e o número certo não é um número**

Com n=8, a distribuição bimodal (1–17 min × 53–69 min) tem um vazio entre 17 e 53. Seus 60 min
caem **depois** do vazio e **partem ao meio o único par de observações frias que você tem**: 53
fica de um lado, 69 do outro. Um limiar que classifica errado metade das suas duas amostras da
classe que ele existe para detectar não é um limiar — é um número redondo com sorte de estar
perto.

**O que fazer em vez de escolher um número:**

1. **Troque o relógio pelo fato.** O discriminante real entre "mesa viva" e "mesa fria" não é
   tempo decorrido — é **se a mesa foi alcançada**. Dois fatos determinísticos disponíveis hoje e
   não consumidos: `listeners` do bus no instante do handoff (era **0** na `75f77efd`) e o
   webhook de status da Meta para a notificação do atendente (`sent` → `delivered` → `read`). Um
   N1 que dispara porque *"a notificação está `sent` há 40 min sem `delivered`"* está ancorado em
   fato de servidor; um que dispara porque "passaram 60 minutos" está ancorado num palpite.
2. **Enquanto o fato não estiver instrumentado**, use a forma que a casa já usa e que não
   depende de calibração fina: **grace window curta** (60–90 s, só para não atropelar a mesa
   viva, cujo modo inteiro está abaixo de 17 min) + **contador com backoff**, herdando
   `MAX_RETOMADAS`/`BACKOFF_RETOMADA_MS`. Errar para menos aqui é barato: o custo de uma acolhida
   a mais é uma frase; o custo de atropelar a mesa é o invariante.
3. **Derive o limiar do sinal, em duas semanas.** Com `mesa_silencio_min` emitido (Q6), o P90 do
   modo "mesa viva" é o limiar, e ele passa a ser recalculado, não escolhido.

### Q4 — Cliente pergunta algo concreto: **responde só o que é fato registrado; o resto vira EVENTO, não frase**

Três casos, três condutas:

| O cliente diz | Conduta | Por quê |
|---|---|---|
| "cadê meu boleto / minha proposta?" | **Responde**, via `check_proposal_status` | A tool está no `BASE` da tool-policy (`tool-policy.ts:44-53`, *"é leitura pura sem efeito colateral; não há fase em que escondê-la seja seguro"*), e o FIX-14 já decidiu que status **sempre** sai por tool, nunca de memória. Negar um fato que o servidor tem é o defeito que o `check_proposal_status` existe para evitar |
| "quero cancelar" / "quero mudar de administradora" | **Acolhe e NÃO decide** — e o turno **dispara uma escalação de verdade** (re-notifica a mesa, marca prioridade) | É decisão de dinheiro num estado em que o invariante diz que quem responde é o humano. O `route.ts:876-890` já bloqueia contratação sem formulário; a mesma lógica vale aqui |
| qualquer outra coisa | Acolhe, sem reabrir funil | — |

**O ponto que a proposta não tem:** hoje, quando o cliente insiste, **nada acontece do lado da
mesa** — o relay reenvia a mesma mensagem ao mesmo telefone que não abriu a anterior. O N1 tem
de ter um **braço de saída**: cliente cobrando + mesa em silêncio → escala (segundo atendente /
supervisão / marca o card). Sem isso a acolhida vira promessa de terceiro grau: o agente pede
para aguardar um atendimento que ninguém foi avisado que está atrasado.

E a tool-policy do estado: **vazia, exceto `check_proposal_status`**. Não é detalhe — é o que
impede o modelo de reabrir a venda. Se a exceção incomodar, lembre que sem ela a alternativa é o
modelo respondendo status de memória, que é o FIX-14 que já custou caro.

### Q5 — Web e WhatsApp: **mesmo conteúdo, uma cópia só; e a nota da web precisa sair**

Sim, a mesma acolhida, gerada pelo **mesmo builder de directive**, pelo mesmo turno de servidor.
Qualquer coisa diferente disso é a costura #1 do dossiê de ontem nascendo de novo (o funil com
duas implementações foi exatamente o que matou a `9b9f9aab`).

Mas o `_Mensagem enviada para {agentName}. Aguarde a resposta aqui._` **não pode conviver** com
o N1: seriam duas vozes para o mesmo fato, uma delas em itálico de sistema, repetida a cada
mensagem e **não persistida** (§1.4). Duas saídas possíveis, nesta ordem de preferência:

1. A nota **morre** quando o N1 assume, e vira o *fallback* para quando o N1 não dispara
   (dentro da grace window, ou quando o contador estourou).
2. Se ficar, ela passa a ser **persistida** (`writeAndSaveText`, como o resto), senão nem o
   modelo nem o N1 sabem que o cliente já foi avisado três vezes.

### Q6 — Os sinais

Nesta ordem (determinístico primeiro — se dá para provar em código, não se gasta juiz):

**Invariante, tem de ser sempre 0 — é o sinal que prova que a feature não fura o contrato:**
- `n1_apos_fala_da_mesa` (booleano, por turno): o N1 emitiu e existe fala da mesa **posterior ao
  início da geração** nesta conversa. Qualquer valor > 0 é incidente do invariante de
  2026-08-10, não "métrica ruim". Alerta no primeiro.

**Cobertura e ritmo:**
- `n1_acolhida_emitida` (booleano, dim. `channel`) — a taxa mostra se a feature está viva nos
  dois canais, e a assimetria entre canais é o primeiro sintoma de costura.
- `mesa_silencio_min` (numérico, por rajada) — é ele que **calibra o limiar da Q3**, e hoje não
  existe.

**Sessão (o que responde "a CONVERSA deu certo?"):**
- `handoff_sem_resposta` (booleano, por `sessionId`): a sessão foi entregue à mesa e terminou sem
  nenhuma fala humana. Hoje valeria **1 na `75f77efd`** — a única venda real do período.

**E o sinal que teria contado o incidente de verdade em 5 minutos — este é o P0, não o N1:**
- `handoff_notificacao_lida_min` (numérico) e `handoff_notificacao_nao_entregue` (booleano),
  vindos do webhook de status da Meta que **já chega** e é só logado
  (`[whatsapp] Status: sent|delivered|read`). Na `75f77efd`: 42 min para `delivered`,
  **1044 min** para `read`. Um Monitor sobre isso alarma na sexta às 19h40, não na segunda.
- `mesa_sem_listeners_no_handoff` (booleano): `listeners=0` no instante do handoff. Era 1.

**Juiz:** um só, e depois de tudo acima — qualidade da acolhida (acolheu sem prometer prazo, sem
reabrir funil, sem contradizer a mesa), com a rubrica dizendo explicitamente que **"educado e
correto sem informar nada de concreto" vale 0**. Nunca como gate de release: em falso sucesso o
juiz de LLM tem AUROC ≤0,65 (arXiv 2606.09863) e este é um estado feito de falso sucesso.

### Q7 — Reativo ou proativo? **Os dois, e o proativo é o que salva o desenho**

O reativo que o Kairo pediu é o produto. Mas *inline no inbound* é a forma errada de entregá-lo
(Q1a). **Faça o N1 nascer proativo por construção e ser percebido como reativo:**

- a mensagem do cliente **arma** o relógio (grava "pendência de acolhida" no meta, como o
  `gate-reengage` já faz com marcador);
- o **worker** (`retomada-cycle`) dispara na tick seguinte, com o lock na mão, re-checando o
  predicado antes de emitir.

Ganhos, todos estruturais: a corrida some (o worker pode reler o estado imediatamente antes de
emitir, sem competir com o stream do inbound); a latência do inbound não paga o custo de uma
geração; a grace window vira gratuita; e — o principal — **não existe um segundo caminho**, é o
mesmo watchdog com mais uma condição.

E há um proativo **mais importante** que o Kairo não pediu porque não sabia dos 42 minutos:
**proativo para a MESA**. Notificação `sent` sem `delivered` em N minutos, ou sem `read` em M,
ou `listeners=0` no handoff → escala. Isso não é omissão da proposta: é o defeito que a proposta
está compensando.

---

## §3 · O que NÃO é a causa (e por isso não deve ser consertado agora)

1. **"A mesa é lenta."** Falso nos dados: 5 das 8 esperas medidas ficaram em ≤ 9 min. O caso
   catastrófico foi um problema de **notificação**, não de diligência.
2. **"O agente precisa saber o horário de atendimento."** O grep do proponente está certo (não
   existe expediente cadastrado) e a conclusão dele também (não inventar prazo). Mas cadastrar
   expediente **não** conserta este caso: a notificação de sexta 19h02 foi lida no sábado ao
   meio-dia; expediente teria feito o agente dizer "a mesa volta segunda", o que seria errado.
   Expediente é P2, e só depois de a notificação funcionar.
3. **"É preciso um guard novo para o agente não falar por cima."** Não — o contrato
   `quemRespondePara` está certo e é allowlist. O que falta é (i) catalogar a exceção do
   `route.ts:376`, (ii) purificar o predicado de "fala da mesa", (iii) avaliar no instante da
   emissão. Tudo dentro do contrato que já existe.
4. **Texto fixo (B).** Não, pelos motivos do CLAUDE.md — e note que o argumento "seguro e
   imgameável" é falso aqui: o texto fixo da web já existe, é repetido a cada mensagem, **não é
   persistido**, e não impediu nada.

---

## §4 · Plano priorizado

### P0-1 · [código] A campainha antes do cobertor — sinal e escalação da notificação de handoff

O webhook de status da Meta já chega e hoje só vira `console.log`. Consumir: gravar
`sent/delivered/read` da notificação do atendente; emitir `handoff_notificacao_lida_min` e
`handoff_notificacao_nao_entregue`; escalar (2º atendente / supervisão) quando `sent` sem
`delivered` em N min. Registrar `listeners` do bus no instante do handoff.

**Aceite:** rodado sobre a `75f77efd`, o sinal acusa 42 min até `delivered`, 1044 min até `read`
e `listeners=0`. Hoje: nenhum dos três existe.

### P0-2 · [código] Purificar o predicado "a mesa falou"

Coluna de autoria (`mesa | agente | sistema`) ou exclusão explícita do prefixo `[sistema]` em
`proxy.ts:672-676`, com teste. **Aceite:** um `/fim` de atendente **não** conta como fala da
mesa; a fala real (painel e WhatsApp) conta nos dois caminhos.

### P0-3 · [código] Catalogar a exceção viva do invariante

`route.ts:376-379` — o agente assume o turno quando o relay falha. Ou vira um estado nomeado no
contrato `quemRespondePara` (`{ quem: "agente", motivo: "handoff-sem-destinatario" }`), ou some.
Hoje é uma exceção silenciosa que qualquer feature construída sobre o contrato vai herdar sem
saber. **Aceite:** o contrato devolve o motivo, e existe teste do caso.

### P1-1 · [código] O N1 como condição do watchdog, não como caminho novo

`retomada.ts` + `retomada-cycle.ts`: nova condição (conversa `handed_off`, inbound do cliente sem
resposta da mesa, grace window vencida, contador disponível) e novo
`buildAcolhidaN1Directive(meta, { proposta, canal })` no mesmo formato **FATO + INTENÇÃO, sem
nome de tool**. Anti-repetição herda `MAX_*`/backoff, com o contador gravado **antes** do
disparo. Re-checagem do predicado dentro do lock, imediatamente antes de emitir.

**Aceite:**
1. Cenário `75f77efd`: cliente escreve, mesa muda → uma acolhida, citando a proposta ITAÚ real
   (`bevi_proposals`), sem prazo inventado e **sem citar tempo de fila** (§1.3).
2. Cinco mensagens seguidas do cliente → **uma** acolhida.
3. **Teste de corrida:** fala da mesa gravada entre o início da geração e a emissão → o N1
   **não** emite, e `n1_apos_fala_da_mesa` fica 0.
4. **Teste de paridade de canal:** mesmo estado, web e WhatsApp → mesmo directive, mesma decisão.

### P1-2 · [eval] Os sinais da Q6

`n1_apos_fala_da_mesa` (alerta no primeiro > 0), `n1_acolhida_emitida` (dim. `channel`),
`mesa_silencio_min`, `handoff_sem_resposta` (sessão, via `sessionId`).
**Aceite:** `handoff_sem_resposta` vale 1 na `75f77efd` e 0 nas outras três `handed_off`.

### P1-3 · [código] A nota da web sai de cena

Vira fallback do N1 e, enquanto existir, passa a ser persistida (`writeAndSaveText`).
**Aceite:** `SELECT … LIKE '%Aguarde a resposta aqui%'` deixa de ser 0 (ou a nota some de vez).

### P2-1 · [código] Encerrar handoff de verdade

4 de 5 handoffs estão `em_andamento` há dias. Sem `closed_at` confiável não há "tempo de fila"
citável nem métrica de mesa. **Aceite:** `mesa_handoffs.closed_at` preenchido em ≥ 90% dos casos
fechados; só então o N1 pode citar tempo de espera.

### P2-2 · [dado] Expediente

Só depois de P0-1. Sem ele o agente não pode dizer quando a mesa volta — e com a notificação
consertada, talvez não precise dizer.

---

## §5 · O que eu recomendo NÃO fazer

1. **Não construir o N1 inline no inbound.** É o único ponto do desenho que eu vetaria como está.
2. **Não citar tempo de fila** enquanto `closed_at` não for mantido (§1.3).
3. **Não usar 60 min / 12 h como estão.** Grace curta + contador agora; limiar derivado do sinal
   em duas semanas (§Q3).
4. **Não criar `metadata.n1AckAt` como convenção nova de anti-repetição.** Herde a forma do
   `retomada`, ou a casa passa a ter três jeitos de dizer "já falei com esse cliente".
5. **Não liberar tool nenhuma além de `check_proposal_status`** neste estado.
6. **Não escrever a acolhida como texto fixo**, nem "só desta vez" — o `_Aguarde a resposta
   aqui._` é a prova viva de que texto fixo neste ponto envelhece mal e some do histórico.
