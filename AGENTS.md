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

**P0 · A conversa não morre.** Do primeiro ao último turno, toda resposta deixa um próximo passo para o lead. Nenhuma resposta truncada e nenhum beco sem saída: nem quando a Bevi falha, nem quando o lead recusa um dado, nem quando ninguém da fila atende. *(Kairo, 04/11: "do início ao fim, não deixar a conversa morrer")*

**P1 · Entrega antes de perguntar.** A primeira resposta entrega valor — opção, comparação, número — e a
qualificação vem depois.

**P2 · O card converte ou não existe.** Pedir menos, mais tarde, com valor na mão. Card que aparece e é
ignorado é card errado.

**P3 · A régua não desiste do lead.** Quem não respondeu hoje é a fila de amanhã.

**P4 · Atende o que a pessoa pediu.** Se o anúncio vende carro e ela pede imóvel, o agente atende o que
ela pediu.

**P5 · Ninguém é empurrado para o fechamento.** A mesa só recebe o lead quando ele pede para fechar ou já gerou a proposta. Isso vale para a mesa, não para a fila de vendedores (P8). *(Bruna, 26/10: "o processo já me pôs no final da negociação, sem eu ter solicitado nenhum valor")*

**P6 · O contato é o ativo.** Na **web**, o número do WhatsApp é o que salva o lead para contato depois
que ele fecha a tela — é o dado que mais importa. No **WhatsApp** o telefone e o nome já chegaram com a
mensagem: não se pede de novo o que já se tem. Na web, o perfil do playground pode pedir o telefone antes da carta (escolha da Bruna e do Charles na call de 04/11); o perfil padrão mostra a carta primeiro e pede o telefone logo depois.

**P7 · Vender é o trabalho.** O agente faz o diabo para fechar. Travar assunto e desistir do lead são falha de condução. Chamar o vendedor da fila quando a venda está para se perder é condução, não desistência: o agente segue com o lead até um humano assumir. *(Kairo, 04/11)*

**P8 · A fila de vendedores não é a mesa.** A fila é o vendedor humano chamado no meio da venda: quando o lead pede atendente, quando a venda está para se perder ou na hora de transferir. A mensagem vai ao WhatsApp de todos os vendedores ativos e quem pegar primeiro atende. A mesa é o fechamento burocrático (documentação), atendido pela Juna no painel. Enquanto ninguém da fila assume, o agente conduz e acalma o lead sem prometer prazo, sabendo a hora em que está: de madrugada ninguém atende, e ele diz isso e combina o retorno. Quando um humano assume, o agente se cala. *(Kairo, 04/11)*

**P9 · Nada fixo.** Como conversar (ordem dos pedidos, quantas cartas e opções mostrar, quando chamar o vendedor, quantas vezes insistir) é orientação editável no playground, separada por parte do fluxo. O prompt base guarda só as premissas. *(Kairo, 04/11: "tudo em prompt, nada fixo")*

**P10 · O agente recebe tudo e filtra.** As ferramentas entregam ao agente todas as cartas e todos os campos que a Bevi devolve. Quem escolhe o que mostrar, e quantas, é o agente. *(Kairo, 04/11: "tudo que está capando a informação para o agente a gente tem que tirar")*

**P11 · O código garante só a verdade.** Número vem de ferramenta; a carta escolhida existe na busca; o card mostra exatamente o que o agente escolheu; o agente não fala por cima de humano que assumiu a conversa. Todo o resto é conversa, e conversa é do prompt: nada de teto, dedup ou contador de recusa em código.

**P12 · O playground é um eval.** Uma IA faz o cliente, segundo um perfil de simulação (caminho feliz, nervoso, recusa o telefone, entre outros), e conversa sozinha com o vendedor, que é o mesmo motor do agente da dev. O layout é o da plataforma. *(Kairo, 04/11)*

> P1 a P5 são **direção**, não número: nenhuma delas carrega métrica herdada de relatório. A régua de
> cada uma se mede no app e no banco, na hora do teste. P0 e P6 a P12 são palavras do dono. P0 e P7 a P12 foram revistas e aprovadas por Kairo em 04/11/2026 (ordem na sessão: "pode reajustar totalmente tudo… refine e lance"), a partir da call de 04/11, 16:02–17:04 (`C:transcricao:2026-11-04/1315-call-teams.md`).

