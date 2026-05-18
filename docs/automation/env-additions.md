# Funnel Automations — Envs a adicionar

Hook defensivo bloqueia edição automática de `.env*`. Aplique manualmente as adições abaixo no `.env.example` (e também no seu `.env` local) antes de rodar a feature.

## Bloco a adicionar logo após `APP_HOST_PORT=3010`

```bash
REDIS_HOST_PORT=6380
```

## Bloco a adicionar após o bloco `# ---- Database ----`

```bash
# ---- Redis (BullMQ — funnel automations engine) ----
# App rodando no host: use localhost + REDIS_HOST_PORT
REDIS_URL=redis://localhost:6380
# App em container: o compose injeta redis://aja-redis-<workspace>:6379
```

## Bloco a adicionar (ou completar) na seção WhatsApp existente

```bash
# ---- WhatsApp Business (Cloud API + Message Templates) ----
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
# NOVO — necessário pra criar/listar message templates via Graph API.
# Pega no Meta Business Manager → Configurações da Conta WhatsApp Business.
WHATSAPP_BUSINESS_ACCOUNT_ID=
```

## Em produção (ECS)

Adicionar no Secrets Manager `tb/<env>/aja-agora/env`:

```bash
REDIS_URL=redis://<elasticache-endpoint>:6379
WHATSAPP_BUSINESS_ACCOUNT_ID=<waba-id>
```

E provisionar:
- ElastiCache Redis (single-node t4g.micro pra começar — barato, ARM, dentro do mesmo VPC do ECS)
- Service ECS adicional `aja-agora-worker` apontando pra imagem `Dockerfile.worker`
