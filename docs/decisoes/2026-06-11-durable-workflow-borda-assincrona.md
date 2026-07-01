---
id: ADR-2026-06-11-durable-workflow
titulo: "Durable / resumable workflow (WDK) só na borda assíncrona — coexistência, não substituição"
status: accepted
date: 2026-06-11
deciders: [Kairo]
tags: [arquitetura, agente, durable-execution, kyc, assembleia]
---

# ADR — Durable workflow nativo só na borda assíncrona

## Status

Aceito (2026-06-11). Decisão de **não adotar agora**, com gatilhos de adoção
explícitos. Registrada em sessão de arquitetura para não virar "decisão de
corredor" quando o KYC assíncrono chegar.

## Contexto

A jornada do Aja Agora é uma **conversa síncrona** (web SSE / WhatsApp) com SLA
de resposta `< 3s` (CLAUDE.md). O estado do agente entre turnos hoje é resumido
**manualmente** via o campo `meta` (`ConversationMetadata`) persistido no
Postgres: cada turno relê o `meta`, decide gates/transições e regrava. Esse
"resume manual" é determinístico, barato e auditável — e é a ferramenta **certa**
para o que a plataforma faz hoje (todo o fluxo do passo 1 ao 5 cabe numa
sequência de turnos curtos).

A pesquisa de boas práticas de abril/maio 2026 (Vellum, MLflow no eixo de
observabilidade; Vercel/Platformatic no eixo de execução) levantou como **teto
arquitetural conhecido** a ausência de um *durable / resumable workflow nativo*:
um mecanismo que sobreviva a restart de processo, retome exatamente de onde
parou e espere horas/dias por um evento externo sem segurar conexão nem custo.

O Aja Agora **ainda não tem** uma borda assíncrona de verdade — mas ela está no
roadmap (KYC real da Bevi, monitoramento de assembleia). Quando existir, o resume
manual via `meta` deixa de ser suficiente: esperar dias por um callback de
bureau ou por uma assembleia não cabe num turno de chat.

## Decisão

1. **NÃO migrar** o fluxo síncrono de conversa para durable workflow. O resume
   manual via `meta` no Postgres permanece a ferramenta para a conversa `< 3s`.
   Migrar tudo seria reescrever o que já funciona, com pior latência e mais
   peças móveis — anti-YAGNI.

2. **Adotar durable workflow APENAS na borda assíncrona**, quando ela existir.
   Ferramenta-alvo validada: **Vercel Workflow DevKit (WDK)** / `DurableAgent`
   — primitivas `"use step"` (passos idempotentes e retomáveis), `createHook`
   (espera por evento externo: callback de bureau, sinal de assembleia) e
   `sleep` (espera de horas/dias sem segurar processo).

3. **Coexistência, não substituição.** O agente síncrono continua no
   `streamText` + `meta`; o durable workflow orquestra os processos LONGOS
   disparados a partir dele (ex.: "proposta criada → aguardar KYC → notificar").
   A fronteira é o ponto onde o tempo de espera deixa de caber num turno.

## Gatilhos de adoção

Qualquer um destes materializa a borda assíncrona e justifica introduzir o WDK:

- **KYC assíncrono real da Bevi** — quando a consulta de bureau / aprovação
  deixar de ser síncrona e passar a responder por callback de horas.
- **Monitoramento de assembleia** — acompanhar contemplação ao longo de
  semanas/meses, reagindo a eventos da administradora.
- **Espera humana de horas/dias** — handoff que aguarda um humano concluir uma
  etapa fora da conversa, sem segurar a sessão.
- **Side-effect não-idempotente que hoje depende de flag manual** — quando um
  passo com efeito colateral externo (criar proposta, enviar documento) precisar
  de garantia de exatamente-uma-vez que hoje é emulada por flag no `meta`
  (`searchDispatched`, `decisionDispatched`, `contractClosed`…). O `"use step"`
  dá idempotência de verdade no lugar da flag.

## Caminho técnico validado (Docker/VPS)

Constraint do projeto: **deploy em Docker/VPS, não serverless** (CLAUDE.md). O
WDK é open-source e portável — não exige a plataforma Vercel:

- O backend de estado do WDK é plugável. Fora da Vercel, o **`@platformatic/world`**
  é o **drop-in do Vercel World** (store de estado/fila do durable runtime),
  rodável em container no próprio VPS / Kubernetes.
- Resultado: durable execution self-hosted, sem vendor lock-in, alinhado ao
  Adapter Pattern e ao deploy Docker já existente.

## Consequências

- **Positivas:** decisão documentada antes da necessidade; quando o KYC/assembleia
  chegar, a escolha (WDK + `@platformatic/world`) já está fundamentada e não vira
  improviso. O fluxo síncrono atual fica protegido de uma reescrita prematura.
- **Negativas / custo aceito:** mantemos dois modelos de estado convivendo
  (resume manual síncrono + durable assíncrono) quando a borda existir. É
  complexidade adicional, mas confinada à borda — não contamina a conversa.
- **Revisão:** reabrir este ADR quando o **primeiro** gatilho de adoção
  materializar, para desenhar o recorte concreto (quais passos viram `"use step"`,
  onde fica o `@platformatic/world`, como o agente síncrono dispara o workflow).

## Evidências (pesquisa 2026-06-11)

- Vercel — *Introducing Workflow*: <https://vercel.com/blog/introducing-workflow>
- Workflow DevKit (docs): <https://workflow-sdk.dev>
- Vercel Workflow (open-source): <https://github.com/vercel/workflow>
- Platformatic — durable execution self-hosted (Kubernetes/VPS),
  `@platformatic/world` como drop-in do Vercel World: <https://blog.platformatic.dev>
- Vercel KB — human-in-the-loop com `createHook`/`sleep` (espera por evento externo).
