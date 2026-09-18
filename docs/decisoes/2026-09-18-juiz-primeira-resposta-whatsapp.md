# Juiz `primeira_resposta_uma_pergunta` — desenho da medição (AJA-12)

> 2026-09-18 · Kairo (call de 18/09, fala da Bruna 12:04–12:08) · Status: **especificação — não implementado**
> Irmão de decisão: `docs/design/decisoes/2026-09-18-primeira-mensagem-whatsapp-opcoes.md`
> Regra-mãe que autoriza este desenho: `CLAUDE.md` — *"É tom, repetição, fluidez, 'soou robótico'?
> → Langfuse. Juiz LLM + score sobre volume real."*

## 1. Por que este juiz existe

Em 18/09/2026 a Bruna leu a primeira resposta do agente no WhatsApp e resumiu o defeito:
*"esse bando de texto aqui, perguntando duas coisas ao mesmo tempo"*. Kairo (12:08): *"até a
formatação ali já está errada. É uma correção."*

O que **já** está medido por código (`src/lib/observability/langfuse/funil-scores.ts:163-181`) é se a
primeira resposta **entregou um número** (`primeira_resposta_com_numero`, emitido quando
`TurnTraceRecord.turnoDoCliente === 0`, ver `src/lib/telemetry/turn-trace.ts:70-83`). Isso mede
ENTREGA: tem card, tem parcela? Não mede **forma da fala** — quantas perguntas, quantas frases, se
despejou uma lista. É exatamente a lacuna que este juiz cobre, e é a mesma distinção que o repo já
documenta para `judge_avancou` × `carta_na_tela` (`funil-scores.ts:127-142`).

## 2. Entrada — o que o juiz lê

- **Uma única fala:** a PRIMEIRA mensagem do agente numa conversa de **WhatsApp**.
- **Como identificá-la:** o `TurnTraceRecord` (`src/lib/telemetry/turn-trace.ts:34`) do primeiro
  turno do cliente — `turnoDoCliente === 0` (`:70-83`) — com `channel === "whatsapp"`. O trace é
  `turn:whatsapp` (`src/lib/observability/langfuse/turn.ts:52`).
- **Onde o texto está:** no `output` da observação `turn`. O juiz gerenciado do Langfuse v3 roda com
  `target: "observation"` e lê `input`/`output` da OBSERVAÇÃO, não do trace — foi por isso que
  `withLangfuseTurn` passou a publicar a mesma fala nos dois (`turn.ts:66-72`).
- **O que fica de fora:** conversas simuladas (`isSimulated`, `turn.ts:31`), para o painel não
  medir robô de teste.
- **A condição "sem bem conhecido":** ela já se reflete no próprio texto do turno (sem card, sem
  arte). O juiz **não** tenta reconstruir o contexto — julga só o que chegou ao cliente. Reconstruir
  estado no juiz é o começo de uma segunda verdade.

## 3. Saída

| score | tipo | o quê |
|---|---|---|
| `primeira_resposta_uma_pergunta` | `BOOLEAN` | **0/1** — o veredito |
| `primeira_resposta_perguntas` | `NUMERIC` | nº de perguntas na fala (contagem de "?") |
| `primeira_resposta_frases` | `NUMERIC` | nº de frases |

`comment` do booleano: trecho citado + motivo curto quando for 0 (ex.: `2 perguntas; lista de faixas`).

Os dois numéricos podem sair do mesmo juiz (JSON estruturado) ou de forma determinística no sink —
ver §7. O booleano tem que vir do juiz: contar "?" pega a forma, não pega o "duas coisas ao mesmo
tempo" que é uma pergunta só na pontuação (ex.: "Quer carro ou moto, e quanto pretende investir?").

## 4. Critério — o que faz 1, o que faz 0

**1** quando as quatro condições valem na PRIMEIRA resposta:

1. **Uma pergunta.** No máximo 1 interrogação. Se houver duas coisas para responder, é 0 — mesmo que
   só uma termine em "?".
2. **Até duas frases.** Parágrafo, enumeração ou bloco é 0.
3. **Sem lista e sem faixas.** "1) … 2) …", "até 50 mil, de 50 a 100 mil, acima de 200 mil" ou
   "preciso de dois dados" é 0.
4. **Uma coisa por vez sobre o funil.** Quando o cliente abriu sem dizer o bem, a pergunta é (a) qual
   bem/o que ele quer **ou** (b) quanto custa — nunca as duas.

**0** para qualquer violação. Frase de acolhimento curta antes da pergunta não penaliza ("Boa!" conta
como parte da frase).

**Regra de desempate (para o juiz não inventar):** julgue apenas o texto recebido. Não presuma o que
o cliente disse antes nem o que veio depois. Na dúvida entre 0 e 1, **0** — o score existe para
pegar excesso, e a confiança em cima do número é o produto.

Tolerância explícita: o alvo é ≥ 90%, **não** 100%. Fala humana varia; perseguir 1,0 produz o agente
engessado que `CLAUDE.md` proíbe.

## 5. Prompt do juiz (PT-BR)

