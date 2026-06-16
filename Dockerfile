# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PNPM_STORE_DIR=/pnpm/store

# === builder ===
FROM base AS builder
WORKDIR /app

# Install ANTES de copiar o código → a camada de deps só invalida quando o
# lockfile muda (rebuild com mudança só de código = Docker layer cache hit,
# segundos). Build scripts permitidos (esbuild/sharp) rodam via allowBuilds do
# pnpm-workspace.yaml.
#
# Store SEM BuildKit cache mount (de propósito): o postinstall do esbuild
# extrai um binário nativo de ~10 MB para dentro do pacote no store; com o store
# num cache mount, esse binário some quando o mount se desprende ao fim do RUN
# (`esbuild/bin/esbuild: not found` no `db:migrate:bundle`). Com o store no
# próprio layer da imagem, esbuild + sharp ficam self-contained e o build é
# reproduzível. (O par `pnpm fetch` + `install --offline` do template tb-local-dev
# também não materializa os optional deps nativos por plataforma a partir de um
# lockfile importado de npm — mesmo sintoma.) A partilha de store é mantida no
# DEV (named volume tb-pnpm-store-shared no compose); o build prod prioriza
# correção e o cache de layer do Docker já cobre o rebuild rápido.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .

# Bundle do migrate runner (inclui pg + drizzle-orm/migrator num único arquivo).
# Não depende do file tracer do Next standalone — funciona em runtime sem
# resolver node_modules.
RUN pnpm db:migrate:bundle

# DATABASE_URL dummy só em build-time — Next 16 "Collecting page data" carrega
# api routes que importam src/db/index.ts (que lança se a env não existe).
# Em runtime, ECS task definition sobreescreve com o valor real do Secrets Manager.
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN pnpm build

# === runner ===
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next standalone (slim — só o que é importado em runtime pela app)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations runtime — pasta de migrations + bundle do guard + package.json
# (entrypoint chama `pnpm run --silent db:migrate:runtime` que aponta pro bundle)
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate-guard.bundle.cjs ./scripts/migrate-guard.bundle.cjs
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Entrypoint padrão TwoBrains — roda migrations antes do CMD
COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
