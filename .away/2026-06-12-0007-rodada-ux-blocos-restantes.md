# Away — Completar a rodada-ux 2026-06: blocos R, O, P, N (FIX-32/28/30/27) na branch única

- **Início:** 2026-06-12 00:07 · **Sessão:** aja-agora / fix/rodada-ux-2026-06
- **Critério de pronto:** cada um dos 4 itens (FIX-32, FIX-28, FIX-30, FIX-27)
  com TDD strict (teste visto FALHAR antes do fix), 1 commit `test+fix:`,
  item movido pra `docs/correcoes/done/`, pasta do bloco removida ao esvaziar,
  pre-commit verde em cada commit. E2E Playwright do bloco R se o ambiente
  permitir (senão impedimento técnico concreto registrado). Bloco Q (FIX-31)
  já concluído antes do /to-saindo (commit 8f11ee2).
- **Status:** EM ANDAMENTO

## Decisões

### D1 · 00:07 — NÃO paralelizar via subagents/worktrees; executar os 4 em fluxo contínuo no mesmo worktree
- **Contexto:** Kairo saiu e pediu "executa mais de um de uma vez, nao rola? vaii".
  Os 4 blocos restantes SÃO disjuntos em arquivo (R: message-list.tsx · O:
  other-options.ts · P: offer-mapper.ts+simulation-result.tsx · N: system-prompt/
  personas/agents/leads-route/chat-route/whatsapp-optin/types) — nenhum overlap,
  paralelização seria segura quanto a conflito.
- **Decidi:** executar eu mesmo, sequencial e sem pausar entre blocos, no mesmo
  worktree. Capturo o ganho prático de "tudo de uma vez" agrupando operações e
  não tratando como 5 sessões lentas.
- **Alternativas descartadas:**
  - Subagents com `isolation: worktree` → viola a regra global do Kairo "Sem
    subagent — você escreve o teste de bug direto na sessão"; o contexto do bug
    tem que estar comigo.
  - Paralelo de verdade → os testes integration brigam pelo MESMO Postgres do
    dev (um DB compartilhado), e o bloco N exige Camada 3 (LLM real) no
    pre-commit. Wall-clock real NÃO melhora: o gargalo é a suíte de ~1500 testes
    do pre-commit, que rodada 4× concorrente no mesmo DB fica mais lenta.
  - Em modo autônomo (Kairo fora), menos visibilidade da execução = maior risco
    de falso-verde. Prefiro controle total da qualidade de cada TDD.
- **Reversibilidade:** fácil (decisão de processo, não toca código).
- **Evidência:** este diário; manifestos dos blocos (`conflitos_esperados`).

### D2 · 00:18 — Bloco R: E2E via app do worktree + SSE fake (page.route), build em paralelo
- **Contexto:** o item R exige E2E Playwright (regra E2E do Kairo é inviolável).
  O baseURL do playwright aponta pra OUTRO workspace; meu worktree não tem app
  rodando. O streaming real depende de LLM+Bevi (frágil/caro em autônomo).
- **Decidi:** (1) Camada 1 robusta com 7 testes de componente cobrindo os 4
  comportamentos (a/b/c/d) — JÁ VERDE. (2) Subir o app do meu workspace via
  local-dev em background e escrever um spec E2E determinístico que intercepta
  `/api/chat` com `page.route` servindo um SSE fake (streaming controlado, sem
  LLM) — testa o scroll REAL no browser sem depender do agente. Build roda em
  paralelo enquanto avanço O e P (unit puros).
- **Alternativas descartadas:** E2E com agente real streamando (não-determinístico,
  exige ANTHROPIC_API_KEY+Bevi, lento); pular o E2E (viola a regra — não é
  impossível, só trabalhoso).
- **Reversibilidade:** fácil.
- **Evidência:** E2E `tests/e2e/specs/chat-scroll/scroll-intent.spec.ts` **passou
  3×/3** contra o app do workspace. Resolvido — sem PENDENTE-KAIRO.
- **Nota técnica (resolvida):** o `/api/chat` real dá 500 no dev (DB do container
  sem schema; migrate-guard só no build de prod). Contornei interceptando 100% a
  rede com `page.route` + SSE fake (formato gerado pela própria lib `ai`), então
  o E2E não depende do backend. Decisão de lib registrada no item (própria, sem
  `use-stick-to-bottom`).

## Linha do tempo (resumida)
- 00:07 — /to-saindo ativado. Bloco Q já fechado (8f11ee2). Começando bloco R.
- 00:17 — Bloco R Camada 1 verde (7/7: scroll-intent + message-list). Subindo app pro E2E.
- 00:37 — Bloco R fechado (3663229): Camada 1 + E2E Playwright 3×/3 verde.
- 00:41 — Bloco O fechado (ce2cc3e): investigação DB (meta sem groupId, recommendedOffer presente) + dedupe por equivalência. Restam P e N.
- 00:51 — Bloco P (FIX-30) Camada 1 verde (6 testes: mapper + component). embeddedPercent do teto real, não do lance total; render omite embutido contraditório. Suite 1493 verde. Commitando P.

## Relatório final (preencher ao encerrar)
- **Resultado vs critério de pronto:** _pendente_
- **O que NÃO fiz e por quê:** _pendente_
- **Revisar primeiro:** _pendente_
- **Próximos passos sugeridos:** _pendente_
