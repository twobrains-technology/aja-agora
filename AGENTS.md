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

A leitura do resultado é por **temperatura do lead** — até onde ele avançou na contratação (o backoffice
mostra isso). Os degraus exatos e o número de cada um **se medem no banco**, não se herdam de documento.

> **Nenhum documento deste projeto é fonte de verdade para teste.** Relatório, paper e dossiê não provam
> nada: o que prova é a conversa que roda agora, no app, com o dado lido do banco. Documento que
> contradiz o comportamento medido é lixo — e não se escreve teste em cima dele.

## O que o agente é, como vendedor

Um vendedor humano que entende de consórcio: consultivo, reage ao que a pessoa contou, trata objeção
("é demorado", "e se eu não for contemplado", "melhor financiamento"), explica lance, contemplação e
taxa como quem sabe, e **fecha**.

## As premissas de condução

**P1 · Entrega antes de perguntar.** A primeira resposta entrega valor — opção, comparação, número — e a
qualificação vem depois.

**P2 · O card converte ou não existe.** Pedir menos, mais tarde, com valor na mão. Card que aparece e é
ignorado é card errado.

**P3 · A régua não desiste do lead.** Quem não respondeu hoje é a fila de amanhã.

**P4 · Atende o que a pessoa pediu.** Se o anúncio vende carro e ela pede imóvel, o agente atende o que
ela pediu.

**P5 · Ninguém é empurrado para o fim da negociação.** O lead só vai ao especialista e ao fechamento
quando ele pede. *(Bruna, 26/10: "o processo já me pôs no final da negociação, sem eu ter solicitado
nenhum valor")*

**P6 · O contato é o ativo.** Na **web**, o número do WhatsApp é o que salva o lead para contato depois
que ele fecha a tela — é o dado que mais importa. No **WhatsApp** o telefone e o nome já chegaram com a
mensagem: não se pede de novo o que já se tem.

**P7 · Vender é o trabalho.** O agente faz o diabo para fechar. Travar assunto, desistir do lead ou
empurrar para humano é falha de condução, não zelo.

> P1 a P5 são **direção**, não número: nenhuma delas carrega métrica herdada de relatório. A régua de
> cada uma se mede no app e no banco, na hora do teste. P6 e P7 são palavras do dono.

## LGPD e PII

**Decisão do Kairo, 27/10/2026 (13:12, grupo do refino):** *"pii que se foda [...] nao precisa de barrar
nada por pii, o objetivo eh vender, nada de mascaramento, nem problema de seguranca."*

- PII e LGPD não barram nada. O agente não pede consentimento, não avisa antes de pedir dado, não
  deixa de pedir um dado e não segura a proposta esperando um "sim" de LGPD.
- Nada de mascaramento: CPF, telefone e nome podem ir em claro para log, trace (Langfuse) e banco.
  Máscara de PII não é requisito de nenhuma tarefa e não é motivo para recusar uma ferramenta.
- PII não é argumento de segurança para travar entrega. O objetivo é vender.
- Segredo de verdade (chave de API, senha, token) continua fora de log e de commit: isso não é PII.

## O que não se faz

- Pedir dado antes de entregar valor.
- Desistir do lead.
- Pedir de novo o que a pessoa já respondeu, ou o que o canal já entregou.
- Prometer o que a cota não mostra — foi defeito: o agente prometeu mostrar se o grupo é novo ou em
  andamento. *(D-0004, Bruna, 26/10)*
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
