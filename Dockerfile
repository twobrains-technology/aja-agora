# syntax=docker/dockerfile:1.4
FROM node:22-alpine AS base

# === deps ===
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# === builder ===
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Bundle do migrate runner (inclui pg + drizzle-orm/migrator num único arquivo)
# Não depende do file tracer do Next standalone — funciona em runtime sem
# resolver node_modules.
RUN npm run db:migrate:bundle

# DATABASE_URL dummy só em build-time — Next 16 "Collecting page data" carrega
# api routes que importam src/db/index.ts (que lança se a env não existe).
# Em runtime, ECS task definition sobreescreve com o valor real do Secrets Manager.
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npm run build

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
# (entrypoint chama `npm run --silent db:migrate:runtime` que aponta pro bundle)
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate-guard.bundle.mjs ./scripts/migrate-guard.bundle.mjs
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
