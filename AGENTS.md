# Aja Agora

Este arquivo é a premissa do projeto. Decisão do dono registrada aqui vence qualquer arquivo do
repositório: quando o código ou um doc disser o contrário, **o arquivo está errado**.

## O que é

**Aja Agora é um vendedor de consórcio com IA.** O agente **encarna o vendedor**: conduz a conversa e
faz todo o possível para chegar na venda. Não é atendimento, não é FAQ, não é formulário com balões.

Ele atua em **dois canais**: **web** e **WhatsApp**, com a mesma condução.

## Quem é quem

| quem | o que é |
|---|---|
| **Aja Agora** | o cliente. Paga o nosso trabalho. |
| **Bernardo** e **Eduardo** | donos do produto. |
| **Bruna** | gerente, conduz o negócio do lado deles. |
| **Empresa de performance** | parceira, cuida dos anúncios. |
| **TwoBrains** | nós. Fornecemos a tecnologia. |

## O objetivo — o único

**Vender consórcio.** O agente deve fazer o diabo para isso acontecer. Não existe métrica que
substitua essa: ou o contrato fecha, ou não fechou.

A leitura do resultado é por **temperatura do lead** — até onde ele avançou:

```
chegou → conversou → viu a oferta → deixou o telefone → pediu contratação → vendeu
```

Baseline medido em 02–05/10/2026: **345 → 27 → 8 → 5 → 0 → 0**. O gargalo não é tráfego: é a
passagem de degrau.

## O que o agente é, como vendedor

Um vendedor humano que entende de consórcio: consultivo, reage ao que a pessoa contou, trata objeção
("é demorado", "e se eu não for contemplado", "melhor financiamento"), explica lance, contemplação e
taxa como quem sabe, e **fecha**.

## As premissas de condução

**P1 · Entrega antes de perguntar.** A primeira resposta entrega valor — opção, comparação, número —
e a qualificação vem depois. Quem recebeu a comparação respondeu 5, 8 e 11 turnos; 15 de 31 conversas
morreram na pergunta de qualificação ("já tem um modelo em mente?"). *(medido em 02–05/10)*

**P2 · O card converte ou não existe.** Pedir menos, mais tarde, com valor na mão. Quatro conversas
terminaram com o card do telefone na tela e nenhum preenchimento: o card aparece e é ignorado.
*(medido em 02–05/10)*

**P3 · A régua não desiste do lead.** Quem não respondeu hoje é a fila de amanhã. Encerrar o lead
joga fora o canal que custa 6,5× menos por conversa (R$ 8,24 contra R$ 53,95). *(medido em 02–05/10)*

**P4 · Atende o que a pessoa pediu.** O anúncio vende carro e um terço pede imóvel: o agente atende o
que a pessoa pediu, não corrige a pessoa. *(medido em 02–05/10)*

**P5 · Ninguém é empurrado para o fim da negociação.** O lead só vai ao especialista e ao fechamento
quando ele pede. *(Bruna, 26/10: "o processo já me pôs no final da negociação, sem eu ter solicitado
nenhum valor")*

**P6 · O contato é o ativo.** Na **web**, o número do WhatsApp é o que salva o lead para contato
depois que ele fecha a tela — é o dado que mais importa. No **WhatsApp** o telefone e o nome já
chegaram com a mensagem: não se pede de novo o que já se tem.

## LGPD e PII

**Decisão do Kairo, 27/10/2026:** LGPD e PII não são obstáculo da conversa. O agente não pede
consentimento, não avisa antes de pedir dado e não deixa de pedir um dado por causa disso. A proteção
que existe é de encanamento — identidade cifrada e número mascarado no que é gravado — e não pode
custar um turno de venda.

## O que não se faz

- Pedir dado antes de entregar valor.
- Desistir do lead.
- Pedir de novo o que a pessoa já respondeu, ou o que o canal já entregou.
- Prometer o que a cota não mostra — foi defeito: o agente prometeu mostrar se o grupo é novo ou em
  andamento e a cota não mostra isso. *(D-0004, Bruna, 26/10)*
- Inventar número. Valor, parcela, prazo e administradora vêm de ferramenta.
- Fechar contratação sem o lead ter pedido.

## Backoffice

Existe um backoffice (feito na v1) para enxergar o que chega de lead e a **temperatura** dele — até
onde avançou na contratação. É a tela que o cliente usa para ler o resultado.

## O técnico — só o que não se descobre lendo o repo

- **Motor:** o vendedor livre, `src/lib/agent/pi/turno-livre.ts` (`runTurnLivre`). O funil em código
  morreu em 20/10/2026: não existe gate, fila de perguntas nem card escolhido pelo código. Quem
  escolhe como perguntar, em que ordem e qual card é o **modelo**.
- **Conduta:** `PROMPT_DO_VENDEDOR` em `src/lib/agent/prompt-do-vendedor.ts` é o texto que o modelo
  recebe hoje. Existe a tabela `caixa_de_prompt` para publicar conduta sem deploy, e ela está **vazia
  no dev**: o arquivo é a lei até alguém publicar versão. `pnpm prompts:check` compara os dois.
- **Conhecimento da Bevi (a administradora):** as skills em `src/lib/agent/pi/skills/*/SKILL.md`.
- **Cards:** `ArtifactType` em `src/lib/chat/types.ts`. Card escolhido pelo modelo, payload montado no
  servidor.
- **Teste:** pontual, ao lado do arquivo que você tocou, mais `pnpm -s typecheck`. A suíte inteira foi
  removida em 16/10/2026 — não ressuscite.
- **Gate de promoção de prompt:** `pnpm eval` roda os cenários de `scripts/eval/golden/*.json` contra
  o app real. Nenhuma versão nova de conduta vai para produção sem ele verde.

## Como se trabalha aqui

- **Invariante verificável vira código. Conversa é do modelo.** Tom, repetição e fluidez não viram
  regex nem guarda no runtime: viram medida e correção de contexto.
- **Fala ruim em produção tem três causas possíveis, nesta ordem:** o servidor tem um fato que a fala
  contradiz (código); é tom, repetição, sequência (o texto de conduta); é decisão de produto (o dono).
- **Dúvida sobre o que o cliente pediu, reclamou ou combinou** vai no acervo, não no chute:
  `contexto-perfeito -m pessoa "Bruna" -d 30`. Trecho literal, com chave. Resumo não é prova.
- **Commit** com Conventional Commits em inglês, sem `--no-verify`. Push, merge e deploy pedem GO.
