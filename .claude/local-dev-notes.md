# Local dev / smoke num worktree — lições (leia ANTES de sofrer)

> Notas de quem subiu o app num **worktree novo** pra fazer smoke/E2E no host.
> A skill global `~/.claude/skills/local-dev/` é a fonte de verdade do fluxo;
> aqui ficam só os atritos específicos do aja-agora que custam tempo se você
> não souber de antemão. Convenção: stack inteira em containers por workspace
> (OrbStack), nunca `npm run dev` no host.

## TL;DR — sequência que funciona num worktree limpo

```bash
# 1. Deps no HOST (pra rodar vitest/tsc/biome no host) — worktree vem SEM node_modules
pnpm install                 # rápido com o store compartilhado; NUNCA symlink

# 2. Sobe a stack do workspace (Postgres + App em container, hot reload)
~/.claude/skills/local-dev/scripts/bootstrap-workspace.sh
#    → se falhar em "required variable X is missing", ver seção 2 abaixo

# 3. Migrations NÃO rodam sozinhas no bootstrap — schema nasce VAZIO.
#    Rode DENTRO do container (nunca psql/drizzle manual contra o DB):
docker exec aja-app-<workspace> pnpm db:migrate

# 4. App: http://aja-<workspace>.orb.local   (workspace = basename do worktree)
```

`<workspace>` = basename do diretório do worktree (ex.: pasta `agent-chat-ui`
→ `aja-app-agent-chat-ui`, URL `http://aja-agent-chat-ui.orb.local`). Branch
`feat/agent-chat-ui` NÃO vira o workspace no worktree — é o basename.

## 1. Worktree vem SEM node_modules

`git worktree add` não copia `node_modules`. Testes de host (vitest/tsc/biome)
falham com "Cannot find module". **`pnpm install`** (rápido com store compartilhado). NUNCA
symlinkar do clone principal — symlink quebra o Turbopack do container
(ver memória global `worktree_node_modules_symlink`). `pnpm exec vitest` resolve o binário do projeto (use `./node_modules/.bin/vitest` se preferir explícito).

## 2. `.env.local` gerado do `.env.example` NÃO tem os secrets obrigatórios

O `bootstrap` gera `.env.local` a partir do `.env.example`, que deixa várias
chaves **vazias ou ausentes**. O `docker compose` aborta na interpolação:
`required variable X is missing a value`. As que mordem (estado em 2026-06):

| Chave | Origem recomendada |
|---|---|
| `BETTER_AUTH_SECRET` | **ausente** no example — compose exige. Pega do clone principal ou dummy. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ausentes — seed do admin. Dummy serve pro smoke. |
| `BEVI_SELFCONTRACT_HASH` / `BEVI_API_TOKEN` | vazias — só precisa de verdade pra exercer descoberta/simulação Bevi. |
| `IDENTITY_ENC_KEY` | vazia — **NÃO** vale dummy qualquer: `identity.ts` exige **base64 de 32 bytes** (`openssl rand -base64 32`), senão testes de identity/bevi (ex.: `contract-summary.test.ts`) quebram com `key.length !== 32`. |
| `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | vazias — dummy pro smoke. |

**Clone principal** com `.env.local` real (secrets de verdade): `/Users/kairo/code/aja-agora/.env.local`.
Pra smoke do front, **dummy não-vazio basta** nas que não vão ser exercidas
(Bevi/Sendgrid/Identity). NÃO sobrescreva `WORKSPACE_NAME`, portas
(`DB_HOST_PORT`/`APP_HOST_PORT`) nem `DATABASE_URL` — essas o bootstrap já
acertou pro seu workspace; copiar do clone principal causa colisão de porta/DB.

Atalho seguro (preenche só as vazias com dummy, sem despejar secret no log):
```bash
bash -c '
MINE=.env.local
for k in BETTER_AUTH_SECRET BEVI_SELFCONTRACT_HASH BEVI_API_TOKEN \
        IDENTITY_ENC_KEY SENDGRID_API_KEY SENDGRID_FROM_EMAIL \
        ADMIN_EMAIL ADMIN_PASSWORD; do
  cur=$(grep -E "^${k}=" "$MINE" | head -1 | sed -E "s/^[^=]+=//")
  if [ -z "$cur" ]; then
    if grep -qE "^${k}=" "$MINE"; then   # existe vazia → substitui a linha
      awk -v key="$k" "{ if (\$0 ~ \"^\" key \"=\") print key \"=smoke_dummy_value\"; else print }" "$MINE" > "$MINE.t" && mv "$MINE.t" "$MINE"
    else                                  # ausente → anexa
      printf "%s=smoke_dummy_value\n" "$k" >> "$MINE"
    fi
  fi
