Você é o executor da migração pnpm + arquitetura dev local deste repositório, num worktree isolado deste branch. Roda SOZINHO (sem o Kairo) com --dangerously-skip-permissions. Implemente, commite e **pushe a branch** — mas **NÃO** abra PR, **NÃO** faça merge, **NÃO** rode deploy/restart. A linha vermelha é tua responsabilidade.

## Contexto (por que esta migração)
O M5 do Kairo fritou porque `node_modules` era instalado dentro da imagem (1 imagem por worktree) → custo linear de tempo+disco. A regra global (em ~/.claude/CLAUDE.md, seção "Regra de Package Manager — pnpm é o ÚNICO permitido") agora obriga: pnpm único + dev sem build de deps + store compartilhado via named volume.

Leia `docs/correcoes/todo/bloco-pnpm/_bloco.md` deste repo antes de começar.

## Runbook (execute na ordem; detecte o que se aplica)

### A. Package manager → pnpm (PULE se já não houver package-lock.json/yarn.lock)
- `corepack enable && corepack prepare pnpm@latest --activate`
- `pnpm import` (gera pnpm-lock.yaml do package-lock.json/yarn.lock) → `pnpm install`
- `rm -f package-lock.json yarn.lock`
- package.json: adicione `"packageManager": "pnpm@<versão instalada>"` e `"engines": { "pnpm": ">=11" }`
- Crie/atualize `pnpm-workspace.yaml` com `enableGlobalVirtualStore: true` (+ `packages:` se for monorepo)
- Se o projeto já usa `.npmrc` com `node-linker=hoisted`, mantenha
- Troque TODO `npm ci`/`npm install`/`npm run`/`npx`/`yarn` em: scripts do package.json, Dockerfiles, docker-compose, .github/workflows, Makefile, README/docs → equivalente pnpm (`pnpm`/`pnpm exec`/`pnpm dlx`)

### B. Dockerfile.dev — remover install embutido (só se existir Dockerfile.dev)
- Remova `COPY package*.json` + `RUN npm ci`/`RUN pnpm install` do Dockerfile.dev
- Garanta `corepack enable && corepack prepare pnpm@latest --activate`, `ENV PNPM_STORE_DIR=/pnpm/store`
- CMD instala no boot: `CMD ["sh","-c","pnpm install --frozen-lockfile && pnpm dev -- --port 3000 --hostname 0.0.0.0"]` (ajuste o comando dev ao projeto)
- Referência: `~/code/tb-local-dev/templates/Dockerfile.dev.example`

### C. docker-compose (dev) — volumes nomeados + store externo (só se houver compose com serviço app)
- No serviço app: volumes `- ./:/app`, `- app_node_modules:/app/node_modules` (NAMED, trocar o anônimo), `- pnpm_store:/pnpm/store`; env `PNPM_STORE_DIR: /pnpm/store`
- Seção volumes: declare `app_node_modules:` e
  ```
  pnpm_store:
    name: tb-pnpm-store-shared
    external: true
  ```
- Referência: `~/code/tb-local-dev/templates/docker-compose.yml.example`

### D. Dockerfile (build prod/standalone) — BuildKit cache mount + pnpm fetch (só se houver Dockerfile de build)
- `# syntax=docker/dockerfile:1.7` no topo
- `RUN --mount=type=cache,target=/pnpm/store pnpm fetch --frozen-lockfile` (antes de copiar o código)
- `COPY . .` → `RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile --offline` → `pnpm build`
- Mantenha o stage runtime/standalone existente, só troque npm→pnpm

### E. CLAUDE.md do projeto
- Se existe CLAUDE.md: adicione uma seção curta "## Package manager — pnpm ÚNICO" apontando a regra global e proibindo npm/yarn/node_modules-no-build
- Se NÃO existe: crie CLAUDE.md mínimo com a stack do projeto + essa seção

### F. Validação (OBRIGATÓRIA — não é opcional)
- `pnpm install` limpo passa sem erro
- Nenhum `package-lock.json`/`yarn.lock` sobrando; `pnpm-lock.yaml` commitado
- Se o projeto tem stack local: `docker compose --profile containerized up -d` sobe e o app responde (em `.orb.local` ou `localhost`). Se subir stack, **derrube no fim** (`docker compose down`) pra não acumular container.
- Rode lint/typecheck/build do projeto se houver (`pnpm lint`, `pnpm typecheck`, `pnpm build`) e garanta que passam

## Commits e fechamento
- Commits Conventional em PT-BR, separados por etapa: `build: migra <projeto> pra pnpm`, `build: dev sem rebuild de deps (volumes + store compartilhado)`, `docs: regra pnpm no CLAUDE.md`
- Ao terminar: **push da branch** (`git push origin <branch>`)
- Gere `.done/{data}-migracao-pnpm.md` (o que mudou, validação rodada, gaps honestos)
- Crie reminder de revisão (NÃO PR):
  `osascript -l JavaScript /Users/kairo/.superset/projects/organizacao-produtiva/scripts/reminders.js add "[TwoBrains] Revisar+mergear migração pnpm <projeto>: branch <branch> — validar diff + stack sobe, decidir merge"`
- **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart.**

## Resumo final
Liste o que aplicou (A-F), o que pulou e por quê, e qualquer decisão que tomou (ex.: comando dev do projeto, monorepo vs single). Uma linha por item.
