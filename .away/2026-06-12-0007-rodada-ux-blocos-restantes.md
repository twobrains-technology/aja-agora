# Away — Completar a rodada-ux 2026-06: blocos R, O, P, N (FIX-32/28/30/27) na branch única

- **Início:** 2026-06-12 00:07 · **Sessão:** aja-agora / fix/rodada-ux-2026-06
- **Critério de pronto:** cada um dos 4 itens (FIX-32, FIX-28, FIX-30, FIX-27)
  com TDD strict (teste visto FALHAR antes do fix), 1 commit `test+fix:`,
  item movido pra `docs/correcoes/done/`, pasta do bloco removida ao esvaziar,
  pre-commit verde em cada commit. E2E Playwright do bloco R se o ambiente
  permitir (senão impedimento técnico concreto registrado). Bloco Q (FIX-31)
  já concluído antes do /to-saindo (commit 8f11ee2).
- **Status:** COMPLETO

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
- 00:51 — Bloco P (FIX-30) fechado (71d0809): embeddedPercent do teto real, não do lance total; render omite embutido contraditório.
- 01:12 — Bloco N (FIX-27) Camadas 1+2 verdes: stage "confirm" + contactPhone no meta + knownPhone no card + supressão em retry. Suite 1514 verde, 0 erro de tipo em produção. Commitando N (pre-commit roda Camada 3 LLM).

### D3 · 00:55 — Bloco N (FIX-27): stage "confirm" 1-clique + contactPhone no meta + supressão em retry de fechamento
- **Contexto:** opt-in pedia o WhatsApp pela 3ª vez. `deriveWhatsappOptinStage`
  só olhava revealCompleted+whatsappOptinShown — não enxergava telefone já
  capturado (lead form/identify) nem fechamento com erro Bevi pendente.
- **Decidi (segue a recomendação do item):**
  - `meta.contactPhone` (MASCARADO — LGPD, vai pro prompt) setado no leads route
    e no contract-submit. `meta.contractRetryPending` setado no erro Bevi.
  - `deriveWhatsappOptinStage`: novo stage `"confirm"` quando contactPhone
    presente (não re-coleta, só confirma o canal); `"done"` quando respondido OU
    retry de fechamento pendente; `"open"` só sem telefone.
  - Card `whatsapp_optin` aceita `knownPhone` (runner enriquece o payload, igual
    contract_form/identity) → confirmação 1-clique (sem input vazio). Action
    `whatsapp_optin_confirm` usa o número já salvo (não re-digita).
  - `shouldEmitWhatsappOptin` → false em retry pendente (determinismo na
    tool-policy).
- **Camadas:** C1 (derive/section/guard/mask/component/leads route) + C2
  (cassette: pós-phone-capturado o agente confirma, não re-coleta) + C3 roda no
  pre-commit (toca src/lib/agent/; ANTHROPIC_API_KEY presente em .env.local).
- **Reversibilidade:** média (toca prompt + 9 arquivos; campos do meta aditivos).

## Linha do tempo (cont.)
- 01:15 — Verificação final. E2E do R falhou 1× por **Turbopack virtiofs stale**
  no container (simulation-result.tsx "Expected '</', got '<eof>'" — arquivo
  íntegro, tsc 0 erro) após o hot reload das mudanças de P/N. `docker restart`
  do app limpou o cache → `/chat` 200 → E2E **3/3 verde**. (Memória conhecida:
  [[project_turbopack_virtiofs_stale]].) Teardown do app do workspace.

## Relatório final
- **Resultado vs critério de pronto: ✅ ATINGIDO.** 5/5 blocos completos, cada
  um TDD strict (teste visto FALHAR antes do fix), 1 commit `test+fix:`, item em
  `done/`, pasta do bloco removida:
  - Q · FIX-31 (eco do handoff duplicava a bolha) — `8f11ee2`
  - R · FIX-32 (auto-scroll brigava com o gesto) — `3663229` · E2E Playwright 3/3
  - O · FIX-28 (outras opções duplicadas) — `ce2cc3e` · investigação DB registrada
  - P · FIX-30 (lance total rotulado como embutido) — `c04eea8`
  - N · FIX-27 (opt-in pedia número já informado) — `072b80e` · Camada 3 LLM verde
  - Evidência fresca: suite Camadas 1+2 **1514 verde**, tsc **0 erro em produção**,
    pre-commit verde por commit (N rodou Camada 3 LLM real).
- **O que NÃO fiz e por quê:**
  - `bloco-s-funil-canonico` — fora do escopo deste pedido (segue em `todo/`).
  - **push / PR** — não pedido; a branch é tua, deixei os 5 commits locais pra tua
    revisão/PR.
  - **done-report** — são bugfixes (não feature visível nova); este diário cobre.
- **Revisar primeiro:**
  - **D3** (bloco N) — o mais invasivo: stage "confirm" + `contractRetryPending`
    tocam o system-prompt e 9 arquivos. Olhar a UX do card de confirmação 1-clique
    e a lógica de supressão em retry de fechamento.
  - **D2** (bloco R) — E2E via `page.route` + SSE fake (intercepta 100% a rede; o
    `/api/chat` real dá 500 no dev por DB sem schema). A regressão dura é a Camada 1.
  - **FIX-28** — exclusão da recomendada por equivalência via `recommendedOffer`
    (o meta não tem groupId, confirmado no DB) — não por groupId como o item sugeria.
  - **FIX-30** — semântica AGX (perguntas 7/8) ficou como `TODO(AGX)` no mapper.
- **Próximos passos sugeridos:** revisar e abrir PR da branch; executar o bloco-s;
  responder as perguntas 7/8 à AGX pra destravar o `TODO` do FIX-30.