done'
```

## 3. Migrations: schema nasce VAZIO no DB do workspace

O bootstrap sobe o Postgres mas **não roda migrations**. Sintoma: app responde
HTTP 200 (landing OK) mas `POST /api/chat` dá **500** com
`relation "conversations" does not exist` (visível em `docker logs aja-app-<workspace>`).
A landing renderiza sem DB; o chat real (e qualquer rota que toca o banco) quebra.

Correto (convenção do projeto — migration sempre dentro do container, nunca
manual contra o DB):
```bash
docker exec aja-app-<workspace> pnpm db:migrate
```

## 4. Testes de INTEGRAÇÃO no host precisam do DB do workspace

`pnpm test:unit` (Camadas 1+2 do pre-commit) inclui testes que conectam num
Postgres **real** (ex.: `src/lib/agent/tools/ai-sdk.test.ts`,
`src/lib/**/lead-history-completeness.test.ts`, e alguns cassettes de
`tests/regression/agent-trajectory.test.ts` que persistem no DB). Sem DB
alcançável eles falham com `ECONNREFUSED ::1:5433` — a porta **5433 é legada**;
o Postgres do workspace está em container, alcançável via DNS OrbStack
`aja-pg-<workspace>.orb.local:5432` (não publica porta no host).

`vitest.setup.ts` carrega `.env.local` → `.env.test` → `.env`. O `.env.local`
gerado deixa `DATABASE_URL` comentado (o compose injeta a interna pro container),
então o host cai no `.env` (5433, morto). Aponte o host pro DB do workspace
(que você JÁ migrou na seção 3):

```bash
# pega a cred funcional do container e troca o host interno pelo DNS do host
export DATABASE_URL="$(docker exec aja-app-<workspace> sh -c 'echo $DATABASE_URL' \
  | sed -E 's#@aja-pg-<workspace>:5432#@aja-pg-<workspace>.orb.local:5432#')"
./node_modules/.bin/vitest run src/ tests/regression
```

**Pro pre-commit hook passar** (ele roda `test:unit`), o jeito durável é setar
esse `DATABASE_URL` no `.env.local` (host-only — o compose tem `environment:`
que sobrescreve a chave pro container, então não afeta o app). `.env.local` é
gitignored; nada vaza no commit. Sem isso, o hook bloqueia o commit por causa
desses testes de DB — falha de ambiente, não do seu código.

## 5. Pegadinhas de shell

- O shell padrão aqui é **zsh**: `for k in $VAR` com string de palavras **NÃO**
  faz word-split (roda 1x com a string inteira). Use array, `${=VAR}` (zsh), ou
  rode o loop dentro de `bash -c '...'`.
- `/bin/bash` do macOS é **3.2** — sem `${var,,}` (lowercase) e afins. Use awk/sed.

## 6. Onde olhar quando o agente "não responde"

1. `docker logs aja-app-<workspace> --since 90s | grep -iE "POST|/api/chat|error"`
   — se não há POST, pode ser compilação lazy da rota no dev (1ª chamada lenta).
2. `relation ... does not exist` → migrations (seção 3).
3. Console do browser (chrome-devtools `list_console_messages`) → 500 no
   `/api/conversations/:id/status` é o polling de handoff numa conversa que
   ainda não existe; some depois do 1º turno. Não é bug do front.
