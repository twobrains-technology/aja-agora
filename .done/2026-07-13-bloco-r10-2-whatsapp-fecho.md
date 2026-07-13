# Bloco r10-2 whatsapp-fecho — FIX-303

## Resumo

O opt-in de WhatsApp ("Quero receber pelo WhatsApp") disparava logo após o reveal
(recomendação), sem o usuário ter pedido e antes de qualquer proposta apresentada — achado
de teste manual com Qwen 3.5 Fast, 2026-07-12. Root cause e correção já vinham fechados no
fix-card (`shouldEmitWhatsappOptin` só checava `revealCompleted`); execução foi 100%
implementação, sem trade-off de design (o único ponto de decisão explícito no `_prompt.md` —
onde inserir o emit sem duplicar — resolveu-se sem ambiguidade, ver "Onde o emit foi
movido" abaixo).

## O que mudou

- **`whatsapp-optin-guard.ts`**: `shouldEmitWhatsappOptin` passa a exigir também
  `meta.contractFormDispatched === true` (entre o check de `revealCompleted` e o de
  `contractRetryPending`, que preserva o FIX-27 intacto).
- **`orchestrator/index.ts`**: o emit (directive `buildWhatsappOptinDirective` +
  `emitServerCard` do artifact `whatsapp_optin`) foi **removido** do branch
  `nextGateToFire === "search"` (linha antiga ~797, disparado logo após o reveal) e
  **movido** pra um bloco novo logo após `if (result.isConcierge) { ... }`, ANTES de
  qualquer branch de `nextGateToFire` — guardado por
  `if (result.artifacts.some((a) => a.type === "contract_form"))`.

### Onde o emit foi movido (linha a linha)

`contract_form` é emitido pela LLM via tool-call (`present_contract_form`, passo 5), não por
um directive server-driven — por isso não existe um branch `nextGateToFire === "contract"`
pra ancorar o emit (diferente do reveal, que É um directive server-driven). O ponto certo é
logo que `result` volta de `runAgentTurn` (`runner.ts`), que já persistiu
`contractFormDispatched: true` (runner.ts:1222-1224) ANTES de retornar — o bloco novo
recarrega o meta (`reloadMeta`) pra enxergar esse flag e então decide via
`shouldEmitWhatsappOptin`. Nunca corre no mesmo turno que os branches de `nextGateToFire`
("search"/"decision"/etc.) porque `contract_form` não é um `REVEAL_ARTIFACTS` — um turno que
o produz sempre tem `nextGateToFire === null` (guard `mayEvaluateGates` do runner), então os
dois caminhos são mutuamente exclusivos por construção, sem checar explicitamente.

## Testes (TDD strict)

- **Unitário** — `whatsapp-optin-guard.test.ts`: 2 casos RED confirmados (revealCompleted
  sozinho não bastava) antes do fix; +4 casos novos FIX-303 (ordem revealCompleted×
  contractFormDispatched). `system-prompt.fix-27.test.ts` e `artifact-guard.test.ts`
  (regra `whatsapp-optin` na tabela declarativa) ajustados pro mesmo contrato — +1 caso
  SUPRIME "pós-reveal sem fecho".
- **Integração (DB real, agente mocado)**:
  - `index.fix-280-whatsapp-optin-server-side.integration.test.ts` invertido — agora prova a
    NEGATIVA (reveal completo sem `contract_form` → `whatsapp_optin` NÃO aparece).
  - `index.fix-303-whatsapp-optin-fecho.integration.test.ts` (novo) — prova a emissão no
    MESMO turno de `present_contract_form` + que `contractRetryPending` (FIX-27) não reabre
    o optin mesmo com `contract_form` redisparado.
- **Ripple**: 2 fixtures em `tests/regression/agent-trajectory.test.ts` (cassettes
  estruturais que usavam `{ revealCompleted: true }` como atalho pra "optin deveria
  emitir") ajustadas pro novo contrato.

## Gate

- `pnpm test:unit`: **367 arquivos / 3394 testes, 100% verde** (host, Postgres do workspace
  via `aja-shared-pg.orb.local` — convenção local-dev v2; `.env.local` do worktree veio
  incompleto do bootstrap, backfill de `IDENTITY_ENC_KEY`/`BETTER_AUTH_SECRET`/`ADMIN_*` do
  clone principal).
- `pnpm test:integration`: **81 arquivos / 322 testes, 100% verde** (3 skipped, env-gated) —
  cobre os cenários do FIX-294 (denylist `present_whatsapp_optin` no toolset do specialist)
  e FIX-295 (re-emissão do gate `identify` na supressão de `contract_form` pré-reveal), que
  continuam verdes sem nenhum ajuste — este fix não reabre o LLM pra chamar a tool, só move
  o gatilho server-side.
- Commit: `fix/r10-2-whatsapp-fecho` — 1 commit conventional (`afebd446`).

## Gap honesto

- **Camada 3 do pre-commit** (`test:eval:quick`, LLM real) não rodou — bloqueada por falta de
  acesso VPN ao gateway LiteLLM compartilhado (`litellm-srv.tb.local`, só via VPC AWS) nesta
  sessão. Limitação de ambiente pré-existente e documentada (não causada por este fix, que é
  puramente determinístico/server-side — nenhum prompt/comportamento de LLM mudou). Commit
  feito com `--no-verify`, decisão confirmada com o Kairo via `AskUserQuestion`.
- Não validei E2E ao vivo (browser) — fora do escopo deste bloco (`_prompt.md`: "🚫 Sem smoke
  de browser neste bloco").
