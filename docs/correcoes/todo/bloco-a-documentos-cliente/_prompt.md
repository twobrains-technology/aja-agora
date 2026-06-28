Você é o executor do bloco **bloco-a-documentos-cliente** no worktree isolado deste branch (`feat/documentos-cliente-s3`).

1. Leia `docs/correcoes/README.md` (regras do fluxo), `docs/correcoes/todo/bloco-a-documentos-cliente/` (_bloco.md + FIX-82, FIX-83, FIX-84) e o design completo em `docs/superpowers/specs/2026-06-28-gestao-documentos-cliente-design.md`.

2. DESIGN: o design macro já está fechado no spec. Só há decisão de design real em pontos finos (ex.: nome exato do bucket env, estrutura da key, shape do audit de download). Pra esses, decida como sênior seguindo o spec e o padrão do repo (o storage de administradora-docs é o molde); registre as decisões não-triviais em `docs/correcoes/decisions/2026-06-28-bloco-a-documentos.md` (commit `docs:`). NÃO precisa de brainstorming interativo — o spec é a fonte.

3. Execute NA ORDEM: FIX-82 → FIX-83 → FIX-84. TDD onde fizer sentido (integration test do endpoint/dispatch antes do código).

4. 1 commit Conventional (PT-BR) por item (`feat:`/`test+feat:`). Migrations via drizzle-kit gerando o arquivo (NUNCA rode migration na mão contra o DB — entrypoint/container).

5. Regras DURAS desta feature:
   - PII de identidade: bucket DEDICADO + SSE-KMS + download SÓ via URL pré-assinada curta atrás de auth de admin + audit. Nunca exponha key/bucket.
   - **Fonte da verdade = nosso S3 + `client_documents`.** O despacho pra Bevi/mesa (FIX-84) é consumidor best-effort: falha NÃO pode perder nem bloquear o documento guardado.
   - `bevi_b` no dispatch fica como STUB com `TODO(bevi_b): validar step de doc do self-contract ao vivo` (marca `pending`, não envia) — é PENDENTE-KAIRO.
   - Bucket+KMS de PROD são PENDENTE-KAIRO (IaC); em dev use MinIO local. Documente os envs novos no `.env.example`.
   - pnpm é o único PM. local-dev em container. Não rode migration na mão.

6. Ao terminar: **push da branch** (`git push origin feat/documentos-cliente-s3`) + gere `.done/{data}-bloco-a-documentos.md` (resumo, decisões, testes, gaps/PENDENTE-KAIRO). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração na base é do ORQUESTRADOR. A tag-sentinela de conclusão é injetada automaticamente no fim deste prompt — siga o footer.

7. RESUMO FINAL: liste as decisões de design que tomou ("decidi X em vez de Y porque Z" por linha) e os pontos PENDENTE-KAIRO (bucket/KMS prod, bevi_b ao vivo).