## LGPD e PII

**Decisão do Kairo, 27/10/2026 (13:12, grupo do refino):** *"pii que se foda [...] nao precisa de barrar
nada por pii, o objetivo eh vender, nada de mascaramento, nem problema de seguranca."*

- PII e LGPD não barram nada. O agente não pede consentimento, não avisa antes de pedir dado, não
  deixa de pedir um dado e não segura a proposta esperando um "sim" de LGPD.
- Nada de mascaramento: CPF, telefone e nome podem ir em claro para log, trace do turno e banco.
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

Não se usa (e por quê): Prisma, next-auth, Inngest, Mastra e o SDK `openai` direto, porque o projeto já escolheu outra peça (Drizzle, better-auth, BullMQ, Pi como motor do vendedor e AI SDK para o LLM) e trocar exige decisão. LangChain, LangGraph e o SDK do Langfuse saíram porque o agente passou a rodar no motor do Pi como biblioteca (sessão de 25/10/2026). O Langfuse está desligado por ora (desde 19/10/2026, B6): o trace do turno é local (`comTraceDoTurno`, só log), e a volta pelo plugin de observabilidade do Pi está em estudo na D-0014.

Aprovado por Kairo em 28/10/2026 · origem grupo Agent - Preciso do kairo, 11:53 · D-0024

## O técnico — só o que não se descobre lendo o repo

- **Motor:** o vendedor livre, `src/lib/agent/pi/turno-livre.ts` (`runTurnLivre`). O funil em código
  morreu em 20/10/2026: não existe gate, fila de perguntas nem card escolhido pelo código. Quem
  escolhe como perguntar, em que ordem e qual card é o **modelo**.
- **Conduta:** `PROMPT_DO_VENDEDOR` em `src/lib/agent/prompt-do-vendedor.ts` é a **base**: só as premissas. O comportamento vem do perfil do playground, por parte do fluxo; sem perfil publicado vale o perfil padrão. A tabela `caixa_de_prompt` guarda a versão publicada e é a lei quando existe; `pnpm prompts:check` compara o arquivo com ela.
- **Conhecimento da Bevi (a administradora):** as skills em `src/lib/agent/pi/skills/*/SKILL.md`.
- **Cards:** `ArtifactType` em `src/lib/chat/types.ts`. O modelo recebe todas as cartas e todos os campos da busca e escolhe quais e quantas vão ao card (`mostrar_card` com `ids`); o servidor só valida que o id existe e monta o payload (P10, P11).
- **Fila × mesa:** a fila de vendedores avisa todo usuário `attendant` ativo e quem assumir primeiro atende (`src/lib/whatsapp/proxy.ts`); a mesa é `src/lib/mesa/` (fechamento e documentação, Juna). Chamar a fila não silencia o agente; o claim de um atendente ou o caso aberto na mesa silenciam.
- **Teste:** pontual, ao lado do arquivo que você tocou, mais `pnpm -s typecheck`. A suíte inteira foi
  removida em 16/10/2026 — não ressuscite.
- **Gate de promoção de prompt:** `pnpm eval` roda os cenários de `scripts/eval/golden/*.json` contra
  o app real. Nenhuma versão nova de conduta vai para produção sem ele verde. A simulação do playground (P12), com os perfis de cliente, é o segundo gate.

## Como se trabalha aqui

- **Invariante verificável vira código. Conversa é do modelo.** Tom, repetição e fluidez não viram
  regex nem guarda no runtime: viram medida e correção de contexto.
- **Fala ruim em produção tem três causas possíveis, nesta ordem:** o servidor tem um fato que a fala
  contradiz (código); é tom, repetição, sequência (o texto de conduta); é decisão de produto (o dono).
- **Dúvida sobre o que o cliente pediu, reclamou ou combinou** vai no acervo, não no chute:
  `contexto-perfeito -m pessoa "Bruna" -d 30`. Trecho literal, com chave. Resumo não é prova.
- **Commit** com Conventional Commits em inglês, sem `--no-verify`. Push, merge e deploy pedem GO.
