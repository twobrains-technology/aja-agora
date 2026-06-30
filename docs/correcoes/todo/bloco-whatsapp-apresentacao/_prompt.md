Você é o executor do bloco `bloco-whatsapp-apresentacao` no worktree isolado deste branch (`feat/whatsapp-entrada-simulador`), rodando com Opus.

CONTEXTO: revisão da jornada de ENTRADA do Aja Agora (consórcio AI-first), foco no canal WhatsApp. Leia PRIMEIRO:
- `docs/specs/2026-06-28-jornada-entrada-simulador-conversacional-design.md` (decisões + desenho — FONTE DE VERDADE).
- `docs/correcoes/README.md` (regras do fluxo) e `docs/correcoes/todo/bloco-whatsapp-apresentacao/` (_bloco.md + fix-108 + fix-109).
- `CLAUDE.md` do projeto — "Regressão de agent — 3 camadas OBRIGATÓRIAS" e pnpm.
- A arquitetura do canal: `src/lib/whatsapp/processor.ts`, `adapter.ts` (consumeEvents), `formatter.ts` (artifactToWhatsApp).

ESCOPO (só estes arquivos): `src/lib/whatsapp/formatter.ts`, `adapter.ts`, `interactive-handlers.ts` + os testes da área + cassettes WhatsApp em `tests/regression/agent-trajectory.test.ts`.

Execute NA ORDEM: FIX-108 → FIX-109.

REGRAS:
1. TDD. Mudança de apresentação WhatsApp testável via unit/integration do formatter + cassette (Camada 2) onde envolver comportamento do agent. Veja falhar antes do fix.
2. 1 commit Conventional PT-BR por item. Sem `--no-verify`.
3. PRESERVE o que já funciona: o guard anti-drop (`artifactToWhatsApp` cobre 100% das PRESENTATION_TOOLS — nenhum artifact pode virar `null`/sumir), a máquina de contrato (FIX-25), os CTAs de ação como botão.
4. Português correto (com acentuação) em toda copy.
5. Reuso: a apresentação do simulador (FIX-109) mostra o cenário que o agente calculou via `computeContemplationDial` (bloco-jornada) — não recalcular aqui, só formatar.
6. NÃO toca backend/agent core — só `src/lib/whatsapp/**`. O contrato (agente para de emitir value_picker, conduz o simulador em loop) vem do bloco-jornada-entrada; onde precisar do shape, `TODO(bloco-jornada-entrada)` contra stub.

Ao concluir cada item: mova o fix-NN pra `docs/correcoes/done/` (status done + commit + executado_em). Ao terminar: `git push origin feat/whatsapp-entrada-simulador` + gere `docs/entregas/<ts>-bloco-whatsapp-apresentacao.md`. NÃO abra PR, NÃO faça merge, NÃO rode deploy.

RESUMO FINAL: liste as decisões de design que tomou.
