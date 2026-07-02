---
bloco: bloco-whatsapp-templates-schema
branch: feat/whatsapp-templates-schema
workspace: feat-whatsapp-templates-schema
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-191, FIX-192]
escopo_arquivos:
  - src/db/schema.ts
  - src/db/migrations/*            # migration gerada pelo drizzle-kit
  - src/lib/whatsapp/api.ts        # + createTemplate / listTemplates (append, região nova)
  - .env.example
---
# Bloco — Fundação: schema de templates + cliente Meta (onda 1)

Alicerce de que TUDO depende (nível 4 — dependência estrutural dura). Os blocos
`backend` e `admin` da onda 2 forkam da base **depois** deste integrar, então
enxergam as tabelas `whatsappTemplates`/`whatsappOutboundQueue` e as funções
`createTemplate`/`listTemplates` já existentes. Por isso é onda 1 sozinho: Drizzle
não é stubável (tabela precisa existir pra query tipar e migration rodar).

## Itens (ordem)
1. **FIX-191** — schema `whatsappTemplates` + `whatsappOutboundQueue` + enums + migration.
2. **FIX-192** — cliente Meta `createTemplate`/`listTemplates` + env `WHATSAPP_WABA_ID` + `.env.example`.

Spec de design: `docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md`.
