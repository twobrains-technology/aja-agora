Você é o executor do bloco **bloco-conversa-wa-cadencia** no worktree isolado desta branch
(`feat/conversa-wa-cadencia`). Você roda em **MODO PLAN** (ver o header no topo deste prompt): pesquise,
apresente o plano via ExitPlanMode, e SÓ implemente após aprovação.

## O que ler primeiro (fonte de verdade)
1. **O spec:** `docs/design/specs/2026-07-02-conversa-whatsapp-cadencia-design.md` — a estratégia já
   está DECIDIDA lá (arquitetura channel-aware, os 4 pilares, a tabela antes→depois das mensagens
   grandes, os critérios de aceite C1–C5). Você NÃO redefine estratégia; implementa o spec.
2. `docs/correcoes/README.md` (regras do fluxo) e `docs/correcoes/todo/bloco-conversa-wa-cadencia/`
   (_bloco.md + fix-210, fix-211, fix-212 — cada um com root cause, correção e regressão exigida).

## Escopo (Fase 1 — qualificação: nome → consent → identify → valor → lance/embutido)
Execute os itens NA ORDEM: **FIX-210 → FIX-211 → FIX-212**. NÃO faça reveal (Fase 2) nem fechamento
(Fase 3). Não toque `closing-presentation.ts`, `contract-capture.ts`, `interactive-handlers.ts` além
do estritamente necessário.

## Invariantes DUROS (não negociáveis)
- **ZERO emoji** em toda a copy do WhatsApp (fixa e gerada). Regra dura no system-prompt + varredura de
  teste que falha se achar emoji.
- **Channel-aware (C5): NÃO quebrar a web.** A web usa componentes React (`artifact-renderer.tsx`). A
  cadência/nº de balões é decisão de render do WhatsApp — não vaza pra lógica compartilhada. Ao mexer em
  copy compartilhada (`system-prompt.ts`, `directives.ts`, `gate-questions.ts`), rode os testes da web
  (`src/app/api/chat/route*.test.ts`) e confirme que passam. NÃO alterar `artifact-renderer.tsx` nem a
  lista de itens de `closing-presentation.ts`.
- **TDD strict:** teste de regressão PRIMEIRO, vê FALHAR, corrige, vê passar. Commit `test+feat:` por
  item.
- **Regressão de agent — 3 camadas OBRIGATÓRIAS** (ver CLAUDE.md): Camada 1 estrutural (`src/**/*.test.ts`),
  Camada 2 cassette em `tests/regression/agent-trajectory.test.ts` (append determinístico, reconstrua a
  suíte — nunca union), Camada 3 é nightly (não bloqueia). Cada fix-card diz a regressão exigida.
- **pnpm ÚNICO.** Conventional Commits PT-BR, imperativo, um item por commit. Gate verde no container
  (`prisma generate && tsc --noEmit && vitest run` do escopo tocado) antes de pushar.

## Gate antes de pushar
`pnpm test:unit` verde (Camadas 1+2) + `tsc --noEmit` limpo nos arquivos tocados + testes da web
passando. Vermelho não pusha.

## Ao terminar (implement-and-push — a linha vermelha)
`git push origin feat/conversa-wa-cadencia` + gere `.done/<data>-bloco-conversa-wa-cadencia.md` (resumo
+ decisões + testes com "falhou antes" + gaps). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart.**
A integração na base é do ORQUESTRADOR. A sinalização por tag-sentinela está no footer.

## Resumo final
Liste as decisões de design que você tomou dentro da liberdade do spec ("decidi X em vez de Y porque
Z"). Registre a copy final de cada mensagem reescrita (antes→depois) pro Kairo revisar no simulador.
