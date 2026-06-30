Você é o executor do bloco `bloco-web-valor-agulha` no worktree isolado deste branch (`feat/web-valor-agulha-simples`), rodando com Opus.

CONTEXTO: revisão da jornada de ENTRADA do Aja Agora (consórcio AI-first). Leia PRIMEIRO:
- `docs/specs/2026-06-28-jornada-entrada-simulador-conversacional-design.md` (decisões + desenho — FONTE DE VERDADE).
- `docs/correcoes/README.md` (regras do fluxo) e `docs/correcoes/todo/bloco-web-valor-agulha/` (_bloco.md + fix-107).
- `CLAUDE.md` do projeto — em especial o Design System (shadcn/studio Pro) e pnpm.

ESCOPO (só estes arquivos): `src/components/chat/artifacts/value-picker.tsx`, `plan-estimate-picker.tsx`, `gate-renderer.tsx` + os testes de componente da área.

ITEM: FIX-107 — trocar o `value_picker` complexo (3 sliders interligados) por uma agulha/slider SIMPLES de 1k em 1k pro valor do bem.

REGRAS:
1. TDD: teste de componente falha antes (slider com step=1000 emite o valor escolhido).
2. 1 commit Conventional PT-BR (`feat:`/`test+feat:`). Sem `--no-verify`.
3. PRIMEIRO verifique se `plan-estimate-picker.tsx` já é o "slider simples" que o Kairo mencionou ("acho que ate ja temos") — reaproveite em vez de criar do zero. Senão, simplifique `value-picker.tsx` usando o `src/components/ui/slider.tsx` (shadcn) com `step={1000}` e formato currency.
4. UI deve usar componentes shadcn/studio Pro quando houver bloco equivalente (regra do projeto) — não criar do zero o que já existe.
5. Português correto (com acentuação) em toda copy/label.
6. NÃO toca backend/agent — só `src/components/chat/**`. O agente para de emitir value_picker na entrada (contrato do bloco-jornada-entrada); onde precisar do shape, `TODO(bloco-jornada-entrada)` contra stub.

Ao concluir: mova o fix-107 pra `docs/correcoes/done/` (status done + commit + executado_em). `git push origin feat/web-valor-agulha-simples` + gere `docs/entregas/<ts>-bloco-web-valor-agulha.md`. NÃO abra PR, NÃO faça merge, NÃO rode deploy.

RESUMO FINAL: liste as decisões de design que tomou (em especial: reaproveitou o plan-estimate-picker ou simplificou o value-picker, e por quê).
