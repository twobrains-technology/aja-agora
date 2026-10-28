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

## Premissa técnica

A versão vem do lockfile, não da memória do modelo. A doc vem da fonte oficial na versão travada (Context7), para o agente não escrever API velha.

| peça | versão travada (fonte: lockfile) | onde está a doc | id no Context7 |
|---|---|---|---|
| Next.js (App Router, framework web) | 16.2.3 (`pnpm-lock.yaml:84-86`; `package.json` pina `16.2.3` exato) | nextjs.org/docs; Context7 | `/vercel/next.js` · tag mais próxima `v16.2.2` (não há `v16.2.3`) |
| React / react-dom | 19.2.4 (`pnpm-lock.yaml:96-98` e `102-104`) | react.dev; Context7 | `/reactjs/react.dev` (sem tag de versão; `/react/react` tem `v19.2.6`, `v19.2.7`, não `v19.2.4`) |
| Vercel AI SDK (`ai`) | 6.0.184 (`pnpm-lock.yaml:48-50`) | ai-sdk.dev/docs; Context7 | `/vercel/ai` · tag `ai_6.0.0` (a linha 6.x; não há tag 6.0.184) |
| `@ai-sdk/anthropic` | 3.0.78 (`pnpm-lock.yaml:15-17`) | mesma doc do AI SDK (providers) | `/vercel/ai` · tag `ai_6.0.0` |
| `@ai-sdk/openai` | 3.0.80 (`pnpm-lock.yaml:18-20`) | mesma doc do AI SDK (providers) | `/vercel/ai` · tag `ai_6.0.0` |
| `@ai-sdk/react` | 3.0.186 (`pnpm-lock.yaml:21-23`) | mesma doc do AI SDK (UI) | `/vercel/ai` · tag `ai_6.0.0` |
| Pi coding agent SDK (motor do vendedor: `src/lib/agent/pi/sessao.ts`) | 1.3.0 (`pnpm-lock.yaml:33-35`; `package.json` pina `1.3.0` exato) | `docs/` do pacote `@earendil-works/pi-coding-agent` instalado; Context7 | `/earendil-works/pi` · tag `v1.3.0` |
| better-auth | 1.6.11 (`pnpm-lock.yaml:51-53`) | better-auth.com/docs; Context7 | `/better-auth/better-auth` · tag `v1.6.11` |
| Drizzle ORM | 0.45.2 (`pnpm-lock.yaml:69-71`) | orm.drizzle.team/docs; Context7 | `/drizzle-team/drizzle-orm` · tags `0.45.1` e `0.45.4` (não há `0.45.2`) |
| drizzle-kit (migrações) | 0.31.10 (`pnpm-lock.yaml:169-171`) | orm.drizzle.team/docs/kit-overview | `/drizzle-team/drizzle-orm` · tag `drizzle-kit_0.31.5` (a mais próxima; não há `0.31.10`) |
| Fila: BullMQ | 5.78.1 (`pnpm-lock.yaml:54-56`) | docs.bullmq.io; Context7 | `/taskforcesh/bullmq` · tag `v5.77.6` (a mais próxima; não há `v5.78.1`) |
| Redis: ioredis | 5.11.1 (`pnpm-lock.yaml:75-77`) | github.com/redis/ioredis | `/redis/ioredis` · tags `v5_4_0`, `v6.0.0` (não há 5.11.1) |
| Postgres: pg | 8.20.0 (`pnpm-lock.yaml:93-95`) | node-postgres.com | `/brianc/node-postgres` (sem tags de versão) |
| zod | 4.4.3 (`pnpm-lock.yaml:132-134`) | zod.dev; Context7 | `/colinhacks/zod` · tags `v4.3.6` e `v4.6.5` (não há `v4.4.3`) |
| Tailwind CSS | 4.3.0 (`pnpm-lock.yaml:181-183`) | tailwindcss.com/docs; Context7 | `/tailwindlabs/tailwindcss.com` (só a tag `__branch__v4-beta-docs`; sem tag 4.3.0, a doc pode estar à frente ou atrás da versão travada) |
| Testes: vitest | 4.1.6 (`pnpm-lock.yaml:193-195`) | vitest.dev | `/vitest-dev/vitest` · tag `v4.1.6` |

Tag aproximada do Context7 não prova a versão travada: quando a API for sensível, confira no `node_modules` ou no changelog.

Não se usa (e por quê): Prisma, next-auth, Inngest, Mastra e o SDK `openai` direto, porque o projeto já escolheu outra peça (Drizzle, better-auth, BullMQ, Pi como motor do vendedor e AI SDK para o LLM) e trocar exige decisão. LangChain, LangGraph e Langfuse saíram porque o agente passou a rodar no motor do Pi como biblioteca (sessão de 25/10/2026).

Aprovado por Kairo em 28/10/2026 · origem grupo Agent - Preciso do kairo, 11:53 · D-0024

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
