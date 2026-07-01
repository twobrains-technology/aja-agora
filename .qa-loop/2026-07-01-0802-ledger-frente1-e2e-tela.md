# LEDGER — QA Autônomo · Frente 1 (Descoberta+Qualificação+Identidade) — rodada E2E de TELA real

- **Rodada:** 2026-07-01 08:02
- **Frente:** 1 de 3 — Passos 1-4 da jornada (web↔WhatsApp). Faixa FIX: **FIX-130 a FIX-149**.
- **Branch de trabalho:** `qa-e2e/frente-1-descoberta-identidade` (worktree Superset, forkada de
  `feat/testes-e2e-integracao`)
- **Motivo da rodada:** a régua da skill `qa-autonomo` mudou hoje (2026-07-01) — determinístico é
  PISO, mas todo fluxo crítico de TELA exige spec Playwright real. A rodada anterior
  (`.qa-loop/2026-07-01-0236-ledger-frente1-descoberta.md`) fechou 10/10 ✅ majoritariamente no
  nível determinístico (só 1 golden path teve E2E de tela real, FIX-130). Esta rodada reabre os
  cenários de tela crítica e prova cada um com Playwright de verdade.
- **Fonte da verdade:** `docs/jornada/jornada-canonica.md` (Passos 1-4, regras P1-P7)
- **Stack:** `aja-app-frente-1-descoberta-identidade` UP · `http://aja-frente-1-descoberta-identidade.orb.local`
  (fallback `localhost:3010`) · bind mount confirmado (`/app` → este worktree) · Postgres
  `aja-pg-frente-1-descoberta-identidade` healthy
- **Objetivo:** (1) corrigir via TDD o bug bloqueador cross-frente (agente mudo captura de nome
  WhatsApp); (2) rodar E2E de tela real do golden path Passo 1→4 nos dois canais até o reveal do
  Passo 5; (3) provar adversarialmente que pular identidade é IMPOSSÍVEL; (4) reconfirmar retorno
  de carta real da Bevi ao vivo.
- **Critério de PRONTO:** cenários de tela crítica ∈ {✅ pleno (spec Playwright rodou e passou)} ou
  `⚠️ TELA-NÃO-VALIDADA`/`PENDENTE-KAIRO` com evidência do bloqueio. Teto: 12 iterações / 8h.

## Regras de fase (da jornada)
- 🟢 vivo = testa (falha se quebrar). ⚪ futuro = pendente, não falha. ⚠️ tensão (T1 sweep/trilhos,
  T2 embutido) = **NÃO testo como bug** (decisão stakeholder).

## Cenários

| # | Cenário (fluxo) | Origem | Nível certo | Status | Bug card | Fix | Último resultado |
|---|-----------------|--------|-------------|--------|----------|-----|------------------|
| 1 | **Bug bloqueador:** agente mudo ao capturar nome (WhatsApp) — toolChoice forçado sem reverter | cross-frente inbox | cassette + behavioral (builder.ts) | 🔴→corrigindo | `docs/correcoes/inbox/2026-07-01-crossfrente-agente-mudo-captura-nome.md` | **em andamento** | root cause confirmada (D1 do diário): `builder.ts` sem `prepareStep`, toolChoice estático se repete em todos os steps |
| 2 | Welcome web: 3 categorias, golden path Passo 1→4 completo até reveal Passo 5 | FIX-130/D21 | E2E browser real | pendente | — | — | — |
| 3 | Golden path WhatsApp (simulador) Passo 1→4 até reveal Passo 5 | paridade | E2E browser real (simulador admin) | pendente | — | — | bloqueado até corrigir cenário #1 |
| 4 | Identidade CPF+telefone SEMPRE antes de search_groups (adversarial: tentar pular) | P6/D7 | E2E browser real adversarial | pendente | — | — | — |
| 5 | Retorno ≥1 carta REAL da Bevi (ao vivo, contas de teste homologação) | P7/Passo 4 | E2E browser real + integration ao vivo | pendente | — | — | — |
| 6 | Educação lance embutido Sim/Não/Talvez nos 2 canais | FIX-118/D19 | E2E browser real | pendente | — | — | — |

## Tensões (NÃO testar como bug)
- **T1** — sweep 2 objetivos + Trilho A primário + tradução A↔B (D1/D2/D3). PENDENTE-Kairo/recalibrar.
- **T2** — lance embutido amortiza dívida × reduz crédito (D9/P5). PENDENTE-Bernardo. (Passo 5, fora da frente.)

## Diário de decisões
(ver `.away/2026-07-01-0802-qa-frente1-e2e-tela.md`)
