This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

> **Package manager: `pnpm` é o único suportado.** `npm`/`yarn` são proibidos
> (lockfile, store e arquitetura dev local dependem de pnpm). Ative com
> `corepack enable && corepack prepare pnpm@latest --activate`.

A stack de dev roda em containers por workspace (convenção TwoBrains local-dev,
OrbStack) — **não** rode `next dev` no host:

```bash
# sobe Postgres + Redis + app (HMR via bind mount) no workspace atual
docker compose --profile containerized up -d
# app em http://aja-<workspace>.orb.local
```

Pra rodar testes/typecheck/lint no host (worktree vem sem node_modules):

```bash
pnpm install   # rápido com o store compartilhado tb-pnpm-store-shared
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Observabilidade (Langfuse)

Instância self-hosted da TwoBrains: `https://langfuse.twobrainstechnology.com` (projeto
`aja-agora`, chaves próprias). Envs: `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`,
`LANGFUSE_SECRET_KEY` (ver `.env.example`). **Sem as envs (ou com elas vazias) tudo vira
no-op silencioso — o app nunca depende do Langfuse pra funcionar.**

Convenções:

- **1 request de turno = 1 trace** (`turn:web` / `turn:whatsapp`). Interrupt/resume do grafo
  não é costurado num trace só — a costura é a **session**.
- **`sessionId` = `conversations.id`** (a mesma chave do `thread_id` do checkpointer). Toda
  a conversa aparece agrupada na aba Sessions.
- **`userId`**: web = cookie visitante `aja_uid`; whatsapp = `wa:<telefone>`.
- **Tags**: `channel:<web|whatsapp>`, `simulated:<true|false>`, `persona:<slug>`.
- Spans: nós do grafo (via `CallbackHandler` por turno em `run-turn.ts`), generations do
  `converse` (até 4x/turno, tool-loop) e do `turn-analyzer`, e toda tool de negócio com
  input/output (`tool-adapter.ts`). Segredos são mascarados no export
  (`src/lib/observability/langfuse/mask.ts`); dado de negócio trafega (instância nossa).
- **Feedback**: `POST /api/admin/simulator/sessions/<id>/feedback` `{value: "up"|"down",
  traceId?, comment?}` → score `user_feedback` (BOOLEAN). O `traceId` do turno chega na UI
  pelo data-part transient `data-trace`.

### Prompt Management

Os textos-base ESTÁVEIS são versionados no Langfuse com a label `production` —
`aja-system-prompt` (base do `converse`) e `aja-turn-analyzer` (system do classificador).
Blocos dinâmicos (`montarSystem`, sub-tópicos) são função do estado e continuam código.

- Bootstrap/sync idempotente: `pnpm sync-prompts` (texto igual à versão `production` atual
  não cria versão nova).
- Runtime: `fetchManagedPrompt` busca por label com cache de 60s → **editar na UI reflete
  em ≤2 turnos sem deploy** (cache é stale-while-revalidate). Fallback OBRIGATÓRIO é a
  constante do código — Langfuse fora do ar nunca derruba o app.
- A versão usada fica linkada em cada generation (`promptName`/`promptVersion` no trace) —
  é o que permite comparar métricas por versão de prompt.

## Ciclo de avaliação (Langfuse)

- **Dataset `golden-set`** (14 cenários em `scripts/eval/golden/*.json` — jornadas r9/r10 +
  invariantes dos CA): `pnpm eval:seed` sincroniza (upsert por id; placeholders
  `${E2E_TEST_CPF}` ficam literais no Langfuse — PII só em runtime).
- **`pnpm eval` é o experiment runner e o GATE DE PROMOÇÃO DE PROMPT.** Roda cada cenário
  contra o app real (`/api/chat`, conversas nascem simuladas), registra o dataset run no
  Langfuse com traces linkados e imprime pass/fail por caso. Asserts são de TRAJETÓRIA
  (artifacts/gates/contaminação) — nunca prosa (CLAUDE.md: conversa é do modelo).
- **Regra do gate**: prompt novo SÓ ganha a label `production` com `pnpm eval` verde contra
  a versão candidata. Fluxo: criar a versão nova na UI (label `staging` ou nenhuma) →
  apontar o app local pra ela (editar a label de teste) → `pnpm eval` → verde? → mover a
  label `production` na UI. Cenários pulados por env ausente (`E2E_TEST_CPF`) saem avisados
  no sumário — pulado ≠ verde.
- **LLM-as-a-judge**: Evaluator GERENCIADO na UI do Langfuse (não é código deste repo) —
  roda sozinho sobre traces novos que casem com o filtro configurado e grava os scores
  `judge_*`. A rubrica vive na UI (Evaluators); o trace já leva `input`/`output`/tags pro
  filtro. Requisito: uma LLM Connection válida em Settings → LLM Connections.
