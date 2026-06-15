---
bloco: bloco-a-polir-funil-retorno
branch: feat/polir-funil-retorno
workspace: feat-polir-funil-retorno
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-48, FIX-49, FIX-50]
escopo_arquivos:
  - src/lib/bevi/contract-input.ts
  - src/lib/bevi/fulfillment.ts
  - src/lib/bevi/proposal-repo.ts
  - src/app/api/chat/route.ts
  - src/app/api/leads/route.ts
  - src/components/chat/theater/theater-chat.tsx
  - src/components/chat/message-list.tsx
  - src/components/chat/chat-message.tsx
  - src/components/chat/artifact-renderer.tsx
  - src/components/chat/artifacts/gate-renderer.tsx
  - src/lib/chat/provider.tsx
  - src/lib/chat/resume.ts
  - src/components/admin/pipeline/contact-detail-panel.tsx
  - src/lib/admin/contact-detail.ts
---

# Bloco A — Polir funil + retorno (refino pós-entrega da feature funil-e-retorno)

Pacote único de UM dev. São 3 refinamentos da **mesma feature** já mergeada
(`funil-e-retorno-para-sessao`, FIX-41..47), levantados na sessão de PO crítico
de 2026-06-15. Os três têm **arquivos disjuntos entre si** (backend Bevi/API ×
chat UI × admin UI — nível 1), mas são **afins de tema e curtos**: agrupados
numa sessão só, em ordem, como o operador pediu ("bloco único se viável").

## Ordem interna (executar nesta sequência)

1. **FIX-48** — bug do funil (proposta web sem `leadId` → raia presa). É o de
   maior impacto de negócio (verdade quebrada no admin) e tem root cause já
   provado no código. Backend.
2. **FIX-49** — retomada acolhedora (resume sela artifacts/gates, ancora scroll).
   Chat UI. Fecha também o vetor de duplicação que alimenta o FIX-48.
3. **FIX-50** — proposta vigente + conversa ativa em destaque no card. Admin UI.

Sem dependência dura entre eles; a ordem é por prioridade, não por bloqueio.

## TDD obrigatório (regra do projeto)

Todos os 3 são **não-agênticos** (não tocam `streamText`/comportamento da LLM)
→ **dispensam cassette (Camada 2)**. Cada um exige:
- Camada 1 (structural, `src/**/*.test.ts`) +
- teste de comportamento real: **integration** (FIX-48, toca DB) ou
  **component + E2E Playwright** (FIX-49, FIX-50).
Escrever o teste, **ver falhar com a assinatura do bug**, só então corrigir.
1 commit por item (`test+fix:` pro FIX-48; `test+feat:`/`fix:` conforme couber
nos outros). Ao concluir cada item: **mover** o `fix-NN-*.md` pra
`docs/correcoes/done/` com `status: done` + `commit:` + `executado_em:`.

## Prompt de lançamento (colar na sessão do Superset)

> Você vai executar o bloco `docs/correcoes/todo/bloco-a-polir-funil-retorno/`
> no projeto aja-agora. Antes de tudo, leia `docs/correcoes/README.md` (fluxo
> TODO→DONE) e o `CLAUDE.md` do projeto (regras de TDD e de regressão).
>
> Crie a branch `feat/polir-funil-retorno` (workspace `feat-polir-funil-retorno`)
> e suba o ambiente local pela skill `local-dev` (stack em containers do
> workspace, nunca no host).
>
> Execute os 3 itens NA ORDEM: FIX-48 → FIX-49 → FIX-50. Cada item está
> especificado em seu `fix-NN-*.md` (root cause provado, correção proposta,
> regressão exigida). Para cada um:
> 1. Escreva o teste de regressão PRIMEIRO (integration p/ FIX-48; component +
>    E2E Playwright p/ FIX-49 e FIX-50) e **veja falhar** com a assinatura exata
>    do bug descrito. São bugs não-agênticos — NÃO precisa cassette.
> 2. Para o FIX-48, confirme o root cause no banco com a query do spec antes de
>    corrigir (proposta com `leadId` null + lead em `qualificado` na mesma
>    conversa).
> 3. Corrija o produto. Re-rode, veja passar.
> 4. Commit único por item (`test+fix:` no FIX-48; `fix:`/`test+feat:` nos
>    outros), mensagem em PT-BR, Conventional Commits.
> 5. Mova o `fix-NN-*.md` pra `docs/correcoes/done/` com `status: done`,
>    `commit: <hash>`, `executado_em: <data>`.
> Ao fim, rode o QA-flow (qa-planner → qa-runner) sobre o fluxo web de
> fechamento + retomada, e abra PR pra `develop`.