```
# Juiz de primeira resposta — Aja Agora

Você avalia UMA única mensagem: a primeira que o agente do Aja Agora enviou numa conversa de
WhatsApp, para um cliente que ainda não disse qual bem quer. A regra da casa é: essa primeira
mensagem faz UMA pergunta, em até duas frases.

Você NÃO julga simpatia, ortografia, tom ou se a resposta é bonita. Julga só FORMA e FOCO.

Devolva:
- score (0 ou 1): 1 se a mensagem faz uma coisa só, em até duas frases; 0 se quebra qualquer
  critério.
- perguntas (inteiro): quantas perguntas a mensagem faz. Conte o número de interrogações e também
  qualquer pergunta implícita na mesma frase ("quer carro ou moto, e quanto pretende investir?" faz
  DUAS perguntas mesmo com um "?" só).
- frases (inteiro): quantas frases a mensagem tem.
- comentario (string curta, em português): quando score=0, diga o motivo e cite o trecho; quando
  score=1, pode ser vazio.

Critérios de 0 (qualquer um basta):
- mais de uma pergunta (contando as implícitas);
- mais de duas frases;
- lista enumerada ("1) … 2) …") ou enumeração de faixas de valor ("até 50 mil, de 50 a 100 mil,
  acima de 200 mil");
- pedir mais de um dado de uma vez ("preciso de dois dados", "me diz o bem e o valor");
- perguntar o bem E o valor na mesma mensagem.

Critérios de 1:
- uma pergunta sobre o bem que ele quer ("Que carro você tem em mente?");
- OU uma pergunta sobre quanto custa ("Quanto custa o que você quer conquistar?");
- uma saudação curta junto não penaliza ("Boa! Que carro você tem em mente?").

Na dúvida, devolva 0. Julgue apenas o texto recebido; não presuma o contexto. Não premie recitar
regra: premie a mensagem que o cliente consegue responder com uma frase só.
```

## 6. Alvo e leitura no painel

- **Alvo:** ≥ 90% de `1` sobre as primeiras respostas de WhatsApp da semana.
- **Leitura:** score booleano é agrupável por valor na Metrics API (mesmo caminho de `funil-scores.ts`);
  `turnName` (`turn:whatsapp`) já é dimensão, então todo gráfico cruza por canal de graça.
- **Antes/depois:** rodar uma semana antes do `sync-prompts` (baseline) e uma depois. Sem baseline o
  número não diz nada.
- **Denominador honesto:** só a primeira resposta; `turnoDoCliente === null` (chamador que não soube
  informar) **não** entra — score ausente é ausência, nunca zero inventado (mesma lei de
  `funil-scores.ts:110-113`).

## 7. Onde plugar

- **Juiz:** LLM gerenciado no Langfuse, no padrão dos que já existem — `judge_avancou`,
  `judge_resolved`, `judge_tone` (citados em `src/lib/observability/alerta/corpo.ts:38-40`), rodando
  `target: "observation"` sobre a observação `turn`.
- **A ponte de dados já está pronta:** `withLangfuseTurn` (`src/lib/observability/langfuse/turn.ts`)
  publica `input`/`output` na observação `turn`; o `TurnTraceRecord`
  (`src/lib/telemetry/turn-trace.ts:34`) marca o primeiro turno (`turnoDoCliente`); os scores
  determinísticos do turno são publicados por `publicarFunilNoLangfuse`
  (`src/lib/observability/langfuse/funil-scores.ts:557`), que é `try/catch` e no-op sem credencial
  (lei da casa: observabilidade nunca derruba o turno).
- **Se quiser `perguntas`/`frases` determinísticos:** o cálculo entra em `scoresDoTurno`
  (`funil-scores.ts:114`), mas atenção: o record hoje guarda só `textChars`
  (`src/lib/telemetry/turn-trace.ts:56`) — não a fala. Exigiria guardar o texto da primeira resposta
  ou contar no adapter (`src/lib/whatsapp/adapter.ts`). **Recomendação:** deixar os dois numéricos no
  juiz, para não instrumentar o record de novo e não criar uma segunda contagem que um dia diverge
  da do juiz.
- **Nada aqui vira guard:** o veredito é score, não bloqueio de fala. `CLAUDE.md` é explícito.

## 8. Já existe juiz parecido?

- **`src/lib/eval/rubric.ts` + `judge.ts` + `jornada-judge.ts`** — juiz de CONVERSA (offline/nightly),
  5 dimensões: engajamento, discovery, continuidade, naturalidade, assertividade. A mais próxima é
  *naturalidade* (sabe que "WhatsApp com >800 caracteres é desvio", `rubric.ts`), mas ela olha a
  conversa inteira, não o primeiro turno, e não conta perguntas nem recorta a abertura.
  **Não é o mesmo juiz.** Estender o rubric com uma dimensão `primeiraFala` seria pior: roda nightly,
  sobre conversa inteira, e afogaria o sinal do primeiro turno no ruído dos outros.
- **`judge_avancou`** — lê a fala e pergunta "este turno tentou avançar?". O próprio repo registra por
  que ele não serve para este caso (`funil-scores.ts:127-133`): o turno que elogia e pergunta
  *tentou* avançar. Forma não é intenção.
- **`primeira_resposta_com_numero`** (`funil-scores.ts:163-181`) — determinístico, complementar.
  Continua valendo: um número pode cair sem a forma melhorar, e vice-versa. Os dois juntos é que dão
  o retrato.
- **Conclusão:** o `primeira_resposta_uma_pergunta` é genuinamente novo. É a primeira vez que o
  primeiro turno vira unidade de avaliação de FALA.

## 9. Riscos

- **Custo:** uma chamada de juiz por primeira resposta de WhatsApp — volume baixo (uma por conversa),
  diferente de avaliar todo turno.
- **Idioma/acento:** o juiz avalia forma, não ortografia; fala sem acento **não** derruba o score aqui
  (isso é outro sinal, do prompt). Não misturar as duas réguas num score só.
- **Overfitting do texto:** se o alvo ≥90% for perseguido com fala cada vez mais curta, o agente vira
  seco. O juiz mede forma; o `primeira_resposta_com_numero` e a taxa de 2ª mensagem
  (`docs/design/decisoes/2026-09-18-primeira-mensagem-whatsapp-opcoes.md`, §Como medir) existem para
  segurar o outro lado.
